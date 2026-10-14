// CTF-RPG — Copyright (c) 2026 Jaime C Acosta
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {runtimeConfig} from '../lib/runtime-config.mjs';
import {parseChallenges} from '../lib/config-schema.mjs';
import {createApi} from '../server/api.mjs';
import {createSQLiteAdapter,initializeSchema} from '../server/sqlite.mjs';
import {ensureStartupAdmin} from '../server/protected-admin.mjs';
import {createSnapshot,validateSnapshot} from '../server/backup.mjs';
async function setup(){
 const sqlite=new DatabaseSync(':memory:');initializeSchema(sqlite);
 const db=createSQLiteAdapter(sqlite),config=runtimeConfig({ADMIN_USERNAME:'teacher'}),challenges=parseChallenges(readFileSync('content/challenges.yaml','utf8'));
 await ensureStartupAdmin(db,config,'teacher-password');const api=createApi({db,config,challenges});
 function client(){let cookie='';return async(path,{method='GET',body,authorization,origin=method==='GET'?undefined:'https://quest.test'}={})=>{
  const response=await api(new Request('https://quest.test'+path,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(origin?{Origin:origin}:{}),...(authorization?{Authorization:authorization}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined}));
  if(response.headers.has('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];return{status:response.status,data:await response.json(),headers:response.headers};
 };}
 return{sqlite,db,config,challenges,client};
}
async function signIn(admin){const result=await admin('/api/auth',{method:'POST',body:{mode:'login',username:'teacher',password:'teacher-password',hero:'web'}});assert.equal(result.status,200);assert.equal(result.data.admin,true);assert.match(result.headers.get('set-cookie'),/HttpOnly/);}
test('username/password REST sessions create students, read scores, reset passwords, and enforce roles, origins and logout',async()=>{
 const s=await setup();try{
  const admin=s.client(),guest=s.client(),student=s.client();
  const bearer='Bearer ctfrpg_'+'a'.repeat(64);
  assert.equal((await guest('/api/admin/users',{authorization:bearer})).status,401);
  assert.equal((await guest('/api/admin/users',{authorization:'Basic '+Buffer.from('teacher:teacher-password').toString('base64')})).status,401);
  assert.equal((await admin('/api/auth',{method:'POST',body:{mode:'login',username:'teacher',password:'teacher-password'},origin:null})).status,403);
  await signIn(admin);assert.equal((await admin('/api/admin/users')).status,200);assert.equal((await admin('/api/admin/challenges')).status,200);
  let result=await admin('/api/admin/users',{method:'POST',body:{username:'student01',password:'student-password',hero:'web',role:'student',disabled:false,editing:false,revision:0}});
  assert.equal(result.status,200);assert.ok(result.data.users.some(a=>a.username==='student01'));
  const login=await student('/api/auth',{method:'POST',body:{mode:'login',username:'student01',password:'student-password',hero:'thunder'}});assert.equal(login.status,200);assert.equal(login.data.admin,false);
  assert.equal((await student('/api/admin/users')).status,403);assert.equal((await student('/api/admin/challenges')).status,403);
  assert.equal((await student('/api/game',{method:'POST',body:{id:'lantern',answer:'24'}})).status,200);
  const account=(await admin('/api/admin/users')).data.users.find(a=>a.username==='student01');assert.equal(account.score,100);assert.equal((await admin('/api/scoreboard')).status,200);
  const body={username:account.username,hero:account.hero,role:account.role,disabled:account.disabled,editing:true,revision:account.revision,password:'replacement-password'};
  assert.equal((await admin('/api/admin/users',{method:'POST',body,origin:'https://other.test'})).status,403);
  assert.equal((await admin('/api/admin/users',{method:'POST',body})).status,200);
  assert.equal((await student('/api/game')).status,401);
  assert.equal((await student('/api/auth',{method:'POST',body:{mode:'login',username:'student01',password:'replacement-password'}})).status,200);
  assert.equal((await student('/api/game')).data.score,100);
  assert.equal((await admin('/api/auth',{method:'DELETE'})).status,200);assert.equal((await admin('/api/admin/users')).status,401);
 }finally{s.sqlite.close();}
});
test('retired token endpoints are absent for guests and admins; tokens cannot bypass session authorization',async()=>{
 const s=await setup();try{
  const guest=s.client(),admin=s.client();await signIn(admin);const authorization='Bearer ctfrpg_'+'b'.repeat(64);
  for(const call of [guest,admin])for(const path of ['/api/admin/integration-tokens','/api/admin/integration-tokens/'+crypto.randomUUID(),'/api/integrations/v1/me','/api/integrations/v1/users','/api/integrations/v1/users/student01','/api/integrations/v1/scoreboard']){
   assert.equal((await call(path,{authorization})).status,404,path);
   assert.equal((await call(path,{method:'POST',authorization,body:{name:'Removed'}})).status,404,path);
  }
  assert.equal((await guest('/api/admin/challenges',{authorization})).status,401);
  assert.equal((await guest('/api/admin/users',{method:'POST',authorization,body:{username:'baduser'},origin:null})).status,403,'all writes use the origin check');
  assert.equal(s.sqlite.prepare("SELECT COUNT(*) n FROM students WHERE username='student01'").get().n,0);
 }finally{s.sqlite.close();}
});
test('upgrading discards old token storage while preserving accounts, sessions, progress and backup restoration data',async()=>{
 const s=await setup();try{
  const admin=s.client();await signIn(admin);await admin('/api/game',{method:'POST',body:{id:'lantern',answer:'24'}});
  const before=s.sqlite.prepare('SELECT * FROM students').all(),sessions=s.sqlite.prepare('SELECT * FROM sessions').all();
  s.sqlite.exec('CREATE TABLE integration_tokens(id TEXT PRIMARY KEY,name TEXT,token_hash TEXT,created_at INTEGER)');
  s.sqlite.prepare('INSERT INTO integration_tokens VALUES(?,?,?,?)').run('old-api-token','Old integration','f'.repeat(64),1);
  initializeSchema(s.sqlite);initializeSchema(s.sqlite);
  assert.equal(s.sqlite.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name='integration_tokens'").get().n,0);
  assert.deepEqual(s.sqlite.prepare('SELECT * FROM students').all(),before);assert.deepEqual(s.sqlite.prepare('SELECT * FROM sessions').all(),sessions);
  assert.equal((await admin('/api/admin/users')).status,200);assert.equal((await admin('/api/game')).data.score,100);
  const snapshot=await createSnapshot(s);assert.equal(Object.hasOwn(snapshot,'integrationTokens'),false);
  const legacy={...snapshot,integrationTokens:[{id:crypto.randomUUID(),name:'Old integration',tokenHash:'f'.repeat(64),createdAt:1}]};
  const validated=validateSnapshot(legacy);assert.equal(Object.hasOwn(validated,'integrationTokens'),false);assert.deepEqual(validated.accounts,snapshot.accounts);assert.deepEqual(validated.solved,snapshot.solved);
  assert.ok(Object.hasOwn(legacy,'integrationTokens'),'reading the old export leaves its input unchanged');
 }finally{s.sqlite.close();}
});
