import { EMOTE_DURATION_MS, PLAYER_EMOTES } from "../lib/player-emotes.mjs";
import { chatClearedThrough } from "./chat-history.mjs";
import { personalMuteContext } from "./personal-mutes.mjs";
import { teamLabel } from "./team-social.mjs";

// Emoji-only messages use the existing chat write, retry, throttle, and history rules.
export async function teamEmojiEvents(db, config, user, team, features, now = Date.now()) {
  if (!team || user.role === "admin" || !features.everyone.messaging) return [];
  const cleared = await chatClearedThrough(db, user.id);
  const rows = (await db.prepare(`
    SELECT m.id,m.sender_user,s.username,m.sender_team,m.recipient_team,m.text,m.created_at,
      source.name AS source_name,target.name AS target_name
    FROM team_messages m
    JOIN students s ON s.id=m.sender_user
    JOIN teams source ON source.id=m.sender_team
    JOIN teams target ON target.id=m.recipient_team
    WHERE ((m.sender_user=? AND m.sender_team=?) OR m.recipient_team=?)
      AND m.sender_team<>m.recipient_team
      AND m.text IN (${PLAYER_EMOTES.map(() => "?").join(",")})
      AND m.created_at>? AND m.created_at>?
      AND s.disabled=0 AND source.disabled=0 AND target.disabled=0
    ORDER BY m.created_at,m.id LIMIT 100
  `).bind(user.id, team, team, ...PLAYER_EMOTES.map(option => option.emoji), now - EMOTE_DURATION_MS, cleared).all()).results;
  if (!rows.length) return [];
  const mutes = await personalMuteContext(db, config, user.id, rows.map(row => row.sender_user));
  return rows.filter(row => !mutes.isMuted(row.sender_user)).map(row => ({
    id: row.id,
    emoji: row.text,
    sender: row.username,
    fromTeam: { id: row.sender_team, label: teamLabel({ id: row.sender_team, name: row.source_name }, row.sender_team === team ? features : features.everyone) },
    toTeam: { id: row.recipient_team, label: teamLabel({ id: row.recipient_team, name: row.target_name }, row.recipient_team === team ? features : features.everyone) },
    outgoing: row.sender_user === user.id,
    remainingMs: row.created_at + EMOTE_DURATION_MS - now,
  }));
}
