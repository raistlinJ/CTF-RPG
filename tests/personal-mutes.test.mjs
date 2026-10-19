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
  const db=createSQLiteAdapter(sqlite), config=parseGame('characters:\n - id: web\n   name: Explorer\naccounts:\n allowRegistration: true\n users:\n  - username: teacher\n    password: teacher-password\n    role: admin\n  - username: teacher2\n    password: teacher-password\n    role: admin');
  const api=createApi({db,config,challenges:[]});
  function client() {let cookie='';return async(path,body,origin='https://quest.test')=>{
    const r=await api(new Request('https://quest.test'+path,{method:body?'POST':'GET',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined}));
    if(r.headers.has('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];
    return {status:r.status,data:await r.json()};
  };}
  const clients={};
  for(const username of ['alice','annika','bobby','bruno','carol','teacher','teacher2']) {
    const call=client();clients[username]=call;
    assert.equal((await call('/api/auth',{mode:username.startsWith('teacher')?'login':'register',username,password:username.startsWith('teacher')?'teacher-password':'student-password',hero:'web'})).status,200);
  }
  const alpha=(await clients.alice('/api/teams',{mode:'create',name:'Alpha',password:'team-password'})).data.team.id;
  const beta=(await clients.bobby('/api/teams',{mode:'create',name:'Beta',password:'team-password'})).data.team.id;
  await clients.annika('/api/teams',{mode:'join',id:alpha,password:'team-password'});
  await clients.bruno('/api/teams',{mode:'join',id:beta,password:'team-password'});
  await clients.carol('/api/teams',{mode:'create',name:'Gamma',password:'team-password'});
  const setting=async(call,action,extra={})=>{
    const current=(await call('/api/chat-mutes')).data;
    return call('/api/chat-mutes',{action,revision:current.revision,...extra});
  };
  const send=async(call,team,text)=>{const r=await call('/api/team-social',{id:crypto.randomUUID(),team,text});assert.equal(r.status,200,JSON.stringify(r));};
  const inbox=async(call,team=alpha)=>(await call('/api/team-social?team='+team)).data.messages;
  const state=()=>({db,config,challenges:[]});
  return {sqlite,db,config,clients,client,alpha,beta,setting,send,inbox,state};
}

test('personal mutes redact only the receiver stream and counts; teammates and instructors remain available',async()=>{
  const s=await fixture();try {
    const {alice,annika,bobby,carol,teacher}=s.clients;
    await s.send(bobby,s.alpha,'private-bobby-body');
    await s.send(annika,s.alpha,'teammate-body');
    await s.send(teacher,s.alpha,'instructor-body');
    await s.send(carol,s.alpha,'carol-body');
    assert.equal((await s.setting(alice,'set',{username:'bobby',muted:true})).status,200);
    const messages=await s.inbox(alice);
    const muted=messages.find(m=>m.sender==='bobby');
    assert.equal(muted.text,null);assert.equal(muted.personalMuted,true);assert.equal(muted.canPersonalMute,true);
    assert.ok(!JSON.stringify(messages).includes('private-bobby-body'));
    assert.equal(messages.find(m=>m.sender==='annika').canPersonalMute,false);
    assert.equal(messages.find(m=>m.sender==='Instructor').canPersonalMute,false);
    assert.equal((await s.inbox(annika)).find(m=>m.sender==='bobby').text,'private-bobby-body');
    assert.equal((await s.inbox(bobby,s.alpha)).find(m=>m.sender==='bobby').text,'private-bobby-body');
    const presence=await alice('/api/presence',{map:'town',x:18,y:20,themeRevision:0});
    assert.equal(presence.status,200);assert.equal(presence.data.receivedCount,3);
    await s.send(bobby,s.alpha,'another-bobby-message');
    assert.equal((await s.inbox(alice)).find(m=>m.text==='another-bobby-message'),undefined);
    assert.ok((await s.inbox(annika)).some(m=>m.text==='another-bobby-message'));
    await s.setting(alice,'set',{username:'bobby',muted:false});
    assert.ok((await s.inbox(alice)).some(m=>m.text==='private-bobby-body'));
  } finally{s.sqlite.close();}
});

test('mute all covers future contacts, supports individual exceptions, and unmute all clears overrides',async()=>{
  const s=await fixture();try {
    const {alice,bobby,annika,teacher}=s.clients;
    await s.send(bobby,s.alpha,'bobby');await s.send(annika,s.alpha,'annika');await s.send(teacher,s.alpha,'teacher');
    const bulk=await s.setting(alice,'mute-all');assert.equal(bulk.status,200);assert.equal(bulk.data.muteAll,true);
    const dylan=s.client();await dylan('/api/auth',{mode:'register',username:'dylan',password:'student-password',hero:'web'});
    await dylan('/api/teams',{mode:'join',id:s.beta,password:'team-password'});
    await s.send(dylan,s.alpha,'future-contact');
    let messages=await s.inbox(alice);
    assert.equal(messages.find(m=>m.sender==='dylan').personalMuted,true);
    assert.equal(messages.find(m=>m.sender==='annika').text,'annika');
    assert.equal(messages.find(m=>m.sender==='Instructor').text,'teacher');
    assert.equal((await alice('/api/presence',{map:'town',x:18,y:20,themeRevision:0})).data.receivedCount,2);
    await s.setting(alice,'set',{username:'bobby',muted:false});
    messages=await s.inbox(alice);assert.equal(messages.find(m=>m.sender==='bobby').text,'bobby');
    assert.equal(messages.find(m=>m.sender==='dylan').text,null);
    await s.setting(alice,'set',{username:'carol',muted:true});
    const unmuted=await s.setting(alice,'unmute-all');assert.equal(unmuted.data.muteAll,false);assert.deepEqual(unmuted.data.overrides,{});
    assert.ok((await s.inbox(alice)).some(m=>m.text==='future-contact'));
  } finally{s.sqlite.close();}
});

test('mute API protects self, teammates, admins, origins, ownership, and concurrent revisions',async()=>{
  const s=await fixture();try {
    const {alice,bobby}=s.clients;
    assert.equal((await s.client()('/api/chat-mutes')).status,401);
    for(const username of ['alice','annika','teacher','teacher2'])assert.equal((await s.setting(alice,'set',{username,muted:true})).status,400,username);
    assert.equal((await alice('/api/chat-mutes',{action:'mute-all',revision:0},'https://elsewhere.test')).status,403);
    const results=await Promise.all(['bobby','carol'].map(username=>alice('/api/chat-mutes',{action:'set',username,muted:true,revision:0,user:'someone-else'})));
    assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
    assert.equal((await alice('/api/chat-mutes')).data.revision,1);
    assert.equal(Object.keys((await alice('/api/chat-mutes')).data.overrides).length,1);
    assert.deepEqual((await bobby('/api/chat-mutes')).data,{muteAll:false,revision:0,overrides:{}});
    assert.equal((await alice('/api/chat-mutes',{action:'unmute-all',revision:0})).status,409);
    await s.setting(alice,'set',{username:'bobby',muted:true});
    await s.send(bobby,s.alpha,'dynamic-exemption');
    s.sqlite.prepare("UPDATE students SET managed=1,role='admin' WHERE username='bobby'").run();
    assert.ok((await s.inbox(alice)).some(m=>m.text==='dynamic-exemption'));
    assert.equal((await s.setting(alice,'set',{username:'bobby',muted:true})).status,400);
    s.sqlite.prepare("UPDATE students SET role='student' WHERE username='bobby'").run();
    s.sqlite.prepare("UPDATE team_members SET team=? WHERE user=(SELECT id FROM students WHERE username='bobby')").run(s.alpha);
    const teammate=(await s.inbox(alice)).find(m=>m.sender==='bobby');
    assert.equal(teammate.text,'dynamic-exemption');assert.equal(teammate.canPersonalMute,false);
  } finally{s.sqlite.close();}
});

test('each administrator can personally mute student requests without changing other administrators inboxes',async()=>{
  const s=await fixture();try {
    const {teacher,teacher2,bobby}=s.clients;
    await s.send(bobby,'instructors','student-instructor-request');
    await s.setting(teacher,'set',{username:'bobby',muted:true});
    assert.equal((await s.inbox(teacher,'instructors'))[0].text,null);
    assert.equal((await s.inbox(teacher2,'instructors'))[0].text,'student-instructor-request');
    assert.equal((await teacher('/api/presence',{map:'town',x:18,y:20,themeRevision:0})).data.receivedCount,0);
    assert.equal((await teacher2('/api/presence',{map:'town',x:18,y:20,themeRevision:0})).data.receivedCount,1);
  } finally{s.sqlite.close();}
});

test('personal mutes survive full restore, default safely in older backups, and clean up with deleted accounts',async()=>{
  const s=await fixture();let folder;try {
    await s.setting(s.clients.alice,'mute-all');
    await s.setting(s.clients.alice,'set',{username:'bobby',muted:false});
    const snapshot=await createSnapshot(s.state());
    assert.equal(snapshot.personalChatSettings.length,1);assert.equal(snapshot.personalChatMutes.length,1);
    const old=structuredClone(snapshot);delete old.personalChatSettings;delete old.personalChatMutes;
    assert.deepEqual(validateSnapshot(old).personalChatMutes,[]);
    const corrupt=structuredClone(snapshot);corrupt.personalChatMutes[0].target='unknown';assert.throws(()=>validateSnapshot(corrupt),/personal chat mutes/);
    folder=mkdtempSync(resolve(tmpdir(),'quest-personal-mutes-'));
    for(const name of ['server','lib'])cpSync(name,resolve(folder,name),{recursive:true});
    symlinkSync(resolve('node_modules'),resolve(folder,'node_modules'),'dir');
    writeFileSync(resolve(folder,'backup.json'),JSON.stringify(snapshot));
    const dbpath=resolve(folder,'restored.sqlite');
    const restored=spawnSync(process.execPath,[resolve(folder,'server/restore.mjs'),resolve(folder,'backup.json')],{encoding:'utf8',env:{...process.env,DATABASE_PATH:dbpath}});
    assert.equal(restored.status,0,restored.stderr);
    const target=new DatabaseSync(dbpath);try {
      assert.deepEqual({...target.prepare('SELECT * FROM personal_chat_settings').get()},snapshot.personalChatSettings[0]);
      assert.deepEqual({...target.prepare('SELECT * FROM personal_chat_mutes').get()},snapshot.personalChatMutes[0]);
    }finally{target.close();}
    s.sqlite.prepare("DELETE FROM sessions WHERE user=(SELECT id FROM students WHERE username='bobby')").run();
    s.sqlite.prepare("DELETE FROM team_members WHERE user=(SELECT id FROM students WHERE username='bobby')").run();
    s.sqlite.prepare("DELETE FROM students WHERE username='bobby'").run();
    assert.equal(s.sqlite.prepare('SELECT COUNT(*) n FROM personal_chat_mutes').get().n,0);
    // The hosted migration must initialize the same two tables as native SQLite.
    const migration=new DatabaseSync(':memory:');try {migration.exec('CREATE TABLE students(id TEXT PRIMARY KEY)');migration.exec(readFileSync('drizzle/0028_personal_chat_mutes.sql','utf8'));assert.equal(migration.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name IN ('personal_chat_settings','personal_chat_mutes')").get().n,2);}finally{migration.close();}
  } finally {s.sqlite.close();if(folder)rmSync(folder,{recursive:true,force:true});}
});
