export function validConversationReads(value) {
  return !!value && typeof value === "object" && !Array.isArray(value) &&
    Number.isSafeInteger(value.baseline) && value.baseline >= 0 &&
    !!value.through && typeof value.through === "object" && !Array.isArray(value.through) &&
    Object.keys(value.through).length <= 500 && Object.entries(value.through).every(([id, at]) =>
      id.length > 0 && id.length <= 200 && Number.isSafeInteger(at) && at >= 0);
}
export const conversationReadKey = (username, scope) => `ctf-rpg:conversation-reads:${username}:${scope}`;
export function loadConversationReads(storage, username, scope, baseline = 0) {
  try {
    const saved = JSON.parse(storage.getItem(conversationReadKey(username, scope)) || "null");
    if (validConversationReads(saved)) return saved;
  } catch {}
  const initial = { baseline, through: {} };
  saveConversationReads(storage, username, scope, initial);
  return initial;
}
export function saveConversationReads(storage, username, scope, reads) {
  try { storage.setItem(conversationReadKey(username, scope), JSON.stringify(reads)); } catch {}
}
export function readConversation(reads, id, at) {
  if (!Number.isSafeInteger(at) || at < 0) return reads;
  return { ...reads, through: { ...reads.through, [id]: Math.max(reads.through[id] || reads.baseline, at) } };
}
