import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyMessageInbox, receiveMessages, readMessages, savedMessageReadAt, saveMessageReadAt } from '../lib/message-inbox.mjs';

test('incoming message counts persist across presence polls until the inbox is read', () => {
  let state = receiveMessages(emptyMessageInbox(), { receivedCount: 40, latestMessageAt: 100 });
  assert.equal(state.unreadCount, 0, 'existing history is not counted as newly received');
  state = receiveMessages(state, { receivedCount: 41, latestMessageAt: 200 });
  assert.equal(state.unreadCount, 1);
  for (let i = 0; i < 20; i++) state = receiveMessages(state, { receivedCount: 41, latestMessageAt: 200 });
  assert.equal(state.unreadCount, 1, 'polling must not expire the badge');
  assert.equal(readMessages(state, 200).unreadCount, 0);
});

test('reading an earlier inbox snapshot does not clear a newer incoming message', () => {
  let state = receiveMessages(emptyMessageInbox(), { receivedCount: 1, latestMessageAt: 100 });
  state = receiveMessages(state, { receivedCount: 2, latestMessageAt: 200 });
  state = receiveMessages(state, { receivedCount: 3, latestMessageAt: 300 });
  state = readMessages(state, 200);
  assert.equal(state.unreadCount, 2);
  assert.equal(state.readAt, 200);
  state = readMessages(state, 300);
  assert.equal(state.unreadCount, 0);
  state = receiveMessages(state, { receivedCount: 4, latestMessageAt: 400 });
  assert.equal(state.unreadCount, 1);
});

test('a late presence response cannot resurrect messages already read', () => {
  let state = receiveMessages(emptyMessageInbox(), { receivedCount: 8, latestMessageAt: 100 });
  state = readMessages(state, 200);
  state = receiveMessages(state, { receivedCount: 9, latestMessageAt: 200 });
  assert.equal(state.unreadCount, 0);
  state = receiveMessages(state, { receivedCount: 10, latestMessageAt: 300 }, 300);
  assert.equal(state.unreadCount, 0);
  state = receiveMessages(state, { receivedCount: 3, latestMessageAt: 150 });
  assert.equal(state.unreadCount, 0, 'removed messages or permission changes do not create unread messages');
});

test('read history is isolated by account, monotonic, and safe when storage is blocked', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  assert.equal(savedMessageReadAt(storage, 'alice'), 0);
  saveMessageReadAt(storage, 'alice', 300);
  saveMessageReadAt(storage, 'alice', 100);
  assert.equal(savedMessageReadAt(storage, 'alice'), 300);
  assert.equal(savedMessageReadAt(storage, 'bob'), 0);
  const resumed = receiveMessages(emptyMessageInbox(), { receivedCount: 10, latestMessageAt: 300 }, savedMessageReadAt(storage, 'alice'));
  assert.equal(resumed.unreadCount, 0);
  const blocked = { getItem() { throw Error('Blocked'); }, setItem() { throw Error('Blocked'); } };
  assert.equal(savedMessageReadAt(blocked, 'alice'), 0);
  assert.doesNotThrow(() => saveMessageReadAt(blocked, 'alice', 400));
});
