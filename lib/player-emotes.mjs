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
  return event.outgoing
    ? `${outgoingSubject} sent ${teamName(event.toTeam.label)} a ${event.emoji}`
    : `${teamName(event.fromTeam?.label || "unknown")} sent you a ${event.emoji}`;
}

export function teamEmojiTargets(event, player) {
  return event.outgoing
    ? player.team === event.toTeam.id
    : player.username === event.sender;
}
