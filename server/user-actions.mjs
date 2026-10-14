// CTF-RPG — Copyright (c) 2026 Jaime C Acosta
import { configuredCredentials } from './passwords.mjs';
import { protectedAdminUsername } from '../lib/config-schema.mjs';

export async function bulkUserAction(body, { db, config, viewer, accountList }) {
  const reply = (data, status = 200) => Response.json(data, {status, headers:{'Cache-Control':'no-store'}});
  if (!['disable', 'delete', 'mute', 'unmute', 'remove-team'].includes(body.action) ||
      !Array.isArray(body.users) || !body.users.length || body.users.length > 1000 ||
      body.users.some(u => !u || typeof u.username !== 'string' || !/^[a-z0-9_-]{3,24}$/.test(u.username) || !Number.isInteger(u.revision) || u.revision < 0 ||
        (body.action === 'remove-team' && u.team !== null && typeof u.team !== 'string')) ||
      new Set(body.users.map(u => u.username)).size !== body.users.length) {
    return reply({error:'Choose an action and 1–1000 users with their current revisions.'}, 400);
  }
  const protectedUsername = protectedAdminUsername(config) || viewer?.username;
  const skipped = ['disable', 'delete'].includes(body.action) ? body.users.filter(u => u.username === protectedUsername).map(u => u.username) : [];
  const targets = body.users.filter(u => !skipped.includes(u.username));
  const accounts = await accountList();
  if (!targets.length) return reply({users:accounts, characters:config.characters, updated:0, skipped, action:body.action});
  const selected = targets.map(target => accounts.find(a => a.username === target.username));
  if (selected.some((a, i) => !a || a.revision !== targets[i].revision ||
      (body.action === 'remove-team' && (a.team?.id ?? null) !== targets[i].team))) {
    return reply({error:'A selected user changed. Refresh users and select them again.'}, 409);
  }
  const expected = JSON.stringify(selected.map(a => ({id:a.id, username:a.username, revision:a.revision, team:a.team?.id ?? null})));
  const id = crypto.randomUUID();
  const membershipGuard = body.action === 'remove-team'
    ? "AND (SELECT team FROM team_members WHERE user=json_extract(wanted.value,'$.id')) IS json_extract(wanted.value,'$.team')"
    : '';
  const matching = `SELECT COUNT(*) FROM json_each(?) wanted WHERE (
    (json_extract(wanted.value,'$.id') IS NOT NULL AND EXISTS (
      SELECT 1 FROM students WHERE id=json_extract(wanted.value,'$.id') AND username=json_extract(wanted.value,'$.username') AND revision=json_extract(wanted.value,'$.revision')
    )) OR (json_extract(wanted.value,'$.id') IS NULL AND NOT EXISTS (
      SELECT 1 FROM students WHERE username=json_extract(wanted.value,'$.username')
    ) AND NOT EXISTS (SELECT 1 FROM deleted_accounts WHERE username=json_extract(wanted.value,'$.username')))
  ) ${membershipGuard}`;
  // CHECK(valid=1) aborts the whole batch if a revision or membership changed
  // after the read, before any user's data is changed. D1 batch is transactional.
  const statements = [db.prepare(`INSERT INTO admin_user_action_guard(id,valid) SELECT ?,CASE WHEN (${matching})=? THEN 1 ELSE 0 END`).bind(id, expected, selected.length)];
  const ids = "SELECT json_extract(value,'$.id') FROM json_each(?) WHERE json_extract(value,'$.id') IS NOT NULL";
  if (['disable', 'mute', 'unmute'].includes(body.action)) {
    const field = body.action === 'disable' ? 'disabled' : 'muted';
    const value = body.action === 'unmute' ? 0 : 1;
    statements.push(db.prepare(`UPDATE students SET ${field}=?,revision=revision+1 WHERE id IN (${ids})`).bind(value, expected));
    for (const account of selected.filter(a => !a.id)) {
      const cfg = config.accounts.users.find(c => c.username === account.username);
      const credentials = await configuredCredentials(cfg, null);
      statements.push(db.prepare('INSERT INTO students(id,username,hash,salt,hero,role,disabled,muted,spawn,managed,provisioned,revision) VALUES(?,?,?,?,?,?,?,?,?,1,1,1)').bind(
        crypto.randomUUID(), account.username, credentials.hash, credentials.salt, account.hero, account.role,
        +(body.action === 'disable'), +(body.action === 'mute'), account.spawn ? JSON.stringify(account.spawn) : null,
      ));
    }
    if (body.action === 'disable') {
      statements.push(db.prepare(`DELETE FROM sessions WHERE user IN (${ids})`).bind(expected));
      statements.push(db.prepare(`DELETE FROM player_presence WHERE user IN (${ids})`).bind(expected));
    }
  } else if (body.action === 'remove-team') {
    statements.push(db.prepare(`UPDATE students SET revision=revision+1 WHERE id IN (${ids})`).bind(expected));
    statements.push(db.prepare(`DELETE FROM team_members WHERE user IN (${ids})`).bind(expected));
    statements.push(db.prepare(`DELETE FROM player_presence WHERE user IN (${ids})`).bind(expected));
  } else {
    statements.push(db.prepare("INSERT INTO deleted_accounts(username,deleted_at) SELECT json_extract(value,'$.username'),? FROM json_each(?) WHERE true ON CONFLICT(username) DO UPDATE SET deleted_at=excluded.deleted_at").bind(Date.now(), expected));
    for (const table of ['sessions','solved','purchased_hints','written_responses','answer_attempts','discovered_challenges','challenge_cutscenes','entity_activations','entity_dialogue_progress','entity_dialogue_outputs','earned_rewards','unlocked_transports','team_members','player_presence','notification_reads']) {
      statements.push(db.prepare(`DELETE FROM ${table} WHERE user IN (${ids})`).bind(expected));
    }
    statements.push(db.prepare(`UPDATE team_messages SET sender_user=NULL WHERE sender_user IN (${ids})`).bind(expected));
    statements.push(db.prepare(`DELETE FROM instructor_messages WHERE sender_user IN (${ids})`).bind(expected));
    statements.push(db.prepare("DELETE FROM notification_recipients WHERE username IN (SELECT json_extract(value,'$.username') FROM json_each(?))").bind(expected));
    statements.push(db.prepare(`DELETE FROM students WHERE id IN (${ids})`).bind(expected));
  }
  statements.push(db.prepare('DELETE FROM admin_user_action_guard WHERE id=?').bind(id));
  try { await db.batch(statements); }
  catch (error) {
    if (/admin_user_action_guard|CHECK constraint|UNIQUE constraint/i.test(error.message)) {
      return reply({error:'A selected user changed. Refresh users and select them again.'}, 409);
    }
    throw error;
  }
  return reply({users:await accountList(), characters:config.characters, updated:selected.length, skipped, action:body.action});
}
