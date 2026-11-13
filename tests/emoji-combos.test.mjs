import test from "node:test";
import assert from "node:assert/strict";
import { emojiCombos, EMOJI_COMBO_DURATION_MS, EMOJI_COMBO_WINDOW_MS } from "../lib/emoji-combos.mjs";

const message = (id, sender, from, to, at, emoji = "👋", toUser) => ({ id, sender, fromTeam: from ? { id: from } : null, toTeam: { id: to }, createdAt: at, emoji, ...(toUser ? { toUser } : {}) });

test("matching reciprocal emojis form one combo for the actual participants", () => {
  const first = message("a", "alice", "alpha", "beta", 1000, "👋", "bobby");
  const second = message("b", "bobby", "beta", "alpha", 9000, "👋", "alice");
  const expected = { id: "a:b", kind: "high-five", partner: "bobby", remainingMs: EMOJI_COMBO_DURATION_MS };
  assert.deepEqual(emojiCombos([second, first], "alice", 9000), [expected]);
  assert.deepEqual(emojiCombos([first, second], "bobby", 9000), [{ ...expected, partner: "alice" }]);
  assert.deepEqual(emojiCombos([first, second], "annika", 9000), []);
  assert.deepEqual(emojiCombos([first], "alice", 9000), []);
  assert.deepEqual(emojiCombos([first, { ...second, toUser: "annika" }], "bobby", 9000), []);
  assert.deepEqual(emojiCombos([first, { ...second, emoji: "😮" }], "alice", 9000), []);
  assert.deepEqual(emojiCombos([first, { ...second, sender: "alice" }], "alice", 9000), []);
});

test("combos respect reply windows, expire, pair replies once and preserve team/instructor targeting", () => {
  const first = message("a", "alice", "alpha", "beta", 1000, "😮");
  const reply = message("b", "bobby", "beta", "alpha", 1000 + EMOJI_COMBO_WINDOW_MS, "😮");
  assert.equal(emojiCombos([first, reply], "alice", reply.createdAt)[0].kind, "fireworks");
  assert.deepEqual(emojiCombos([first, { ...reply, createdAt: reply.createdAt + 1 }], "alice", reply.createdAt + 1), []);
  assert.deepEqual(emojiCombos([first, reply], "alice", reply.createdAt + EMOJI_COMBO_DURATION_MS), []);
  assert.equal(emojiCombos([first, { ...first, id: "aa", createdAt: 1100 }, reply], "alice", reply.createdAt).length, 1);
  assert.deepEqual(emojiCombos([first, { ...reply, toTeam: { id: "gamma" } }], "alice", reply.createdAt), []);
  const admin = message("teacher-wave", "teacher", null, "alpha", 1000, "👋", "alice");
  const student = message("student-wave", "alice", "alpha", "instructors", 2000);
  assert.equal(emojiCombos([admin, student], "teacher", 2000)[0].partner, "alice");
  assert.equal(emojiCombos([admin, student], "alice", 2000)[0].partner, "teacher");
});
