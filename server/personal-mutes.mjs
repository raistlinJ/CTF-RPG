import { effectiveAccount } from './passwords.mjs';
const reply = (data, status = 200) => Response.json(data, {status, headers:{'Cache-Control':'no-store'}});

export async function personalMuteContext(db, config, viewer, senderIds = []) {
  const settings = await db.prepare('SELECT mute_all,revision FROM personal_chat_settings WHERE user=?').bind(viewer).first();
  const overrides = (await db.prepare('SELECT target,muted FROM personal_chat_mutes WHERE user=?').bind(viewer).all()).results;
  const own = await db.prepare('SELECT team FROM team_members WHERE user=?').bind(viewer).first();
  const rows = senderIds.length ? (await db.prepare('SELECT s.*,m.team FROM students s LEFT JOIN team_members m ON m.user=s.id WHERE s.id IN (SELECT value FROM json_each(?))').bind(JSON.stringify([...new Set(senderIds.filter(Boolean))])).all()).results : [];
  const people = new Map(rows.map(row => [row.id,row]));
  const rules = new Map(overrides.map(row => [row.target,!!row.muted]));
  function canMute(target) {
    const row = people.get(target);
    if (!row || target === viewer || (own?.team && row.team === own.team)) return false;
    const account = effectiveAccount(row, config.accounts?.users.find(a => a.username === row.username), config);
    return account.role !== 'admin' && row.username !== config.admin?.protectedUsername;
  }
  return {
    canMute,
    isMuted: target => canMute(target) && (rules.get(target) ?? !!settings?.mute_all),
  };
}

export async function personalMuteSettings(db, viewer) {
  const settings = await db.prepare('SELECT mute_all,revision FROM personal_chat_settings WHERE user=?').bind(viewer).first();
  const rows = (await db.prepare('SELECT s.username,m.muted FROM personal_chat_mutes m JOIN students s ON s.id=m.target WHERE m.user=? ORDER BY s.username').bind(viewer).all()).results;
  return { muteAll:!!settings?.mute_all, revision:settings?.revision || 0, overrides:Object.fromEntries(rows.map(row => [row.username,!!row.muted])) };
}

export async function personalizeMessages(db, config, viewer, messages) {
  if (!viewer) return messages.map(({senderUser,...message})=>message);
  const context = await personalMuteContext(db,config,viewer,messages.map(m=>m.senderUser));
  return messages.map(({senderUser,...message}) => {
    const canPersonalMute = !!message.fromTeam && context.canMute(senderUser);
    const personalMuted = canPersonalMute && context.isMuted(senderUser);
    return { ...message, canPersonalMute, personalMuted, ...(personalMuted ? {text:null} : {}) };
  });
}

export async function handlePersonalMutes(req,{db,config,user}) {
  const viewer = await user(req);
  if (!viewer) return reply({error:'Sign in to manage your personal chat mutes.'},401);
  if (req.method === 'GET') return reply(await personalMuteSettings(db,viewer.id));
  if (req.method !== 'POST') return reply({error:'Method not allowed.'},405);
  const body = await req.json();
  if (!body || typeof body !== 'object' || Array.isArray(body) || !['set','mute-all','unmute-all'].includes(body.action) || !Number.isSafeInteger(body.revision) || body.revision < 0 ||
      (body.action === 'set' && (typeof body.username !== 'string' || !/^[a-z0-9_-]{3,24}$/.test(body.username) || typeof body.muted !== 'boolean')))
    return reply({error:'Choose a personal mute action and its current revision.'},400);
  const current = await personalMuteSettings(db,viewer.id);
  if (current.revision !== body.revision) return reply({error:'Your personal mutes changed. Refresh and try again.'},409);
  let target;
  if (body.action === 'set') {
    target = await db.prepare('SELECT id FROM students WHERE username=?').bind(body.username).first();
    if (!target) return reply({error:'This player is unavailable.'},404);
    const context = await personalMuteContext(db,config,viewer.id,[target.id]);
    if (!context.canMute(target.id)) return reply({error:'You can only personally mute other players outside your team. Teammates and administrators are exempt.'},400);
  }
  const guard = 'personal-mute-'+crypto.randomUUID();
  const statements = [db.prepare('INSERT INTO admin_user_action_guard(id,valid) SELECT ?,CASE WHEN COALESCE((SELECT revision FROM personal_chat_settings WHERE user=?),0)=? THEN 1 ELSE 0 END').bind(guard,viewer.id,body.revision)];
  const muteAll = body.action === 'set' ? current.muteAll : body.action === 'mute-all';
  statements.push(db.prepare('INSERT INTO personal_chat_settings(user,mute_all,revision) VALUES(?,?,1) ON CONFLICT(user) DO UPDATE SET mute_all=excluded.mute_all,revision=personal_chat_settings.revision+1').bind(viewer.id,+muteAll));
  if (target) statements.push(db.prepare('INSERT INTO personal_chat_mutes(user,target,muted) VALUES(?,?,?) ON CONFLICT(user,target) DO UPDATE SET muted=excluded.muted').bind(viewer.id,target.id,+body.muted));
  else statements.push(db.prepare('DELETE FROM personal_chat_mutes WHERE user=?').bind(viewer.id));
  statements.push(db.prepare('DELETE FROM admin_user_action_guard WHERE id=?').bind(guard));
  try { await db.batch(statements); }
  catch(error) {
    if (/admin_user_action_guard|CHECK constraint|UNIQUE constraint/i.test(error.message)) return reply({error:'Your personal mutes changed. Refresh and try again.'},409);
    throw error;
  }
  return reply(await personalMuteSettings(db,viewer.id));
}
