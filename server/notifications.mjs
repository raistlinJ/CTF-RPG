// CTF-RPG — Copyright (c) 2026 Jaime C Acosta
const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const visible="(n.scope='all' OR EXISTS(SELECT 1 FROM notification_recipients p WHERE p.notification=n.id AND p.username=?))";
export async function notificationStats(db,u){
 const row=await db.prepare(`SELECT COUNT(*) AS unread,COALESCE(MAX(n.created_at),0) AS latestAt FROM notifications n LEFT JOIN notification_reads r ON r.notification=n.id AND r.user=? WHERE ${visible} AND r.notification IS NULL`).bind(u.id,u.username).first();return row;
}
export async function handleNotifications(req,{db,config,user,platformAdmin}){
 const u=await user(req),admin=platformAdmin||u?.role==='admin',url=new URL(req.url),manage=url.pathname.startsWith('/api/admin/');
 if(manage&&!admin)return reply({error:'Administrator access required.'},u?403:401);
 if(!manage&&!u)return reply({error:'Sign in to read notifications.'},401);
 if(req.method==='GET'){
  const offset=Number(url.searchParams.get('offset')||0);if(!Number.isInteger(offset)||offset<0||offset>1000000)return reply({error:'Invalid notification page.'},400);
  if(manage){const users=(await db.prepare('SELECT username FROM students WHERE disabled=0 ORDER BY username').bind().all()).results.map(r=>r.username);for(const c of config.accounts.users)if(!users.includes(c.username))users.push(c.username);return reply({notifications:(await db.prepare('SELECT * FROM notifications ORDER BY created_at DESC,id DESC LIMIT 50 OFFSET ?').bind(offset).all()).results.map(r=>({...r,targets:JSON.parse(r.targets)})),users:users.sort(),teams:(await db.prepare('SELECT id,name FROM teams ORDER BY name').bind().all()).results});}
  if(url.searchParams.get('summary')==='true')return reply(await notificationStats(db,u));
  const rows=(await db.prepare(`SELECT n.id,n.title,n.body,n.author,n.created_at,r.read_at FROM notifications n LEFT JOIN notification_reads r ON r.notification=n.id AND r.user=? WHERE ${visible} ORDER BY n.created_at DESC,n.id DESC LIMIT 50 OFFSET ?`).bind(u.id,u.username,offset).all()).results;
  return reply({notifications:rows,...await notificationStats(db,u),offset,limit:50});
 }
 if(req.method!=='POST')return reply({error:'Method not allowed.'},405);
 const b=await req.json();
 if(!manage){
  if(b.action!=='read'&&b.action!=='readAll')return reply({error:'Choose a valid read action.'},400);
  if(b.action==='read'&&typeof b.id!=='string')return reply({error:'Choose a notification.'},400);
  const sql=`INSERT OR IGNORE INTO notification_reads(notification,user,read_at) SELECT n.id,?,? FROM notifications n WHERE ${visible}`+(b.action==='read'?' AND n.id=?':'');
  await db.prepare(sql).bind(u.id,Date.now(),u.username,...(b.action==='read'?[b.id]:[])).run();return reply(await notificationStats(db,u));
 }
 if(typeof b.id!=='string'||!/^[a-zA-Z0-9-]{8,128}$/.test(b.id)||typeof b.title!=='string'||!b.title.trim()||b.title.length>120||typeof b.body!=='string'||!b.body.trim()||b.body.length>5000||!['all','users','teams'].includes(b.scope)||!Array.isArray(b.targets)||b.targets.length>1000||b.targets.some(t=>typeof t!=='string'))return reply({error:'Provide a title, message and valid recipients.'},400);
 const targets=[...new Set(b.targets)].sort(),saved=await db.prepare('SELECT * FROM notifications WHERE id=?').bind(b.id).first();
 if(saved)return saved.title===b.title.trim()&&saved.body===b.body.trim()&&saved.scope===b.scope&&saved.targets===JSON.stringify(targets)?reply({sent:true,id:saved.id}):reply({error:'Notification reference already used.'},409);
 const recipients=new Set();
 if(b.scope==='users'){
  const users=new Set((await db.prepare('SELECT username FROM students WHERE disabled=0').bind().all()).results.map(r=>r.username));config.accounts.users.forEach(c=>users.add(c.username));
  if(!targets.length||targets.some(t=>!users.has(t)))return reply({error:'Select existing users.'},400);targets.forEach(t=>recipients.add(t));
 }else if(b.scope==='teams'){
  const teams=new Set((await db.prepare('SELECT id FROM teams').bind().all()).results.map(r=>r.id));if(!targets.length||targets.some(t=>!teams.has(t)))return reply({error:'Select existing teams.'},400);
  const rows=(await db.prepare(`SELECT s.username FROM team_members m JOIN students s ON s.id=m.user WHERE s.disabled=0 AND m.team IN (${targets.map(()=>'?').join(',')})`).bind(...targets).all()).results;rows.forEach(r=>recipients.add(r.username));if(!recipients.size)return reply({error:'The selected teams have no active members.'},400);
 }else if(targets.length)return reply({error:'Everyone does not need a recipient list.'},400);
 if(recipients.size>1000)return reply({error:'Select up to 1,000 active recipients, or use Everyone.'},400);
 try {await db.batch([db.prepare('INSERT INTO notifications(id,title,body,author,scope,targets,created_at) VALUES(?,?,?,?,?,?,?)').bind(b.id,b.title.trim(),b.body.trim(),u?.username||'Administrator',b.scope,JSON.stringify(targets),Date.now()),...[...recipients].map(username=>db.prepare('INSERT INTO notification_recipients(notification,username) VALUES(?,?)').bind(b.id,username))]);}catch(e){
  const previous=await db.prepare('SELECT * FROM notifications WHERE id=?').bind(b.id).first();
  if(previous&&previous.title===b.title.trim()&&previous.body===b.body.trim()&&previous.scope===b.scope&&previous.targets===JSON.stringify(targets))return reply({sent:true,id:b.id});
  if(previous)return reply({error:'Notification reference already used.'},409);throw e;
 }
 return reply({sent:true,id:b.id,recipients:b.scope==='all'?'everyone':recipients.size});
}
