// CTF-RPG — Copyright (c) 2026 Jaime C Acosta
export const EMOTE_DURATION_MS = 5000;
export const PLAYER_EMOTES = [
  { emoji: "👋", label: "Wave" },
  { emoji: "👍", label: "Thumbs up" },
  { emoji: "👎", label: "Thumbs down" },
  { emoji: "😮", label: "Wow face" },
  { emoji: "😢", label: "Cry face" },
];
export function isPlayerEmote(emoji) {
  return PLAYER_EMOTES.some(emote => emote.emoji === emoji);
}

function teamName(label) {
  return /^team\b/i.test(label) ? label : `Team ${label}`;
}

export function teamEmojiNotice(event, outgoingSubject = "You") {
  if (event.toUser) return event.outgoing
    ? `${outgoingSubject} sent ${event.toUser} a ${event.emoji}`
    : `${event.sender} sent you a ${event.emoji}`;
  return event.outgoing
    ? `${outgoingSubject} sent ${teamName(event.toTeam.label)} a ${event.emoji}`
    : `${event.fromTeam ? teamName(event.fromTeam.label) : "Instructors"} sent you a ${event.emoji}`;
}

export function teamEmojiTargets(event, player) {
  return event.outgoing
    ? event.toUser ? player.username === event.toUser : player.team === event.toTeam.id
    : player.username === event.sender;
}

// Use only visible players on the current map; never invent an off-map endpoint.
export function teamEmojiConnections(event, players, self) {
  if (!self) return [];
  if (event.outgoing) {
    if (event.sender !== self.username) return [];
    return players.filter(player => player.username !== self.username && teamEmojiTargets(event, player))
      .map(player => ({ from: self, to: player }));
  }
  if (event.toUser ? self.username !== event.toUser : self.team !== event.toTeam.id) return [];
  const sender = players.find(player => player.username === event.sender && player.username !== self.username);
  return sender ? [{ from: sender, to: self }] : [];
}

export const EMOJI_DELIVERY_COLORS = ["#73edc8", "#ffc857", "#88b8ff", "#f6a0dd", "#c5adff", "#ff9f79", "#6de1f2", "#d2ed78"];
export function emojiDeliveryColors(keys) {
  const used = new Set();
  return keys.map((key, position) => {
    let hash = 0;
    for (const character of key) hash = (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0;
    if (used.size === EMOJI_DELIVERY_COLORS.length)
      return `hsl(${((position - EMOJI_DELIVERY_COLORS.length) * 137.508 + 17) % 360} 85% 72%)`;
    let index = hash % EMOJI_DELIVERY_COLORS.length;
    for (let step = 0; step < EMOJI_DELIVERY_COLORS.length && used.has(index); step++)
      index = (index + 1) % EMOJI_DELIVERY_COLORS.length;
    used.add(index);
    return EMOJI_DELIVERY_COLORS[index];
  });
}
