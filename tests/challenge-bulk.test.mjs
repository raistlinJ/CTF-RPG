// CTF-RPG — Copyright Jaime C Acosta 2026
import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {readFileSync} from 'node:fs';
import {createApi} from '../server/api.mjs';import {initializeSchema,createSQLiteAdapter} from '../server/sqlite.mjs';import {parseGame,parseChallenges} from '../lib/config-schema.mjs';
test('bulk enable/disable is admin-only, atomic, revision checked, and preserves definitions and earned points',async()=>{
 const sqlite=new DatabaseSync(':memory:');initializeSchema(sqlite);
 try{
 const db=createSQLiteAdapter(sqlite),config=parseGame('characters:\n - id: web\n   name: Web\naccounts:\n allowRegistration: true\n users:\n  - username: teacher\n    password: teacher-password\n    role: admin\n    hero: web'),challenges=parseChallenges(readFileSync('content/challenges.yaml','utf8')),api=createApi({db,config,challenges});
 function client(){let cookie='';return async(body,path='/api/admin/challenges')=>{const r=await api(new Request('https://quest.test'+path,{method:body?'POST':'GET',headers:{Origin:'https://quest.test',Cookie:cookie,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined}));if(r.headers.has('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return{status:r.status,data:await r.json()};};}
 const admin=client(),student=client(),anon=client();await admin({username:'teacher',password:'teacher-password',mode:'login'},'/api/auth');await student({username:'alice',password:'student-password',mode:'register',hero:'web'},'/api/auth');
 const [a,b]=challenges;await student({id:a.id,answer:a.flags[0]},'/api/game');const request={action:'bulk-visibility',ids:[a.id,b.id],visibility:'hidden',revision:0,themeRevision:0};
 assert.equal((await anon(request)).status,401);assert.equal((await student(request)).status,403);
 assert.equal((await admin({...request,ids:[a.id,'missing']})).status,409);assert.equal((await admin({...request,ids:[a.id,a.id]})).status,400);assert.equal((await admin({...request,themeRevision:99})).status,409);
 assert.equal((await admin()).data.revision,0);
 const disabled=await admin(request);assert.equal(disabled.status,200);assert.equal(disabled.data.updated,2);assert.equal(disabled.data.revision,1);
 for(const c of disabled.data.challenges)assert.deepEqual(c,[a.id,b.id].includes(c.id)?{...challenges.find(q=>q.id===c.id),visibility:'hidden'}:challenges.find(q=>q.id===c.id));
 const state=(await student(undefined,'/api/game')).data;assert.equal(state.score,a.points);assert.ok(!state.challenges.some(c=>[a.id,b.id].includes(c.id)));
 assert.equal((await admin(request)).status,409);
 const enabled=await admin({...request,ids:[a.id],visibility:'visible',revision:1});assert.equal(enabled.status,200);assert.equal(enabled.data.challenges.find(c=>c.id===a.id).visibility,'visible');assert.equal(enabled.data.challenges.find(c=>c.id===b.id).visibility,'hidden');
 assert.equal((await student(undefined,'/api/game')).data.score,a.points);
 }finally{sqlite.close();}
});
