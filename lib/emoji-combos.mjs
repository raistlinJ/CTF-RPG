export const EMOJI_COMBO_WINDOW_MS = 10000;
export const EMOJI_COMBO_DURATION_MS = 5000;
export const emojiComboKind = emoji => emoji === "👋" ? "high-five" : emoji === "😮" ? "fireworks" : null;

function addressedTo(message, person) {
  return message.toUser ? message.toUser === person.sender :
    message.toTeam.id === "instructors" ? person.fromTeam === null :
      !!person.fromTeam && message.toTeam.id === person.fromTeam.id;
}

// The caller supplies only the viewer's permitted, unmuted chat records.
// One reply completes one pair; neither teammates nor spectators receive it.
export function emojiCombos(messages, viewer, now = Date.now()) {
  const ordered = messages.filter(message => emojiComboKind(message.emoji))
    .toSorted((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  const used = new Set(), combos = [];
  for (let index = 0; index < ordered.length; index++) {
    const reply = ordered[index];
    if (used.has(reply.id)) continue;
    for (let prior = index - 1; prior >= 0; prior--) {
      const first = ordered[prior];
      if (reply.createdAt - first.createdAt > EMOJI_COMBO_WINDOW_MS) break;
      if (used.has(first.id) || first.emoji !== reply.emoji || first.sender === reply.sender ||
          (viewer !== first.sender && viewer !== reply.sender) ||
          !addressedTo(first, reply) || !addressedTo(reply, first)) continue;
      used.add(first.id); used.add(reply.id);
      const remainingMs = reply.createdAt + EMOJI_COMBO_DURATION_MS - now;
      if (remainingMs > 0 && remainingMs <= EMOJI_COMBO_DURATION_MS) combos.push({
        id: [first.id, reply.id].sort().join(":"),
        kind: emojiComboKind(reply.emoji),
        partner: viewer === first.sender ? reply.sender : first.sender,
        remainingMs,
      });
      break;
    }
  }
  return combos;
}
