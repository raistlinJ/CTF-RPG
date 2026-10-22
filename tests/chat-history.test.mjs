import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, cpSync, writeFileSync, symlinkSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createApi } from '../server/api.mjs';
import { initializeSchema, createSQLiteAdapter } from '../server/sqlite.mjs';
import { parseGame } from '../lib/config-schema.mjs';
import { createSnapshot, validateSnapshot } from '../server/backup.mjs';

async function fixture() {
  const sqlite=new DatabaseSync(':memory:');initializeSchema(sqlite);
  const db=createSQLiteAdapter(sqlite),config=parseGame('characters:\n - id: web\n   name: Explorer\naccounts:\n allowRegistration: true\n users:\n  - username: teacher\n    password: teacher-password\n    role: admin');
  const api=createApi({db,config,challenges:[]});
  function client() {let cookie='';return async(path,body,origin='https://quest.test')=>{
    const r=await api(new Request('https://quest.test'+path,{method:body?'POST':'GET',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined}));
    if(r.headers.has('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];
    return {status:r.status,data:await r.json()};
  };}
  const clients={};
  for(const username of ['alice','annika','bobby','teacher']) {
    clients[username]=client();
    const r=await clients[username]('/api/auth',{mode:username==='teacher'?'login':'register',username,password:username==='teacher'?'teacher-password':'student-password',hero:'web'});
    assert.equal(r.status,200);
  }
  const alpha=(await clients.alice('/api/teams',{mode:'create',name:'Alpha',password:'team-password'})).data.team.id;
  const beta=(await clients.bobby('/api/teams',{mode:'create',name:'Beta',password:'team-password'})).data.team.id;
  await clients.annika('/api/teams',{mode:'join',id:alpha,password:'team-password'});
  const send=async(call,team,text)=>{const id=crypto.randomUUID();const r=await call('/api/team-social',{id,team,text});assert.equal(r.status,200,JSON.stringify(r));return id;};
  const inbox=async(call,team=alpha)=>(await call('/api/team-social?team='+team)).data.messages;
  return {sqlite,db,config,clients,client,alpha,beta,send,inbox};
}

test('personal clear hides sent and received chats only for the signed-in viewer, resets badges, and permits new messages',async()=>{
  const s=await fixture();try {
    const {alice,annika,bobby,teacher}=s.clients;
    await s.send(bobby,s.alpha,'incoming');await s.send(alice,s.beta,'outgoing');await s.send(alice,'instructors','question');await s.send(teacher,s.alpha,'reply');
    assert.equal((await s.inbox(alice)).length,3);assert.equal((await s.inbox(alice,'instructors')).length,2);
    const cleared=await alice('/api/chat-history',{action:'clear-all',user:'someone-else'});assert.equal(cleared.status,200);
    assert.deepEqual(await s.inbox(alice),[]);assert.deepEqual(await s.inbox(alice,s.beta),[]);assert.deepEqual(await s.inbox(alice,'instructors'),[]);
    assert.equal((await s.inbox(annika)).length,3);assert.equal((await s.inbox(bobby,s.alpha)).length,2);
    const presence=await alice('/api/presence',{map:'town',x:18,y:20,themeRevision:0});assert.equal(presence.data.receivedCount,0);assert.equal(presence.data.latestMessageAt,0);
    const newId=await s.send(bobby,s.alpha,'new message');
    s.sqlite.prepare('UPDATE team_messages SET created_at=? WHERE id=?').run(cleared.data.clearedThrough+1,newId);
    assert.deepEqual((await s.inbox(alice)).map(m=>m.text),['new message']);
    assert.equal((await alice('/api/presence',{map:'town',x:18,y:20,themeRevision:0})).data.receivedCount,1);
    const admin=(await teacher('/api/admin/chats')).data;assert.equal(admin.total,5);assert.ok(admin.messages.some(m=>m.text==='question'));
  } finally {s.sqlite.close();}
});

test('chat management enforces admin roles and write origins; personal clears cannot act as global deletion',async()=>{
  const s=await fixture();try {
    const {alice,teacher}=s.clients;
    assert.equal((await s.client()('/api/chat-history',{action:'clear-all'})).status,401);
    assert.equal((await alice('/api/chat-history')).status,405);
    assert.equal((await alice('/api/chat-history',{action:'delete'})).status,400);
    for(const call of [s.client(),alice]) {
      assert.equal((await call('/api/admin/chats')).status,403);
      assert.equal((await call('/api/admin/chats',{action:'clear-all',through:Date.now()})).status,403);
    }
    assert.equal((await alice('/api/chat-history',{action:'clear-all'},'https://elsewhere.test')).status,403);
    assert.equal((await teacher('/api/admin/chats',{action:'clear-all',through:Date.now()},'https://elsewhere.test')).status,403);
    assert.equal((await teacher('/api/admin/chats',{action:'delete',kind:'__proto__',id:'x'})).status,400);
    assert.equal((await teacher('/api/admin/chats',{action:'clear-all',through:Date.now()+100000})).status,400);
    assert.equal(s.sqlite.prepare('SELECT COUNT(*) AS n FROM chat_history_settings').get().n,0);
  } finally {s.sqlite.close();}
});

test('admin history identifies both directions, includes muted and cleared messages, and filters by sender, recipient, and literal text',async()=>{
  const s=await fixture();try {
    const {alice,bobby,teacher}=s.clients;
    await s.send(bobby,s.alpha,'literal %_ body');await s.send(alice,'instructors','question');await s.send(teacher,s.alpha,'reply');
    await alice('/api/chat-mutes',{action:'mute-all',revision:0});await alice('/api/chat-history',{action:'clear-all'});
    const all=(await teacher('/api/admin/chats')).data;
    assert.equal(all.total,3);assert.deepEqual(new Set(all.messages.map(m=>`${m.from_name}->${m.to_name}`)),new Set(['Beta->Alpha','Alpha->Instructors','Instructors->Alpha']));
    assert.equal(all.messages.find(m=>m.text==='literal %_ body').username,'bobby');
    for(const [filter,text] of [[`from=${s.beta}&to=${s.alpha}`,'literal %_ body'],['from=instructors','reply'],['to=instructors','question'],['q=bobby','literal %_ body'],['q=%25_','literal %_ body']]) {
      const result=await teacher('/api/admin/chats?'+filter);assert.equal(result.status,200);assert.equal(result.data.total,1,filter);assert.equal(result.data.messages[0].text,text);
    }
    assert.equal((await teacher('/api/admin/chats?offset=-1')).status,400);
    const id=s.sqlite.prepare("SELECT id FROM students WHERE username='bobby'").get().id;
    const insert=s.sqlite.prepare('INSERT INTO team_messages VALUES(?,?,?,?,?,?,?)');
    for(let n=0;n<52;n++)insert.run(crypto.randomUUID(),id,s.beta,s.alpha,'bobby','page '+n,Date.now()-1000);
    assert.equal((await teacher('/api/admin/chats')).data.messages.length,50);
    const next=(await teacher('/api/admin/chats?offset=50')).data;assert.equal(next.messages.length,5);assert.equal(next.total,55);
  } finally {s.sqlite.close();}
});

test('admin deletion removes only the selected source; clear all spans both streams and retains new messages and notifications',async()=>{
  const s=await fixture();try {
    const {alice,bobby,teacher}=s.clients;
    const first=await s.send(bobby,s.alpha,'delete me');await s.send(alice,'instructors','question');await s.send(teacher,s.alpha,'reply');
    assert.equal((await teacher('/api/admin/chats',{action:'delete',kind:'instructor',id:first})).data.deleted,0);
    assert.equal((await teacher('/api/admin/chats',{action:'delete',kind:'team',id:first})).data.deleted,1);
    assert.ok(!(await s.inbox(alice)).some(m=>m.id===first));
    await teacher('/api/admin/notifications',{id:crypto.randomUUID(),title:'Keep notice',body:'Notice',scope:'all',targets:[]});
    const preview=(await teacher('/api/admin/chats?from=instructors')).data;assert.equal(preview.total,1);assert.equal(preview.allTotal,2);
    const fresh=await s.send(bobby,s.alpha,'arrived after preview');
    s.sqlite.prepare('UPDATE team_messages SET created_at=? WHERE id=?').run(preview.through+1,fresh);
    const result=await teacher('/api/admin/chats',{action:'clear-all',through:preview.through});assert.equal(result.status,200);assert.equal(result.data.deleted,2);
    assert.equal(s.sqlite.prepare('SELECT COUNT(*) n FROM instructor_messages').get().n,0);
    assert.deepEqual(s.sqlite.prepare('SELECT text FROM team_messages').all().map(r=>r.text),['arrived after preview']);
    assert.equal(s.sqlite.prepare('SELECT COUNT(*) n FROM notifications').get().n,1);
    assert.deepEqual((await s.inbox(alice)).map(m=>m.text),['arrived after preview']);
  } finally {s.sqlite.close();}
});

test('personal clear settings migrate, survive full restore, validate safely, and cascade on account deletion',async()=>{
  const s=await fixture();let folder;try {
    await s.clients.alice('/api/chat-history',{action:'clear-all'});
    const snapshot=await createSnapshot({db:s.db,config:s.config,challenges:[]});assert.equal(snapshot.chatHistorySettings.length,1);
    const old=structuredClone(snapshot);delete old.chatHistorySettings;assert.deepEqual(validateSnapshot(old).chatHistorySettings,[]);
    const corrupt=structuredClone(snapshot);corrupt.chatHistorySettings[0].user='unknown';assert.throws(()=>validateSnapshot(corrupt),/personal chat history/);
    const duplicate=structuredClone(snapshot);duplicate.chatHistorySettings.push(duplicate.chatHistorySettings[0]);assert.throws(()=>validateSnapshot(duplicate),/personal chat history/);
    folder=mkdtempSync(resolve(tmpdir(),'quest-chat-history-'));
    for(const name of ['server','lib'])cpSync(name,resolve(folder,name),{recursive:true});
    symlinkSync(resolve('node_modules'),resolve(folder,'node_modules'),'dir');
    writeFileSync(resolve(folder,'backup.json'),JSON.stringify(snapshot));const dbpath=resolve(folder,'restored.sqlite');
    const result=spawnSync(process.execPath,[resolve(folder,'server/restore.mjs'),resolve(folder,'backup.json')],{encoding:'utf8',env:{...process.env,DATABASE_PATH:dbpath}});assert.equal(result.status,0,result.stderr);
    const restored=new DatabaseSync(dbpath);try {assert.deepEqual({...restored.prepare('SELECT * FROM chat_history_settings').get()},snapshot.chatHistorySettings[0]);}finally{restored.close();}
    s.sqlite.prepare("DELETE FROM sessions WHERE user=(SELECT id FROM students WHERE username='alice')").run();s.sqlite.prepare("DELETE FROM team_members WHERE user=(SELECT id FROM students WHERE username='alice')").run();s.sqlite.prepare("DELETE FROM students WHERE username='alice'").run();
    assert.equal(s.sqlite.prepare('SELECT COUNT(*) n FROM chat_history_settings').get().n,0);
    const migrated=new DatabaseSync(':memory:');try {migrated.exec('CREATE TABLE students(id TEXT PRIMARY KEY)');migrated.exec(readFileSync('drizzle/0029_chat_history.sql','utf8'));assert.ok(migrated.prepare("SELECT name FROM sqlite_master WHERE name='chat_history_settings'").get());}finally{migrated.close();}
  } finally {s.sqlite.close();if(folder)rmSync(folder,{recursive:true,force:true});}
});

test('presence shares only raw aggregates while keeping notification audiences, mutes, clears, and sender exclusions personal',async()=>{
  const s=await fixture();try {
    const {alice,annika,bobby,teacher}=s.clients;
    await s.send(bobby,s.alpha,'other team');await s.send(alice,s.alpha,'own team');
    await teacher('/api/admin/notifications',{id:crypto.randomUUID(),title:'Alice only',body:'Private notice',scope:'users',targets:['alice']});
    const queries=[],prepare=s.db.prepare.bind(s.db);s.db.prepare=sql=>{queries.push(sql);return prepare(sql);};
    const poll=call=>call('/api/presence',{map:'town',x:18,y:20,themeRevision:0});
    const first=await poll(alice),second=await poll(annika);
    assert.equal(first.data.receivedCount,1);assert.equal(second.data.receivedCount,2);
    assert.equal(first.data.notifications.unread,1);assert.equal(second.data.notifications.unread,0);
    assert.equal(queries.filter(sql=>sql.includes('COALESCE(solved.points,0) AS score')).length,1);
    assert.equal(queries.filter(sql=>sql.includes('FROM solved GROUP BY challenge')).length,1);
    assert.equal(queries.filter(sql=>sql.includes('FROM team_messages WHERE created_at>?')).length,1);
    await alice('/api/chat-mutes',{action:'mute-all',revision:0});
    assert.equal((await poll(alice)).data.receivedCount,0);assert.equal((await poll(annika)).data.receivedCount,2);
    await alice('/api/chat-history',{action:'clear-all'});
    assert.equal((await poll(alice)).data.receivedCount,0);assert.equal((await poll(annika)).data.receivedCount,2);
    await alice('/api/notifications',{action:'readAll'});assert.equal((await poll(alice)).data.notifications.unread,0);
    await s.send(bobby,s.alpha,'new team message');assert.equal((await poll(annika)).data.receivedCount,3);
  }finally{s.sqlite.close();}
});

test('chat cursors page tied timestamps across both streams without duplicates or new-message page shifts',async()=>{
  const s=await fixture();try {
    const sender=s.sqlite.prepare("SELECT id FROM students WHERE username='alice'").get().id,at=Date.now()-1000;
    for(let i=0;i<123;i++){
      const id='tied-'+String(i).padStart(4,'0');
      if(i%2)s.sqlite.prepare('INSERT INTO instructor_messages VALUES(?,?,?,?,?,?)').run(id,sender,s.alpha,'alice','question '+i,at);
      else s.sqlite.prepare('INSERT INTO team_messages VALUES(?,?,?,?,?,?,?)').run(id,sender,s.alpha,s.beta,'alice','message '+i,at);
    }
    const get=async(cursor,filter='')=>s.clients.teacher('/api/admin/chats?'+new URLSearchParams({...cursor?{cursor}:{},...filter?{to:filter}:{}}));
    let page=(await get()).data;const seen=new Set(page.messages.map(m=>m.kind+':'+m.id));assert.equal(page.messages.length,50);assert.ok(page.nextCursor);
    // Removing a previous-page row must not shift a subsequent cursor page.
    const removed=page.messages[0];await s.clients.teacher('/api/admin/chats',{action:'delete',kind:removed.kind,id:removed.id});
    const fresh=await s.send(s.clients.bobby,s.alpha,'new after snapshot');s.sqlite.prepare('UPDATE team_messages SET created_at=? WHERE id=?').run(page.through+1,fresh);
    while(page.nextCursor){const response=await get(page.nextCursor);assert.equal(response.status,200);page=response.data;for(const message of page.messages){assert.ok(!seen.has(message.kind+':'+message.id));seen.add(message.kind+':'+message.id);assert.notEqual(message.id,fresh);}}
    assert.equal(seen.size,123);
    let filtered=(await get(null,'instructors')).data;const ids=new Set(filtered.messages.map(m=>m.id));while(filtered.nextCursor){filtered=(await get(filtered.nextCursor,'instructors')).data;filtered.messages.forEach(m=>{assert.equal(m.to_name,'Instructors');assert.ok(!ids.has(m.id));ids.add(m.id);});}assert.equal(ids.size,61);
    for(const cursor of ['garbage','{}',JSON.stringify({at:at,kind:'team',id:'id',through:at-1})])assert.equal((await get(cursor)).status,400);
  }finally{s.sqlite.close();}
});

test('hosted performance migration adds the native ordering, session and aggregate indexes',()=>{
  const sqlite=new DatabaseSync(':memory:');try{
    sqlite.exec('CREATE TABLE team_messages(created_at INTEGER,id TEXT);CREATE TABLE instructor_messages(created_at INTEGER,id TEXT);CREATE TABLE sessions(user TEXT,expires INTEGER);CREATE TABLE solved(challenge TEXT);CREATE TABLE notifications(created_at INTEGER,id TEXT);');
    sqlite.exec(readFileSync('drizzle/0030_social_performance.sql','utf8'));
    for(const index of ['idx_team_messages_created_id','idx_instructor_messages_created_id','idx_sessions_user_expires','idx_solved_challenge','idx_notifications_created_id'])assert.ok(sqlite.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name=?").get(index));
    assert.match(sqlite.prepare('EXPLAIN QUERY PLAN SELECT 1 FROM sessions WHERE user=? AND expires>?').get('user',0).detail,/idx_sessions_user_expires/);
  }finally{sqlite.close();}
});

test('indexed chat search preserves literal searches, current names, updates, and deletion semantics',async()=>{
 const s=await fixture();try {
  assert.equal(s.db.capabilities.chatSearch,true);
  const sender=s.sqlite.prepare("SELECT id FROM students WHERE username='bobby'").get().id;
  const insert=s.sqlite.prepare('INSERT INTO team_messages VALUES(?,?,?,?,?,?,?)');
  for(const [index,text] of ['Needle in text','literal %_ body','a "quoted" phrase','écho café','line\nbreak','C++ exercise','nothing special'].entries())insert.run('search-'+index,sender,s.beta,s.alpha,'Historical sender',text,Date.now()-1000);
  s.sqlite.prepare('INSERT INTO instructor_messages VALUES(?,?,?,?,?,?)').run('search-instructor',sender,s.beta,'Historical sender','Needle for instructors',Date.now()-1000);
  s.sqlite.prepare("UPDATE teams SET name='Renamed Beta' WHERE id=?").run(s.beta);
  const queries=['Needle','needle','%_','"quoted"','écho','line\nbreak','C++','Historical','bobby','Renamed','Alpha','Instructors','go','unlikely missing text'];
  for(const query of queries) {
   const path='/api/admin/chats?'+new URLSearchParams({q:query});
   s.db.capabilities.chatSearch=true;const indexed=await s.clients.teacher(path);
   s.db.capabilities.chatSearch=false;const scanned=await s.clients.teacher(path);
   assert.equal(indexed.status,200,JSON.stringify(indexed.data));assert.equal(scanned.status,200);
   assert.equal(indexed.data.total,scanned.data.total,query);
   assert.deepEqual(indexed.data.messages.map(row=>row.kind+row.id).sort(),scanned.data.messages.map(row=>row.kind+row.id).sort(),query);
  }
  s.db.capabilities.chatSearch=true;
  s.sqlite.prepare("UPDATE team_messages SET text='Updated unique marker' WHERE id='search-0'").run();
  assert.equal((await s.clients.teacher('/api/admin/chats?q=Updated')).data.total,1);
  await s.clients.teacher('/api/admin/chats',{action:'delete',kind:'team',id:'search-0'});
  assert.equal((await s.clients.teacher('/api/admin/chats?q=Updated')).data.total,0);
 }finally{s.sqlite.close();}
});
