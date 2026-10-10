import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { stringify } from 'yaml';
import { createApi } from '../server/api.mjs';
import { initializeSchema, createSQLiteAdapter } from '../server/sqlite.mjs';
import { parseGame, parseChallenges } from '../lib/config-schema.mjs';
import { defaultTheme } from '../lib/theme-schema.mjs';
import { createWorld } from '../lib/world-data.mjs';
import { challengeLocationAvailable, findChallengeLocation } from '../lib/challenge-placement.mjs';

function setup() {
  const sqlite = new DatabaseSync(':memory:'); initializeSchema(sqlite);
  const config = parseGame('characters:\n - id: web\n   name: Web\naccounts:\n allowRegistration: true\n users:\n  - username: teacher\n    password: teacher-password\n    role: admin\n    hero: web');
  const theme = defaultTheme(config), world = createWorld(theme.world);
  const question = {
    id:'quest',map:'town',location:{x:18,y:19},object:'Key quest',region:'Square',
    text:'Find the flag.',flags:['answer'],points:100,rewards:{keys:['red'],incantations:['Open sesame']},
    discoveryVideo:'/videos/discovery.mp4',solveVideo:'/videos/solve.mp4',
    hints:[{id:'help',text:'Help',cost:10}],downloads:[{name:'File',url:'/downloads/puzzle.txt'}],
  };
  const castleLocation = findChallengeLocation(world, [], 'castle', question.location);
  const challenges = parseChallenges(stringify({challenges:[question,
    {...question,id:'nearby',location:{x:17,y:19}},
    {...question,id:'castle-quest',map:'castle',location:castleLocation},
  ]}));
  const api = createApi({db:createSQLiteAdapter(sqlite),config,challenges});
  function client() {
    let cookie = '';
    return async (path,body) => {
      const r = await api(new Request('https://quest.test'+path,{method:body?'POST':'GET',headers:{Origin:'https://quest.test',Cookie:cookie,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined}));
      if(r.headers.has('set-cookie')) cookie=r.headers.get('set-cookie').split(';')[0];
      return {status:r.status,data:await r.json()};
    };
  }
  return {sqlite,client,world,challenges};
}
async function login(call,admin=true) {
  const r = await call('/api/auth',{username:admin?'teacher':'alice',password:admin?'teacher-password':'student-password',mode:admin?'login':'register',hero:'web'});
  assert.equal(r.status,200);
}
const movement = (revision,map='town',location) => ({action:'move',id:'quest',map,location,revision,themeRevision:0});

test('automatic map placement chooses the nearest free valid tile and reports unknown or full maps',()=>{
  const {sqlite,world,challenges}=setup();try {
    const original=challenges[0];
    assert.equal(challengeLocationAvailable(world,challenges,'town',17,19,original.id),false);
    assert.equal(challengeLocationAvailable(world,challenges,'town',18,19,original.id),true);
    const location=findChallengeLocation(world,challenges,'castle',original.location,original.id);
    assert.equal(challengeLocationAvailable(world,challenges,'castle',location.x,location.y,original.id),true);
    const all=[];
    for(let y=0;y<28;y++)for(let x=0;x<40;x++)if(world.canPlaceChallenge('castle',x,y))all.push({id:`occupied-${x}-${y}`,map:'castle',location:{x,y}});
    assert.equal(findChallengeLocation(world,all,'castle',original.location,original.id),null);
    assert.equal(findChallengeLocation(world,challenges,'missing',original.location,original.id),null);
    const free=all.filter(c=>c.location.x!==location.x||c.location.y!==location.y);
    assert.deepEqual(findChallengeLocation(world,free,'castle',original.location,original.id),location);
  } finally {sqlite.close();}
});

test('map transfers and direct drag moves change only placement and preserve student scores, hints, inventory and cutscenes',async()=>{
  const {sqlite,client,world,challenges}=setup();try {
    const admin=client(),student=client();await login(admin);await login(student,false);
    await student('/api/game',{id:'quest',action:'hint',hintId:'help'});
    await student('/api/game',{id:'quest',action:'discover'});
    assert.equal((await student('/api/game',{id:'quest',action:'cutscene',phase:'discovery'})).data.play,true);
    const solved=await student('/api/game',{id:'quest',answer:'answer'});assert.equal(solved.data.awardedPoints,90);
    assert.equal((await student('/api/game',{id:'quest',action:'cutscene',phase:'solve'})).data.play,true);
    const before=structuredClone(challenges[0]);
    const moved=await admin('/api/admin/challenges',movement(0,'castle'));assert.equal(moved.status,200,JSON.stringify(moved.data));
    const saved=moved.data.challenges.find(c=>c.id==='quest');
    assert.deepEqual(saved,{...before,map:'castle',location:findChallengeLocation(world,challenges,'castle',before.location,before.id)});
    assert.deepEqual(moved.data.challenges.filter(c=>c.id!=='quest'),challenges.filter(c=>c.id!=='quest'));
    let state=(await student('/api/game')).data;assert.equal(state.score,90);assert.deepEqual(state.inventory,solved.data.inventory);assert.equal(state.challenges.find(c=>c.id==='quest').map,'castle');
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM purchased_hints').get().n,1);assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM challenge_cutscenes').get().n,2);
    const back=await admin('/api/admin/challenges',movement(1,'town',{x:16,y:20}));assert.equal(back.status,200);
    assert.deepEqual(back.data.challenges.find(c=>c.id==='quest'),{...before,location:{x:16,y:20}});
    state=(await student('/api/game')).data;assert.equal(state.score,90);assert.deepEqual(state.inventory,solved.data.inventory);
  } finally {sqlite.close();}
});

test('moves reject unauthorized, occupied, blocked, fractional, unknown and stale destinations without changing content',async()=>{
  const {sqlite,client,challenges,world}=setup();try {
    const admin=client(),anonymous=client(),student=client();
    assert.equal((await anonymous('/api/admin/challenges',movement(0))).status,401);
    await login(admin);await login(student,false);assert.equal((await student('/api/admin/challenges',movement(0))).status,403);
    const door=world.portals.find(p=>p.map==='town').location;
    for(const location of [{x:17,y:19},{x:0,y:0},door,{x:18.5,y:19},{x:-1,y:20},null,{}]) {
      const result=await admin('/api/admin/challenges',movement(0,'town',location));assert.equal(result.status,400,JSON.stringify(result.data));
    }
    assert.equal((await admin('/api/admin/challenges',movement(0,'missing'))).status,400);
    assert.equal((await admin('/api/admin/challenges',{...movement(0),id:'missing'})).status,409);
    assert.equal((await admin('/api/admin/challenges',{...movement(0),themeRevision:1})).status,409);
    assert.equal((await admin('/api/admin/challenges',{...movement(0),action:'unknown'})).status,400);
    assert.equal((await admin('/api/admin/challenges',movement(1))).status,409);
    assert.deepEqual((await admin('/api/admin/challenges')).data.challenges,challenges);
    const moves=await Promise.all([admin('/api/admin/challenges',movement(0,'town',{x:16,y:20})),admin('/api/admin/challenges',movement(0,'castle'))]);
    assert.deepEqual(moves.map(r=>r.status).sort(),[200,409]);
    assert.equal((await admin('/api/admin/challenges')).data.revision,1);
    assert.equal((await admin('/api/admin/challenges',movement(0,'town',{x:15,y:20}))).status,409);
  } finally {sqlite.close();}
});
