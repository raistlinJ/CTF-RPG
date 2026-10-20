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
