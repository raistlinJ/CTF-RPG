import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { stringify, parse } from 'yaml';
import { unzipSync, strFromU8 } from 'fflate';
import { createApi } from '../server/api.mjs';
import { createSQLiteAdapter, initializeSchema } from '../server/sqlite.mjs';
import { parseGame, parseChallenges } from '../lib/config-schema.mjs';
import { defaultTheme, parseTheme } from '../lib/theme-schema.mjs';
import { createWorld } from '../lib/world-data.mjs';
import { rewardsSchema, lockSchema } from '../lib/inventory.mjs';
import { inventoryState, unlockTransport } from '../server/inventory.mjs';
import { exportFullBackup, validateSnapshot } from '../server/backup.mjs';

const phrase='Saffron stars align';
const question={id:'red-key',map:'town',object:'Key quest',location:{x:18,y:19},region:'Square',text:'Find the flag.',points:50,flags:['answer'],rewards:{keys:['red'],incantations:[phrase]}};
function setup() {
  const sqlite=new DatabaseSync(':memory:'); sqlite.exec('PRAGMA foreign_keys=ON');
  for(const file of readdirSync('drizzle').filter(f=>/^\d+.*\.sql$/.test(f)).sort()) sqlite.exec(readFileSync(`drizzle/${file}`,'utf8'));
  const db=createSQLiteAdapter(sqlite);
  const config=parseGame('characters:\n - id: web\n   name: Web\naccounts:\n allowRegistration: true\n users:\n  - username: teacher\n    password: teacher-password\n    role: admin\n    hero: web');
  const theme=defaultTheme(config);
  theme.world.transports=[
    {id:'red-door',map:'town',location:{x:18,y:21},to:'castle',lock:{type:'key',color:'red'}},
    {id:'spell-portal',map:'town',location:{x:19,y:20},to:'cocoa-cottage',lock:{type:'incantation',phrase}},
  ];
  theme.world.portalOverrides=createWorld(theme.world).portals.filter(p=>['entrance-castle','entrance-cocoa-cottage'].includes(p.id)).map(p=>({id:p.id,location:p.location,to:p.to,lock:p.to==='castle'?{type:'key',color:'red'}:{type:'incantation',phrase}}));
  const validTheme=parseTheme(theme);
  sqlite.prepare("INSERT INTO theme_catalog(id,payload,revision) VALUES('active',?,1)").run(JSON.stringify(validTheme));
  const challenges=parseChallenges(stringify({challenges:[question,{...question,id:'manual-key',object:'Written quest',location:{x:17,y:19},grading:'manual',flags:[],rewards:{keys:['blue'],incantations:['blue moon']}},{...question,id:'inside',map:'castle',location:{x:20,y:22},rewards:{keys:['gold'],incantations:[]}}]}));
  const files=new Map(), assetStore={get:async k=>files.get(k),put:async(k,v)=>files.set(k,v)};
  const api=createApi({db,config,challenges,assetStore,exportBackup:exportFullBackup});
  function client(){let cookie='';return async(path,body)=>{
    const form=body instanceof FormData;
    const response=await api(new Request('https://quest.test'+path,{method:body?'POST':'GET',headers:{Origin:'https://quest.test',Cookie:cookie,...(body&&!form?{'Content-Type':'application/json'}:{})},body:form?body:body?JSON.stringify(body):undefined}));
    if(response.headers.has('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
    const bytes=new Uint8Array(await response.arrayBuffer());return{status:response.status,bytes,data:response.headers.get('content-type')?.includes('json')?JSON.parse(strFromU8(bytes)):null};
  };}
  return{sqlite,db,config,theme:validTheme,challenges,client};
}
async function login(call,username='alice',mode=username==='teacher'?'login':'register'){
  const response=await call('/api/auth',{username,password:username==='teacher'?'teacher-password':'student-password',hero:'web',mode});assert.equal(response.status,200,JSON.stringify(response.data));
}
const unlock=(id,phrase)=>({action:'unlock-transport',id,phrase});

// A lock must be representable in exports and executable by the movement engine.
test('lock and reward schemas validate colors and phrases, and locked routes preserve return trips',()=>{
  for(const bad of [{type:'key',color:'pink'},{type:'incantation',phrase:''},{type:'incantation',phrase:'a\nb'},{type:'incantation',phrase:'a'.repeat(81)}])assert.throws(()=>lockSchema.parse(bad));
  for(const bad of [{keys:['red','red']},{incantations:['Hello world',' hello   WORLD ']},{keys:['pink']}])assert.throws(()=>rewardsSchema.parse(bad));
  const {sqlite,theme}=setup();try{
    const w=createWorld(theme.world),p={map:'town',pos:{x:18,y:20}};
    assert.equal(w.step(p,0,1),p);assert.equal(w.step(p,1,0),p);
    const arrived=w.step(p,0,1,['red-door']);assert.equal(arrived.map,'castle');
    const away=w.step(arrived,0,-1);const returned=w.step(away,0,1);
    assert.equal(returned.map,'town');assert.deepEqual(returned.travel,[]);
    assert.equal(w.step(p,1,0,['spell-portal']).map,'cocoa-cottage');
    const t=structuredClone(theme);t.world.transports[0].id='entrance-castle';assert.throws(()=>parseTheme(t));
  }finally{sqlite.close();}
});

test('rewards and unlocks are per player, phrases are private until earned, and repeats cannot mint edited rewards',async()=>{
  const {sqlite,db,theme,client,challenges}=setup();challenges.splice(1,1);try{
    const alice=client(),admin=client();
    assert.equal((await alice('/api/game',unlock('red-door'))).status,401);
    await login(alice);await login(admin,'teacher');
    assert.ok(!JSON.stringify((await alice('/api/config')).data).includes(phrase));
    let state=(await alice('/api/game')).data;
    assert.deepEqual(state.inventory,{keys:[],incantations:[]});assert.ok(!state.challenges.some(c=>c.id==='inside'));
    assert.ok(!JSON.stringify(state).includes(phrase));
    assert.equal((await alice('/api/game',{id:'inside',answer:'answer'})).status,403);
    assert.equal((await alice('/api/game',unlock('red-door'))).status,403);
    assert.equal((await alice('/api/game',unlock('spell-portal','wrong'))).status,403);
    assert.equal((await alice('/api/game',{id:'red-key',answer:'wrong',rewards:{keys:['gold']}})).data.correct,false);
    state=(await alice('/api/game')).data;assert.deepEqual(state.inventory.keys,[]);
    const solves=await Promise.all(Array.from({length:5},()=>alice('/api/game',{id:'red-key',answer:'answer'})));
    assert.ok(solves.every(r=>r.status===200));
    state=solves[0].data;assert.deepEqual(state.inventory,{keys:['red'],incantations:[phrase]});
    assert.equal(state.expeditionComplete,false);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM earned_rewards').get().n,1);
    let opened=await alice('/api/game',unlock('red-door'));assert.equal(opened.status,200);assert.ok(opened.data.unlockedTransports.includes('red-door'));assert.ok(opened.data.challenges.some(c=>c.id==='inside'));
    assert.deepEqual(opened.data.inventory.keys,['red']);
    opened=await alice('/api/game',unlock('spell-portal','  SAFFRON   stars align  '));assert.equal(opened.status,200);
    await alice('/api/game',unlock('entrance-castle'));
    const bob=client();await login(bob,'bob');assert.deepEqual((await bob('/api/game')).data.inventory.keys,[]);assert.equal((await bob('/api/game',unlock('red-door'))).status,403);
    const resumed=client();await login(resumed,'alice','login');assert.ok((await resumed('/api/game')).data.unlockedTransports.includes('spell-portal'));
    const edit=await admin('/api/admin/challenges',{revision:0,editingId:'red-key',challenge:{...question,rewards:{keys:['gold'],incantations:['changed phrase']}}});assert.equal(edit.status,200);
    await alice('/api/game',{id:'red-key',answer:'answer'});assert.deepEqual((await alice('/api/game')).data.inventory,{keys:['red'],incantations:[phrase]});
    assert.deepEqual((await alice('/api/game')).data.challenges.find(c=>c.id==='red-key').rewards.keys,['red']);
    const changed=structuredClone(theme);changed.world.transports[0].lock.color='blue';sqlite.prepare("UPDATE theme_catalog SET payload=?,revision=revision+1 WHERE id='active'").run(JSON.stringify(changed));
    const player=sqlite.prepare("SELECT id FROM students WHERE username='alice'").get().id;
    state=await inventoryState(db,player,changed);assert.ok(!state.unlockedTransports.includes('red-door'));assert.ok(state.unlockedTransports.includes('spell-portal'));
    assert.equal((await alice('/api/game',unlock('red-door'))).status,403);
    assert.equal((await unlockTransport(db,player,theme,1,'red-door')).status,409);
  }finally{sqlite.close();}
});

test('manual responses snapshot inventory rewards at submission and award them once even after edits or regrading',async()=>{
  const {sqlite,client,challenges}=setup();try{
    const alice=client(),admin=client();await login(alice);await login(admin,'teacher');
    assert.equal((await alice('/api/game',{id:'manual-key',answer:'Reasoning.',revision:0})).status,200);
    assert.deepEqual((await alice('/api/game')).data.inventory.keys,[]);
    const edited=await admin('/api/admin/challenges',{revision:0,editingId:'manual-key',challenge:{...challenges[1],rewards:{keys:['gold'],incantations:['new words']}}});assert.equal(edited.status,200);
    assert.deepEqual((await alice('/api/game')).data.challenges.find(c=>c.id==='manual-key').rewards.keys,['blue']);
    await alice('/api/game',{id:'manual-key',answer:'Revised.',revision:1});
    let row=(await admin('/api/admin/review')).data.responses[0];
    assert.equal((await admin('/api/admin/review',{user:row.user,challenge:row.challenge,revision:row.revision,grade:0})).status,200);
    assert.deepEqual((await alice('/api/game')).data.inventory,{keys:['blue'],incantations:['blue moon']});
    row=(await admin('/api/admin/review?status=graded')).data.responses[0];
    await admin('/api/admin/review',{user:row.user,challenge:row.challenge,revision:row.revision,grade:50});
    assert.deepEqual((await alice('/api/game')).data.inventory.keys,['blue']);assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM earned_rewards').get().n,1);
  }finally{sqlite.close();}
});

test('map editing and theme/content packs retain locks and rewards; backups restore inventory, pending rewards, and unlocks',async()=>{
  const {sqlite,client,theme}=setup();let folder;try{
    const alice=client(),admin=client();await login(alice);await login(admin,'teacher');
    const w=createWorld(theme.world),m=theme.world.maps[0],ground=[];
    for(let y=0;y<28;y++)for(let x=0;x<40;x++)if(!w.blocked(m.id,x,y))ground.push([x,y]);
    const f=new FormData();f.set('map',JSON.stringify({id:m.id,name:m.name,bounds:m.bounds,spawn:m.spawn,ground}));f.set('transports',JSON.stringify(theme.world.transports));f.set('portalOverrides',JSON.stringify(theme.world.portalOverrides));f.set('themeRevision','1');f.set('contentRevision','0');
    const save=await admin('/api/admin/maps',f);assert.equal(save.status,200,JSON.stringify(save.data));
    const full=(await admin('/api/admin/challenges')).data;assert.deepEqual(full.theme.world.transports[0].lock,{type:'key',color:'red'});assert.equal(full.theme.world.transports[1].lock.phrase,phrase);
    await alice('/api/game',{id:'red-key',answer:'answer'});await alice('/api/game',unlock('red-door'));await alice('/api/game',unlock('spell-portal',phrase));await alice('/api/game',{id:'manual-key',answer:'Pending response.',revision:0});
    const tpack=await admin('/api/admin/packs?kind=theme'),cpack=await admin('/api/admin/packs?kind=content');
    assert.equal(tpack.status,200);assert.equal(cpack.status,200);
    const exportedTheme=parse(strFromU8(unzipSync(tpack.bytes)['theme.yaml']));assert.equal(exportedTheme.world.transports[1].lock.phrase,phrase);
    const exportedContent=parse(strFromU8(unzipSync(cpack.bytes)['content.yaml']));assert.deepEqual(exportedContent.challenges[0].rewards.keys,['red']);
    const backup=await admin('/api/admin/backup');assert.equal(backup.status,200,JSON.stringify(backup.data));
    const entries=unzipSync(backup.bytes),snapshot=JSON.parse(strFromU8(entries['backup.json']));
    assert.deepEqual(snapshot.earnedRewards[0].rewards,{keys:['red'],incantations:[phrase]});assert.equal(snapshot.unlockedTransports.length,2);assert.deepEqual(snapshot.writtenResponses[0].rewards.keys,['blue']);
    const old={...snapshot};delete old.earnedRewards;delete old.unlockedTransports;assert.deepEqual(validateSnapshot(old).earnedRewards,[]);
    assert.throws(()=>validateSnapshot({...snapshot,earnedRewards:[...snapshot.earnedRewards,snapshot.earnedRewards[0]]}));
    folder=mkdtempSync(resolve(tmpdir(),'quest-inventory-'));for(const[name,bytes]of Object.entries(entries)){const path=resolve(folder,name);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,bytes);}symlinkSync(resolve('node_modules'),resolve(folder,'node_modules'),'dir');
    const path=resolve(folder,'data/quest.sqlite'),restore=spawnSync(process.execPath,[resolve(folder,'server/restore.mjs'),resolve(folder,'backup.json')],{env:{...process.env,DATABASE_PATH:path},encoding:'utf8'});assert.equal(restore.status,0,restore.stderr);
    const restored=new DatabaseSync(path);try{assert.equal(restored.prepare('SELECT COUNT(*) AS n FROM earned_rewards').get().n,1);assert.equal(restored.prepare('SELECT COUNT(*) AS n FROM unlocked_transports').get().n,2);assert.deepEqual(JSON.parse(restored.prepare('SELECT rewards_payload FROM written_responses').get().rewards_payload).keys,['blue']);}finally{restored.close();}
    const user=(await admin('/api/admin/users')).data.users.find(u=>u.username==='alice');assert.equal((await admin('/api/admin/users',{action:'delete',users:[{username:user.username,revision:user.revision}]})).status,200);assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM earned_rewards').get().n,0);assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM unlocked_transports').get().n,0);
  }finally{sqlite.close();if(folder)rmSync(folder,{recursive:true,force:true});}
});

test('existing standalone databases gain inventory tables without changing prior scores or granting edited rewards',()=>{
  const sqlite=new DatabaseSync(':memory:');try{
    for(const file of readdirSync('drizzle').filter(f=>/^\d+.*\.sql$/.test(f)&&Number(f.slice(0,4))<=18).sort())sqlite.exec(readFileSync(`drizzle/${file}`,'utf8'));
    sqlite.prepare('INSERT INTO students(id,username,hash,salt,hero) VALUES(?,?,?,?,?)').run('old','alice','hash','salt','web');sqlite.prepare('INSERT INTO solved(user,challenge,points) VALUES(?,?,?)').run('old','old-test',42);
    initializeSchema(sqlite);assert.equal(sqlite.prepare('SELECT points FROM solved').get().points,42);assert.deepEqual(JSON.parse(sqlite.prepare('SELECT payload FROM earned_rewards').get().payload),{keys:[],incantations:[]});
  }finally{sqlite.close();}
});
