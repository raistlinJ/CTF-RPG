import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { unzipSync, strFromU8 } from 'fflate';
import { parse, stringify } from 'yaml';
import { themePresets, presetCatalog } from '../lib/theme-presets.mjs';
import { parseTheme, themeAssetPaths } from '../lib/theme-schema.mjs';
import { parseChallenges, parseGame } from '../lib/config-schema.mjs';
import { createWorld } from '../lib/world-data.mjs';
import { themeContentValid } from '../server/packs.mjs';
import { createSQLiteAdapter, initializeSchema } from '../server/sqlite.mjs';
import { createApi } from '../server/api.mjs';

const preset = themePresets.find(p => p.id === 'environment-development');

test('Environment Development preserves the source exercise and reachable sequential checkpoints', () => {
  const { theme, challenges } = preset;
  assert.equal(presetCatalog().find(p => p.id === preset.id).contentLabel, 'assignment');
  assert.equal(theme.world.maps.length, 2);
  assert.equal(theme.world.buildings.length, 1);
  assert.equal(challenges.length, 10);
  assert.equal(challenges.reduce((sum,c) => sum+c.points,0), 42);
  assert.equal(challenges.reduce((sum,c) => sum+c.hints.length,0), 4);
  assert.equal(challenges.reduce((sum,c) => sum+c.flagRules.length,0), 17);
  assert.equal(challenges.reduce((sum,c) => sum+c.ctfd.flags.filter(f=>f.type==='regex').length,0), 2);
  assert.deepEqual(challenges.map(c=>c.ctfd.challenge.id), [18,31,32,33,34,36,35,37,38,24]);
  assert.match(challenges.at(-1).text, /Assignment-EnvDev1/);
  const world = createWorld(theme.world);
  themeContentValid(theme,challenges);
  for (const [index,c] of challenges.entries()) {
    assert.ok(world.reachable(c.map,c.location.x,c.location.y),c.id);
    assert.deepEqual(c.dependsOn,index?[challenges[index-1].id]:[]);
    assert.equal(c.points,c.ctfd.challenge.value);
    assert.deepEqual(c.flagRules,c.ctfd.flags.filter(f=>f.type==='static').map(f=>({value:f.content,caseSensitive:f.data!=='case_insensitive'})));
  }
  const entries=unzipSync(readFileSync('theme-packs/environment-development.zip'));
  assert.deepEqual(parseTheme(parse(strFromU8(entries['theme.yaml']))),theme);
  assert.ok(!entries['content.yaml']);
  for(const path of themeAssetPaths(theme))assert.ok(entries['assets'+path]?.length,path);
  const content=unzipSync(readFileSync('theme-packs/environment-development-demo-content.zip'));
  assert.deepEqual(parseChallenges(stringify({challenges:parse(strFromU8(content['content.yaml'])).challenges}),theme.world.maps.map(m=>m.id)),challenges);
  assert.ok(content['assets/downloads/environment-development/05_assignment_envdev.pdf']?.length);
});

test('the top-left airlock enters the trophy hall and its exit returns beside the same door', () => {
  const world=createWorld(preset.theme.world);
  const hall=world.mapInfo('celebration-hall');
  assert.equal(hall.name,'Congratulations You Completed the Assignment');
  const outside={map:'commissioning-deck',pos:{x:4,y:9}};
  assert.ok(world.reachable(outside.map,outside.pos.x,outside.pos.y));
  const arrived=world.step(outside,0,-1);
  assert.deepEqual(arrived,{map:hall.id,pos:hall.spawn});
  const beforeExit={map:hall.id,pos:{x:hall.exit.x,y:hall.exit.y-1}};
  assert.ok(world.reachable(beforeExit.map,beforeExit.pos.x,beforeExit.pos.y));
  assert.deepEqual(world.step(beforeExit,0,1),outside);
  const crew=preset.theme.world.entities.filter(e=>e.map===hall.id);
  assert.equal(crew.length,3);
  for(const person of crew) {
    assert.ok(person.nodes.some(n=>/congratulations|well done|great work/i.test(n.text)),person.name);
    assert.ok([[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>world.reachable(hall.id,person.location.x+dx,person.location.y+dy)),person.name);
  }
});

test('Environment Development imports as a pair and rejects every premature answer', async () => {
  const sqlite=new DatabaseSync(':memory:'); initializeSchema(sqlite);
  try {
    const db=createSQLiteAdapter(sqlite);
    const config=parseGame('characters:\n - id: web\n   name: Engineer\naccounts:\n allowRegistration: true\n users: []');
    const blobs=new Map();
    const options={db,config,challenges:[],assetStore:{get:async k=>blobs.get(k),put:async(k,v)=>blobs.set(k,v)},readBaseAsset:p=>new Uint8Array(readFileSync('public'+p))};
    const admin=createApi({...options,platformAdmin:true});
    const form=new FormData();
    form.set('file',new File([readFileSync('theme-packs/environment-development-demo-theme.zip')],'theme.zip'));
    form.set('content',new File([readFileSync('theme-packs/environment-development-demo-content.zip')],'content.zip'));
    form.set('themeRevision','0');form.set('contentRevision','0');
    const imported=await admin(new Request('https://quest.test/api/admin/packs?kind=theme',{method:'POST',headers:{Origin:'https://quest.test'},body:form}));
    const result=await imported.json();assert.equal(imported.status,200,JSON.stringify(result));
    assert.equal(result.placement.moved.length,0);assert.equal(result.placement.excluded.length,0);
    const api=createApi(options);let cookie='';
    async function call(path,body) {
      const r=await api(new Request('https://quest.test'+path,{method:body?'POST':'GET',headers:{Origin:'https://quest.test',Cookie:cookie,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined}));
      if(r.headers.has('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];
      return {status:r.status,data:await r.json()};
    }
    assert.equal((await call('/api/admin/packs?kind=content&preset=environment-development')).status,401);
    assert.equal((await call('/api/auth',{mode:'register',username:'launch-student',password:'student-password',hero:'web'})).status,200);
    for(const c of preset.challenges.slice(1))assert.ok((await call('/api/game',{id:c.id,answer:c.flags[0]})).status>=400,c.id);
    const initial=(await call('/api/game')).data;
    assert.ok(!JSON.stringify(initial).includes('flagRules'));
    assert.ok(!JSON.stringify(initial).includes('"ctfd"'));
    for(const c of preset.challenges) {
      const answer=await call('/api/game',{id:c.id,answer:c.flags[0]});
      assert.equal(answer.status,200,JSON.stringify(answer));assert.equal(answer.data.correct,true,c.id);
    }
    assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM solved').get().n,10);
    const contentBefore=sqlite.prepare('SELECT payload FROM challenge_catalog').get().payload;
    const themeOnly=new FormData();
    themeOnly.set('file',new File([readFileSync('theme-packs/environment-development.zip')],'celebration-update.zip'));
    themeOnly.set('themeRevision','1');themeOnly.set('contentRevision','1');
    const update=await admin(new Request('https://quest.test/api/admin/packs?kind=theme',{method:'POST',headers:{Origin:'https://quest.test'},body:themeOnly}));
    const updated=await update.json();assert.equal(update.status,200,JSON.stringify(updated));
    assert.equal(updated.placement.moved.length,0);assert.equal(updated.placement.excluded.length,0);
    assert.equal(sqlite.prepare('SELECT payload FROM challenge_catalog').get().payload,contentBefore);
    assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM solved').get().n,10);
  } finally {sqlite.close();}
});
