import { defaultGameConfig } from "../lib/runtime-config.mjs";
// CTF-RPG — Copyright Jaime C Acosta 2026
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {parse,stringify} from 'yaml';
import {unzipSync,strFromU8} from 'fflate';
import {themePresets} from '../lib/theme-presets.mjs';
import {parseChallenges,parseGame,publicConfig} from '../lib/config-schema.mjs';
import {defaultTheme,parseTheme} from '../lib/theme-schema.mjs';
import {createWorld} from '../lib/world-data.mjs';
import {themeContentValid} from '../server/packs.mjs';
import {initializeSchema,createSQLiteAdapter} from '../server/sqlite.mjs';
import {createApi} from '../server/api.mjs';
test('default character catalog keeps player and entity appearances separate',()=>{
 const config=defaultGameConfig();
 assert.equal(publicConfig(config).characters.length,8);
 assert.equal(defaultTheme(config).characters.filter(c=>c.appearanceFor==='entity').length,7);
 assert.ok(publicConfig(config).characters.every(c=>c.appearanceFor!=='entity'));
});
for(const preset of themePresets.filter(preset=>preset.demoTheme)) {
 test(`${preset.id} demo ZIPs preserve footprints, separate content, and a solvable reward route`,async()=>{
  const {id,demoTheme,challenges}=preset;
  assert.deepEqual(challenges,parseChallenges(readFileSync(`themes/${id}/demo-challenges.yaml`,'utf8')));
  themeContentValid(demoTheme,challenges);
  const themeEntries=unzipSync(readFileSync(`theme-packs/${id}-demo-theme.zip`));
  const contentEntries=unzipSync(readFileSync(`theme-packs/${id}-demo-content.zip`));
  assert.ok(!themeEntries['content.yaml']);assert.ok(!contentEntries['theme.yaml']);assert.ok(!themeEntries['backup.json']);
  const packedTheme=parseTheme(parse(strFromU8(themeEntries['theme.yaml'])));
  for(const clip of packedTheme.sounds.clips)assert.ok(themeEntries['assets'+clip.src]?.length,clip.src);
  assert.equal(packedTheme.characters.filter(c=>c.appearanceFor==='player').length,['halloween','solstice-vanguard'].includes(id)?3:5);
  assert.equal(packedTheme.characters.filter(c=>c.appearanceFor==='entity').length,['halloween','solstice-vanguard'].includes(id)?2:7);
  assert.ok(packedTheme.world.entities.every(e=>packedTheme.characters.find(c=>c.id===e.characterId)?.appearanceFor==='entity'));
  for(const c of packedTheme.characters.filter(c=>c.appearanceFor!=='both')) assert.ok(themeEntries['assets'+c.sprite]?.length,c.id);
  const packedChallenges=parseChallenges(stringify({challenges:parse(strFromU8(contentEntries['content.yaml'])).challenges}));
  assert.deepEqual(packedTheme,demoTheme);assert.deepEqual(packedChallenges,challenges);
  assert.deepEqual(challenges.filter(c=>c.icon==='boss').map(c=>c.iconSize),[1,2,3]);
  assert.equal(new Set(challenges.filter(c=>c.icon==='boss').map(c=>c.bossStyle)).size,3);
  assert.ok(challenges.filter(c=>c.icon==='boss').every(c=>c.bossStyle!=='classic'));
  assert.equal(challenges.filter(c=>c.grading==='manual').length,1);
  assert.ok(challenges.some(c=>c.visibility==='hidden'));
  assert.ok(challenges.some(c=>c.hints.some(h=>h.rewardCost.keys.length)));
  for(const c of challenges)for(const d of c.downloads)assert.ok(contentEntries['assets'+d.url]?.length);
  const videos=challenges.flatMap(c=>[c.discoveryVideo,c.solveVideo]).filter(Boolean);
  assert.equal(videos.length,2);
  for(const path of videos){
   const bytes=contentEntries['assets'+path];
   assert.ok(bytes?.length>1000,path);
   assert.equal(Buffer.from(bytes).toString('ascii',4,8),'ftyp');
  }
  // Locks only occur in the paired demo; switching artwork alone never needs a demo reward.
  assert.ok(!createWorld(preset.theme.world).portals.some(p=>p.lock));
  const sqlite=new DatabaseSync(':memory:');initializeSchema(sqlite);
  try {
   const db=createSQLiteAdapter(sqlite),config=parseGame('characters:\n - id: web\n   name: Web\naccounts:\n allowRegistration: true\n users: []');
   const blobs=new Map(),store={get:async k=>blobs.get(k),put:async(k,v)=>blobs.set(k,v)};
   const options={db,config,challenges:[],assetStore:store,readBaseAsset:p=>new Uint8Array(readFileSync('public'+p))};
   const admin=createApi({...options,platformAdmin:true});
   assert.equal((await createApi(options)(new Request(`https://quest.test/api/admin/packs?kind=content&preset=${id}`))).status,401);
   const contentResponse=await admin(new Request(`https://quest.test/api/admin/packs?kind=content&preset=${id}`));assert.equal(contentResponse.status,200);
   const demoResponse=await admin(new Request(`https://quest.test/api/admin/packs?kind=theme&preset=${id}&demo=true`));assert.equal(demoResponse.status,200);
   const form=new FormData();form.set('file',new File([await demoResponse.arrayBuffer()],'theme.zip'));form.set('content',new File([await contentResponse.arrayBuffer()],'content.zip'));form.set('themeRevision','0');form.set('contentRevision','0');
   const imported=await admin(new Request('https://quest.test/api/admin/packs?kind=theme',{method:'POST',headers:{Origin:'https://quest.test'},body:form}));
   const result=await imported.json();assert.equal(imported.status,200,JSON.stringify(result));assert.equal(result.needsDecision,undefined);assert.equal(result.placement.moved.length,0);assert.equal(result.placement.excluded.length,0);
   let cookie='';const api=createApi(options);
   async function call(path,body) {const r=await api(new Request('https://quest.test'+path,{method:body?'POST':'GET',headers:{Origin:'https://quest.test',Cookie:cookie,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined}));if(r.headers.has('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return{status:r.status,data:await r.json()};}
   assert.equal((await call('/api/auth',{mode:'register',username:'demo-player',password:'student-password',hero:'web'})).status,200);
   const find=s=>challenges.find(c=>c.id.endsWith('-'+s));
   const solve=async s=>{const c=find(s),r=await call('/api/game',{id:c.id,answer:c.flags[0]});assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.data.correct,true);return r.data;};
   assert.equal((await call('/api/game',{action:'unlock-transport',id:'entrance-castle',themeRevision:1})).status,403);
   assert.ok((await call('/api/game',{id:find('final-boss').id,answer:find('final-boss').flags[0]})).status >= 400);
   let state=await solve('starter');assert.ok(state.inventory.keys.includes('red'));
   assert.equal((await call('/api/game',{action:'unlock-transport',id:'entrance-castle',themeRevision:1})).status,200);
   state=await solve('phrase');const phrase=find('phrase').rewards.incantations[0];assert.ok(state.inventory.incantations.includes(phrase));
   assert.equal((await call('/api/game',{action:'unlock-transport',id:demoTheme.world.transports.at(-1).id,themeRevision:1,phrase})).status,200);
   state=await solve('small-boss');assert.ok(state.inventory.keys.includes('gold'));
   assert.equal((await call('/api/game',{action:'unlock-transport',id:'entrance-elf-house',themeRevision:1})).status,200);
   await solve('medium-boss');await solve('file');state=await solve('final-boss');assert.ok(state.inventory.keys.includes('silver'));
   assert.ok(state.entities.some(e=>e.id.endsWith('-host')));
   const reflection=find('reflection');assert.equal((await call('/api/game',{id:reflection.id,answer:'I checked each step before continuing.',revision:0})).status,200);
   assert.equal(sqlite.prepare('SELECT grade FROM written_responses WHERE challenge=?').get(reflection.id).grade,null);
   assert.ok(!(await call('/api/game')).data.challenges.some(c=>c.id===find('hidden-example').id));
  } finally {sqlite.close();}
 });
}
