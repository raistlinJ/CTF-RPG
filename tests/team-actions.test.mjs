// CTF-RPG — Copyright (c) 2026 Jaime C Acosta
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {cpSync,symlinkSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {parseGame,parseChallenges} from '../lib/config-schema.mjs';
import {createApi} from '../server/api.mjs';
import {createSQLiteAdapter,initializeSchema} from '../server/sqlite.mjs';
import {createSnapshot,validateSnapshot} from '../server/backup.mjs';

async function setup() {
  const sqlite=new DatabaseSync(':memory:');initializeSchema(sqlite);
  const base=createSQLiteAdapter(sqlite);let beforeBatch;
  const db={...base,async batch(statements){if(beforeBatch){const action=beforeBatch;beforeBatch=null;action();}return base.batch(statements);}};
  const config=parseGame('characters:\n - id: web\n   name: Web\naccounts:\n allowRegistration: true\n users:\n  - username: teacher\n    password: teacher-password\n    role: admin');
  const challenges=parseChallenges('challenges:\n - id: test\n   object: Test\n   location: {x: 18, y: 19}\n   region: Square\n   text: Answer\n   flags: [answer]\n   points: 50');
  const api=createApi({db,config,challenges});
  function client(){let cookie='';return async(path,body,extra={})=>{
    const r=await api(new Request('https://quest.test'+path,{method:body?'POST':'GET',headers:{Origin:'https://quest.test',Cookie:cookie,'Content-Type':'application/json',...extra},body:body?JSON.stringify(body):undefined}));
    if(r.headers.has('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return{status:r.status,data:await r.json()};
  };}
  const admin=client(),alice=client(),bob=client(),carol=client();
  assert.equal((await admin('/api/auth',{username:'teacher',password:'teacher-password',hero:'web',mode:'login'})).status,200);
  for(const [call,name] of [[alice,'alice'],[bob,'bobby'],[carol,'carol']])assert.equal((await call('/api/auth',{username:name,password:'student-password',hero:'web',mode:'register'})).status,200);
  const first=(await alice('/api/teams',{mode:'create',name:'Alpha',password:'team-password'})).data.team;
  const second=(await bob('/api/teams',{mode:'create',name:'Beta',password:'team-password'})).data.team;
  const targets=async(ids=[first.id,second.id])=>(await admin('/api/admin/teams')).data.teams.filter(t=>ids.includes(t.id)).map(({id,revision})=>({id,revision}));
  const bulk=async(action,ids)=>admin('/api/admin/teams',{action,teams:await targets(ids)});
  const send=(call,team,text='Hello')=>call('/api/team-social',{id:crypto.randomUUID(),team,text});
  return{sqlite,db,config,challenges,client,admin,alice,bob,carol,first,second,targets,bulk,send,beforeBatch(action){beforeBatch=action;}};
}

test('bulk team mute applies to current and future members, preserves user mutes and still permits incoming messages',async()=>{
  const s=await setup();try{
    const {sqlite,admin,alice,bob,carol,first,second,bulk,send}=s;
    assert.equal((await send(alice,first.id)).status,200);
    const muted=await bulk('mute');assert.equal(muted.status,200);assert.equal(muted.data.updated,2);assert.ok(muted.data.teams.every(t=>t.muted===1&&t.revision===1));
    for(const [call,id] of [[alice,first.id],[bob,second.id]]){
      assert.equal((await send(call,id)).status,403);assert.equal((await send(call,'instructors')).status,403);
      const card=(await call('/api/team-social?team='+id)).data;assert.equal(card.muted,true);assert.equal(card.team.canMessage,false);
    }
    assert.equal((await carol('/api/teams',{mode:'join',id:first.id,password:'team-password'})).status,200);
    assert.equal((await send(carol,first.id)).status,403,'new members inherit the team restriction');
    assert.equal((await send(admin,first.id,'From teacher')).status,200,'muted teams can still receive');
    assert.ok((await alice('/api/team-social?team='+first.id)).data.messages.some(m=>m.text==='From teacher'));
    assert.equal(sqlite.prepare('SELECT SUM(muted) n FROM students').get().n,0,'account flags are independent');
    sqlite.prepare("UPDATE students SET muted=1 WHERE username='carol'").run();
    assert.equal((await bulk('unmute')).status,200);
    assert.equal((await send(alice,first.id)).status,200);
    assert.equal((await send(carol,first.id)).status,403,'unmute does not clear an individual mute');
  }finally{s.sqlite.close();}
});

test('disabled teams cannot sign in, join, play, appear or score publicly; enabling retains memberships and progress',async()=>{
  const s=await setup();try{
    const {sqlite,admin,alice,bob,carol,first,bulk}=s;
    const uid=sqlite.prepare("SELECT id FROM students WHERE username='alice'").get().id;
    sqlite.prepare('INSERT INTO solved(user,challenge,points) VALUES(?,?,?)').run(uid,'test',50);
    const position={map:'town',x:19,y:22,themeRevision:0};
    assert.equal((await alice('/api/presence',position)).status,200);
    assert.equal((await bulk('disable',[first.id])).status,200);
    assert.equal((await alice('/api/game')).status,401);assert.equal((await alice('/api/presence',position)).status,401);
    assert.equal((await s.client()('/api/auth',{mode:'login',username:'alice',password:'student-password'})).status,403);
    assert.equal((await carol('/api/teams',{mode:'join',id:first.id,password:'team-password'})).status,403);
    assert.ok(!(await carol('/api/teams')).data.teams.some(t=>t.id===first.id));
    assert.ok(!(await bob('/api/team-social')).data.teams.some(t=>t.id===first.id));
    assert.ok(!(await bob('/api/scoreboard')).data.players.some(t=>t.id===first.id));
    assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM player_presence WHERE user=?').get(uid).n,0);
    const list=(await admin('/api/admin/teams')).data.teams;assert.equal(list.find(t=>t.id===first.id).score,50,'admins can still see stored score');
    assert.equal(sqlite.prepare('SELECT disabled FROM students WHERE id=?').get(uid).disabled,0);
    assert.equal((await bulk('enable',[first.id])).status,200);
    assert.equal((await alice('/api/game')).status,200);assert.equal((await alice('/api/teams')).data.team.id,first.id);
    assert.equal((await bob('/api/scoreboard')).data.players.find(t=>t.id===first.id).score,50);
  }finally{s.sqlite.close();}
});

test('bulk team deletion releases members, cascades team chat and gifts, and keeps individual progress',async()=>{
  const s=await setup();try{
    const {sqlite,admin,alice,bob,first,second,bulk,send}=s;
    const uid=sqlite.prepare("SELECT id FROM students WHERE username='alice'").get().id;
    sqlite.prepare('INSERT INTO solved(user,challenge,points) VALUES(?,?,?)').run(uid,'test',50);
    await send(alice,first.id);await send(bob,'instructors');
    await admin('/api/admin/teams',{action:'gift',id:first.id,points:25,comment:'Well done',awardId:crypto.randomUUID()});
    const deleted=await bulk('delete');assert.equal(deleted.status,200);assert.equal(deleted.data.updated,2);
    for(const table of ['teams','team_members','team_messages','instructor_messages','team_point_awards'])assert.equal(sqlite.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n,0,table);
    assert.equal(sqlite.prepare('SELECT points FROM solved WHERE user=?').get(uid).points,50);
    assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM students').get().n,4);
    assert.equal((await alice('/api/teams')).data.team,null);assert.equal((await bob('/api/teams')).data.team,null);
    assert.equal((await alice('/api/teams',{mode:'create',name:'Alpha',password:'new-password'})).status,200);
  }finally{s.sqlite.close();}
});

test('team bulk actions enforce admin and origin permissions and atomically reject stale or malformed selections',async()=>{
  const s=await setup();try{
    const {sqlite,admin,alice,first,second,targets,bulk}=s;
    const selection=await targets();const payload={action:'mute',teams:selection};
    assert.equal((await s.client()('/api/admin/teams',payload)).status,403);
    assert.equal((await alice('/api/admin/teams',payload)).status,403);
    assert.equal((await admin('/api/admin/teams',payload,{Origin:'https://other.test'})).status,403);
    assert.equal((await bulk('mute',[first.id])).status,200);
    assert.equal((await admin('/api/admin/teams',payload)).status,409);
    assert.equal(sqlite.prepare('SELECT muted FROM teams WHERE id=?').get(second.id).muted,0,'no partial update');
    const current=await targets();s.beforeBatch(()=>sqlite.prepare('UPDATE teams SET revision=revision+1 WHERE id=?').run(first.id));
    assert.equal((await admin('/api/admin/teams',{action:'disable',teams:current})).status,409);
    assert.equal(sqlite.prepare('SELECT SUM(disabled) n FROM teams').get().n,0);
    assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM admin_user_action_guard').get().n,0);
    for(const teams of [[],[current[0],current[0]],[{id:'missing',revision:-1}],[{id:first.id}],[null]])assert.equal((await admin('/api/admin/teams',{action:'delete',teams})).status,400);
  }finally{s.sqlite.close();}
});

test('team restrictions and revisions survive full backup restoration and schema initialization is repeatable',async()=>{
  const s=await setup();let folder;try{
    await s.bulk('mute');await s.bulk('disable',[s.first.id]);
    const snap=await createSnapshot(s);assert.equal(snap.teams.find(t=>t.id===s.first.id).disabled,1);assert.equal(snap.teams.find(t=>t.id===s.first.id).revision,2);
    assert.throws(()=>validateSnapshot({...snap,teams:snap.teams.map(t=>({...t,disabled:2}))}));
    folder=mkdtempSync(resolve(tmpdir(),'ctf-team-actions-'));const file=resolve(folder,'backup.json'),path=resolve(folder,'restored.sqlite');writeFileSync(file,JSON.stringify(snap));
    cpSync('server',resolve(folder,'server'),{recursive:true});cpSync('lib',resolve(folder,'lib'),{recursive:true});symlinkSync(resolve('node_modules'),resolve(folder,'node_modules'),'dir');
    const result=spawnSync(process.execPath,[resolve(folder,'server/restore.mjs'),file],{env:{...process.env,DATABASE_PATH:path},encoding:'utf8'});assert.equal(result.status,0,result.stderr);
    const restored=new DatabaseSync(path);try{initializeSchema(restored);assert.deepEqual({...restored.prepare('SELECT muted,disabled,revision FROM teams WHERE id=?').get(s.first.id)},{muted:1,disabled:1,revision:2});assert.equal(restored.prepare('SELECT COUNT(*) n FROM team_members').get().n,2);}finally{restored.close();}
  }finally{s.sqlite.close();if(folder)rmSync(folder,{recursive:true,force:true});}
});
