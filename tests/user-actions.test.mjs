import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,symlinkSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {unzipSync} from 'fflate';
import {createSQLiteAdapter,initializeSchema} from '../server/sqlite.mjs';
import {createApi} from '../server/api.mjs';
import {parseGame,parseChallenges} from '../lib/config-schema.mjs';
import {createSnapshot,exportFullBackup,validateSnapshot} from '../server/backup.mjs';
import {ensureStartupAdmin} from '../server/protected-admin.mjs';
const challenges=parseChallenges(readFileSync('content/challenges.yaml','utf8'));
function setup() {
  const sqlite=new DatabaseSync(':memory:');initializeSchema(sqlite);
  const config=parseGame('admin:\n protectedUsername: teacher\ncharacters:\n - id: web\n   name: Web\naccounts:\n allowRegistration: true\n users:\n  - username: teacher\n    password: teacher-password\n    role: admin\n    hero: web\n  - username: pending\n    password: pending-password\n    hero: web');
  const base=createSQLiteAdapter(sqlite);let beforeBatch, beforeRun;
  const db={...base,prepare(sql){const statement=base.prepare(sql);return{bind(...args){const bound=statement.bind(...args);return{...bound,async run(){if(beforeRun){const run=beforeRun;beforeRun=null;run(sql);}return bound.run();}};}};},async batch(statements){if(beforeBatch){const run=beforeBatch;beforeBatch=null;run();}return base.batch(statements);}};
  const api=createApi({db,config,challenges});
  function client(){let cookie='';return async(path,body,extra={})=>{const r=await api(new Request('https://quest.test'+path,{method:body?'POST':'GET',headers:{Origin:'https://quest.test',Cookie:cookie,'Content-Type':'application/json',...extra},body:body?JSON.stringify(body):undefined}));if(r.headers.has('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return{status:r.status,data:await r.json()};};}
  return{sqlite,config,db,client,race(fn){beforeBatch=fn;},raceRun(fn){beforeRun=fn;}};
}
async function login(client,username='teacher'){const r=await client('/api/auth',{username,password:username==='teacher'?'teacher-password':'student-password',hero:'web',mode:username==='teacher'?'login':'register'});assert.equal(r.status,200,JSON.stringify(r.data));return r.data.user;}
async function targets(admin,names){const all=(await admin('/api/admin/users')).data.users;return names.map(name=>{const a=all.find(a=>a.username===name);assert.ok(a,name);return{username:a.username,revision:a.revision,team:a.team?.id??null};});}
async function bulk(admin,action,names){return admin('/api/admin/users',{action,users:await targets(admin,names)});}

test('select-all deletion keeps the configured admin and deletes every other selected account, including the acting admin',async()=>{
 const s=setup();try{
  const primary=s.client(),second=s.client(),alice=s.client(),bob=s.client();await login(primary);await login(alice,'alice');await login(bob,'bob');
  assert.equal((await primary('/api/admin/users',{username:'secondadmin',password:'second-password',hero:'web',role:'admin',disabled:false,revision:0,editing:false})).status,200);
  assert.equal((await second('/api/auth',{username:'secondadmin',password:'second-password',mode:'login'})).status,200);
  const teacher=(await targets(second,['teacher']))[0];
  for(const change of [{role:'student',disabled:false},{role:'admin',disabled:true}])assert.equal((await second('/api/admin/users',{...teacher,username:'teacher',hero:'web',editing:true,...change})).status,400);
  const disabled=await bulk(second,'disable',['teacher','bob']);assert.equal(disabled.status,200);assert.equal(disabled.data.updated,1);assert.deepEqual(disabled.data.skipped,['teacher']);
  const before=s.sqlite.prepare('SELECT * FROM students WHERE username=?').get('teacher');
  const selected=await targets(second,['teacher','secondadmin','alice','bob','pending']);selected.find(a=>a.username==='teacher').revision=999;
  const deleted=await second('/api/admin/users',{action:'delete',users:selected});assert.equal(deleted.status,200,JSON.stringify(deleted.data));assert.equal(deleted.data.updated,4);assert.deepEqual(deleted.data.skipped,['teacher']);assert.deepEqual(deleted.data.users.map(a=>a.username),['teacher']);assert.equal(deleted.data.users[0].protected,true);
  assert.deepEqual(s.sqlite.prepare('SELECT * FROM students WHERE username=?').get('teacher'),before);
  assert.equal(s.sqlite.prepare('SELECT COUNT(*) n FROM deleted_accounts WHERE username=?').get('teacher').n,0);
  assert.equal((await second('/api/admin/users')).status,401);assert.equal((await primary('/api/admin/users')).status,200);
  const snapshot=await createSnapshot({db:s.db,config:s.config,challenges});assert.equal(snapshot.config.admin.protectedUsername,'teacher');assert.equal(snapshot.accounts[0].role,'admin');
  const damaged=structuredClone(snapshot);damaged.accounts[0].disabled=1;assert.throws(()=>validateSnapshot(damaged),/protected administrator/);
 }finally{s.sqlite.close();}
});

test('startup restores protected admin access without changing its credentials, identity, or progress',async()=>{
 const s=setup();try{
  const primary=s.client();await login(primary);
  assert.equal((await primary('/api/game',{id:'lantern',answer:'24'})).status,200);
  const before=s.sqlite.prepare('SELECT * FROM students WHERE username=?').get('teacher');
  s.sqlite.prepare("UPDATE students SET role='student',disabled=1 WHERE username=?").run('teacher');
  s.sqlite.prepare('INSERT INTO deleted_accounts(username,deleted_at) VALUES(?,?)').run('teacher',Date.now());
  await ensureStartupAdmin(s.db,s.config);
  const after=s.sqlite.prepare('SELECT * FROM students WHERE username=?').get('teacher');assert.equal(after.role,'admin');assert.equal(after.disabled,0);assert.equal(after.hash,before.hash);assert.equal(after.salt,before.salt);assert.equal(after.id,before.id);assert.equal(after.hero,before.hero);
  assert.equal(s.sqlite.prepare('SELECT points FROM solved WHERE user=? AND challenge=?').get(after.id,'lantern').points,100);
  assert.equal(s.sqlite.prepare('SELECT COUNT(*) n FROM deleted_accounts WHERE username=?').get('teacher').n,0);
  await ensureStartupAdmin(s.db,s.config);assert.deepEqual(s.sqlite.prepare('SELECT * FROM students WHERE username=?').get('teacher'),after);assert.equal((await primary('/api/admin/users')).status,200);
 }finally{s.sqlite.close();}
});

test('user profiles include teams; bulk mute, removal and disable enforce access and preserve progress',async()=>{
 const s=setup();try{
  const admin=s.client(),alice=s.client(),bob=s.client();await login(admin);const a=await login(alice,'alice');await login(bob,'bob');
  const team=(await alice('/api/teams',{mode:'create',name:'Classroom team',password:'team-password'})).data.team;
  await bob('/api/teams',{mode:'join',id:team.id,password:'team-password'});
  await alice('/api/game',{id:'lantern',answer:'24'});
  let rows=(await admin('/api/admin/users')).data.users;assert.deepEqual(rows.find(u=>u.username==='alice').team,{id:team.id,name:team.name});
  const payload={action:'mute',users:await targets(admin,['alice','bob'])};assert.equal((await s.client()('/api/admin/users',payload)).status,401);assert.equal((await alice('/api/admin/users',payload)).status,403);assert.equal((await admin('/api/admin/users',payload,{Origin:'https://other.test'})).status,403);
  let r=await bulk(admin,'mute',['alice','bob']);assert.equal(r.status,200,JSON.stringify(r.data));assert.ok(r.data.users.filter(u=>['alice','bob'].includes(u.username)).every(u=>u.muted));assert.equal((await alice('/api/team-social',{id:crypto.randomUUID(),team:team.id,text:'Cannot send'})).status,403);
  r=await bulk(admin,'remove-team',['alice','bob']);assert.equal(r.status,200,JSON.stringify(r.data));assert.equal((await alice('/api/teams')).data.team,null);assert.equal((await alice('/api/game')).data.score,100);assert.equal(s.sqlite.prepare('SELECT COUNT(*) n FROM teams').get().n,1);
  assert.equal((await alice('/api/teams',{mode:'join',id:team.id,password:'team-password'})).status,200);
  r=await bulk(admin,'disable',['alice','bob']);assert.equal(r.status,200,JSON.stringify(r.data));assert.equal((await alice('/api/game')).status,401);assert.equal(s.sqlite.prepare('SELECT COUNT(*) n FROM solved WHERE user=?').get(a.id).n,1);assert.equal((await admin('/api/scoreboard')).data.players.some(u=>u.username==='alice'),false);
  for(const action of ['disable','delete']){const kept=await bulk(admin,action,['teacher']);assert.equal(kept.status,200);assert.equal(kept.data.updated,0);assert.deepEqual(kept.data.skipped,['teacher']);}
 }finally{s.sqlite.close();}
});

test('stale revisions or membership races reject the entire bulk operation',async()=>{
 const s=setup();try{
  const admin=s.client(),alice=s.client(),bob=s.client();await login(admin);const a=await login(alice,'alice');const b=await login(bob,'bob');
  const old=await targets(admin,['alice','bob']);s.sqlite.prepare('UPDATE students SET revision=revision+1 WHERE id=?').run(b.id);
  assert.equal((await admin('/api/admin/users',{action:'mute',users:old})).status,409);assert.equal(s.sqlite.prepare('SELECT muted FROM students WHERE id=?').get(a.id).muted,0);
  const current=await targets(admin,['alice','bob']);s.race(()=>s.sqlite.prepare('UPDATE students SET revision=revision+1 WHERE id=?').run(b.id));
  assert.equal((await admin('/api/admin/users',{action:'disable',users:current})).status,409);assert.equal(s.sqlite.prepare('SELECT SUM(disabled) n FROM students').get().n,0);assert.equal(s.sqlite.prepare('SELECT COUNT(*) n FROM admin_user_action_guard').get().n,0);
  const team=(await alice('/api/teams',{mode:'create',name:'First',password:'team-password'})).data.team;const other=(await bob('/api/teams',{mode:'create',name:'Second',password:'team-password'})).data.team;
  const expected=await targets(admin,['alice']);s.race(()=>s.sqlite.prepare('UPDATE team_members SET team=? WHERE user=?').run(other.id,a.id));
  assert.equal((await admin('/api/admin/users',{action:'remove-team',users:expected})).status,409);assert.equal(s.sqlite.prepare('SELECT team FROM team_members WHERE user=?').get(a.id).team,other.id);assert.ok(team.id);
 }finally{s.sqlite.close();}
});

test('deleting users cleans up dependent records, keeps shared team history, and survives recreation and backup restore',async()=>{
 const s=setup(),directory=mkdtempSync(resolve(tmpdir(),'ctf-user-delete-'));try{
  const admin=s.client(),alice=s.client();await login(admin);const a=await login(alice,'alice');
  const team=(await alice('/api/teams',{mode:'create',name:'Keep this team',password:'team-password'})).data.team;
  await alice('/api/game',{id:'lantern',action:'hint',hintId:'multiply'});await alice('/api/game',{id:'lantern',answer:'24'});
  await alice('/api/team-social',{id:crypto.randomUUID(),team:team.id,text:'Shared message'});await alice('/api/team-social',{id:crypto.randomUUID(),team:'instructors',text:'Instructor message'});
  await admin('/api/admin/notifications',{id:crypto.randomUUID(),title:'Notice',body:'Body',scope:'all',targets:[]});await alice('/api/notifications',{action:'readAll'});
  let r=await bulk(admin,'delete',['alice','pending']);assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.users.some(u=>['alice','pending'].includes(u.username)),false);assert.equal((await alice('/api/game')).status,401);
  assert.equal((await s.client()('/api/auth',{username:'pending',password:'pending-password',mode:'login'})).status,401);
  for(const table of ['sessions','solved','purchased_hints','written_responses','answer_attempts','discovered_challenges','team_members','player_presence','notification_reads'])assert.equal(s.sqlite.prepare(`SELECT COUNT(*) n FROM ${table} WHERE user=?`).get(a.id).n,0,table);
  assert.equal(s.sqlite.prepare('SELECT sender_user FROM team_messages WHERE text=?').get('Shared message').sender_user,null);assert.equal(s.sqlite.prepare('SELECT COUNT(*) n FROM instructor_messages WHERE sender_user=?').get(a.id).n,0);assert.equal(s.sqlite.prepare('SELECT COUNT(*) n FROM teams').get().n,1);
  const snapshot=await createSnapshot({db:s.db,config:s.config,challenges});assert.deepEqual(snapshot.deletedAccounts.map(a=>a.username),['alice','pending']);assert.equal(snapshot.accounts.some(a=>a.username==='pending'),false);assert.equal(snapshot.config.accounts.users.some(a=>a.username==='pending'),false);
  const legacy={...snapshot};delete legacy.deletedAccounts;assert.deepEqual(validateSnapshot(legacy).deletedAccounts,[]);
  const zip=await exportFullBackup({db:s.db,config:s.config,challenges});const entries=unzipSync(new Uint8Array(await zip.arrayBuffer()));
  for(const [path,bytes] of Object.entries(entries)){const destination=resolve(directory,path);mkdirSync(dirname(destination),{recursive:true});writeFileSync(destination,bytes);}symlinkSync(resolve('node_modules'),resolve(directory,'node_modules'),'dir');
  const restored=spawnSync(process.execPath,['server/restore.mjs','backup.json'],{cwd:directory,encoding:'utf8'});assert.equal(restored.status,0,restored.stderr);
  const database=new DatabaseSync(resolve(directory,'data/quest.sqlite'));assert.equal(database.prepare('SELECT COUNT(*) n FROM deleted_accounts').get().n,2);database.close();
  // Explicitly creating a replacement gives it fresh credentials and progress.
  r=await admin('/api/admin/users',{username:'pending',password:'replacement-password',hero:'web',role:'student',disabled:false,editing:false,revision:0});assert.equal(r.status,200,JSON.stringify(r.data));
  const replacement=s.client();assert.equal((await replacement('/api/auth',{username:'pending',password:'pending-password',mode:'login'})).status,401);assert.equal((await replacement('/api/auth',{username:'pending',password:'replacement-password',mode:'login'})).status,200);assert.equal((await replacement('/api/game')).data.score,0);
 }finally{s.sqlite.close();rmSync(directory,{recursive:true,force:true});}
});

test('bulk actions materialize pending YAML users without replacing their credentials',async()=>{
 const s=setup();try{
  const admin=s.client();await login(admin);let r=await bulk(admin,'mute',['pending']);assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.users.find(a=>a.username==='pending').muted,true);
  const pending=s.client();assert.equal((await pending('/api/auth',{username:'pending',password:'pending-password',mode:'login'})).status,200);
  r=await bulk(admin,'disable',['pending']);assert.equal(r.status,200);assert.equal((await pending('/api/game')).status,401);
  for(const body of [{action:'unknown',users:[]},{action:'mute',users:[]},{action:'mute',users:[{username:'bad!',revision:0}]}])assert.equal((await admin('/api/admin/users',body)).status,400);
 }finally{s.sqlite.close();}
});

test('an in-flight first login or profile save cannot recreate a deleted YAML user',async()=>{
 for(const operation of ['login','edit']){
  const s=setup();try{
   const admin=s.client();await login(admin);
   s.raceRun(sql=>{assert.match(sql,/INSERT.*INTO students/);s.sqlite.prepare('INSERT INTO deleted_accounts(username,deleted_at) VALUES(?,?)').run('pending',Date.now());});
   const r=operation==='login'
    ? await s.client()('/api/auth',{username:'pending',password:'pending-password',mode:'login'})
    : await admin('/api/admin/users',{username:'pending',hero:'web',role:'student',disabled:false,editing:true,revision:0});
   assert.equal(r.status,operation==='login'?401:409,JSON.stringify(r.data));
   assert.equal(s.sqlite.prepare('SELECT COUNT(*) n FROM students WHERE username=?').get('pending').n,0);
   assert.equal((await admin('/api/admin/users')).data.users.some(a=>a.username==='pending'),false);
  }finally{s.sqlite.close();}
 }
});

test('single and bulk user unmute restore chat, preserve independent team/disabled flags, and reject unauthorized or stale changes',async()=>{
 const s=setup();try{
  const admin=s.client(),alice=s.client(),bob=s.client();await login(admin);const a=await login(alice,'alice');await login(bob,'bob');
  const team=(await alice('/api/teams',{mode:'create',name:'Unmute team',password:'team-password'})).data.team;
  await bob('/api/teams',{mode:'join',id:team.id,password:'team-password'});await alice('/api/game',{id:'lantern',answer:'24'});
  assert.equal((await bulk(admin,'mute',['alice','bob'])).status,200);
  const selected=await targets(admin,['alice']);const payload={action:'unmute',users:selected};
  assert.equal((await s.client()('/api/admin/users',payload)).status,401);
  assert.equal((await alice('/api/admin/users',payload)).status,403);
  assert.equal((await admin('/api/admin/users',payload,{Origin:'https://other.test'})).status,403);
  let r=await admin('/api/admin/users',payload);assert.equal(r.status,200);assert.equal(r.data.updated,1);
  assert.equal(r.data.users.find(u=>u.username==='alice').muted,false);assert.equal(r.data.users.find(u=>u.username==='bob').muted,true);
  assert.equal((await alice('/api/team-social',{id:crypto.randomUUID(),team:team.id,text:'Chat restored'})).status,200);
  assert.equal((await bob('/api/team-social',{id:crypto.randomUUID(),team:team.id,text:'Still muted'})).status,403);
  assert.equal((await admin('/api/admin/users',payload)).status,409,'old row revisions cannot be reused');
  const managed=(await admin('/api/admin/teams')).data.teams.find(t=>t.id===team.id);
  assert.equal((await admin('/api/admin/teams',{action:'mute',teams:[{id:team.id,revision:managed.revision}]})).status,200);
  assert.equal((await bulk(admin,'disable',['bob'])).status,200);
  r=await bulk(admin,'unmute',['alice','bob']);assert.equal(r.status,200);assert.equal(r.data.updated,2);
  assert.ok(r.data.users.filter(u=>['alice','bob'].includes(u.username)).every(u=>!u.muted));
  assert.equal(r.data.users.find(u=>u.username==='bob').disabled,true);
  assert.equal(s.sqlite.prepare('SELECT muted FROM teams WHERE id=?').get(team.id).muted,1);
  assert.equal((await alice('/api/team-social',{id:crypto.randomUUID(),team:team.id,text:'Team remains muted'})).status,403);
  assert.equal((await alice('/api/game')).data.score,100);assert.equal((await alice('/api/teams')).data.team.id,team.id);
  assert.equal(s.sqlite.prepare('SELECT COUNT(*) n FROM sessions WHERE user=?').get(a.id).n,1,'unmute keeps sessions');
  assert.equal(s.sqlite.prepare('SELECT COUNT(*) n FROM team_members WHERE team=?').get(team.id).n,2);
 }finally{s.sqlite.close();}
});

test('bulk unmute rolls back all selected users if a revision changes during the operation',async()=>{
 const s=setup();try{
  const admin=s.client();await login(admin);await login(s.client(),'alice');await login(s.client(),'bob');
  await bulk(admin,'mute',['alice','bob']);const selection=await targets(admin,['alice','bob']);
  s.race(()=>s.sqlite.prepare("UPDATE students SET revision=revision+1 WHERE username='alice'").run());
  const r=await admin('/api/admin/users',{action:'unmute',users:selection});assert.equal(r.status,409);
  assert.equal(s.sqlite.prepare("SELECT SUM(muted) n FROM students WHERE username IN ('alice','bob')").get().n,2);
  assert.equal(s.sqlite.prepare('SELECT COUNT(*) n FROM admin_user_action_guard').get().n,0);
 }finally{s.sqlite.close();}
});
