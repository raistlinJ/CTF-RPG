import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { stringify, parse } from 'yaml';
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { createApi } from '../server/api.mjs';
import { initializeSchema, createSQLiteAdapter } from '../server/sqlite.mjs';
import { parseGame, parseChallenges } from '../lib/config-schema.mjs';
import { defaultTheme, parseTheme } from '../lib/theme-schema.mjs';
import { createWorld } from '../lib/world-data.mjs';
import { entitiesSchema, resolveEntityDialogue, matchDialogueChoice, entityLocationAvailable, findEntityLocation, entityInInteractionRange } from '../lib/non-player-entities.mjs';
import { findChallengeLocation, planChallengePlacement } from '../lib/challenge-placement.mjs';
import { exportFullBackup, validateSnapshot } from '../server/backup.mjs';
import { PLAYER_EMOTES } from '../lib/player-emotes.mjs';
import { publicTheme } from '../lib/inventory-data.mjs';

const entity={id:'guide',name:'Trail guide',characterId:'web',map:'town',location:{x:16,y:20},startNode:'hello',nodes:[
  {id:'hello',text:'Welcome, traveler. What would you like to know?',choices:[{id:'key',label:'Find a key',to:'keys'},{id:'portal',label:'Open a portal',to:'spell'}]},
  {id:'keys',text:'A challenge can award a red key.',choices:[{id:'back',label:'Go back',to:'hello'}]},
  {id:'spell',text:'A hidden portal phrase: starlight unlocks.',choices:[]},
]};
function setup(size = 1, { invisible = false } = {}) {
  const sqlite=new DatabaseSync(':memory:');initializeSchema(sqlite);
  const base=createSQLiteAdapter(sqlite);
  let hook;
  const db={...base,prepare(sql){const statement=base.prepare(sql);return{bind(...args){const bound=statement.bind(...args);return{...bound,_sql:sql,async run(){if(hook?.match(sql)){const h=hook;hook=null;h.run();}return bound.run();}};}};},async batch(statements){if(hook && statements.some(s=>hook.match(s._sql))){const h=hook;hook=null;h.run();}return base.batch(statements);}};
  const config=parseGame('characters:\n - id: web\n   name: Web\naccounts:\n allowRegistration: true\n users:\n  - username: teacher\n    password: teacher-password\n    role: admin\n    hero: web');
  const theme=defaultTheme(config);theme.world.entities=[{...entity,size,...(invisible?{invisible:true}:{}),...(size===3?{location:{x:14,y:20}}:{})},{...entity,id:'castle-guide',name:'Castle guide',map:'castle',location:{x:19,y:20}}];
  theme.world.portalOverrides=[{id:'entrance-castle',location:createWorld(theme.world).portals.find(p=>p.id==='entrance-castle').location,to:'castle',lock:{type:'key',color:'green'}}];
  const validTheme=parseTheme(theme);sqlite.prepare("INSERT INTO theme_catalog(id,payload,revision) VALUES('active',?,1)").run(JSON.stringify(validTheme));
  const challenges=parseChallenges(stringify({challenges:[{id:'quest',map:'town',object:'Key quest',location:{x:18,y:19},region:'Square',text:'Find the flag.',flags:['answer'],points:50,rewards:{keys:['red'],incantations:[]}}]}));
  const files=new Map(),assetStore={get:async k=>files.get(k),put:async(k,v)=>files.set(k,v)};
  const api=createApi({db,config,challenges,assetStore,exportBackup:exportFullBackup,readBaseAsset:path=>{try{return new Uint8Array(readFileSync('public'+path));}catch{return null;}}});
  function client(){let cookie='';return async(path,body)=>{
    const form=body instanceof FormData,r=await api(new Request('https://quest.test'+path,{method:body?'POST':'GET',headers:{Origin:'https://quest.test',Cookie:cookie,...(body&&!form?{'Content-Type':'application/json'}:{})},body:form?body:body?JSON.stringify(body):undefined}));
    if(r.headers.has('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];
    const bytes=new Uint8Array(await r.arrayBuffer());return{status:r.status,bytes,data:r.headers.get('content-type')?.includes('json')?JSON.parse(strFromU8(bytes)):null};
  };}
  return{sqlite,db,config,theme:validTheme,challenges,api,client,beforeWrite(match,run){hook={match,run};}};
}
async function login(call,name='alice') {assert.equal((await call('/api/auth',{mode:name==='teacher'?'login':'register',username:name,password:name==='teacher'?'teacher-password':'student-password',hero:'web'})).status,200);}
const dialogue=(choices=[],extra={})=>({action:'entity-dialogue',id:'guide',themeRevision:1,map:'town',x:17,y:20,choices,...extra});
function entityUpdate(themeRevision,entities,map='town',contentRevision=0) {
  const form=new FormData();form.set('action','update-entities');form.set('map',JSON.stringify({id:map}));form.set('entities',JSON.stringify(entities));form.set('themeRevision',String(themeRevision));form.set('contentRevision',String(contentRevision));return form;
}

function emojiSetup() {
  const s=setup();
  const theme=structuredClone(s.theme);
  theme.world.entities[0].nodes.push({id:'secret',text:'The secret trail is now open.',choices:[]});
  theme.world.entities[0].emojiInteractions=[
    {emoji:'👋',response:'You found the secret greeting!',effect:'hearts',once:true,outputNodeId:'secret'},
    {emoji:'😮',response:'A little wonder goes a long way.',effect:'fireworks',once:false,outputNodeId:null},
  ];
  s.sqlite.prepare("UPDATE theme_catalog SET payload=? WHERE id='active'").run(JSON.stringify(parseTheme(theme)));
  const challenges=parseChallenges(stringify({challenges:[...s.challenges,{id:'secret-quest',map:'town',object:'Secret quest',location:{x:12,y:19},region:'Town',text:'A secret question.',flags:['SECRET'],points:50,dependsOn:['npe:guide:secret']}]}));
  s.sqlite.prepare("INSERT INTO challenge_catalog(id,payload,revision) VALUES('active',?,1)").run(JSON.stringify(challenges));
  return{...s,theme:parseTheme(theme),challenges};
}
const emojiRequest=(emoji='👋',extra={})=>({action:'entity-emoji',id:'guide',emoji,themeRevision:1,map:'town',x:17,y:20,...extra});

test('every character accepts all supported emojis without configured secret interactions or progress changes',async()=>{
  const s=setup();try{
    const alice=s.client();await login(alice);
    await alice('/api/teams',{mode:'create',name:'Alpha',password:'team-password'});
    for(const path of ['/api/config','/api/game']){
      const result=await alice(path);
      const characters=path==='/api/config'?result.data.theme.world.entities:result.data.entities;
      assert.ok(characters.length);
      assert.ok(characters.every(character=>character.acceptsEmoji===true));
    }
    for(const {emoji} of PLAYER_EMOTES){
      const response=await alice('/api/game',emojiRequest(emoji));
      assert.equal(response.status,200);
      assert.deepEqual(response.data.reaction,{matched:false,emoji,response:`${emoji} Sent`,effect:'none',firstDiscovery:false});
    }
    for(const table of ['entity_emoji_discoveries','entity_activations','entity_dialogue_outputs'])
      assert.equal(s.sqlite.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n,0);
  }finally{s.sqlite.close();}
});

test('invisible characters save, allow walking through their full allocation, and require their exact tile for dialogue and emojis',async()=>{
  const s=setup(3);try{
    const admin=s.client(),alice=s.client();await login(admin,'teacher');await login(alice);
    await alice('/api/teams',{mode:'create',name:'Alpha',password:'team-password'});
    const edited=structuredClone(s.theme.world.entities);
    edited[0].invisible=true;
    edited[0].emojiInteractions=[{emoji:'👋',response:'You found the hidden cache!',effect:'sparkles',once:true,outputNodeId:'spell'}];
    const saved=await admin('/api/admin/maps',entityUpdate(1,edited));
    assert.equal(saved.status,200,JSON.stringify(saved.data));
    const catalog=(await admin('/api/admin/challenges')).data;
    assert.equal(catalog.theme.world.entities[0].invisible,true);
    const config=(await alice('/api/config')).data;
    assert.equal(config.theme.world.entities[0].invisible,true);
    assert.equal((await alice('/api/game')).data.entities[0].invisible,true);
    for(const world of [catalog.theme.world,config.theme.world,publicTheme(catalog.theme).world]){
      const engine=createWorld(world);
      for(let y=20;y<23;y++)for(let x=14;x<17;x++){
        assert.equal(engine.blocked('town',x,y),false,`${x},${y} must remain walkable`);
        assert.equal(engine.reachable('town',x,y),true);
      }
      assert.deepEqual(engine.step({map:'town',pos:{x:13,y:20}},1,0).pos,{x:14,y:20});
    }
    for(const pos of [{x:13,y:20},{x:14,y:19},{x:15,y:20},{x:16,y:22},{x:13,y:19}]){
      for(const call of [alice,admin]){
        assert.equal((await call('/api/game',dialogue([],{...pos,themeRevision:2}))).status,400);
        assert.equal((await call('/api/game',emojiRequest('👋',{...pos,themeRevision:2}))).status,400);
      }
    }
    const exact={x:14,y:20,themeRevision:2};
    assert.equal((await alice('/api/game',dialogue([],exact))).status,200);
    const reaction=await alice('/api/game',emojiRequest('👋',exact));
    assert.equal(reaction.status,200);assert.equal(reaction.data.reaction.matched,true);
    assert.equal(reaction.data.reaction.firstDiscovery,true);
    assert.equal(s.sqlite.prepare("SELECT COUNT(*) n FROM entity_dialogue_outputs WHERE entity='guide' AND node='spell'").get().n,1);
    edited[0].invisible=false;
    assert.equal((await admin('/api/admin/maps',entityUpdate(2,edited))).status,200);
    const visible=(await alice('/api/config')).data;
    assert.equal(createWorld(visible.theme.world).blocked('town',14,20),true);
    assert.equal((await alice('/api/game',dialogue([],{x:14,y:20,themeRevision:3}))).status,400);
    assert.equal((await alice('/api/game',dialogue([],{x:17,y:21,themeRevision:3}))).status,200);
  }finally{s.sqlite.close();}
});

test('NPC emoji configuration validates secret rules and keeps their triggers and replies out of public summaries',async()=>{
  const s=emojiSetup();try{
    const definition=s.theme.world.entities[0];
    for(const patch of [
      {emojiInteractions:[{...definition.emojiInteractions[0],emoji:'🎉'}]},
      {emojiInteractions:[definition.emojiInteractions[0],definition.emojiInteractions[0]]},
      {emojiInteractions:[{...definition.emojiInteractions[0],response:''}]},
      {emojiInteractions:[{...definition.emojiInteractions[0],effect:'danger'}]},
      {emojiInteractions:[{...definition.emojiInteractions[0],outputNodeId:'missing'}]},
      {emojiInteractions:[{...definition.emojiInteractions[0],outputNodeId:'hello'}]},
    ])assert.throws(()=>entitiesSchema.parse([{...definition,...patch}]));
    assert.deepEqual(entitiesSchema.parse([entity])[0].emojiInteractions,[]);
    const alice=s.client();await login(alice);await alice('/api/teams',{mode:'create',name:'Alpha',password:'team-password'});
    for(const path of ['/api/config','/api/game']){
      const result=await alice(path);assert.equal(result.status,200);
      const serialized=JSON.stringify(result.data);
      assert.ok(!serialized.includes('You found the secret greeting!'));
      assert.ok(!serialized.includes('emojiInteractions'));
    }
    const game=(await alice('/api/game')).data;
    assert.equal(game.entities.find(e=>e.id==='guide').acceptsEmoji,true);
    assert.ok(!game.challenges.some(c=>c.id==='secret-quest'));
  }finally{s.sqlite.close();}
});

test('matching an NPC emoji records a per-player discovery, plays once when configured, and unlocks only its configured dialogue ending',async()=>{
  const s=emojiSetup();try{
    const alice=s.client(),bob=s.client();await login(alice);await login(bob,'bobby');
    const team=(await alice('/api/teams',{mode:'create',name:'Alpha',password:'team-password'})).data.team;
    await bob('/api/teams',{mode:'join',id:team.id,password:'team-password'});
    const miss=await alice('/api/game',emojiRequest('👍'));assert.equal(miss.status,200);assert.equal(miss.data.reaction.matched,false);
    assert.equal(s.sqlite.prepare('SELECT COUNT(*) n FROM entity_emoji_discoveries').get().n,0);
    const found=await alice('/api/game',emojiRequest('👋',{response:'Forged reply',effect:'fireworks',outputNodeId:'hello'}));
    assert.equal(found.status,200);assert.equal(found.data.reaction.firstDiscovery,true);assert.equal(found.data.reaction.effect,'hearts');
    assert.equal(found.data.reaction.response,'You found the secret greeting!');
    assert.ok(found.data.game.challenges.some(c=>c.id==='secret-quest'));
    assert.equal(found.data.game.score,0);assert.deepEqual(found.data.game.inventory,{keys:[],incantations:[]});
    const repeat=await alice('/api/game',emojiRequest());assert.equal(repeat.data.reaction.repeated,true);assert.equal(repeat.data.reaction.effect,'none');
    assert.equal(s.sqlite.prepare('SELECT COUNT(*) n FROM entity_emoji_discoveries').get().n,1);
    assert.equal(s.sqlite.prepare('SELECT COUNT(*) n FROM entity_dialogue_outputs').get().n,1);
    assert.ok(!(await bob('/api/game')).data.challenges.some(c=>c.id==='secret-quest'),'NPC milestones remain personal, just like dialogue outcomes');
    for(let i=0;i<2;i++)assert.equal((await alice('/api/game',emojiRequest('😮'))).data.reaction.effect,'fireworks');
    assert.equal(s.sqlite.prepare('SELECT COUNT(*) n FROM entity_emoji_discoveries').get().n,2);
  }finally{s.sqlite.close();}
});

test('NPC emoji actions enforce accounts, origins, map locks, prerequisites, footprint proximity and current revisions',async()=>{
  const s=emojiSetup();try{
    const anonymous=s.client();assert.equal((await anonymous('/api/game',emojiRequest())).status,401);
    assert.equal((await s.api(new Request('https://quest.test/api/game',{method:'POST',headers:{Origin:'https://evil.test','Content-Type':'application/json'},body:JSON.stringify(emojiRequest())}))).status,403);
    const alice=s.client();await login(alice);await alice('/api/teams',{mode:'create',name:'Alpha',password:'team-password'});
    for(const [patch,status] of [[{emoji:'🎉'},400],[{themeRevision:0},409],[{x:18},400],[{x:17,y:21},400],[{map:'castle'},400],[{id:'missing'},404],[{id:'castle-guide',map:'castle',x:18,y:20},403]])
      assert.equal((await alice('/api/game',emojiRequest('👋',patch))).status,status);
    const gated=structuredClone(s.theme);gated.world.entities[0].dependsOn=['quest'];
    s.sqlite.prepare("UPDATE theme_catalog SET payload=? WHERE id='active'").run(JSON.stringify(gated));
    assert.equal((await alice('/api/game',emojiRequest())).status,404);
    assert.equal(s.sqlite.prepare('SELECT COUNT(*) n FROM entity_emoji_discoveries').get().n,0);
    await alice('/api/game',{id:'quest',answer:'answer'});
    assert.equal((await alice('/api/game',emojiRequest())).status,200);
  }finally{s.sqlite.close();}
});

test('concurrent NPC emoji discoveries grant their outcome once and stale writes roll back without partial progress',async()=>{
  const s=emojiSetup();try{
    const alice=s.client();await login(alice);await alice('/api/teams',{mode:'create',name:'Alpha',password:'team-password'});
    const responses=await Promise.all(Array.from({length:8},()=>alice('/api/game',emojiRequest())));
    assert.ok(responses.every(r=>r.status===200));assert.equal(responses.filter(r=>r.data.reaction.firstDiscovery).length,1);
    assert.equal(s.sqlite.prepare('SELECT COUNT(*) n FROM entity_emoji_discoveries').get().n,1);
    s.beforeWrite(sql=>sql.includes('INSERT OR IGNORE INTO entity_emoji_discoveries'),()=>s.sqlite.exec("UPDATE theme_catalog SET revision=revision+1 WHERE id='active'"));
    assert.equal((await alice('/api/game',emojiRequest('😮'))).status,409);
    assert.equal(s.sqlite.prepare('SELECT COUNT(*) n FROM entity_emoji_discoveries').get().n,1);
  }finally{s.sqlite.close();}
});

test('administrators can preview NPC emoji effects repeatedly without saving discoveries or changing progression',async()=>{
  const s=emojiSetup();try{
    const admin=s.client();await login(admin,'teacher');
    for(let i=0;i<8;i++){
      const response=await admin('/api/game',emojiRequest());assert.equal(response.status,200);assert.equal(response.data.reaction.preview,true);assert.equal(response.data.reaction.effect,'hearts');
    }
    assert.equal(s.sqlite.prepare('SELECT COUNT(*) n FROM entity_emoji_discoveries').get().n,0);
    assert.equal(s.sqlite.prepare('SELECT COUNT(*) n FROM entity_dialogue_outputs').get().n,0);
  }finally{s.sqlite.close();}
});

test('NPC emoji discoveries and authored reactions survive full recreation while legacy backups default safely',async()=>{
  const s=emojiSetup();let folder;try{
    const alice=s.client(),admin=s.client();await login(alice);await login(admin,'teacher');
    await alice('/api/teams',{mode:'create',name:'Alpha',password:'team-password'});
    assert.equal((await alice('/api/game',emojiRequest())).status,200);
    const themePack=unzipSync((await admin('/api/admin/packs?kind=theme')).bytes);
    assert.equal(parse(strFromU8(themePack['theme.yaml'])).world.entities[0].emojiInteractions[0].response,'You found the secret greeting!');
    assert.ok(!Object.keys(themePack).some(name=>name.includes('discoveries')));
    const entries=unzipSync((await admin('/api/admin/backup')).bytes),snapshot=JSON.parse(strFromU8(entries['backup.json']));
    assert.equal(snapshot.entityEmojiDiscoveries.length,1);
    const old=structuredClone(snapshot);delete old.entityEmojiDiscoveries;assert.deepEqual(validateSnapshot(old).entityEmojiDiscoveries,[]);
    assert.throws(()=>validateSnapshot({...snapshot,entityEmojiDiscoveries:[{...snapshot.entityEmojiDiscoveries[0],user:'missing'}]}));
    assert.throws(()=>validateSnapshot({...snapshot,entityEmojiDiscoveries:[snapshot.entityEmojiDiscoveries[0],snapshot.entityEmojiDiscoveries[0]]}));
    folder=mkdtempSync(resolve(tmpdir(),'npc-emoji-'));
    for(const[name,bytes]of Object.entries(entries)){const path=resolve(folder,name);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,bytes);}
    symlinkSync(resolve('node_modules'),resolve(folder,'node_modules'),'dir');
    const path=resolve(folder,'restored.sqlite');
    const result=spawnSync(process.execPath,[resolve(folder,'server/restore.mjs'),resolve(folder,'backup.json')],{env:{...process.env,DATABASE_PATH:path},encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    const restored=new DatabaseSync(path);try{
      const discovery=restored.prepare('SELECT user,entity,emoji,discovered_at FROM entity_emoji_discoveries').get();
      assert.deepEqual({...discovery},snapshot.entityEmojiDiscoveries[0]);
      assert.equal(JSON.parse(restored.prepare("SELECT payload FROM theme_catalog WHERE id='active'").get().payload).world.entities[0].emojiInteractions[0].effect,'hearts');
      restored.prepare('DELETE FROM entity_activations WHERE user=?').run(discovery.user);
      restored.prepare('DELETE FROM entity_dialogue_outputs WHERE user=?').run(discovery.user);
      restored.prepare('DELETE FROM team_members WHERE user=?').run(discovery.user);
      restored.prepare('DELETE FROM students WHERE id=?').run(discovery.user);
      assert.equal(restored.prepare('SELECT COUNT(*) n FROM entity_emoji_discoveries').get().n,0);
    }finally{restored.close();}
  }finally{s.sqlite.close();if(folder)rmSync(folder,{recursive:true,force:true});}
});

test('hosted migration and native startup support persistent per-player NPC emoji discoveries',()=>{
  const db=new DatabaseSync(':memory:');try{
    db.exec('PRAGMA foreign_keys=ON;CREATE TABLE students(id TEXT PRIMARY KEY);');
    db.exec(readFileSync('drizzle/0034_entity_emoji_discoveries.sql','utf8'));
    assert.ok(db.prepare('PRAGMA foreign_key_list(entity_emoji_discoveries)').all().some(row=>row.table==='students'&&row.on_delete==='CASCADE'));
    assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name='entity_emoji_discoveries'").get());
  }finally{db.close();}
  const native=new DatabaseSync(':memory:');try{initializeSchema(native);initializeSchema(native);assert.ok(native.prepare('PRAGMA table_info(entity_emoji_discoveries)').all().some(column=>column.name==='discovered_at'));}finally{native.close();}
});

test('entity definitions validate dialogue links, appearances and spatial rules, with legacy themes defaulting to no entities',()=>{
  const {sqlite,theme}=setup();try {
    const old=structuredClone(theme);delete old.world.entities;assert.deepEqual(parseTheme(old).world.entities,[]);
    for(const patch of [{characterId:'missing'},{map:'missing'},{location:{x:-1,y:0}},{startNode:'missing'},
      {nodes:[{id:'hello',text:'',choices:[]}]},{nodes:[{id:'hello',text:'Hello',choices:[{id:'bad',label:'Bad',to:'missing'}]}]},
      {nodes:[{id:'hello',text:'Hello',choices:[{id:'a',label:'Yes',to:'hello'},{id:'b',label:' YES ',to:'hello'}]}]}]) {
      const changed=structuredClone(theme);changed.world.entities[0]={...entity,...patch};assert.throws(()=>parseTheme(changed));
    }
    assert.throws(()=>entitiesSchema.parse([entity,entity]));
    assert.equal(resolveEntityDialogue(entity,['key','back','portal']).id,'spell');
    const node=resolveEntityDialogue(entity);assert.equal(matchDialogueChoice(node,'2').id,'portal');assert.equal(matchDialogueChoice(node,' FIND   a KEY ').id,'key');assert.equal(matchDialogueChoice(node,'unknown'),null);
    assert.throws(()=>resolveEntityDialogue(entity,['spell']));
    const collision={id:'collision',map:'town',object:'Collision',location:entity.location};
    const plan=planChallengePlacement(theme,[collision]);assert.equal(plan.moved.length,1);assert.notDeepEqual(plan.challenges[0].location,entity.location);
    assert.notDeepEqual(findChallengeLocation(createWorld(theme.world),[],'town',entity.location,'quest'),entity.location);
  } finally {sqlite.close();}
});

test('entity sizes reserve every tile and use the full perimeter for interaction',()=>{
  const {sqlite,theme,challenges}=setup();try{
    const world=createWorld(theme.world),large={...entity,size:3,location:{x:14,y:20}};
    assert.equal(entitiesSchema.parse([entity])[0].size,1);
    for(const size of [1,2,3])assert.equal(entitiesSchema.parse([{...entity,size}])[0].size,size);
    for(const patch of [{size:4},{size:2,location:{x:39,y:20}},{size:3,location:{x:16,y:26}}])assert.throws(()=>entitiesSchema.parse([{...entity,...patch}]));
    assert.throws(()=>entitiesSchema.parse([large,{...entity,id:'overlap',location:{x:16,y:22}}]));
    assert.equal(entityLocationAvailable(world,challenges,[large],'town',14,20,large.id),true);
    assert.equal(entityLocationAvailable(world,[{...challenges[0],location:{x:16,y:22}}],[large],'town',14,20,large.id),false);
    const door=world.portals.find(p=>p.map==='town');
    assert.equal(entityLocationAvailable(world,[],[],'town',door.location.x-1,door.location.y-1,undefined,{size:2}),false);
    for(const p of [{x:17,y:22},{x:16,y:23},{x:13,y:21},{x:15,y:19}])assert.equal(entityInInteractionRange(large,'town',p.x,p.y),true);
    for(const p of [{x:17,y:23},{x:18,y:22},{x:12,y:21},{x:16,y:22}])assert.equal(entityInInteractionRange(large,'town',p.x,p.y),false);
    const expanded=structuredClone(theme);expanded.world.entities[0]=large;
    const overlap={...challenges[0],location:{x:16,y:22}};
    const plan=planChallengePlacement(expanded,[overlap]);assert.equal(plan.moved.length,1);
    const relocated=plan.challenges[0].location;
    assert.ok(relocated.x<14||relocated.x>16||relocated.y<20||relocated.y>22);
    const nearest=findEntityLocation(world,[overlap],[large],'town',large.location,large.id);
    assert.ok(nearest);assert.notDeepEqual(nearest,large.location);
    assert.equal(entityLocationAvailable(world,[overlap],[large],'town',nearest.x,nearest.y,large.id),true);
  }finally{sqlite.close();}
});

test('large entity allocations save, reject overlaps, support edge dialogue and survive exports',async()=>{
  const {sqlite,theme,client}=setup();try{
    const admin=client(),student=client();await login(admin,'teacher');await login(student);
    const edited=structuredClone(theme.world.entities);edited[0].size=3;edited[0].location={x:14,y:20};
    assert.equal((await admin('/api/admin/maps',entityUpdate(1,edited))).status,200);
    const current=(await admin('/api/admin/challenges')).data;assert.equal(current.theme.world.entities[0].size,3);
    const invalid=structuredClone(edited);invalid[0].location={x:16,y:18};
    assert.equal((await admin('/api/admin/maps',entityUpdate(2,invalid))).status,400);
    assert.equal((await admin('/api/admin/challenges')).data.themeRevision,2);
    assert.equal((await admin('/api/admin/challenges',{action:'move',id:'quest',map:'town',location:{x:16,y:22},revision:0,themeRevision:2})).status,400);
    const talk=await student('/api/game',dialogue([],{x:17,y:21,themeRevision:2}));assert.equal(talk.status,200,JSON.stringify(talk.data));
    assert.equal((await student('/api/config')).data.theme.world.entities[0].size,3);
    const pack=await admin('/api/admin/packs?kind=theme');assert.equal(pack.status,200);
    assert.equal(parseTheme(parse(strFromU8(unzipSync(pack.bytes)['theme.yaml']))).world.entities[0].size,3);
    const backup=await admin('/api/admin/backup');assert.equal(backup.status,200);
    const {validateSnapshot}=await import('../server/backup.mjs');
    assert.equal(validateSnapshot(JSON.parse(strFromU8(unzipSync(backup.bytes)['backup.json']))).theme.world.entities[0].size,3);
  }finally{sqlite.close();}
});

test('entities may use non-walkable map tiles while map limits and occupied locations remain protected',()=>{
  const {sqlite,theme,challenges}=setup();try{
    const world=createWorld(theme.world),location={x:0,y:0};
    assert.equal(world.blocked('town',location.x,location.y),true);
    assert.equal(entityLocationAvailable(world,challenges,theme.world.entities,'town',0,0,'guide'),true);
    assert.deepEqual(findEntityLocation(world,challenges,theme.world.entities,'town',location,'guide'),location);
    const placed=structuredClone(theme);placed.world.entities[0].location=location;
    assert.deepEqual(parseTheme(placed).world.entities[0].location,location);
    for(const [map,x,y] of [['missing',0,0],['town',-1,0],['town',40,0],['town',0,28],['town',0.5,0]])
      assert.equal(entityLocationAvailable(world,challenges,theme.world.entities,map,x,y,'guide'),false);
    assert.equal(entityLocationAvailable(world,challenges,theme.world.entities,'town',18,19,'guide'),false,'challenge collision');
    assert.equal(entityLocationAvailable(world,challenges,theme.world.entities,'town',16,20,'another'),false,'entity collision');
    const door=world.portals.find(p=>p.map==='town');
    assert.equal(entityLocationAvailable(world,[],[],'town',door.location.x,door.location.y),false);
    placed.world.entities[0].location=door.location;
    assert.throws(()=>parseTheme(placed),/spawns, doors, transport/);
    assert.equal(world.canPlaceChallenge('town',0,0),false,'challenge placement still requires walkable ground');
  }finally{sqlite.close();}
});

test('saving a non-walkable entity preserves terrain and supports conversation from an adjacent walkable tile',async()=>{
  const {sqlite,theme,challenges,client}=setup();try{
    const admin=client(),student=client();await login(admin,'teacher');await login(student);
    const world=createWorld(theme.world);
    let placement;
    for(let y=0;y<28&&!placement;y++)for(let x=0;x<40&&!placement;x++){
      if(!world.blocked('town',x,y))continue;
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]])if(world.canPlaceChallenge('town',x+dx,y+dy)){
        placement={location:{x,y},player:{x:x+dx,y:y+dy}};break;
      }
    }
    assert.ok(placement,'a blocked tile beside a walkable tile exists');
    const edited=structuredClone(theme.world.entities);edited[0].location=placement.location;
    const saved=await admin('/api/admin/maps',entityUpdate(1,edited));
    assert.equal(saved.status,200,JSON.stringify(saved.data));
    const current=(await admin('/api/admin/challenges')).data;
    const geometry=maps=>maps.map(({background,originalBackground,...layout})=>layout);
    assert.deepEqual(geometry(current.theme.world.maps),geometry(theme.world.maps));
    assert.deepEqual(current.challenges,challenges);
    assert.deepEqual(current.theme.world.entities[0].location,placement.location);
    const response=await student('/api/game',dialogue([],{themeRevision:2,...placement.player}));
    assert.equal(response.status,200,JSON.stringify(response.data));
    assert.equal(response.data.dialogue.text,entity.nodes[0].text);
    const pack=await admin('/api/admin/packs?kind=theme');
    const packed=parse(strFromU8(unzipSync(pack.bytes)['theme.yaml']));
    assert.deepEqual(parseTheme(packed).world.entities[0].location,placement.location);
    const backup=await admin('/api/admin/backup');assert.equal(backup.status,200);
    const snapshot=JSON.parse(strFromU8(unzipSync(backup.bytes)['backup.json']));
    const {validateSnapshot}=await import('../server/backup.mjs');
    assert.deepEqual(validateSnapshot(snapshot).theme.world.entities[0].location,placement.location);
  }finally{sqlite.close();}
});

test('entity interactions allow one cardinal tile and reject two tiles or a diagonal before activation',async()=>{
  const {sqlite,client}=setup();try{
    const student=client(),admin=client();await login(student);await login(admin,'teacher');
    for(const pos of [{x:18,y:20},{x:16,y:22},{x:17,y:21},{x:16,y:20}]){
      assert.equal(entityInInteractionRange(entity,'town',pos.x,pos.y),false);
      for(const call of [student,admin])assert.equal((await call('/api/game',dialogue([],pos))).status,400);
    }
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM entity_activations').get().n,0);
    for(const pos of [{x:15,y:20},{x:17,y:20},{x:16,y:19},{x:16,y:21}]){
      assert.equal(entityInInteractionRange(entity,'town',pos.x,pos.y),true);
      assert.equal((await student('/api/game',dialogue([],pos))).status,200);
    }
    assert.equal(entityInInteractionRange(entity,'castle',16,20),false);
    assert.equal(entityInInteractionRange(entity,'town',16.5,20),false);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM entity_activations').get().n,1);
  }finally{sqlite.close();}
});

test('Search conversations expose only reached dialogue, validate choices and proximity, respect locked maps, and never change rewards',async()=>{
  const {sqlite,client}=setup();try {
    const alice=client(),bob=client(),admin=client();assert.equal((await alice('/api/game',dialogue())).status,401);await login(alice);await login(bob,'bobby');await login(admin,'teacher');
    const publicConfig=(await alice('/api/config')).data;assert.ok(!JSON.stringify(publicConfig).includes('starlight unlocks'));assert.ok(!JSON.stringify(publicConfig).includes('Welcome, traveler'));
    assert.deepEqual(publicConfig.theme.world.entities[0],{id:entity.id,name:entity.name,characterId:entity.characterId,map:entity.map,location:entity.location,size:1,restartable:true,acceptsEmoji:true});
    const first=await alice('/api/game',dialogue());assert.equal(first.status,200);assert.equal(first.data.dialogue.text,entity.nodes[0].text);assert.equal(first.data.dialogue.choices[0].to,undefined);assert.ok(!JSON.stringify(first.data).includes('starlight unlocks'));
    assert.equal((await alice('/api/game',dialogue(['key']))).data.dialogue.id,'keys');
    const last=await alice('/api/game',dialogue(['portal']));assert.equal(last.data.dialogue.text,entity.nodes[2].text);assert.deepEqual(last.data.dialogue.choices,[]);
    assert.equal((await bob('/api/game',dialogue())).data.dialogue.id,'hello');assert.equal((await alice('/api/game',dialogue())).data.dialogue.id,'hello');
    for(const body of [dialogue(['spell']),dialogue(['portal','back']),dialogue(Array(101).fill('key')),dialogue([], {x:0,y:0}),dialogue([],{x:18.5}),dialogue([],{map:'castle'}),dialogue([],{choices:'invalid'})])assert.equal((await alice('/api/game',body)).status,400);
    assert.equal((await alice('/api/game',dialogue([],{id:'missing'}))).status,404);assert.equal((await alice('/api/game',dialogue([],{themeRevision:0}))).status,409);
    assert.equal((await alice('/api/game',dialogue([],{id:'castle-guide',map:'castle',x:18,y:20}))).status,403);
    assert.equal((await admin('/api/game',dialogue([],{id:'castle-guide',map:'castle',x:18,y:20}))).status,200);
    const state=(await alice('/api/game')).data;assert.equal(state.score,0);assert.deepEqual(state.inventory,{keys:[],incantations:[]});assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM solved').get().n,0);
  } finally {sqlite.close();}
});

test('map entity saves preserve map geometry, transport and challenges, enforce map scope and conflicts, and can restore removed characters',async()=>{
  const {sqlite,theme,challenges,client}=setup();try {
    const admin=client(),student=client();await login(admin,'teacher');await login(student);
    assert.equal((await student('/api/admin/maps',entityUpdate(1,theme.world.entities))).status,403);
    const edited=structuredClone(theme.world.entities);edited[0].name='Friendly guide';edited[0].nodes[0].text='A new greeting.';
    const save=await admin('/api/admin/maps',entityUpdate(1,edited));assert.equal(save.status,200,JSON.stringify(save.data));assert.deepEqual(save.data.placement.moved,[]);
    const current=(await admin('/api/admin/challenges')).data;
    assert.deepEqual(current.challenges,challenges);assert.equal(current.themeRevision,2);assert.equal(current.revision,0);
    const geometry=world=>world.maps.map(({id,bounds,spawn,exit,ground,obstacles})=>({id,bounds,spawn,exit,ground,obstacles}));
    assert.deepEqual(geometry(current.theme.world),geometry(theme.world));assert.deepEqual(current.theme.world.portalOverrides,theme.world.portalOverrides);assert.deepEqual(current.theme.world.entities,edited);
    assert.equal((await admin('/api/admin/maps',entityUpdate(1,edited))).status,400);
    const cross=structuredClone(edited);cross[1].name='Changed other map';assert.equal((await admin('/api/admin/maps',entityUpdate(2,cross))).status,400);
    const collision=structuredClone(edited);collision[0].location=challenges[0].location;assert.equal((await admin('/api/admin/maps',entityUpdate(2,collision))).status,400);
    const mutation=entityUpdate(2,edited);mutation.set('moves','[]');assert.equal((await admin('/api/admin/maps',mutation)).status,400);
    assert.equal((await admin('/api/admin/challenges',{revision:0,editingId:'quest',challenge:{...challenges[0],location:entity.location}})).status,400);
    assert.equal((await admin('/api/admin/challenges',{action:'move',id:'quest',map:'town',location:entity.location,revision:0,themeRevision:2})).status,400);
    assert.equal((await admin('/api/admin/maps',entityUpdate(2,[edited[1]]))).status,200);
    assert.equal((await student('/api/game',dialogue([],{themeRevision:3}))).status,404);
    assert.equal((await admin('/api/admin/maps',entityUpdate(3,edited))).status,200);
    assert.equal((await student('/api/game',dialogue([],{themeRevision:4}))).data.dialogue.text,'A new greeting.');
  } finally {sqlite.close();}
});

test('theme packs and full backups retain invisible entities and branching dialogue through restoration',async()=>{
  const {sqlite,client,theme}=setup(3,{invisible:true});let folder;try {
    const admin=client();await login(admin,'teacher');
    const pack=await admin('/api/admin/packs?kind=theme');assert.equal(pack.status,200);const packed=parse(strFromU8(unzipSync(pack.bytes)['theme.yaml']));assert.deepEqual(packed.world.entities,theme.world.entities);
    const backup=await admin('/api/admin/backup');assert.equal(backup.status,200,JSON.stringify(backup.data));const entries=unzipSync(backup.bytes),snapshot=JSON.parse(strFromU8(entries['backup.json']));assert.deepEqual(snapshot.theme.world.entities,theme.world.entities);
    folder=mkdtempSync(resolve(tmpdir(),'quest-entities-'));for(const[name,bytes]of Object.entries(entries)){const path=resolve(folder,name);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,bytes);}symlinkSync(resolve('node_modules'),resolve(folder,'node_modules'),'dir');
    const path=resolve(folder,'restored.sqlite'),r=spawnSync(process.execPath,[resolve(folder,'server/restore.mjs'),resolve(folder,'backup.json')],{env:{...process.env,DATABASE_PATH:path},encoding:'utf8'});assert.equal(r.status,0,r.stderr);
    const restored=new DatabaseSync(path);try {const value=JSON.parse(restored.prepare('SELECT payload FROM theme_catalog').get().payload);assert.deepEqual(value.world.entities,theme.world.entities);assert.equal(resolveEntityDialogue(value.world.entities[0],['portal']).text,entity.nodes[2].text);}finally{restored.close();}
  } finally {sqlite.close();if(folder)rmSync(folder,{recursive:true,force:true});}
});

function graphBody(graph, overrides={}, entities=graph.entities) {
  return {revision:graph.revision,themeRevision:graph.themeRevision,entities,
    dependencies:[...graph.challenges.map(c=>({id:c.id,dependsOn:overrides[c.id]??c.dependsOn})),...entities.map(e=>({id:`npe:${e.id}`,dependsOn:overrides[`npe:${e.id}`]??e.dependsOn??[]}))]};
}
test('dependency-only saves connect and disconnect existing entities without replacing their Theme definitions',async()=>{
  const {sqlite,client}=setup();try{
    const admin=client();await login(admin,'teacher');
    let graph=(await admin('/api/admin/challenge-dependencies')).data;
    const original=structuredClone(graph.entities);
    const save=async overrides=>{
      const body=graphBody(graph,overrides);delete body.entities;
      const result=await admin('/api/admin/challenge-dependencies',body);
      assert.equal(result.status,200,JSON.stringify(result.data));graph=result.data;
      assert.deepEqual(graph.entities.map(({dependsOn,...definition})=>definition),original.map(({dependsOn,...definition})=>definition));
    };
    await save({quest:['npe:guide'],'npe:castle-guide':['quest']});
    assert.deepEqual(graph.challenges[0].dependsOn,['npe:guide']);
    assert.deepEqual(graph.entities.find(e=>e.id==='castle-guide').dependsOn,['quest']);
    const invalid=graphBody(graph);delete invalid.entities;
    invalid.dependencies=invalid.dependencies.filter(n=>n.id!=='npe:guide');
    assert.equal((await admin('/api/admin/challenge-dependencies',invalid)).status,400);
    await save({quest:[],'npe:castle-guide':[]});
    assert.equal(graph.entities.length,original.length);
    assert.ok(graph.entities.every(e=>!e.dependsOn.length));
  }finally{sqlite.close();}
});
test('dependency graph adds, edits and deletes entities, validates mixed loops, and saves both catalogs atomically',async()=>{
  const {sqlite,client,beforeWrite}=setup();try{
    const admin=client(),student=client();await login(admin,'teacher');await login(student);
    assert.equal((await student('/api/admin/challenge-dependencies')).status,403);
    let graph=(await admin('/api/admin/challenge-dependencies')).data;
    assert.equal(graph.entities.length,2);assert.ok(graph.characters.length);assert.ok(graph.world.maps.length);
    const added={...entity,id:'another-guide',name:'Second guide',location:{x:17,y:20}};
    let result=await admin('/api/admin/challenge-dependencies',graphBody(graph,{'npe:another-guide':['quest']},[...graph.entities,added]));
    assert.equal(result.status,200,JSON.stringify(result.data));graph=result.data;
    assert.equal(graph.themeRevision,2);assert.equal(graph.revision,1);
    const before=sqlite.prepare('SELECT payload,revision FROM theme_catalog').get();
    for(const overrides of [{quest:['npe:another-guide']},{quest:['npe:missing']},{'npe:another-guide':['npe:another-guide']},{'npe:guide':['quest','quest']},{'npe:guide':['npe:another-guide'],'npe:another-guide':['npe:guide']}]){
      assert.equal((await admin('/api/admin/challenge-dependencies',graphBody(graph,overrides))).status,400);
      assert.deepEqual(sqlite.prepare('SELECT payload,revision FROM theme_catalog').get(),before);
    }
    result=await admin('/api/admin/challenge-dependencies',graphBody(graph,{quest:['npe:guide']},graph.entities.map(e=>e.id==='guide'?{...e,name:'Renamed guide'}:e)));
    assert.equal(result.status,200,JSON.stringify(result.data));graph=result.data;
    assert.equal((await admin('/api/admin/challenges',{revision:graph.revision,editingId:'quest',challenge:{...(await admin('/api/admin/challenges')).data.challenges[0],object:'Edited quest'}})).status,200,'regular challenge editor preserves entity prerequisites');
    graph=(await admin('/api/admin/challenge-dependencies')).data;
    assert.equal((await admin('/api/admin/challenge-dependencies',graphBody(graph,{},graph.entities.filter(e=>e.id!=='guide')))).status,400,'dangling edges must be removed explicitly');
    result=await admin('/api/admin/challenge-dependencies',graphBody(graph,{quest:[]},graph.entities.filter(e=>e.id!=='guide')));assert.equal(result.status,200,JSON.stringify(result.data));graph=result.data;
    assert.ok(!graph.entities.some(e=>e.id==='guide'));
    assert.equal((await admin('/api/admin/challenge-dependencies',graphBody({...graph,themeRevision:graph.themeRevision-1}))).status,409);
    const previousContent=sqlite.prepare('SELECT payload,revision FROM challenge_catalog').get();
    beforeWrite(sql=>sql.includes('admin_user_action_guard'),()=>sqlite.prepare("UPDATE theme_catalog SET revision=revision+1 WHERE id='active'").run());
    assert.equal((await admin('/api/admin/challenge-dependencies',graphBody(graph,{quest:['npe:castle-guide']}))).status,409);
    assert.deepEqual(sqlite.prepare('SELECT payload,revision FROM challenge_catalog').get(),previousContent,'stale graph cannot change the challenge catalog');
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM admin_user_action_guard').get().n,0);
  }finally{sqlite.close();}
});

test('solving unlocks entities, speaking unlocks challenges immediately and per player, and gated details never leak',async()=>{
  const {sqlite,client,challenges}=setup();try{
    const admin=client(),alice=client(),bob=client();await login(admin,'teacher');await login(alice);await login(bob,'bobby');
    await alice('/api/teams',{mode:'create',name:'Class',password:'team-password'});
    const graph=(await admin('/api/admin/challenge-dependencies')).data;
    const save=await admin('/api/admin/challenge-dependencies',graphBody(graph,{'npe:guide':['quest']}));assert.equal(save.status,200,JSON.stringify(save.data));
    const rev=save.data.themeRevision;
    const followup={...challenges[0],id:'followup',object:'Private followup',text:'Secret followup question',location:{x:19,y:19},dependsOn:['npe:guide']};
    let catalog=(await admin('/api/admin/challenges')).data;
    assert.equal((await admin('/api/admin/challenges',{revision:catalog.revision,challenge:followup})).status,200);
    const config=(await alice('/api/config')).data;assert.ok(!JSON.stringify(config).includes('Trail guide'));
    let game=(await alice('/api/game')).data;assert.ok(!game.entities.some(e=>e.id==='guide'));assert.ok(!JSON.stringify(game).includes('Secret followup'));
    assert.equal((await alice('/api/game',dialogue([],{themeRevision:rev}))).status,404);
    assert.equal((await alice('/api/game',{id:'followup',action:'discover'})).status,400);
    const before=(await alice('/api/presence',{map:'town',x:18,y:20,themeRevision:rev})).data;
    assert.ok(!before.challengeSolves.some(c=>c.id==='followup'));
    game=(await alice('/api/game',{id:'quest',answer:'answer'})).data;assert.ok(game.entities.some(e=>e.id==='guide'));assert.ok(!game.challenges.some(c=>c.id==='followup'));
    assert.equal((await admin('/api/game',dialogue([],{themeRevision:rev}))).status,200);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM entity_activations').get().n,0,'admin preview never activates');
    for(const patch of [{x:0,y:0},{choices:['unknown']},{themeRevision:rev-1}])assert.notEqual((await alice('/api/game',dialogue([],{themeRevision:rev,...patch}))).status,200);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM entity_activations').get().n,0);
    let spoken=await alice('/api/game',dialogue([],{themeRevision:rev}));assert.equal(spoken.status,200);assert.ok(spoken.data.game.challenges.some(c=>c.id==='followup'));assert.deepEqual(spoken.data.game.activatedEntities,['guide']);
    assert.equal((await alice('/api/game',dialogue(['key'],{themeRevision:rev}))).status,200);assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM entity_activations').get().n,1);
    const after=(await alice('/api/presence',{map:'town',x:18,y:20,themeRevision:rev})).data;assert.ok(after.challengeSolves.some(c=>c.id==='followup'));assert.notEqual(after.gameRevision,before.gameRevision);
    game=(await alice('/api/game')).data;assert.ok(game.challenges.some(c=>c.id==='followup'));assert.equal(game.score,50);assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM solved').get().n,1);
    const other=(await bob('/api/game')).data;assert.ok(!other.entities.some(e=>e.id==='guide'));assert.ok(!other.challenges.some(c=>c.id==='followup'));
    catalog=(await admin('/api/admin/challenges')).data;assert.deepEqual(catalog.challenges.find(c=>c.id==='followup').dependsOn,['npe:guide']);
  }finally{sqlite.close();}
});

test('a final dialogue output unlocks its dependent challenge only after that ending is reached',async()=>{
  const {sqlite,client,theme}=setup();try{
    const admin=client(),alice=client(),bob=client();await login(admin,'teacher');await login(alice);await login(bob,'bobby');
    const graph=(await admin('/api/admin/challenge-dependencies')).data;
    const saved=await admin('/api/admin/challenge-dependencies',graphBody(graph,{quest:['npe:guide:spell']}));
    assert.equal(saved.status,200,JSON.stringify(saved.data));
    assert.ok(!(await alice('/api/game')).data.challenges.some(c=>c.id==='quest'));
    assert.equal((await alice('/api/game',dialogue())).status,200);
    assert.ok(!(await alice('/api/game')).data.challenges.some(c=>c.id==='quest'));
    assert.equal((await alice('/api/game',dialogue(['key']))).status,200);
    assert.ok(!(await alice('/api/game')).data.challenges.some(c=>c.id==='quest'));
    const ending=await alice('/api/game',dialogue(['portal']));
    assert.equal(ending.status,200,JSON.stringify(ending.data));
    assert.ok(ending.data.game.challenges.some(c=>c.id==='quest'));
    assert.deepEqual(ending.data.game.activatedEntities,['guide']);
    assert.deepEqual(sqlite.prepare('SELECT entity,node FROM entity_dialogue_outputs').all().map(r=>({...r})),[{entity:'guide',node:'spell'}]);
    assert.ok(!(await bob('/api/game')).data.challenges.some(c=>c.id==='quest'));
    const invalid=graphBody(saved.data,{quest:['npe:guide:keys']});
    assert.equal((await admin('/api/admin/challenge-dependencies',invalid)).status,400,'nonfinal dialogue cannot be a dependency');
    const changed=structuredClone(theme.world.entities);
    changed[0].nodes[0].choices.push({id:'bye',label:'Say goodbye',to:'goodbye'});
    changed[0].nodes.push({id:'goodbye',text:'Safe travels.',choices:[]});
    assert.equal((await admin('/api/admin/maps',entityUpdate(1,changed,'town',1))).status,200);
    assert.equal((await alice('/api/game',dialogue(['bye'],{themeRevision:2}))).status,200);
    assert.deepEqual(sqlite.prepare('SELECT node FROM entity_dialogue_outputs WHERE entity=? ORDER BY node').all('guide').map(r=>r.node),['goodbye','spell']);
    assert.ok((await alice('/api/game')).data.challenges.some(c=>c.id==='quest'),'reaching another ending preserves the earlier output');
  }finally{sqlite.close();}
});

test('one-time dialogue remembers the last screen and ends later interactions',async()=>{
  const {sqlite,client,theme}=setup();try{
    const admin=client(),alice=client();await login(admin,'teacher');await login(alice);
    const edited=structuredClone(theme.world.entities);edited[0].restartable=false;
    assert.equal((await admin('/api/admin/maps',entityUpdate(1,edited))).status,200);
    const call=(choices,session)=>alice('/api/game',dialogue(choices,{themeRevision:2,session}));
    const session='session-one',later='session-two';
    assert.equal((await call([],session)).data.dialogue.id,'hello');
    assert.equal((await call(['key'],session)).data.dialogue.id,'keys');
    const replay=await call([],later);
    assert.equal(replay.status,200,JSON.stringify(replay.data));
    assert.equal(replay.data.dialogue.id,'keys');assert.deepEqual(replay.data.dialogue.choices,[]);
    assert.equal((await call([],session)).status,400,'same session cannot restart');
    assert.equal((await call(['key','back'],session)).data.dialogue.id,'hello');
    assert.equal((await call(['key','back','portal'],session)).data.dialogue.id,'spell');
    assert.deepEqual((await call([],later)).data.dialogue.choices,[]);
    assert.equal((await call([],later)).data.dialogue.id,'spell');
    assert.deepEqual(sqlite.prepare('SELECT entity,node FROM entity_dialogue_outputs').all().map(r=>({...r})),[{entity:'guide',node:'spell'}]);
    assert.equal((await call(['portal'],later)).data.dialogue.id,'spell','later session cannot choose a new branch');
  }finally{sqlite.close();}
});

test('a graph changed during conversation cannot activate an entity or unlock its dependents',async()=>{
  const {sqlite,client,beforeWrite,challenges}=setup();try{
    const alice=client();await login(alice);
    beforeWrite(sql=>sql.includes('INSERT OR IGNORE INTO entity_activations'),()=>sqlite.prepare("INSERT INTO challenge_catalog(id,payload,revision) VALUES('active',?,1)").run(JSON.stringify(challenges)));
    assert.equal((await alice('/api/game',dialogue())).status,409);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM entity_activations').get().n,0);
    assert.equal((await alice('/api/game',dialogue())).status,200);
  }finally{sqlite.close();}
});

test('full backups preserve entity prerequisites and player activation through recreation and reject corrupt history',async()=>{
  const {sqlite,client}=setup();let folder;try{
    const admin=client(),alice=client();await login(admin,'teacher');await login(alice);
    const graph=(await admin('/api/admin/challenge-dependencies')).data;
    const result=await admin('/api/admin/challenge-dependencies',graphBody(graph,{quest:['npe:guide']}));assert.equal(result.status,200);
    assert.equal((await alice('/api/game',dialogue())).status,200);
    assert.equal((await alice('/api/game',dialogue(['portal']))).status,200);
    const backup=await admin('/api/admin/backup');assert.equal(backup.status,200,JSON.stringify(backup.data));const entries=unzipSync(backup.bytes),snapshot=JSON.parse(strFromU8(entries['backup.json']));assert.equal(snapshot.entityActivations.length,1);assert.deepEqual(snapshot.challenges[0].dependsOn,['npe:guide']);assert.equal(snapshot.entityDialogueOutputs.length,1);assert.equal(snapshot.entityDialogueProgress[0].node,'spell');
    const {validateSnapshot}=await import('../server/backup.mjs');
    assert.throws(()=>validateSnapshot({...snapshot,entityActivations:[...snapshot.entityActivations,...snapshot.entityActivations]}));
    assert.throws(()=>validateSnapshot({...snapshot,entityActivations:[{user:'missing',entity:'guide'}]}));
    const legacy=structuredClone(snapshot);delete legacy.entityActivations;assert.deepEqual(validateSnapshot(legacy).entityActivations,[]);
    folder=mkdtempSync(resolve(tmpdir(),'quest-entity-deps-'));for(const[name,bytes]of Object.entries(entries)){const path=resolve(folder,name);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,bytes);}symlinkSync(resolve('node_modules'),resolve(folder,'node_modules'),'dir');
    const path=resolve(folder,'restored.sqlite'),r=spawnSync(process.execPath,[resolve(folder,'server/restore.mjs'),resolve(folder,'backup.json')],{env:{...process.env,DATABASE_PATH:path},encoding:'utf8'});assert.equal(r.status,0,r.stderr);
    const restored=new DatabaseSync(path);try{assert.deepEqual(restored.prepare('SELECT user,entity FROM entity_activations').all().map(r=>({...r})),snapshot.entityActivations);assert.deepEqual(restored.prepare('SELECT user,entity,node FROM entity_dialogue_outputs').all().map(r=>({...r})),snapshot.entityDialogueOutputs);assert.deepEqual(restored.prepare('SELECT user,entity,session,node,text,path,completed FROM entity_dialogue_progress').all().map(r=>({...r})),snapshot.entityDialogueProgress);assert.deepEqual(JSON.parse(restored.prepare('SELECT payload FROM challenge_catalog').get().payload)[0].dependsOn,['npe:guide']);}finally{restored.close();}
  }finally{sqlite.close();if(folder)rmSync(folder,{recursive:true,force:true});}
});

test('mixed prerequisites survive theme/content pack imports and dangling entity references cannot drop challenges',async()=>{
  const {sqlite,client}=setup();try{
    const admin=client();await login(admin,'teacher');
    let graph=(await admin('/api/admin/challenge-dependencies')).data;
    const result=await admin('/api/admin/challenge-dependencies',graphBody(graph,{quest:['npe:guide']}));assert.equal(result.status,200);graph=result.data;
    const themePack=await admin('/api/admin/packs?kind=theme'),contentPack=await admin('/api/admin/packs?kind=content');
    const files=unzipSync(themePack.bytes),value=parse(strFromU8(files['theme.yaml']));value.world.entities=value.world.entities.filter(e=>e.id!=='guide');files['theme.yaml']=strToU8(stringify(value));
    const form=(bytes)=>{const f=new FormData();f.set('file',new Blob([bytes]),'theme.zip');f.set('themeRevision',String(graph.themeRevision));f.set('contentRevision',String(graph.revision));f.set('dropOverflow','true');return f;};
    const before=sqlite.prepare('SELECT payload,revision FROM challenge_catalog').get();
    const bad=await admin('/api/admin/packs?kind=theme',form(zipSync(files)));assert.equal(bad.status,400);assert.match(bad.data.error,/unknown prerequisite/);assert.deepEqual(sqlite.prepare('SELECT payload,revision FROM challenge_catalog').get(),before);
    const paired=form(themePack.bytes);paired.set('content',new Blob([contentPack.bytes]),'content.zip');const imported=await admin('/api/admin/packs?kind=theme',paired);assert.equal(imported.status,200,JSON.stringify(imported.data));
    graph=(await admin('/api/admin/challenge-dependencies')).data;assert.deepEqual(graph.challenges[0].dependsOn,['npe:guide']);assert.ok(graph.entities.some(e=>e.id==='guide'));
  }finally{sqlite.close();}
});
