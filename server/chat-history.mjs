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
  UNION ALL SELECT 'instructor' AS kind,m.id,m.sender,COALESCE(s.username,'') AS username,m.team AS from_id,t.name AS from_name,NULL AS to_id,'Instructors' AS to_name,m.text,m.created_at
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
  if (query.length > 1000 || from.length > 200 || to.length > 200 || !Number.isSafeInteger(offset) || offset < 0 || offset > 1000000) return reply({error:'Invalid chat filters.'},400);
  let cursor;
  if (params.has('cursor')) {
    try {
      const raw = params.get('cursor');
      if (raw.length > 2000) throw Error();
      cursor = JSON.parse(raw);
      if (!cursor || !Number.isSafeInteger(cursor.at) || cursor.at < 0 || !Object.hasOwn(sources,cursor.kind) || typeof cursor.id !== 'string' || cursor.id.length > 200 || !Number.isSafeInteger(cursor.through) || cursor.through < cursor.at || cursor.through > Date.now() || offset) throw Error();
    } catch { return reply({error:'Invalid chat cursor. Refresh the history.'},400); }
  }
  const through = cursor?.through ?? Date.now();
  const conditions = ['created_at<=?'], args = [through];
  if (query) { conditions.push("(instr(lower(sender),lower(?))>0 OR instr(lower(username),lower(?))>0 OR instr(lower(text),lower(?))>0 OR instr(lower(from_name),lower(?))>0 OR instr(lower(to_name),lower(?))>0)");args.push(query,query,query,query,query); }
  if (from) { conditions.push(from === 'instructors' ? 'from_id IS NULL' : 'from_id=?');if (from !== 'instructors') args.push(from); }
  if (to) { conditions.push(to === 'instructors' ? 'to_id IS NULL' : 'to_id=?');if (to !== 'instructors') args.push(to); }
  const where = conditions.join(' AND ');
  // Covering time indexes count the source tables without joining every message
  // to accounts and teams. With no filters, reuse this count for both totals.
  const allTotal = (await db.prepare('SELECT (SELECT COUNT(*) FROM team_messages WHERE created_at<=?)+(SELECT COUNT(*) FROM instructor_messages WHERE created_at<=?) AS count').bind(through,through).first()).count;
  const total = !query && !from && !to ? allTotal : (await db.prepare(`SELECT COUNT(*) AS count FROM (${allChats}) WHERE ${where}`).bind(...args).first()).count;
  // Bound each ordered source before merging: the outer sort handles at most
  // 102 rows for cursor pages, rather than sorting the complete joined history.
  const sourceArgs = [];
  const orderedSources = allChats.split(/\s+UNION ALL\s+/).map((source,index) => {
    const kind = index === 0 ? 'team' : 'instructor';
    let boundary = '', bindings = [];
    if (cursor) {
      if (kind === cursor.kind) { boundary = ' AND (m.created_at,m.id)<(?,?)'; bindings = [cursor.at,cursor.id]; }
      else { boundary = kind < cursor.kind ? ' AND m.created_at<=?' : ' AND m.created_at<?'; bindings = [cursor.at]; }
    }
    sourceArgs.push(...args,...bindings,offset+51);
    return `SELECT * FROM (${source} WHERE ${where}${boundary} ORDER BY m.created_at DESC,m.id DESC LIMIT ?)`;
  });
  const rows = (await db.prepare(`${orderedSources.join(' UNION ALL ')} ORDER BY created_at DESC,kind DESC,id DESC LIMIT 51 OFFSET ?`).bind(...sourceArgs,offset).all()).results;
  const messages = rows.slice(0,50), last = messages.at(-1);
  const nextCursor = rows.length > 50 ? JSON.stringify({at:last.created_at,kind:last.kind,id:last.id,through}) : null;
  const teams = (await db.prepare('SELECT id,name FROM teams ORDER BY name,id').bind().all()).results;
  return reply({messages,total,allTotal,through,teams,nextCursor});
}
