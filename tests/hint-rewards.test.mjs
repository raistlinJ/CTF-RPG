import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, cpSync, symlinkSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { stringify, parse } from 'yaml';
import { unzipSync, strFromU8 } from 'fflate';
import { createApi } from '../server/api.mjs';
import { initializeSchema, createSQLiteAdapter } from '../server/sqlite.mjs';
import { parseGame, parseChallenges } from '../lib/config-schema.mjs';
import { createSnapshot, validateSnapshot } from '../server/backup.mjs';

const phrase = 'Saffron stars align';
const question = {
  id: 'quest', map: 'town', object: 'Key quest', location: {x:18,y:19},
  region: 'Square', text: 'Find the flag.', points:100, flags:['answer'],
  rewards: {keys:['red','blue'],incantations:[phrase,'Blue moon']},
  hints: [
    {id:'combined',text:'Combined help',cost:10,rewardCost:{keys:['red'],incantations:[' SAFFRON   stars ALIGN ']}},
    {id:'alternative',text:'Alternative help',cost:15,rewardCost:{keys:['red']}},
    {id:'item',text:'Item help',rewardCost:{incantations:['blue moon']}},
    {id:'points',text:'Point help',cost:5},
    {id:'free',text:'Free help'},
  ],
};
const empty = {keys:[],incantations:[]};
function setup() {
  const sqlite = new DatabaseSync(':memory:'); initializeSchema(sqlite);
  const db = createSQLiteAdapter(sqlite);
  const config = parseGame('characters:\n - id: web\n   name: Web\naccounts:\n allowRegistration: true\n users:\n  - username: teacher\n    password: teacher-password\n    role: admin\n    hero: web');
  const challenges = parseChallenges(stringify({challenges:[question,
    {...question,id:'written',location:{x:17,y:19},grading:'manual',flags:[]},
    {...question,id:'other',location:{x:19,y:19},hints:[],rewards:{keys:['red'],incantations:[phrase]}},
  ]}));
  const api = createApi({db,config,challenges});
  function client() {
    let cookie = '';
    return async (path,body) => {
      const r = await api(new Request('https://quest.test'+path, {method:body?'POST':'GET',headers:{Origin:'https://quest.test',Cookie:cookie,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined}));
      if(r.headers.has('set-cookie')) cookie=r.headers.get('set-cookie').split(';')[0];
      const bytes = new Uint8Array(await r.arrayBuffer());
      return {status:r.status,bytes,data:r.headers.get('content-type')?.includes('json')?JSON.parse(strFromU8(bytes)):null};
    };
  }
  return {sqlite,db,config,challenges,client};
}
async function login(call,name='alice') {
  const r = await call('/api/auth',{username:name,password:name==='teacher'?'teacher-password':'student-password',hero:'web',mode:name==='teacher'?'login':'register'});
  assert.equal(r.status,200,JSON.stringify(r.data));
}
const hint = (hintId,id='quest') => ({id,action:'hint',hintId});
const quest = state => state.challenges.find(c=>c.id==='quest');

test('hint prices validate against their own reward list and retain legacy/free behavior',()=>{
  const q = parseChallenges(stringify({challenges:[question]}))[0];
  assert.deepEqual(q.hints[3].rewardCost,empty); assert.equal(q.hints[2].cost,0);
  for(const rewardCost of [{keys:['gold']},{incantations:['unknown phrase']},{keys:['red','red']}])
    assert.throws(()=>parseChallenges(stringify({challenges:[{...question,hints:[{id:'bad',text:'Help',rewardCost}]}]})));
  const legacy=parseChallenges(stringify({challenges:[{...question,hints:undefined,hint:'Legacy help'}]}))[0];
  assert.deepEqual(legacy.hints[0].rewardCost,empty); assert.equal(legacy.hints[0].cost,0);
});

test('combined, item, point and free costs charge once, redact phrases, and preserve other challenge inventory',async()=>{
  const {sqlite,client}=setup();try {
    const alice=client(),bob=client(); await login(alice); await login(bob,'bobby');
    let state=(await alice('/api/game')).data;
    assert.ok(!JSON.stringify(state).includes(phrase));
    assert.deepEqual(quest(state).hints[0].rewardCost,{keys:['red'],incantationCount:1});
    assert.equal(quest(state).hints[0].text,undefined);
    await alice('/api/game',{id:'other',answer:'answer'});
    const purchases=await Promise.all(Array.from({length:5},()=>alice('/api/game',hint('combined'))));
    assert.ok(purchases.every(r=>r.status===200));
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM purchased_hints WHERE challenge='quest'").get().n,1);
    state=(await alice('/api/game')).data;
    assert.equal(quest(state).remainingPoints,90);
    assert.deepEqual(quest(state).rewards,{keys:['blue'],incantationCount:1});
    assert.equal(quest(state).hints[1].available,false);
    assert.equal((await alice('/api/game',hint('alternative'))).status,409);
    assert.deepEqual(state.inventory,{keys:['red'],incantations:[phrase]});
    for(const id of ['item','points','free'])assert.equal((await alice('/api/game',hint(id))).status,200);
    const result=await alice('/api/game',{id:'quest',answer:'answer'});
    assert.equal(result.status,200);assert.equal(result.data.awardedPoints,85);
    assert.deepEqual(result.data.inventory,{keys:['red','blue'],incantations:[phrase]});
    assert.deepEqual(JSON.parse(sqlite.prepare("SELECT payload FROM earned_rewards WHERE challenge='quest'").get().payload),{keys:['blue'],incantations:[]});
    assert.equal((await alice('/api/game',hint('combined'))).status,200);
    const other=(await bob('/api/game',{id:'quest',answer:'answer'})).data;
    assert.equal(other.awardedPoints,100);assert.deepEqual(other.inventory.keys,['red','blue']);assert.equal(other.inventory.incantations.length,2);
  } finally {sqlite.close();}
});

test('shared reward purchases and simultaneous solve/purchase cannot double spend or bypass costs',async()=>{
  const {sqlite,client}=setup();try {
    const alice=client();await login(alice);
    const r=await Promise.all([alice('/api/game',hint('combined')),alice('/api/game',hint('alternative'))]);
    assert.deepEqual(r.map(v=>v.status).sort(),[200,409]);
    const bought=sqlite.prepare('SELECT cost,reward_cost FROM purchased_hints').get();
    const solved=(await alice('/api/game',{id:'quest',answer:'answer'})).data;
    assert.equal(solved.awardedPoints,100-bought.cost);assert.deepEqual(solved.inventory.keys,['blue']);
    for(let i=0;i<5;i++) {
      const player=client();await login(player,'race'+i);
      const [purchase,answer]=await Promise.all(i%2 ? [player('/api/game',hint('combined')),player('/api/game',{id:'quest',answer:'answer'})] : [player('/api/game',{id:'quest',answer:'answer'}),player('/api/game',hint('combined'))]).then(rows=>i%2?rows:[rows[1],rows[0]]);
      assert.equal(answer.status,200);
      const state=(await player('/api/game')).data;
      if(purchase.status===200) {assert.equal(quest(state).awardedPoints,90);assert.deepEqual(state.inventory.keys,['blue']);assert.ok(!state.inventory.incantations.includes(phrase));}
      else {assert.equal(purchase.status,409);assert.equal(quest(state).awardedPoints,100);assert.deepEqual(state.inventory.keys,['red','blue']);assert.ok(state.inventory.incantations.includes(phrase));}
    }
  } finally {sqlite.close();}
});

test('historical prices survive edits and removal; manual first submissions freeze filtered awards through grading',async()=>{
  const {sqlite,client}=setup();try {
    const alice=client(),admin=client();await login(alice);await login(admin,'teacher');
    await alice('/api/game',hint('combined'));await alice('/api/game',hint('combined','written'));
    await alice('/api/game',{id:'written',answer:'First reasoning',revision:0});
    assert.equal((await alice('/api/game',hint('points','written'))).status,409);
    let current=(await admin('/api/admin/challenges')).data;
    for(const id of ['quest','written']) {
      const old=current.challenges.find(c=>c.id===id);
      const edit=await admin('/api/admin/challenges',{revision:current.revision,editingId:id,challenge:{...old,rewards:{keys:['red','blue','gold'],incantations:[phrase,'Blue moon','New phrase']},hints:old.hints.map(h=>h.id==='combined'?{...h,cost:30,rewardCost:{keys:['blue'],incantations:[]}}:h)}});
      assert.equal(edit.status,200,JSON.stringify(edit.data));current=edit.data;
    }
    const replay=(await alice('/api/game',hint('combined'))).data;
    assert.equal(quest(replay).hints[0].cost,10);assert.deepEqual(quest(replay).hints[0].rewardCost,{keys:['red'],incantationCount:1});
    assert.deepEqual(quest(replay).rewards.keys,['blue','gold']);
    const old=current.challenges.find(c=>c.id==='quest');
    assert.equal((await admin('/api/admin/challenges',{revision:current.revision,editingId:'quest',challenge:{...old,hints:[]}})).status,200);
    assert.equal((await alice('/api/game',{id:'quest',answer:'answer'})).data.awardedPoints,90);
    assert.deepEqual(JSON.parse(sqlite.prepare("SELECT payload FROM earned_rewards WHERE challenge='quest'").get().payload),{keys:['blue','gold'],incantations:['Blue moon','New phrase']});
    await alice('/api/game',{id:'written',answer:'Revised reasoning',revision:1});
    const pending=sqlite.prepare('SELECT rewards_payload,hint_cost FROM written_responses').get();
    assert.equal(pending.hint_cost,10);assert.deepEqual(JSON.parse(pending.rewards_payload),{keys:['blue'],incantations:['Blue moon']});
    let row=(await admin('/api/admin/review')).data.responses[0];
    assert.equal((await admin('/api/admin/review',{user:row.user,challenge:row.challenge,revision:row.revision,grade:0})).status,200);
    const earned=JSON.parse(sqlite.prepare("SELECT payload FROM earned_rewards WHERE challenge='written'").get().payload);
    assert.deepEqual(earned,{keys:['blue'],incantations:['Blue moon']});
    row=(await admin('/api/admin/review?status=graded')).data.responses[0];
    assert.equal((await admin('/api/admin/review',{user:row.user,challenge:row.challenge,revision:row.revision,grade:100})).status,200);
    assert.equal(sqlite.prepare("SELECT points FROM solved WHERE challenge='written'").get().points,90);
    assert.deepEqual(JSON.parse(sqlite.prepare("SELECT payload FROM earned_rewards WHERE challenge='written'").get().payload),earned);
  } finally {sqlite.close();}
});

test('a simultaneous hint and first manual submission records matching point and item costs',async()=>{
  const {sqlite,client}=setup();try {
    for(let i=0;i<2;i++) {
      const player=client();await login(player,'writtenrace'+i);
      const buy=()=>player('/api/game',hint('combined','written'));
      const submit=()=>player('/api/game',{id:'written',answer:'Reasoning',revision:0});
      const rows=await Promise.all(i?[buy(),submit()]:[submit(),buy()]);
      const purchase=rows[i?0:1],answer=rows[i?1:0];assert.equal(answer.status,200);
      const user=sqlite.prepare('SELECT id FROM students WHERE username=?').get('writtenrace'+i).id;
      const saved=sqlite.prepare('SELECT hint_cost,rewards_payload FROM written_responses WHERE user=?').get(user);
      if(purchase.status===200) {assert.equal(saved.hint_cost,10);assert.deepEqual(JSON.parse(saved.rewards_payload),{keys:['blue'],incantations:['Blue moon']});}
      else {assert.equal(purchase.status,409);assert.equal(saved.hint_cost,0);assert.deepEqual(JSON.parse(saved.rewards_payload),question.rewards);}
      assert.equal((await player('/api/game',hint('item','written'))).status,409);
    }
  } finally {sqlite.close();}
});

test('hint item prices survive content packs, backups and restoration; older snapshots default to point-only',async()=>{
  const {sqlite,db,config,challenges,client}=setup();let folder;try {
    const alice=client(),admin=client();await login(alice);await login(admin,'teacher');
    await alice('/api/game',hint('combined'));await alice('/api/game',hint('combined','written'));
    await alice('/api/game',{id:'written',answer:'Pending reasoning',revision:0});
    const pack=await admin('/api/admin/packs?kind=content');assert.equal(pack.status,200);
    const content=parse(strFromU8(unzipSync(pack.bytes)['content.yaml']));
    assert.deepEqual(content.challenges[0].hints[0].rewardCost.keys,['red']);
    const snapshot=await createSnapshot({db,config,challenges});
    assert.deepEqual(snapshot.purchasedHints[0].rewardCost,{keys:['red'],incantations:['saffron stars align']});
    const legacy=validateSnapshot({...snapshot,purchasedHints:snapshot.purchasedHints.map(row=>{const old={...row};delete old.rewardCost;return old;})});
    assert.deepEqual(legacy.purchasedHints[0].rewardCost,empty);
    folder=mkdtempSync(resolve(tmpdir(),'quest-hint-rewards-'));
    for(const directory of ['server','lib','themes'])cpSync(directory,resolve(folder,directory),{recursive:true});
    symlinkSync(resolve('node_modules'),resolve(folder,'node_modules'),'dir');
    const file=resolve(folder,'backup.json'),path=resolve(folder,'restored.sqlite');writeFileSync(file,JSON.stringify(snapshot));
    const r=spawnSync(process.execPath,[resolve(folder,'server/restore.mjs'),file],{env:{...process.env,DATABASE_PATH:path},encoding:'utf8'});assert.equal(r.status,0,r.stderr);
    const restored=new DatabaseSync(path);try {
      assert.deepEqual(JSON.parse(restored.prepare("SELECT reward_cost FROM purchased_hints WHERE challenge='quest'").get().reward_cost),snapshot.purchasedHints[0].rewardCost);
      assert.deepEqual(JSON.parse(restored.prepare('SELECT rewards_payload FROM written_responses').get().rewards_payload),{keys:['blue'],incantations:['Blue moon']});
      const restoredApi=createApi({db:createSQLiteAdapter(restored),config,challenges});
      const auth=await restoredApi(new Request('https://quest.test/api/auth',{method:'POST',headers:{Origin:'https://quest.test','Content-Type':'application/json'},body:JSON.stringify({mode:'login',username:'alice',password:'student-password',hero:'web'})}));
      const answer=await restoredApi(new Request('https://quest.test/api/game',{method:'POST',headers:{Origin:'https://quest.test',Cookie:auth.headers.get('set-cookie').split(';')[0],'Content-Type':'application/json'},body:JSON.stringify({id:'quest',answer:'answer'})}));
      const state=await answer.json();assert.equal(state.awardedPoints,90);assert.deepEqual(state.inventory,{keys:['blue'],incantations:['Blue moon']});
    } finally {restored.close();}
  } finally {sqlite.close();if(folder)rmSync(folder,{recursive:true,force:true});}
});

test('existing SQLite purchases gain empty item prices without retroactive charges',()=>{
  const sqlite=new DatabaseSync(':memory:');try {
    for(const file of readdirSync('drizzle').filter(f=>/^\d+.*\.sql$/.test(f)&&Number(f.slice(0,4))<=19).sort())sqlite.exec(readFileSync(`drizzle/${file}`,'utf8'));
    sqlite.prepare('INSERT INTO students(id,username,hash,salt,hero) VALUES(?,?,?,?,?)').run('old','alice','hash','salt','web');
    sqlite.prepare('INSERT INTO purchased_hints(user,challenge,hint,cost) VALUES(?,?,?,?)').run('old','quest','combined',12);
    initializeSchema(sqlite);initializeSchema(sqlite);
    const row=sqlite.prepare('SELECT cost,reward_cost FROM purchased_hints').get();assert.equal(row.cost,12);assert.deepEqual(JSON.parse(row.reward_cost),empty);
  } finally {sqlite.close();}
});
