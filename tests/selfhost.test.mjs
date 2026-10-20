// CTF-RPG — Copyright (c) 2026 Jaime C Acosta
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync,mkdirSync,cpSync,symlinkSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {createServer} from 'node:net';
import {request as httpRequest} from 'node:http';
import {CTFD_IMPORT_REQUEST_LIMIT} from '../lib/pack-limits.mjs';
import {DatabaseSync} from 'node:sqlite';
import {runtimeConfig,defaultGameConfig} from '../lib/runtime-config.mjs';
import {publicConfig} from '../lib/config-schema.mjs';
import {initializeSchema,createSQLiteAdapter} from '../server/sqlite.mjs';
import {midiFixture} from './helpers/midi.mjs';
import {PAGE_ROUTES} from '../lib/page-routes.mjs';
import {ensureStartupAdmin} from '../server/protected-admin.mjs';
async function port(){const s=createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
function fixture(){const dir=mkdtempSync(resolve(tmpdir(),'ctf-rpg-env-'));cpSync('server',resolve(dir,'server'),{recursive:true});for(const p of ['lib','themes','public','selfhost','node_modules'])symlinkSync(resolve(p),resolve(dir,p),'dir');mkdirSync(resolve(dir,'content'));writeFileSync(resolve(dir,'content/challenges.yaml'),readFileSync('content/challenges.yaml'));writeFileSync(resolve(dir,'.env'),"ADMIN_USERNAME=teacher01\nADMIN_PASSWORD='initial-pass#with$dollar'\n");return dir;}
async function start(dir,p){const env={...process.env,HOST:'127.0.0.1',PORT:String(p),DATABASE_PATH:resolve(dir,'quest.sqlite')};delete env.ADMIN_USERNAME;delete env.ADMIN_PASSWORD;const child=spawn(process.execPath,['server/selfhost.mjs'],{cwd:dir,env,stdio:['ignore','pipe','pipe']});let logs='';child.stderr.on('data',d=>logs+=d);await new Promise((done,fail)=>{const timer=setTimeout(()=>{child.kill();fail(Error('Startup timeout '+logs));},10000);child.stdout.on('data',d=>{if(d.toString().includes('listening')){clearTimeout(timer);done();}});child.on('exit',code=>{clearTimeout(timer);fail(Error('Server exited '+code+' '+logs));});});return child;}
async function stop(child){if(child.exitCode!==null)return;await new Promise(r=>{child.once('exit',r);child.kill();});}
test('runtime configuration uses a validated protected name and theme defaults, never platform email privileges',()=>{
 assert.throws(()=>runtimeConfig({}),/ADMIN_USERNAME/);assert.throws(()=>runtimeConfig({ADMIN_USERNAME:'bad name'}),/ADMIN_USERNAME/);
 const c=runtimeConfig({ADMIN_USERNAME:'Teacher01',ADMIN_PASSWORD:'private-bootstrap',GAME_CONFIG:'/missing.yaml'});
 assert.equal(c.admin.protectedUsername,'teacher01');assert.equal(c.admin.platformEmails,undefined);assert.equal(c.accounts.users.length,0);
 assert.equal(c.characters.length,defaultGameConfig().characters.length);assert.ok(!JSON.stringify(publicConfig(c)).includes('private-bootstrap'));
});
test('a missing administrator requires a bootstrap password; existing administrators need no environment password',async()=>{
 const sqlite=new DatabaseSync(':memory:');initializeSchema(sqlite);const db=createSQLiteAdapter(sqlite),config=runtimeConfig({ADMIN_USERNAME:'instructor'});
 try {
  await assert.rejects(()=>ensureStartupAdmin(db,config),/ADMIN_PASSWORD/);
  await assert.rejects(()=>ensureStartupAdmin(db,config,'short'),/ADMIN_PASSWORD/);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM students').get().n,0);
  await ensureStartupAdmin(db,config,'initial-admin-password');const before=sqlite.prepare('SELECT * FROM students').get();
  assert.equal(before.role,'admin');assert.equal(before.hero_selected,0);assert.ok(!JSON.stringify(before).includes('initial-admin-password'));
  await ensureStartupAdmin(db,config);assert.deepEqual(sqlite.prepare('SELECT * FROM students').get(),before);
 } finally {sqlite.close();}
});
test('standalone reads root .env without game.yaml; UI users select once, roles authorize, passwords and progress survive restart',async()=>{
 const dir=fixture(),p=await port(),base=`http://127.0.0.1:${p}`;let child=await start(dir,p);
 function client(){let cookie='';return async(path,body,method=body?'POST':'GET',origin=base)=>{const res=await fetch(base+path,{method,headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json','oai-authenticated-user-email':'owner@example.com'},body:body?JSON.stringify(body):undefined});if(res.headers.has('set-cookie'))cookie=res.headers.get('set-cookie').split(';')[0];return{status:res.status,headers:res.headers,data:res.headers.get('content-type')?.includes('json')?await res.json():await res.text()};};}
 const admin=client(),student=client(),guest=client();
 try{
  assert.equal((await guest('/')).status,200);
  for(const route of [...Object.keys(PAGE_ROUTES).flatMap(path=>path==='/'?[path]:[path,path+'/']),'/admin/users/details?user=student01','/admin/users/details/?user=student01']){
   const page=await guest(route);assert.equal(page.status,200,route);assert.match(page.headers.get('content-type'),/text\/html/,route);assert.match(page.data,/<div id="root"><\/div>/,route);
  }
  for(const path of ['/.env','/content/game.yaml','/content/challenges.yaml','/data/quest.sqlite','/server/selfhost.mjs','/package.json','/%2e%2e/.env','/admin/social/missing','/admin/users/details/missing','/admin/users/detailsXYZ'])assert.equal((await guest(path)).status,404,path);
  const config=(await guest('/api/config')).data;assert.ok(config.characters.length>=3);assert.ok(config.characters.every(c=>c.appearanceFor!=='entity'));assert.ok(!JSON.stringify(config).includes('initial-pass'));
  assert.equal((await guest('/api/auth')).data.admin,false);assert.equal((await guest('/api/admin/users')).status,401);
  assert.equal((await admin('/api/auth',{mode:'login',username:'Teacher01',password:'initial-pass#with$dollar',hero:'shield'})).data.admin,true);
  const initial=(await admin('/api/admin/users')).data;assert.equal(initial.users.find(u=>u.username==='teacher01').protected,true);
  assert.equal((await guest('/api/auth',{mode:'register',username:'unauthorized',password:'student-password',hero:'web',role:'admin'})).status,403);
  const created=await admin('/api/admin/users',{username:'student01',password:'student-password',role:'student',hero:'web',disabled:false,editing:false,revision:0});assert.equal(created.status,200);
  assert.equal((await student('/api/auth',{mode:'login',username:'student01',password:'wrong-password',hero:'thunder'})).status,401);
  assert.equal((await student('/api/auth',{mode:'login',username:'student01',password:'student-password',hero:'thunder'},'POST','https://evil.invalid')).status,403);
  const login=await student('/api/auth',{mode:'login',username:'student01',password:'student-password',hero:'thunder',role:'admin'});assert.equal(login.status,200);assert.equal(login.data.user.hero,'thunder');assert.equal(login.data.admin,false);assert.match(login.headers.get('set-cookie'),/HttpOnly/);assert.equal((await student('/api/admin/users')).status,403);
  assert.equal((await student('/api/game',{id:'lantern',answer:'24'})).status,200);assert.equal((await student('/api/game')).data.score,100);
  const state=(await admin('/api/admin/users')).data,teacher=state.users.find(u=>u.username==='teacher01');assert.equal((await admin('/api/admin/users',{...teacher,password:'changed-admin-password',editing:true,themeRevision:state.themeRevision})).status,200);
  await stop(child);writeFileSync(resolve(dir,'.env'),'ADMIN_USERNAME=teacher01\nADMIN_PASSWORD=another-bootstrap-password\n');child=await start(dir,p);
  assert.equal((await student('/api/game')).data.score,100);
  await student('/api/auth',undefined,'DELETE');assert.equal((await student('/api/auth',{mode:'login',username:'student01',password:'student-password',hero:'shield'})).data.user.hero,'thunder');
  assert.equal((await guest('/api/auth',{mode:'login',username:'teacher01',password:'another-bootstrap-password',hero:'web'})).status,401);
  assert.equal((await guest('/api/auth',{mode:'login',username:'teacher01',password:'changed-admin-password',hero:'web'})).data.admin,true);
  const db=new DatabaseSync(resolve(dir,'quest.sqlite'));assert.equal(db.prepare("SELECT hero FROM students WHERE username='teacher01'").get().hero,'shield');db.close();
 }finally{await stop(child);rmSync(dir,{recursive:true,force:true});}
});

test('oversized CTFd and streamed API requests return JSON 413 errors before dispatch and keep the server available',async()=>{
 const dir=fixture(),p=await port(),child=await start(dir,p);
 try {
  const response=await new Promise((resolve,reject)=>{
   const req=httpRequest({host:'127.0.0.1',port:p,path:'/api/admin/ctfd-import',method:'POST',headers:{'Content-Length':CTFD_IMPORT_REQUEST_LIMIT+1}},res=>{let body='';res.on('data',c=>body+=c);res.on('end',()=>resolve({status:res.statusCode,type:res.headers['content-type'],body}));});
   req.setTimeout(5000,()=>req.destroy(Error('Upload rejection timeout')));req.on('error',reject);req.end('x');
  });
  assert.equal(response.status,413);assert.match(response.type,/application\/json/);assert.match(JSON.parse(response.body).error,/512 MB/);
  const body=new ReadableStream({start(c){c.enqueue(new Uint8Array(600000));c.close();}});
  const streamed=await fetch(`http://127.0.0.1:${p}/api/auth`,{method:'POST',duplex:'half',body});assert.equal(streamed.status,413);assert.match((await streamed.json()).error,/request limit/);
  assert.equal((await fetch(`http://127.0.0.1:${p}/api/config`)).status,200);
 }finally{await stop(child);rmSync(dir,{recursive:true,force:true});}
});

test('shared-network sign-in limits isolate repeated account failures from other students and instructors',async()=>{
 const dir=fixture(),p=await port(),child=await start(dir,p),base=`http://127.0.0.1:${p}`;
 try {
  async function login(username,password){return fetch(base+'/api/auth',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({mode:'login',username,password,hero:'web'})});}
  for(let i=0;i<20;i++)assert.equal((await login('unknownstudent','wrong-password')).status,401);
  const denied=await login('UNKNOWNSTUDENT','wrong-password');assert.equal(denied.status,429);assert.equal(denied.headers.get('retry-after'),'60');
  assert.equal((await login('teacher01','initial-pass#with$dollar')).status,200);
 }finally{await stop(child);rmSync(dir,{recursive:true,force:true});}
});

test('native challenge-file uploads accept analysis files above the generic API limit, persist on restart, and reject oversized files',async()=>{
 const dir=fixture(),p=await port(),base=`http://127.0.0.1:${p}`;let child=await start(dir,p);
 try {
  const auth=await fetch(base+'/api/auth',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({mode:'login',username:'teacher01',password:'initial-pass#with$dollar',hero:'web'})});assert.equal(auth.status,200);const cookie=auth.headers.get('set-cookie').split(';')[0];
  const bytes=new Uint8Array(700*1024);for(let i=0;i<bytes.length;i++)bytes[i]=i%256;
  const upload=await fetch(base+'/api/admin/challenge-files?name=capture.pcap',{method:'POST',headers:{Origin:base,Cookie:cookie},body:bytes});assert.equal(upload.status,200);const attachment=await upload.json();assert.equal(attachment.filename,'capture.pcap');
  await stop(child);child=await start(dir,p);
  const download=await fetch(base+attachment.url);assert.equal(download.status,200);assert.equal(download.headers.get('content-disposition'),'attachment');assert.deepEqual(new Uint8Array(await download.arrayBuffer()),bytes);
  const oversized=await fetch(base+'/api/admin/challenge-files?name=too-big.pcap',{method:'POST',headers:{Origin:base,Cookie:cookie},body:new Uint8Array(4*1024*1024+1)});assert.equal(oversized.status,413);assert.match((await oversized.json()).error,/4 MB/);
 }finally{await stop(child);rmSync(dir,{recursive:true,force:true});}
});


test('native map music accepts a 100-file batch above 33 MB and persists the full library', async () => {
 const dir=fixture(), p=await port(), base=`http://127.0.0.1:${p}`; let child=await start(dir,p);
 try {
  const auth=await fetch(base+'/api/auth',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({mode:'login',username:'teacher01',password:'initial-pass#with$dollar',hero:'web'})});
  assert.equal(auth.status,200); const cookie=auth.headers.get('set-cookie').split(';')[0];
  const headers={Origin:base,Cookie:cookie};
  const initial=await (await fetch(base+'/api/admin/theme-audio',{headers})).json();
  const form=new FormData();
  form.set('revision',String(initial.revision)); form.set('playlist','[]'); form.set('volume','.2'); form.set('loop','true');
  for(let pitch=0;pitch<100;pitch++)form.append('files',new File([midiFixture({pitch,metadataBytes:pitch===0?34*1024*1024:0})],`Track ${pitch}.mid`));
  const response=await fetch(base+'/api/admin/theme-audio',{method:'POST',headers,body:form});
  const saved=await response.json(); assert.equal(response.status,200,JSON.stringify(saved)); assert.equal(saved.uploaded,100);
  await stop(child); child=await start(dir,p);
  const persisted=await (await fetch(base+'/api/admin/theme-audio',{headers})).json();
  assert.equal(persisted.audio.playlist.length,100);
  const download=await fetch(base+persisted.audio.playlist[0].midi);
  assert.equal(download.status,200); assert.ok((await download.arrayBuffer()).byteLength>34*1024*1024);
 } finally {await stop(child);rmSync(dir,{recursive:true,force:true});}
});
