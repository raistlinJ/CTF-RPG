// Chat badges persist until the relevant inbox has actually been read.
export const emptyMessageInbox = () => ({ receivedCount: null, latestMessageAt: 0, readAt: 0, unreadCount: 0 });

export function receiveMessages(state, { receivedCount, latestMessageAt }, readAt = state.readAt) {
  const seenAt = Math.max(state.readAt, readAt);
  // The first poll supplies a baseline, not an unread count for all chat history.
  const added = state.receivedCount === null ? 0 : Math.max(0, receivedCount - state.receivedCount);
  return {
    receivedCount, latestMessageAt, readAt: seenAt,
    unreadCount: latestMessageAt <= seenAt ? 0 : Math.min(receivedCount, state.unreadCount + added),
  };
}

export function savedMessageReadAt(storage, username) {
  try {
    const at = Number(storage.getItem(`ctf-rpg:chat-read:${username}`));
    return Number.isSafeInteger(at) && at > 0 ? at : 0;
  } catch { return 0; }
}

export function saveMessageReadAt(storage, username, at) {
  try {
    if (Number.isSafeInteger(at) && at > 0)
      storage.setItem(`ctf-rpg:chat-read:${username}`, String(Math.max(savedMessageReadAt(storage, username), at)));
  } catch { /* Chat remains available when browser storage is blocked. */ }
}

export function readMessages(state, at) {
  const readAt = Math.max(state.readAt, at);
  return { ...state, readAt, unreadCount: state.latestMessageAt <= readAt ? 0 : state.unreadCount };
}
