const reply = (data, status = 200) => Response.json(data, {status, headers:{'Cache-Control':'no-store'}});

export async function chatClearedThrough(db, user) {
  if (!user) return 0;
  return (await db.prepare('SELECT cleared_through FROM chat_history_settings WHERE user=?').bind(user).first())?.cleared_through || 0;
}

// Personal clears affect only the authenticated viewer, including their unread counts.
export async function handleChatHistory(req, {db, user}) {
  const viewer = await user(req);
  if (!viewer) return reply({error:'Sign in to clear your chats.'},401);
  if (req.method !== 'POST') return reply({error:'Method not allowed.'},405);
  const body = await req.json();
  if (body.action !== 'clear-all') return reply({error:'Choose clear-all.'},400);
  const through = Date.now();
  await db.prepare('INSERT INTO chat_history_settings(user,cleared_through) VALUES(?,?) ON CONFLICT(user) DO UPDATE SET cleared_through=MAX(chat_history_settings.cleared_through,excluded.cleared_through)').bind(viewer.id,through).run();
  return reply({cleared:true,clearedThrough:through});
}

const sources = {team:'team_messages', instructor:'instructor_messages'};
const allChats = `SELECT 'team' AS kind,m.id,m.sender,COALESCE(s.username,'') AS username,m.sender_team AS from_id,
  COALESCE(f.name,'Instructors') AS from_name,m.recipient_team AS to_id,t.name AS to_name,m.text,m.created_at
  FROM team_messages m LEFT JOIN students s ON s.id=m.sender_user LEFT JOIN teams f ON f.id=m.sender_team JOIN teams t ON t.id=m.recipient_team
  UNION ALL SELECT 'instructor',m.id,m.sender,COALESCE(s.username,''),m.team,t.name,NULL,'Instructors',m.text,m.created_at
  FROM instructor_messages m LEFT JOIN students s ON s.id=m.sender_user JOIN teams t ON t.id=m.team`;

export async function handleAdminChats(req, {db,user,platformAdmin}) {
  const viewer = await user(req);
  if (!platformAdmin && viewer?.role !== 'admin') return reply({error:'Administrator access required.'},403);
  if (req.method === 'POST') {
    const body = await req.json();
    if (body.action === 'delete') {
      const table = Object.hasOwn(sources,body.kind) ? sources[body.kind] : null;
      if (!table || typeof body.id !== 'string' || body.id.length > 200) return reply({error:'Choose a chat message to delete.'},400);
      const result = await db.prepare(`DELETE FROM ${table} WHERE id=?`).bind(body.id).run();
      return reply({deleted:result.meta?.changes ?? result.changes ?? 0});
    }
    if (body.action === 'clear-all') {
      // Retain messages arriving after the administrator loaded the confirmation's snapshot.
      if (!Number.isSafeInteger(body.through) || body.through < 0 || body.through > Date.now()) return reply({error:'Refresh the chat history before clearing it.'},400);
      const results = await db.batch(Object.values(sources).map(table => db.prepare(`DELETE FROM ${table} WHERE created_at<=?`).bind(body.through)));
      return reply({deleted:results.reduce((n,r)=>n+(r.meta?.changes ?? r.changes ?? 0),0)});
    }
    return reply({error:'Choose delete or clear-all.'},400);
  }
  if (req.method !== 'GET') return reply({error:'Method not allowed.'},405);
  const params = new URL(req.url).searchParams;
  const query = (params.get('q') || '').trim(), from = params.get('from') || '', to = params.get('to') || '';
  const offset = Number(params.get('offset') || 0);
  if (query.length > 1000 || from.length > 200 || to.length > 200 || !Number.isSafeInteger(offset) || offset < 0) return reply({error:'Invalid chat filters.'},400);
  const through = Date.now();
  const conditions = ['created_at<=?'], args = [through];
  if (query) { conditions.push("(instr(lower(sender),lower(?))>0 OR instr(lower(username),lower(?))>0 OR instr(lower(text),lower(?))>0 OR instr(lower(from_name),lower(?))>0 OR instr(lower(to_name),lower(?))>0)");args.push(query,query,query,query,query); }
  if (from) { conditions.push("COALESCE(from_id,'instructors')=?");args.push(from); }
  if (to) { conditions.push("COALESCE(to_id,'instructors')=?");args.push(to); }
  const where = conditions.join(' AND ');
  const total = await db.prepare(`SELECT COUNT(*) AS count FROM (${allChats}) WHERE ${where}`).bind(...args).first();
  const messages = (await db.prepare(`SELECT * FROM (${allChats}) WHERE ${where} ORDER BY created_at DESC,kind,id DESC LIMIT 50 OFFSET ?`).bind(...args,offset).all()).results;
  const teams = (await db.prepare('SELECT id,name FROM teams ORDER BY name,id').bind().all()).results;
  const allTotal = await db.prepare(`SELECT COUNT(*) AS count FROM (${allChats}) WHERE created_at<=?`).bind(through).first();
  return reply({messages,total:total.count,allTotal:allTotal.count,through,teams});
}
