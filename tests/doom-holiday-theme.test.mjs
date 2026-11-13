import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {unzipSync,strFromU8} from 'fflate';
import {parse} from 'yaml';
import midiPackage from '@tonejs/midi';
import {themePresets,presetCatalog} from '../lib/theme-presets.mjs';
import {parseTheme,themeAssetPaths} from '../lib/theme-schema.mjs';
import {createWorld} from '../lib/world-data.mjs';
import {parseChallenges,parseGame} from '../lib/config-schema.mjs';
import {themeContentValid} from '../server/packs.mjs';
import {createApi} from '../server/api.mjs';
import {createSQLiteAdapter,initializeSchema} from '../server/sqlite.mjs';
import {expansionMaps,expansionCast} from '../scripts/doom-holiday-expansion-layouts.mjs';
import {pathMaps,pathTransports} from '../scripts/doom-holiday-path-maps.mjs';

const preset=themePresets.find(p=>p.id==='doom-holiday');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

test('Doom holiday theme bundles 25 distinct appearances, seventeen unique maps, transparent sprites, music, and portable evidence',()=>{
 assert.ok(preset);
 const {theme,demoTheme,challenges}=preset;
 assert.equal(presetCatalog().find(p=>p.id===preset.id).demoCount,15);
 assert.equal(theme.characters.length,25);
 assert.equal(new Set(theme.characters.map(c=>c.name)).size,25);
 assert.equal(theme.characters.filter(c=>c.appearanceFor==='both').length,17);
 assert.equal(theme.world.maps.length,17);
 assert.equal(theme.world.entities.length,26);
 assert.equal(theme.world.entities.filter(e=>e.invisible).length,1);
 assert.equal(new Set(theme.world.maps.map(m=>m.background)).size,17);
 assert.deepEqual(challenges,parseChallenges(readFileSync('themes/doom-holiday/demo-challenges.yaml','utf8')));
 themeContentValid(demoTheme,challenges);
 const world=createWorld(theme.world);
 assert.ok(theme.world.transports.every(t=>!t.lock));
 assert.equal(world.blocked('town',15,21),false);
 assert.equal(world.reachable('town',15,21),true);
 for(const map of theme.world.maps)assert.equal(world.reachable(map.id,map.spawn.x,map.spawn.y),true);
 for(const entity of theme.world.entities)assert.ok(theme.characters.some(c=>c.id===entity.characterId));
 assert.deepEqual(challenges.filter(c=>c.icon==='boss').map(c=>c.iconSize),[1,2,3]);
 assert.equal(challenges.filter(c=>c.grading==='manual').length,1);
 for(const track of theme.audio.playlist){
  const midi=new midiPackage.Midi(readFileSync(`public${track.midi}`));
  assert.ok(midi.tracks.some(t=>t.notes.length>0));
 }
 assert.equal(theme.audio.playlist.length,3);
 const imageHashes=[];
 for(const c of theme.characters){
  const bytes=readFileSync(`public${c.sprite}`);
  assert.equal(bytes.toString('ascii',0,4),'RIFF');
  assert.equal(bytes.toString('ascii',8,12),'WEBP');
  assert.equal(bytes.toString('ascii',12,16),'VP8X');
  assert.ok(bytes[20]&0x10,`${c.name} retains genuine alpha`);
  assert.ok(bytes.length<4*1024*1024);
  imageHashes.push(hash(bytes));
 }
 assert.equal(new Set(imageHashes).size,25);
 assert.equal(new Set(theme.world.maps.map(m=>hash(readFileSync(`public${m.background}`)))).size,17);
 const reusable=unzipSync(readFileSync('theme-packs/doom-holiday.zip'));
 const demo=unzipSync(readFileSync('theme-packs/doom-holiday-demo-theme.zip'));
 const content=unzipSync(readFileSync('theme-packs/doom-holiday-demo-content.zip'));
 assert.deepEqual(parseTheme(parse(strFromU8(reusable['theme.yaml']))),theme);
 assert.deepEqual(parseTheme(parse(strFromU8(demo['theme.yaml']))),demoTheme);
 assert.ok(!reusable['content.yaml']);assert.ok(!content['theme.yaml']);assert.ok(!reusable['backup.json']);
 for(const path of themeAssetPaths(theme))assert.ok(reusable[`assets${path}`]?.length,path);
 assert.equal(Object.keys(content).filter(path=>path.startsWith('assets/')).length,6);
 for(const c of challenges)for(const d of c.downloads)assert.ok(content[`assets${d.url}`]?.length,d.url);
 assert.ok(!JSON.stringify(theme).includes('FLAG{SECRET_SANTA}'));
});

test('office, space, and castle corridors enforce walls, reach every room, and preserve the return journey',()=>{
 const world=createWorld(preset.theme.world);
 assert.equal(expansionCast.filter(c=>c.role==='hero').length,5);
 assert.equal(expansionCast.filter(c=>c.role==='villain').length,5);
 for(const cast of expansionCast){
  assert.ok(!world.terrainBlocked(cast.map,cast.x,cast.y),`${cast.name} stands on the floor`);
  assert.ok([[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>world.reachable(cast.map,cast.x+dx,cast.y+dy)),`${cast.name} can be approached`);
 }
 for(const spec of expansionMaps){
  const map=world.mapInfo(spec.id);
  for(const [x,y] of map.ground)if(!world.blocked(map.id,x,y))assert.ok(world.reachable(map.id,x,y),`${map.id} ${x},${y} is reachable`);
  for(const [x,y,w,h] of spec.furniture)for(let b=y;b<y+h;b++)for(let a=x;a<x+w;a++)assert.ok(world.blocked(map.id,a,b),`${map.id} furniture ${a},${b}`);
  const start={map:map.id,pos:{x:18,y:20}};
  assert.equal(world.step(start,-1,0),start,'cannot cross the lower corridor wall');
  assert.ok(!world.blocked(map.id,20,13),'east-west corridor is open');
 }
 let place={map:'town',pos:{x:3,y:14}};
 place=world.step(place,0,-1);
 assert.equal(place.map,'latverian-offices');
 // Traverse the central passage using actual movement, entering each outbound doorway.
 for(const next of ['orbital-station','castle-corridors']){
  for(let y=22;y>=3;y--)place=world.step(place,0,-1);
  assert.equal(place.map,next);
 }
 assert.equal(place.travel.length,3);
 place=world.step(world.step(place,0,-1),0,1);
 assert.equal(place.map,'orbital-station');
 assert.deepEqual(place.pos,{x:20,y:3});
 for(let y=4;y<=23;y++)place=world.step(place,0,1);
 assert.equal(place.map,'latverian-offices');
 for(let y=4;y<=23;y++)place=world.step(place,0,1);
 assert.equal(place.map,'town');
 assert.deepEqual(place.pos,{x:3,y:13});
 assert.equal(place.travel.length,0);
});

test('seven path maps provide connected branches, solid boundaries, and reversible journeys from town',()=>{
 const world=createWorld(preset.theme.world), directions=[[1,0],[-1,0],[0,1],[0,-1]];
 assert.equal(pathMaps.length,7);
 assert.equal(new Set(pathMaps.map(m=>JSON.stringify(world.mapInfo(m.id).ground))).size,7);
 function walkTo(place,target){
  const queue=[{x:place.pos.x,y:place.pos.y,path:[]}],seen=new Set([`${place.pos.x},${place.pos.y}`]);
  for(let i=0;i<queue.length;i++){
   const cell=queue[i];
   if(cell.x===target.x&&cell.y===target.y){for(const [dx,dy] of cell.path)place=world.step(place,dx,dy);return place;}
   for(const [dx,dy] of directions){
    const x=cell.x+dx,y=cell.y+dy,key=`${x},${y}`,goal=x===target.x&&y===target.y;
    const transition=world.transportTiles(place.map).some(t=>t.x===x&&t.y===y)||world.transitionAt(place.map,x,y);
    if(seen.has(key)||world.blocked(place.map,x,y)||(!goal&&transition))continue;
    seen.add(key);queue.push({x,y,path:[...cell.path,[dx,dy]]});
   }
  }
  assert.fail(`No safe walking route through ${place.map} to ${target.x},${target.y}`);
 }
 for(const spec of pathMaps){
  const map=world.mapInfo(spec.id);
  assert.ok(map.ground.length<40*28*.6,'most of the map consists of walls, islands, or other barriers');
  for(const [x,y] of map.ground)assert.ok(world.reachable(map.id,x,y),`${map.id} ${x},${y}`);
  for(const [x,y] of spec.probes)assert.ok(world.reachable(map.id,x,y),`${map.id} side room or branch is accessible`);
  assert.ok(map.ground.filter(([x,y])=>world.canPlaceChallenge(map.id,x,y)).length>100,'space remains for administrator-authored challenges');
  for(const [x,y] of spec.barriers){
   assert.ok(world.blocked(map.id,x,y),`${map.id} wall or void is solid`);
   const [dx,dy]=directions.find(([a,b])=>!world.blocked(map.id,x-a,y-b))||[1,0];
   const place={map:map.id,pos:{x:x-dx,y:y-dy}};
   assert.equal(world.step(place,dx,dy),place);
  }
  const chain=[];let destination=map.id;
  while(destination!=='town'){
   const link=preset.theme.world.transports.find(t=>t.to===destination);
   assert.ok(link,`transport to ${destination}`);chain.unshift(link);destination=link.map;
   assert.ok(chain.length<10,'route has no transport cycle');
  }
  let place={map:'town',pos:{x:20,y:23}};
  for(const link of chain){place=walkTo(place,link.location);assert.equal(place.map,link.to);}
  for(const link of chain.toReversed()){
   const spawn=world.mapInfo(place.map).spawn;
   if(place.pos.x===spawn.x&&place.pos.y===spawn.y){
    const [dx,dy]=directions.find(([a,b])=>!world.blocked(place.map,place.pos.x+a,place.pos.y+b));
    place=world.step(world.step(place,dx,dy),-dx,-dy);
   }else place=walkTo(place,spawn);
   assert.equal(place.map,link.map);assert.deepEqual(place.pos,link.location);
  }
  assert.equal(place.travel.length,0);
 }
 assert.equal(pathTransports.length,7);
});

test('paired Doom adventure imports and completes its key, hidden-emoji, boss, and written-response progression',async()=>{
 const sqlite=new DatabaseSync(':memory:');initializeSchema(sqlite);
 try{
  const files=new Map();
  const options={db:createSQLiteAdapter(sqlite),config:parseGame('characters:\n - id: web\n   name: Web\naccounts:\n allowRegistration: true\n users: []'),challenges:[],assetStore:{get:async key=>files.get(key),put:async(key,value)=>files.set(key,value)},readBaseAsset:path=>new Uint8Array(readFileSync('public'+path))};
  const admin=createApi({...options,platformAdmin:true});
  const api=createApi(options);
  const form=new FormData();
  form.set('file',new File([readFileSync('theme-packs/doom-holiday-demo-theme.zip')],'theme.zip'));
  form.set('content',new File([readFileSync('theme-packs/doom-holiday-demo-content.zip')],'content.zip'));
  form.set('themeRevision','0');form.set('contentRevision','0');
  const imported=await admin(new Request('https://quest.test/api/admin/packs?kind=theme',{method:'POST',headers:{Origin:'https://quest.test'},body:form}));
  const result=await imported.json();assert.equal(imported.status,200,JSON.stringify(result));
  assert.equal(result.needsDecision,undefined);assert.equal(result.placement.moved.length,0);assert.equal(result.placement.excluded.length,0);
  let cookie='';
  async function call(path,body){
   const response=await api(new Request('https://quest.test'+path,{method:body?'POST':'GET',headers:{Origin:'https://quest.test',Cookie:cookie,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined}));
   if(response.headers.has('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
   return{status:response.status,data:await response.json()};
  }
  assert.equal((await call('/api/auth',{mode:'register',username:'holiday-player',password:'practice-only-password',hero:'web'})).status,200);
  assert.equal((await call('/api/teams',{mode:'create',name:'Winter heroes',password:'practice-team-password'})).status,200);
  const challenge=key=>preset.challenges.find(c=>c.id===`dh-holiday-v1-${key}`);
  const solve=async key=>{const c=challenge(key),r=await call('/api/game',{id:c.id,answer:c.flags[0]});assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.correct,true,key);return r.data;};
  const interact=(id,x,y,action='entity-dialogue',extra={})=>call('/api/game',{action,id,map:'town',x,y,themeRevision:1,choices:[],...extra});
  assert.ok(!(await call('/api/game')).data.challenges.some(c=>c.id===challenge('signal').id));
  assert.equal((await interact('dh-captain',24,19,'entity-dialogue',{choices:['help']})).status,200);
  await solve('signal');await solve('manifest');
  assert.equal((await call('/api/game',{action:'unlock-transport',id:'vault-route',themeRevision:1})).status,403);
  let state=await solve('gift-code');assert.ok(state.inventory.keys.includes('red'));
  assert.equal((await call('/api/game',{action:'unlock-transport',id:'vault-route',themeRevision:1})).status,200);
  await solve('parcel-sentry');await solve('relay');await solve('mirror');await solve('snowglobe');await solve('ornament');
  assert.equal((await interact('dh-hidden-gift',14,21)).status,400);
  assert.equal((await interact('dh-hidden-gift',15,21)).status,200);
  assert.ok(!(await call('/api/game')).data.challenges.some(c=>c.id===challenge('secret-santa').id));
  const wave=await interact('dh-hidden-gift',15,21,'entity-emoji',{emoji:'👋'});
  assert.equal(wave.status,200);assert.equal(wave.data.reaction.matched,true);
  assert.equal(wave.data.reaction.firstDiscovery,true);
  await solve('secret-santa');state=await solve('power');assert.ok(state.inventory.keys.includes('gold'));
  await solve('sentinel');
  assert.equal((await call('/api/game',{action:'unlock-transport',id:'throne-route',themeRevision:1})).status,200);
  state=await solve('doom');assert.ok(state.inventory.keys.includes('silver'));
  await solve('star');await solve('acorn-audit');
  const debrief=await call('/api/game',{id:challenge('debrief').id,answer:'We recognized Base64, checked the header instead of the decoy, and recorded our failed guesses before trying again.',revision:0});
  assert.equal(debrief.status,200);assert.equal(debrief.data.submitted,true);
  assert.equal(sqlite.prepare('SELECT grade FROM written_responses WHERE challenge=?').get(challenge('debrief').id).grade,null);
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM entity_emoji_discoveries').get().n,1);
 }finally{sqlite.close();}
});
