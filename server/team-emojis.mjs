import { EMOTE_DURATION_MS, PLAYER_EMOTES } from "../lib/player-emotes.mjs";
import { emojiCombos, EMOJI_COMBO_WINDOW_MS, EMOJI_COMBO_DURATION_MS } from "../lib/emoji-combos.mjs";
import { chatClearedThrough } from "./chat-history.mjs";
import { personalMuteContext } from "./personal-mutes.mjs";
import { teamLabel } from "./team-social.mjs";

// Emoji-only messages use the existing chat write, retry, throttle, and history rules.
export async function teamEmojiActivity(db, config, user, team, features, now = Date.now(), admin = user.role === "admin") {
  const empty = { teamEmojis: [], emojiCombos: [] };
  if ((!team && !admin) || (!features.messaging && !features.everyone.messaging)) return empty;
  const cleared = await chatClearedThrough(db, user.id);
  const rows = (await db.prepare(`
    SELECT m.id,m.sender_user,s.username,m.sender_team,m.recipient_team,m.recipient_user,recipient.username AS recipient_username,m.text,m.created_at,
      source.name AS source_name,target.name AS target_name
    FROM team_messages m
    JOIN students s ON s.id=m.sender_user
    LEFT JOIN students recipient ON recipient.id=m.recipient_user
    LEFT JOIN teams source ON source.id=m.sender_team
    JOIN teams target ON target.id=m.recipient_team
    WHERE ((m.sender_user=? AND (m.sender_team=? OR (?=1 AND m.sender_team IS NULL))) OR (m.recipient_team=? AND (m.recipient_user IS NULL OR m.recipient_user=?)))
      AND (m.sender_team IS NULL OR m.sender_team<>m.recipient_team)
      AND ((m.sender_team IS NULL AND ?=1) OR (m.sender_team IS NOT NULL AND ?=1))
      AND m.text IN (${PLAYER_EMOTES.map(() => "?").join(",")})
      AND m.created_at>? AND m.created_at>?
      AND s.disabled=0 AND COALESCE(source.disabled,0)=0 AND target.disabled=0
    ORDER BY m.created_at DESC,m.id DESC LIMIT 100
  `).bind(user.id, team || null, +admin, team || null, user.id, +features.messaging, +features.everyone.messaging, ...PLAYER_EMOTES.map(option => option.emoji), now - EMOJI_COMBO_WINDOW_MS - EMOJI_COMBO_DURATION_MS, cleared).all()).results.reverse();
  if (!rows.length) return empty;
  const instructorReplies = features.messaging ? (await db.prepare(`
    SELECT m.id,m.sender_user,m.sender,m.team,m.text,m.created_at,t.name FROM instructor_messages m
    JOIN teams t ON t.id=m.team AND t.disabled=0
    WHERE m.created_at>? AND m.created_at>? AND (?=1 OR m.team=?) AND m.text IN ('👋','😮')
    ORDER BY m.created_at DESC,m.id DESC LIMIT 100
  `).bind(now - EMOJI_COMBO_WINDOW_MS - EMOJI_COMBO_DURATION_MS, cleared, +admin, team || null).all()).results : [];
  const mutes = await personalMuteContext(db, config, user.id, [...rows, ...instructorReplies].map(row => row.sender_user));
  const messages = rows.filter(row => !mutes.isMuted(row.sender_user)).map(row => ({
    id: row.id,
    emoji: row.text,
    sender: row.username,
    fromTeam: row.sender_team ? { id: row.sender_team, label: teamLabel({ id: row.sender_team, name: row.source_name }, admin || row.sender_team === team ? features : features.everyone) } : null,
    toTeam: { id: row.recipient_team, label: teamLabel({ id: row.recipient_team, name: row.target_name }, admin || row.recipient_team === team ? features : features.everyone) },
    ...(row.recipient_user ? { toUser: row.recipient_username } : {}),
    outgoing: row.sender_user === user.id,
    createdAt: row.created_at,
    remainingMs: row.created_at + EMOTE_DURATION_MS - now,
  }));
  const instructorMessages = instructorReplies.filter(row => !mutes.isMuted(row.sender_user)).map(row => ({
    id: row.id, emoji: row.text, sender: row.sender, createdAt: row.created_at,
    fromTeam: { id: row.team, label: teamLabel({ id: row.team, name: row.name }, features) },
    toTeam: { id: "instructors", label: "Instructors" },
  }));
  return { teamEmojis: messages.filter(message => message.remainingMs > 0), emojiCombos: emojiCombos([...messages, ...instructorMessages], user.username, now) };
}
