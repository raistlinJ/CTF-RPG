import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { stringify } from 'yaml';
import { unzipSync, strFromU8 } from 'fflate';
import { createApi } from '../server/api.mjs';
import { createSQLiteAdapter } from '../server/sqlite.mjs';
import { parseChallenges, parseGame } from '../lib/config-schema.mjs';
import { exportFullBackup, validateSnapshot } from '../server/backup.mjs';
import { byteRange } from '../server/byte-range.mjs';

const definition = {
  id: 'video-puzzle', map: 'town', object: 'Video puzzle', region: 'Square',
  location: {x:14,y:20}, text: 'Find the flag.', flags:['answer'], points:50,
  discoveryVideo:'https://example.org/intro.mp4', solveVideo:'https://example.org/outro.webm',
};
const mp4 = new Uint8Array([0,0,0,16,102,116,121,112,105,115,111,109,0,0,0,0]);
const webm = new Uint8Array([0x1a,0x45,0xdf,0xa3,1,2,3,4]);
function setup() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON');
  for (const file of readdirSync('drizzle').filter(n => /^\d+.*\.sql$/.test(n)).sort()) sqlite.exec(readFileSync(`drizzle/${file}`, 'utf8'));
  const db = createSQLiteAdapter(sqlite);
  const config = parseGame('characters:\n - id: web\n   name: Web\naccounts:\n allowRegistration: true\n users:\n  - username: teacher\n    password: teacher-password\n    role: admin\n    hero: web');
  const challenges = parseChallenges(stringify({challenges:[definition,{...definition,id:'manual-video',grading:'manual',flags:[],location:{x:15,y:20}}]}));
  const files = new Map();
  const assetStore = {get:async key=>files.get(key),put:async (key,bytes)=>files.set(key,bytes)};
  const api = createApi({db,config,challenges,assetStore,exportBackup:exportFullBackup});
  function client() {
    let cookie = '';
    return async (path, body, options={}) => {
      const binary = body instanceof Uint8Array || body instanceof FormData;
      const response = await api(new Request('https://quest.test'+path, {
        method: body ? 'POST' : 'GET',
        headers: {Origin:'https://quest.test',Cookie:cookie,...(body && !binary ? {'Content-Type':'application/json'} : {}),...options},
        body: binary ? body : body ? JSON.stringify(body) : undefined,
      }));
      if (response.headers.has('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
      const bytes = new Uint8Array(await response.arrayBuffer());
      return {status:response.status,headers:response.headers,bytes,data:response.headers.get('content-type')?.includes('json') ? JSON.parse(strFromU8(bytes)) : null};
    };
  }
  return {sqlite, db, config, challenges, files, client};
}
async function login(call, username='alice') {
  const r = await call('/api/auth',{mode:username==='teacher'?'login':'register',username,password:username==='teacher'?'teacher-password':'student-password',hero:'web'});
  assert.equal(r.status,200);
}
const scene = (phase,replay=false,id=definition.id) => ({id,action:'cutscene',phase,replay});

test('optional cutscene URLs validate and old definitions remain compatible', () => {
  const parse = overrides => parseChallenges(stringify({challenges:[{...definition,...overrides}]}))[0];
  assert.equal(parse({}).discoveryVideo,definition.discoveryVideo);
  assert.equal(parse({discoveryVideo:null,solveVideo:null}).solveVideo,null);
  const legacy = {...definition}; delete legacy.discoveryVideo; delete legacy.solveVideo;
  assert.equal(parseChallenges(stringify({challenges:[legacy]}))[0].discoveryVideo,null);
  for (const url of ['javascript:alert(1)','http://example.org/video.mp4','//example.org/video.mp4','/../private.mp4','']) assert.throws(()=>parse({solveVideo:url}));
});

test('first playback is atomic per player and phase, replay stays unlocked, solve videos stay private until earned', async () => {
  const {sqlite,client} = setup();
  try {
    const anonymous=client();
    assert.equal((await anonymous('/api/game',scene('discovery'))).status,401);
    const alice=client(); await login(alice);
    let q=(await alice('/api/game')).data.challenges[0];
    assert.equal(q.solveVideo,null);
    assert.equal((await alice('/api/game',scene('discovery'))).status,403);
    await alice('/api/game',{id:definition.id,action:'discover'});
    const claims=await Promise.all(Array.from({length:6},()=>alice('/api/game',scene('discovery'))));
    assert.equal(claims.filter(r=>r.data.play).length,1);
    assert.equal((await alice('/api/game',scene('discovery',true))).data.play,true);
    assert.equal((await alice('/api/game',scene('solve',true))).status,403);
    await alice('/api/game',{id:definition.id,answer:'wrong'});
    assert.equal((await alice('/api/game',scene('solve'))).status,403);
    await alice('/api/game',{id:definition.id,answer:'answer'});
    assert.equal((await alice('/api/game',scene('solve'))).data.play,true);
    assert.equal((await alice('/api/game',scene('solve'))).data.play,false);
    assert.equal((await alice('/api/game',scene('solve',true))).data.url,definition.solveVideo);
    await alice('/api/game',{id:definition.id,answer:'answer'});
    q=(await alice('/api/game')).data.challenges[0];
    assert.equal(q.discoveryCutsceneSeen,true); assert.equal(q.solveCutsceneSeen,true);
    const anotherSession=client();
    await anotherSession('/api/auth',{username:'alice',password:'student-password',hero:'web',mode:'login'});
    assert.equal((await anotherSession('/api/game',scene('solve'))).data.play,false);
    const bob=client(); await login(bob,'bob');
    await bob('/api/game',{id:definition.id,action:'discover'});
    assert.equal((await bob('/api/game',scene('discovery'))).data.play,true);
    assert.equal((await bob('/api/game',scene('solve'))).status,403);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM challenge_cutscenes').get().n,3);
  } finally {sqlite.close();}
});

test('manual grading unlocks the solve cutscene only after completion and regrading does not replay it', async () => {
  const {sqlite,client}=setup();
  try {
    const alice=client(),admin=client(); await login(alice); await login(admin,'teacher');
    await alice('/api/game',{id:'manual-video',answer:'My reasoning.',revision:0});
    assert.equal((await alice('/api/game',scene('solve',false,'manual-video'))).status,403);
    let row=(await admin('/api/admin/review')).data.responses[0];
    const grade=await admin('/api/admin/review',{user:row.user,challenge:row.challenge,revision:row.revision,grade:40});
    assert.equal(grade.status,200,JSON.stringify(grade.data));
    let q=(await alice('/api/game')).data.challenges.find(c=>c.id==='manual-video');
    assert.equal(q.solveVideo,definition.solveVideo); assert.equal(q.solveCutsceneSeen,false);
    assert.equal((await alice('/api/game',scene('solve',false,'manual-video'))).data.play,true);
    row=(await admin('/api/admin/review?status=graded')).data.responses[0];
    await admin('/api/admin/review',{user:row.user,challenge:row.challenge,revision:row.revision,grade:50});
    q=(await alice('/api/game')).data.challenges.find(c=>c.id==='manual-video');
    assert.equal(q.solveCutsceneSeen,true);
  } finally {sqlite.close();}
});

test('video uploads require admin access, validate size/type, serve byte ranges, and survive packs and full restoration', async () => {
  const {sqlite,client,files}=setup();
  let folder;
  try {
    const alice=client(),admin=client();
    assert.equal((await alice('/api/admin/challenge-videos?type=mp4',mp4)).status,401);
    await login(alice); await login(admin,'teacher');
    assert.equal((await alice('/api/admin/challenge-videos?type=mp4',mp4)).status,403);
    assert.equal((await admin('/api/admin/challenge-videos?type=html',mp4)).status,400);
    assert.equal((await admin('/api/admin/challenge-videos?type=mp4',webm)).status,400);
    assert.equal((await admin('/api/admin/challenge-videos?type=mp4',new Uint8Array(4*1024*1024+1))).status,400);
    const intro=await admin('/api/admin/challenge-videos?type=mp4',mp4);
    const outro=await admin('/api/admin/challenge-videos?type=webm',webm);
    assert.equal(intro.status,200); assert.equal(outro.status,200);
    assert.equal(files.size,2);
    const asset=await alice(intro.data.url,undefined,{Range:'bytes=4-7'});
    assert.equal(asset.status,206); assert.equal(asset.headers.get('content-type'),'video/mp4');
    assert.equal(asset.headers.get('content-range'),'bytes 4-7/16'); assert.deepEqual(asset.bytes,mp4.slice(4,8));
    assert.equal((await alice(intro.data.url,undefined,{Range:'bytes=100-'})).status,416);
    let saved=await admin('/api/admin/challenges',{revision:0,editingId:definition.id,challenge:{...definition,discoveryVideo:intro.data.url,solveVideo:outro.data.url}});
    assert.equal(saved.status,200,JSON.stringify(saved.data));
    await alice('/api/game',{id:definition.id,action:'discover'});
    await alice('/api/game',scene('discovery'));
    await alice('/api/game',{id:definition.id,answer:'answer'});
    await alice('/api/game',scene('solve'));
    const exported=await admin('/api/admin/packs?kind=content');
    assert.equal(exported.status,200);
    const pack=unzipSync(exported.bytes);
    assert.deepEqual(pack['assets'+intro.data.url],mp4); assert.deepEqual(pack['assets'+outro.data.url],webm);
    const form=new FormData(); form.set('file',new Blob([exported.bytes]),'content.zip'); form.set('themeRevision','0'); form.set('contentRevision','1');
    const imported=await admin('/api/admin/packs?kind=content',form);
    assert.equal(imported.status,200,JSON.stringify(imported.data));
    assert.equal((await alice('/api/game')).data.challenges[0].discoveryVideo,intro.data.url);
    const backup=await admin('/api/admin/backup');
    assert.equal(backup.status,200,JSON.stringify(backup.data));
    const entries=unzipSync(backup.bytes),snapshot=JSON.parse(strFromU8(entries['backup.json']));
    assert.equal(snapshot.cutscenes.length,2);
    assert.deepEqual(entries['data/pack-assets/'+outro.data.url.slice(12)],webm);
    const legacy={...snapshot}; delete legacy.cutscenes; assert.deepEqual(validateSnapshot(legacy).cutscenes,[]);
    assert.throws(()=>validateSnapshot({...snapshot,cutscenes:[...snapshot.cutscenes,snapshot.cutscenes[0]]}));
    folder=mkdtempSync(resolve(tmpdir(),'quest-cutscenes-'));
    for (const [name,bytes] of Object.entries(entries)) {const path=resolve(folder,name);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,bytes);}
    symlinkSync(resolve('node_modules'),resolve(folder,'node_modules'),'dir');
    const dbpath=resolve(folder,'data/quest.sqlite');
    const restored=spawnSync(process.execPath,[resolve(folder,'server/restore.mjs'),resolve(folder,'backup.json')],{env:{...process.env,DATABASE_PATH:dbpath},encoding:'utf8'});
    assert.equal(restored.status,0,restored.stderr);
    const restoredDb=new DatabaseSync(dbpath);
    try {assert.equal(restoredDb.prepare('SELECT COUNT(*) AS n FROM challenge_cutscenes').get().n,2);} finally {restoredDb.close();}
    const user=(await admin('/api/admin/users')).data.users.find(u=>u.username==='alice');
    const removed=await admin('/api/admin/users',{action:'delete',users:[{username:user.username,revision:user.revision}]});
    assert.equal(removed.status,200,JSON.stringify(removed.data));
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM challenge_cutscenes').get().n,0);
  } finally {sqlite.close();if(folder)rmSync(folder,{recursive:true,force:true});}
});

test('video byte ranges support seeking and suffix reads without invalid offsets', () => {
  assert.deepEqual(byteRange('bytes=-4',16),{status:206,start:12,end:15,headers:{'Accept-Ranges':'bytes','Content-Length':'4','Content-Range':'bytes 12-15/16'}});
  assert.equal(byteRange('bytes=8-',16).end,15);
  assert.equal(byteRange('bytes=8-100',16).end,15);
  for (const range of ['bytes=16-','bytes=10-2','bytes=-0','bytes=0-1,3-4','bytes=-','bytes=999999999999999999999-']) assert.equal(byteRange(range,16).status,416);
});
