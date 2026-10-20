import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,symlinkSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {stringify} from 'yaml';
import {unzipSync,strFromU8} from 'fflate';
import {createApi} from '../server/api.mjs';
import {initializeSchema,createSQLiteAdapter} from '../server/sqlite.mjs';
import {parseGame,parseChallenges} from '../lib/config-schema.mjs';
import {exportFullBackup} from '../server/backup.mjs';
import {CHALLENGE_FILE_LIMIT} from '../lib/pack-limits.mjs';

const definition={id:'files-puzzle',map:'town',object:'Analyze the capture',region:'Lab',location:{x:14,y:20},text:'Find the answer.',flags:['answer'],points:50};
function setup({storage=true}={}){
 const sqlite=new DatabaseSync(':memory:');initializeSchema(sqlite);
 const config=parseGame('characters:\n - id: web\n   name: Explorer\naccounts:\n allowRegistration: true\n users:\n  - username: teacher\n    password: teacher-password\n    role: admin');
 const db=createSQLiteAdapter(sqlite),files=new Map(),store={get:async key=>files.get(key),put:async(key,bytes)=>files.set(key,bytes)};
 const api=createApi({db,config,challenges:parseChallenges(stringify({challenges:[definition]})),assetStore:storage?store:undefined,exportBackup:exportFullBackup});
 function client(){let cookie='';return async(path,body,headers={})=>{
  const binary=body instanceof Uint8Array||body instanceof ReadableStream||body instanceof FormData;
  const response=await api(new Request('https://quest.test'+path,{method:body!==undefined?'POST':'GET',headers:{Cookie:cookie,Origin:'https://quest.test',...body!==undefined&&!binary?{'Content-Type':'application/json'}:{},...headers},body:binary?body:body!==undefined?JSON.stringify(body):undefined,...body instanceof ReadableStream?{duplex:'half'}:{}}));
  if(response.headers.has('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
  const bytes=new Uint8Array(await response.arrayBuffer());return{status:response.status,headers:response.headers,bytes,data:response.headers.get('content-type')?.includes('json')?JSON.parse(strFromU8(bytes)):null};
 };}
 async function login(username){const call=client();assert.equal((await call('/api/auth',{mode:username==='teacher'?'login':'register',username,password:username==='teacher'?'teacher-password':'student-password',hero:'web'})).status,200);return call;}
 return {sqlite,files,store,client,login};
}
const upload=(name)=>'/api/admin/challenge-files?'+new URLSearchParams({name});

test('challenge uploads require admin access and same origin, support arbitrary analysis files, and force binary downloads',async()=>{
 const s=setup();try{
  const bytes=new TextEncoder().encode('<script>sample for analysis</script>'),anon=s.client(),student=await s.login('alice'),admin=await s.login('teacher');
  assert.equal((await anon(upload('sample.html'),bytes)).status,401);assert.equal((await student(upload('sample.html'),bytes)).status,403);
  assert.equal((await admin(upload('sample.html'),bytes,{Origin:'https://elsewhere.test'})).status,403);assert.equal(s.files.size,0);
  assert.equal((await admin(upload('sample.html'))).status,405);
  const result=await admin(upload('SQL diagnostics.sql'),bytes);assert.equal(result.status,200);assert.equal(result.data.name,'SQL diagnostics.sql');assert.equal(result.data.filename,'SQL_diagnostics.sql');assert.match(result.data.url,/^\/api\/assets\/[a-f0-9]{64}\.bin$/);
  const duplicate=await admin(upload('capture.pcapng'),bytes);assert.equal(duplicate.data.url,result.data.url);assert.equal(duplicate.data.filename,'capture.pcapng');assert.equal(s.files.size,1);
  const downloaded=await anon(result.data.url);assert.equal(downloaded.status,200);assert.deepEqual(downloaded.bytes,bytes);assert.equal(downloaded.headers.get('content-type'),'application/octet-stream');assert.equal(downloaded.headers.get('content-disposition'),'attachment');assert.equal(downloaded.headers.get('x-content-type-options'),'nosniff');
  const paths=await admin(upload('C:\\fakepath\\Lab capture.pcap'),new Uint8Array([1,2,3]));assert.equal(paths.data.name,'Lab capture.pcap');assert.equal(paths.data.filename,'Lab_capture.pcap');
 }finally{s.sqlite.close();}
});

test('uploads enforce stream and declared size limits, reject empty files and invalid names, and report storage failures',async()=>{
 const s=setup();try{
  const admin=await s.login('teacher'),bytes=new Uint8Array([1,2,3]);
  for(const name of ['', '..', '\n', 'x'.repeat(1025)])assert.equal((await admin(upload(name),bytes)).status,400);
  assert.equal((await admin(upload('empty.txt'),new Uint8Array())).status,400);
  assert.equal((await admin(upload('big.bin'),bytes,{'Content-Length':String(CHALLENGE_FILE_LIMIT+1)})).status,413);
  let cancelled=false;
  const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(CHALLENGE_FILE_LIMIT));controller.enqueue(new Uint8Array([1]));},cancel(){cancelled=true;}});
  assert.equal((await admin(upload('stream.pcap'),stream)).status,413);assert.equal(cancelled,true);assert.equal(s.files.size,0);
  assert.equal((await admin(upload('boundary.pcap'),new Uint8Array(CHALLENGE_FILE_LIMIT))).status,200);
  s.store.put=async()=>{throw Error('private-storage-detail');};const failed=await admin(upload('failure.txt'),bytes);assert.equal(failed.status,503);assert.ok(!JSON.stringify(failed.data).includes('private-storage-detail'));
 }finally{s.sqlite.close();}
 const unavailable=setup({storage:false});try{const admin=await unavailable.login('teacher');assert.equal((await admin(upload('notes.txt'),new Uint8Array([1]))).status,503);}finally{unavailable.sqlite.close();}
});

test('uploaded attachments save to challenges, reach students, and survive content-pack and full backup restore',async()=>{
 const s=setup();let folder;try{
  const admin=await s.login('teacher'),student=await s.login('alice'),bytes=new Uint8Array([0xd4,0xc3,0xb2,0xa1,1,2,3,4]);
  const uploaded=(await admin(upload('Network capture.pcap'),bytes)).data;
  const attachment={name:uploaded.name,url:uploaded.url,filename:uploaded.filename};
  const save=await admin('/api/admin/challenges',{revision:0,editingId:definition.id,challenge:{...definition,downloads:[attachment]}});assert.equal(save.status,200,JSON.stringify(save.data));
  assert.deepEqual((await student('/api/game')).data.challenges[0].downloads,[attachment]);
  const pack=await admin('/api/admin/packs?kind=content');assert.equal(pack.status,200);assert.deepEqual(unzipSync(pack.bytes)['assets'+attachment.url],bytes);
  const form=new FormData();form.set('file',new Blob([pack.bytes]),'content.zip');form.set('themeRevision','0');form.set('contentRevision','1');assert.equal((await admin('/api/admin/packs?kind=content',form)).status,200);
  const backup=await admin('/api/admin/backup');assert.equal(backup.status,200);const entries=unzipSync(backup.bytes),snapshot=JSON.parse(strFromU8(entries['backup.json']));
  assert.deepEqual(snapshot.challenges[0].downloads,[attachment]);assert.deepEqual(entries['data/pack-assets/'+attachment.url.slice(12)],bytes);
  folder=mkdtempSync(resolve(tmpdir(),'quest-challenge-file-'));
  for(const [name,content] of Object.entries(entries)){const path=resolve(folder,name);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,content);}
  symlinkSync(resolve('node_modules'),resolve(folder,'node_modules'),'dir');const dbpath=resolve(folder,'data/quest.sqlite');
  const result=spawnSync(process.execPath,[resolve(folder,'server/restore.mjs'),resolve(folder,'backup.json')],{encoding:'utf8',env:{...process.env,DATABASE_PATH:dbpath}});assert.equal(result.status,0,result.stderr);
  const restored=new DatabaseSync(dbpath);try{const challenge=JSON.parse(restored.prepare("SELECT payload FROM challenge_catalog WHERE id='active'").get().payload)[0];assert.deepEqual(challenge.downloads,[attachment]);}finally{restored.close();}
  assert.deepEqual(new Uint8Array(readFileSync(resolve(folder,'data/pack-assets',attachment.url.slice(12)))),bytes);
 }finally{s.sqlite.close();if(folder)rmSync(folder,{recursive:true,force:true});}
});
