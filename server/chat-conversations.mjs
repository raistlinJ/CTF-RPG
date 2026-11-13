import { chatClearedThrough } from "./chat-history.mjs";
import { personalMuteContext } from "./personal-mutes.mjs";
import { teamFeatures, teamLabel } from "./team-social.mjs";
import { validConversationReads } from "../lib/conversation-inbox.mjs";
const reply = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function handleChatConversations(req, { db, config, user, platformAdmin }) {
  const viewer = await user(req);
  if (!viewer) return reply({ error: "Sign in to view messages." }, 401);
  if (req.method !== "GET") return reply({ error: "Method not allowed." }, 405);
  const admin = platformAdmin || viewer.role === "admin";
  const own = (await db.prepare("SELECT team FROM team_members WHERE user=?").bind(viewer.id).first())?.team || null;
  if (!admin && !own) return reply({ error: "Join a team to view messages." }, 403);
  let reads = { baseline: 0, through: {} };
  const raw = new URL(req.url).searchParams.get("read");
  if (raw) {
    try {
      if (raw.length > 40000) throw Error();
      reads = JSON.parse(raw);
      if (!validConversationReads(reads)) throw Error();
    } catch { return reply({ error: "Invalid conversation read state." }, 400); }
  }
  const features = await teamFeatures(db, config);
  const cleared = await chatClearedThrough(db, viewer.id);
  const teamSource = admin ? {
    sql: `SELECT m.recipient_team AS conversation,m.id,m.sender_user,m.sender,m.text,m.created_at,0 AS incoming,
      CASE WHEN m.sender_user=? THEN 1 ELSE 0 END AS mine,t.name
      FROM team_messages m JOIN teams t ON t.id=m.recipient_team AND t.disabled=0
      WHERE m.sender_team IS NULL AND ?=1 AND (m.recipient_user IS NULL OR m.sender_user=? OR m.recipient_user=?)`,
    args: [viewer.id, +features.messaging, viewer.id, viewer.id],
  } : {
    sql: `SELECT CASE WHEN m.sender_team IS NULL THEN 'instructors' WHEN m.sender_team=? THEN m.recipient_team ELSE m.sender_team END AS conversation,
      m.id,m.sender_user,m.sender,m.text,m.created_at,
      CASE WHEN m.recipient_team=? AND m.sender_user IS NOT ? THEN 1 ELSE 0 END AS incoming,
      CASE WHEN m.sender_user=? THEN 1 ELSE 0 END AS mine,
      CASE WHEN m.sender_team IS NULL THEN 'Instructors' WHEN m.sender_team=? THEN target.name ELSE source.name END AS name
      FROM team_messages m JOIN teams target ON target.id=m.recipient_team AND target.disabled=0
      LEFT JOIN teams source ON source.id=m.sender_team
      WHERE (m.sender_team=? OR m.recipient_team=?) AND COALESCE(source.disabled,0)=0
        AND (m.recipient_user IS NULL OR m.sender_user=? OR m.recipient_user=?)
        AND ((?=1 AND (m.sender_team IS NULL OR m.sender_team=m.recipient_team))
          OR (?=1 AND m.sender_team IS NOT NULL AND m.sender_team<>m.recipient_team))`,
    args: [own, own, viewer.id, viewer.id, own, own, own, viewer.id, viewer.id, +features.messaging, +features.everyone.messaging],
  };
  const instructorSource = {
    sql: `SELECT ${admin ? "m.team" : "'instructors'"} AS conversation,m.id,m.sender_user,m.sender,m.text,m.created_at,
      ${admin ? "1" : "0"} AS incoming,CASE WHEN m.sender_user=? THEN 1 ELSE 0 END AS mine,
      ${admin ? "t.name" : "'Instructors'"} AS name
      FROM instructor_messages m JOIN teams t ON t.id=m.team AND t.disabled=0
      WHERE ?=1${admin ? "" : " AND m.team=?"}`,
    args: [viewer.id, +features.messaging, ...(admin ? [] : [own])],
  };
  const source = `${teamSource.sql} UNION ALL ${instructorSource.sql}`;
  const args = [...teamSource.args, ...instructorSource.args];
  const senders = (await db.prepare(`WITH scoped AS (${source}) SELECT DISTINCT sender_user FROM scoped WHERE created_at>? AND sender_user IS NOT NULL`).bind(...args, cleared).all()).results;
  const mutes = await personalMuteContext(db, config, viewer.id, senders.map(row => row.sender_user));
  const muted = senders.filter(row => mutes.isMuted(row.sender_user)).map(row => row.sender_user);
  const rows = (await db.prepare(`WITH scoped AS (${source}), visible AS (
      SELECT scoped.*,MAX(?,COALESCE(reads.value,?)) AS read_at FROM scoped
      LEFT JOIN json_each(?) reads ON reads.key=scoped.conversation
      WHERE created_at>? AND (sender_user IS NULL OR sender_user NOT IN (SELECT value FROM json_each(?)))
    ), ranked AS (
      SELECT *,SUM(CASE WHEN incoming=1 AND created_at>read_at THEN 1 ELSE 0 END) OVER(PARTITION BY conversation) AS unread,
      ROW_NUMBER() OVER(PARTITION BY conversation ORDER BY created_at DESC,id DESC) AS latest FROM visible
    ) SELECT * FROM ranked WHERE latest=1 ORDER BY created_at DESC,id DESC`).bind(...args, cleared, reads.baseline, JSON.stringify(reads.through), cleared, JSON.stringify(muted)).all()).results;
  const conversations = rows.map(row => ({
    id: row.conversation,
    label: row.conversation === "instructors" ? "Instructors" : teamLabel({ id: row.conversation, name: row.name }, admin || row.conversation === own ? features : features.everyone),
    unreadCount: row.unread,
    latestAt: row.created_at,
    preview: { id: row.id, text: row.text, sender: row.sender, mine: !!row.mine },
    isYourTeam: row.conversation === own,
  }));
  return reply({ conversations, unreadCount: conversations.reduce((sum, row) => sum + row.unreadCount, 0), scope: admin ? "admin" : own });
}
