// CTF-RPG — Copyright (c) 2026 Jaime C Acosta
const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function handleSubmissions(req,{db,user,platformAdmin}) {
 const u=await user(req);
 if(!platformAdmin && u?.role!=='admin')return reply({error:'Administrator access required.'},u?403:401);
 if(req.method!=='GET')return reply({error:'Method not allowed.'},405);
 const url=new URL(req.url),status=url.searchParams.get('status')||'all',offset=Number(url.searchParams.get('offset')||0);
 if(!['all','correct','incorrect','pending','partial'].includes(status)||!Number.isInteger(offset)||offset<0||offset>1000000)return reply({error:'Invalid submission filter.'},400);
 const query=`SELECT a.id,a.user,s.username,a.challenge,a.object,a.question,a.answer,a.submitted_team AS team,a.submitted_at AS submittedAt,'automatic' AS grading,CASE WHEN a.correct=1 THEN 'correct' ELSE 'incorrect' END AS status,NULL AS grade,NULL AS maxPoints,NULL AS feedback
 FROM answer_attempts a JOIN students s ON s.id=a.user
 UNION ALL
 SELECT 'manual:'||r.user||':'||r.challenge AS id,r.user,s.username,r.challenge,r.object,r.question,r.answer,r.submitted_team AS team,r.submitted_at AS submittedAt,'manual' AS grading,CASE WHEN r.grade IS NULL THEN 'pending' WHEN r.grade=r.max_points THEN 'correct' WHEN r.grade=0 THEN 'incorrect' ELSE 'partial' END AS status,r.grade,r.max_points AS maxPoints,r.feedback
 FROM written_responses r JOIN students s ON s.id=r.user`;
 const clause=status==='all'?'':' WHERE status=?';
 const args=status==='all'?[]:[status];
 const total=await db.prepare('SELECT COUNT(*) AS n FROM ('+query+')'+clause).bind(...args).first();
 const rows=await db.prepare('SELECT * FROM ('+query+')'+clause+' ORDER BY submittedAt DESC,id DESC LIMIT 50 OFFSET ?').bind(...args,offset).all();
 return reply({submissions:rows.results,total:total.n,offset,limit:50});
}
