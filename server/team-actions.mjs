// CTF-RPG — Copyright (c) 2026 Jaime C Acosta
export async function bulkTeamAction(db, body) {
  if (!['mute', 'unmute', 'disable', 'enable', 'delete'].includes(body.action) ||
      !Array.isArray(body.teams) || !body.teams.length || body.teams.length > 1000 ||
      body.teams.some(t => !t || typeof t.id !== 'string' || !t.id || t.id.length > 128 || !Number.isInteger(t.revision) || t.revision < 0) ||
      new Set(body.teams.map(t => t.id)).size !== body.teams.length)
    return {status:400, error:'Choose an action and 1–1000 teams with their current revisions.'};
  const selected = JSON.stringify(body.teams), guard = crypto.randomUUID();
  const ids = "SELECT json_extract(value,'$.id') FROM json_each(?)";
  // A failing CHECK rolls back the whole transactional D1/SQLite batch.
  const statements = [db.prepare(`INSERT INTO admin_user_action_guard(id,valid) SELECT ?,CASE WHEN
    (SELECT COUNT(*) FROM json_each(?) wanted JOIN teams t ON t.id=json_extract(wanted.value,'$.id') AND t.revision=json_extract(wanted.value,'$.revision'))=?
    THEN 1 ELSE 0 END`).bind(guard, selected, body.teams.length)];
  if (body.action === 'disable' || body.action === 'delete')
    statements.push(db.prepare(`DELETE FROM player_presence WHERE user IN (SELECT user FROM team_members WHERE team IN (${ids}))`).bind(selected));
  if (body.action === 'delete') {
    statements.push(db.prepare(`UPDATE students SET revision=revision+1 WHERE id IN (SELECT user FROM team_members WHERE team IN (${ids}))`).bind(selected));
    statements.push(db.prepare(`DELETE FROM team_members WHERE team IN (${ids})`).bind(selected));
    // Chat and team gifts are owned by the team and cascade; student progress stays.
    statements.push(db.prepare(`DELETE FROM teams WHERE id IN (${ids})`).bind(selected));
  } else {
    const field = ['mute','unmute'].includes(body.action) ? 'muted' : 'disabled';
    const value = ['mute','disable'].includes(body.action) ? 1 : 0;
    statements.push(db.prepare(`UPDATE teams SET ${field}=?,revision=revision+1 WHERE id IN (${ids})`).bind(value,selected));
  }
  statements.push(db.prepare('DELETE FROM admin_user_action_guard WHERE id=?').bind(guard));
  try { await db.batch(statements); }
  catch (e) {
    if (/admin_user_action_guard|CHECK constraint/i.test(e.message))
      return {status:409,error:'A selected team changed. Refresh teams and select them again.'};
    throw e;
  }
  return {status:200,updated:body.teams.length};
}

export async function teamRestriction(db, userId) {
  return await db.prepare('SELECT t.disabled,t.muted FROM team_members m JOIN teams t ON t.id=m.team WHERE m.user=?').bind(userId).first();
}
