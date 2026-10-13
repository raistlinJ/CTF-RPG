// CTF-RPG — Copyright (c) 2026 Jaime C Acosta
const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const query=`SELECT a.id,a.user,s.username,a.challenge,a.object,a.question,a.answer,a.submitted_team AS team,a.submitted_at AS submittedAt,'automatic' AS grading,CASE WHEN a.correct=1 THEN 'correct' ELSE 'incorrect' END AS status,NULL AS grade,NULL AS maxPoints,NULL AS feedback,0 AS revision
 FROM answer_attempts a JOIN students s ON s.id=a.user
 UNION ALL
 SELECT 'manual:'||r.user||':'||r.challenge AS id,r.user,s.username,r.challenge,r.object,r.question,r.answer,r.submitted_team AS team,r.submitted_at AS submittedAt,'manual' AS grading,CASE WHEN r.grade IS NULL THEN 'pending' WHEN r.grade=r.max_points THEN 'correct' WHEN r.grade=0 THEN 'incorrect' ELSE 'partial' END AS status,r.grade,r.max_points AS maxPoints,r.feedback,r.revision
 FROM written_responses r JOIN students s ON s.id=r.user`;
export async function handleSubmissions(req,{db,user,platformAdmin}) {
 const u=await user(req);
 if(!platformAdmin && u?.role!=='admin')return reply({error:'Administrator access required.'},u?403:401);
 if(req.method==='POST') {
  let body;try{body=await req.json();}catch{return reply({error:'Invalid request.'},400);}
  const selections=body?.submissions;
  if(body?.action!=='delete'||!Array.isArray(selections)||!selections.length||selections.length>100||selections.some(s=>!s||typeof s.id!=='string'||s.id.length>256||!s.id.length||!Number.isInteger(s.revision)||s.revision<0||!Number.isInteger(s.submittedAt)||s.submittedAt<0)||new Set(selections.map(s=>s.id)).size!==selections.length)return reply({error:'Select 1–100 submissions with their current revisions.'},400);
  const expected=JSON.stringify(selections.map(s=>({id:s.id,revision:s.revision,submittedAt:s.submittedAt}))),matching=`SELECT r.* FROM (${query}) r JOIN json_each(?) wanted ON r.id=json_extract(wanted.value,'$.id') AND r.revision=json_extract(wanted.value,'$.revision') AND r.submittedAt=json_extract(wanted.value,'$.submittedAt')`;
  const found=(await db.prepare(matching).bind(expected).all()).results;
  if(found.length!==selections.length)return reply({error:'A selected submission changed or was deleted. Refresh and select it again.'},409);
  const pairs=[...new Map(found.map(r=>[JSON.stringify([r.user,r.challenge]),{user:r.user,challenge:r.challenge}])).values()],targets=JSON.stringify(pairs),guard='submission-reset-'+crypto.randomUUID();
  const statements=[db.prepare(`INSERT INTO admin_user_action_guard(id,valid) SELECT ?,CASE WHEN (SELECT COUNT(*) FROM (${matching}))=? THEN 1 ELSE 0 END`).bind(guard,expected,selections.length)];
  // One atomic reset per user/challenge, including unselected attempts for that pair.
  for(const table of ['answer_attempts','written_responses','solved','purchased_hints','earned_rewards','discovered_challenges','challenge_cutscenes']) statements.push(db.prepare(`DELETE FROM ${table} WHERE EXISTS (SELECT 1 FROM json_each(?) target WHERE ${table}.user=json_extract(target.value,'$.user') AND ${table}.challenge=json_extract(target.value,'$.challenge'))`).bind(targets));
  statements.push(db.prepare('DELETE FROM admin_user_action_guard WHERE id=?').bind(guard));
  try{await db.batch(statements);}catch(e){if(/admin_user_action_guard|CHECK constraint|UNIQUE constraint/i.test(e.message))return reply({error:'A selected submission changed. Refresh and select it again.'},409);throw e;}
  return reply({deleted:found.length,reset:pairs.length});
 }
 if(req.method!=='GET')return reply({error:'Method not allowed.'},405);
 const url=new URL(req.url),status=url.searchParams.get('status')||'all',offset=Number(url.searchParams.get('offset')||0),search=url.searchParams.get('search')||'';
 if(!['all','correct','incorrect','pending','partial'].includes(status)||!Number.isInteger(offset)||offset<0||offset>1000000||search.length>1000)return reply({error:'Invalid submission filter.'},400);
 const conditions=[],args=[];
 if(status!=='all'){conditions.push('status=?');args.push(status);}
 if(search.trim()) {
  // Bound substring matching: %, _, and SQL fragments are literal search text.
  conditions.push(`instr(lower(COALESCE(id,'')||char(10)||COALESCE(username,'')||char(10)||CASE WHEN team IS NULL THEN 'Not recorded' WHEN team='' THEN 'No team' ELSE team END||char(10)||COALESCE(challenge,'')||char(10)||COALESCE(object,'')||char(10)||COALESCE(question,'')||char(10)||COALESCE(answer,'')||char(10)||COALESCE(feedback,'')||char(10)||grading||char(10)||status||char(10)||CASE WHEN status='partial' THEN 'Partial credit' WHEN status='pending' THEN 'Pending Awaiting review' ELSE status END||char(10)||CASE WHEN grading='manual' THEN 'Written answer' ELSE 'Automatic' END||char(10)||CAST(COALESCE(grade,'') AS TEXT)||' / '||CAST(COALESCE(maxPoints,'') AS TEXT)||char(10)||COALESCE(datetime(submittedAt/1000,'unixepoch'),'')),lower(?))>0`);args.push(search.trim());
 }
 const clause=conditions.length?' WHERE '+conditions.join(' AND '):'';
 const total=await db.prepare('SELECT COUNT(*) AS n FROM ('+query+')'+clause).bind(...args).first();
 const rows=await db.prepare('SELECT * FROM ('+query+')'+clause+' ORDER BY submittedAt DESC,id DESC LIMIT 50 OFFSET ?').bind(...args,offset).all();
 return reply({submissions:rows.results,total:total.n,offset,limit:50});
}
