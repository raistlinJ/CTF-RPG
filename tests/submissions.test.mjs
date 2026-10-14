// CTF-RPG — Copyright (c) 2026 Jaime C Acosta
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,cpSync,mkdtempSync,symlinkSync,writeFileSync,rmSync} from 'node:fs';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {stringify} from 'yaml';
import {createApi} from '../server/api.mjs';
import {initializeSchema,createSQLiteAdapter} from '../server/sqlite.mjs';
import {parseGame,parseChallenges} from '../lib/config-schema.mjs';
import {createSnapshot,validateSnapshot} from '../server/backup.mjs';
function setup(){const sqlite=new DatabaseSync(':memory:');initializeSchema(sqlite);const db=createSQLiteAdapter(sqlite);const config=parseGame('characters:\n - id: web\n   name: Web\naccounts:\n allowRegistration: true\n users:\n  - username: teacher\n    password: teacher-password\n    role: admin\n    hero: web');const challenges=parseChallenges(stringify({challenges:[...parseChallenges(readFileSync('content/challenges.yaml','utf8')),{id:'written',object:'Written question',map:'town',location:{x:18,y:19},region:'Town',text:'Explain.',points:100,grading:'manual'}]}));const api=createApi({db,config,challenges});function client(){let cookie='';return async(path,body,method=body?'POST':'GET')=>{const r=await api(new Request('http://quest.test'+path,{method,headers:{Origin:'http://quest.test',Cookie:cookie,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined}));if(r.headers.has('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return{status:r.status,data:await r.json()};};}return{sqlite,db,config,challenges,client};}
async function login(c,name){return c('/api/auth',{username:name,password:name==='teacher'?'teacher-password':'student-password',hero:'web',mode:name==='teacher'?'login':'register'});}
test('submission feed protects answers, records correct/incorrect attempts, filters manual grades, and preserves team at submission time',async()=>{const s=setup();try{const admin=s.client(),a=s.client(),anon=s.client();await login(admin,'teacher');await login(a,'alice');const team=(await a('/api/teams',{mode:'create',name:'Original team',password:'team-password'})).data.team;assert.equal((await anon('/api/admin/submissions')).status,401);assert.equal((await a('/api/admin/submissions')).status,403);const c=s.challenges[0];assert.equal((await a('/api/game',{id:c.id,answer:'wrong'})).data.correct,false);assert.equal((await a('/api/game',{id:c.id,answer:c.flags[0]})).data.correct,true);assert.equal((await a('/api/game',{id:'written',answer:'My explanation',revision:0})).data.submitted,true);let all=(await admin('/api/admin/submissions')).data;assert.equal(all.total,3);assert.ok(all.submissions.every(r=>r.team==='Original team'&&r.username==='alice'));assert.equal((await admin('/api/admin/submissions?status=incorrect')).data.submissions[0].answer,'wrong');assert.equal((await admin('/api/admin/submissions?status=correct')).data.total,1);assert.equal((await admin('/api/admin/submissions?status=pending')).data.total,1);const user=all.submissions[0].user;for(const grade of [50,0,100]){const review=(await admin('/api/admin/review?status=all')).data.responses[0];assert.equal(review.team,'Original team');assert.equal((await admin('/api/admin/review',{user,challenge:'written',revision:review.revision,grade,feedback:'Feedback'})).status,200);const status=grade===50?'partial':grade===0?'incorrect':'correct';assert.equal((await admin('/api/admin/submissions?status='+status)).data.total,grade===50?1:2);}assert.equal((await admin('/api/admin/submissions?status=pending')).data.total,0);assert.equal((await admin('/api/admin/teams',{id:team.id},'DELETE')).status,200);all=(await admin('/api/admin/submissions')).data;assert.ok(all.submissions.every(r=>r.team==='Original team'));assert.equal((await admin('/api/admin/submissions?status=bad')).status,400);assert.equal((await admin('/api/admin/submissions?offset=-1')).status,400);
 const snapshot=await createSnapshot({db:s.db,config:s.config,challenges:s.challenges});assert.equal(snapshot.answerAttempts.length,2);assert.equal(snapshot.writtenResponses[0].submittedTeam,'Original team');assert.equal(validateSnapshot(snapshot).answerAttempts.length,2);const legacy=structuredClone(snapshot);delete legacy.answerAttempts;delete legacy.writtenResponses[0].submittedTeam;assert.deepEqual(validateSnapshot(legacy).answerAttempts,[]);assert.equal(validateSnapshot(legacy).writtenResponses[0].submittedTeam,null);
 const root=mkdtempSync(resolve(tmpdir(),'ctf-submission-restore-'));try{for(const dir of ['server','lib'])cpSync(dir,resolve(root,dir),{recursive:true});symlinkSync(resolve('node_modules'),resolve(root,'node_modules'),'dir');writeFileSync(resolve(root,'backup.json'),JSON.stringify(snapshot));const database=resolve(root,'data/quest.sqlite');const restored=spawnSync(process.execPath,[resolve(root,'server/restore.mjs'),resolve(root,'backup.json')],{env:{...process.env,DATABASE_PATH:database},encoding:'utf8'});assert.equal(restored.status,0,restored.stderr);const recovered=new DatabaseSync(database);assert.equal(recovered.prepare('SELECT COUNT(*) AS n FROM answer_attempts').get().n,2);assert.equal(recovered.prepare('SELECT submitted_team FROM written_responses').get().submitted_team,'Original team');recovered.close();}finally{rmSync(root,{recursive:true,force:true});}
}finally{s.sqlite.close();}});
test('submission feed paginates attempts and hides answer data from non-admins',async()=>{const s=setup();try{const admin=s.client(),a=s.client();await login(admin,'teacher');await login(a,'alice');const uid=s.sqlite.prepare("SELECT id FROM students WHERE username='alice'").get().id;const insert=s.sqlite.prepare('INSERT INTO answer_attempts(id,user,challenge,answer,question,object,correct,submitted_team,submitted_at) VALUES(?,?,?,?,?,?,?,?,?)');for(let i=0;i<62;i++)insert.run(String(i).padStart(3,'0'),uid,'test','answer','Question','Object',i%2,'Team',i);const first=(await admin('/api/admin/submissions')).data;assert.equal(first.total,62);assert.equal(first.submissions.length,50);assert.equal(first.submissions[0].submittedAt,61);const second=(await admin('/api/admin/submissions?offset=50')).data;assert.equal(second.submissions.length,12);assert.equal((await admin('/api/admin/submissions?status=correct')).data.total,31);assert.equal((await a('/api/admin/submissions?status=all')).data.submissions,undefined);}finally{s.sqlite.close();}});

test('submission text search covers all pages, combines status, and treats wildcard and SQL text literally',async()=>{const s=setup();try{
 const admin=s.client(),a=s.client();await login(admin,'teacher');await login(a,'alice');const uid=s.sqlite.prepare("SELECT id FROM students WHERE username='alice'").get().id;
 const insert=s.sqlite.prepare('INSERT INTO answer_attempts(id,user,challenge,answer,question,object,correct,submitted_team,submitted_at) VALUES(?,?,?,?,?,?,?,?,?)');for(let i=0;i<70;i++)insert.run('search-'+i,uid,'sample','Ordinary answer','Question','Object',i%2,'Some team',i+1);
 insert.run('search-target',uid,'special-id','Needle_100% exact','Question text','Download puzzle',0,'Team Quokka',0);
 assert.equal((await admin('/api/admin/submissions?search=needle_100%25')).data.total,1);
 for(const text of ['QUOKKA','special-id','Download puzzle','alice','Question text'])assert.ok((await admin('/api/admin/submissions?search='+encodeURIComponent(text))).data.total>0,text);
 assert.equal((await admin('/api/admin/submissions?search=quokka&status=correct')).data.total,0);
 assert.equal((await admin('/api/admin/submissions?search=quokka&status=incorrect')).data.total,1);
 assert.equal((await admin('/api/admin/submissions?search='+encodeURIComponent("' OR 1=1 --"))).data.total,0);
 assert.equal((await admin('/api/admin/submissions?search='+encodeURIComponent('x'.repeat(1001)))).status,400);
 await a('/api/game',{id:'written',answer:'Written match sentinel',revision:0});const review=(await admin('/api/admin/review?status=all')).data.responses[0];await admin('/api/admin/review',{user:uid,challenge:'written',revision:review.revision,grade:50,feedback:'Specific feedback zircon'});
 for(const text of ['zircon','written match','Partial credit','Written answer'])assert.equal((await admin('/api/admin/submissions?search='+encodeURIComponent(text))).data.total,1,text);
}finally{s.sqlite.close();}});

test('checkbox deletion resets each user/challenge atomically, removes all attempts, and permits resubmission',async()=>{const s=setup();try{
 const admin=s.client(),a=s.client(),bob=s.client(),anon=s.client();await login(admin,'teacher');await login(a,'alice');await login(bob,'bob');const c={...s.challenges[0]},uid=s.sqlite.prepare("SELECT id FROM students WHERE username='alice'").get().id;
 // Give the automatic challenge a reward to verify inventory reset as well as points.
 s.challenges[0].rewards={keys:['red'],incantations:['Test phrase']};
 await a('/api/game',{id:c.id,answer:'wrong'});await a('/api/game',{id:c.id,action:'hint',hintId:c.hints[0].id});await a('/api/game',{id:c.id,action:'discover'});await a('/api/game',{id:c.id,answer:c.flags[0]});await bob('/api/game',{id:c.id,answer:c.flags[0]});
 await a('/api/game',{id:'written',answer:'My explanation',revision:0});let review=(await admin('/api/admin/review?status=all')).data.responses[0];await admin('/api/admin/review',{user:uid,challenge:'written',revision:review.revision,grade:70,feedback:'Reviewed'});
 s.sqlite.prepare('INSERT INTO challenge_cutscenes(user,challenge,phase) VALUES(?,?,?)').run(uid,c.id,'solve');
 let all=(await admin('/api/admin/submissions')).data.submissions;const automatic=all.find(r=>r.username==='alice'&&r.grading==='automatic'),manual=all.find(r=>r.username==='alice'&&r.grading==='manual');const token=r=>({id:r.id,revision:r.revision,submittedAt:r.submittedAt});
 const request={action:'delete',submissions:[token(automatic),token(manual)]};assert.equal((await anon('/api/admin/submissions',request)).status,401);assert.equal((await a('/api/admin/submissions',request)).status,403);
 assert.equal((await admin('/api/admin/submissions',{...request,submissions:[token(automatic),{...token(manual),revision:manual.revision-1}]})).status,409);assert.equal(s.sqlite.prepare('SELECT COUNT(*) AS n FROM answer_attempts WHERE user=?').get(uid).n,2);
 // Concurrent grading after the read must abort the entire batch, including the automatic reset.
 const batch=s.db.batch.bind(s.db);let raced=false;s.db.batch=async statements=>{if(!raced){raced=true;s.sqlite.prepare('UPDATE written_responses SET revision=revision+1 WHERE user=?').run(uid);}return batch(statements);};
 assert.equal((await admin('/api/admin/submissions',request)).status,409);assert.equal(s.sqlite.prepare('SELECT COUNT(*) AS n FROM solved WHERE user=?').get(uid).n,2);s.db.batch=batch;
 all=(await admin('/api/admin/submissions')).data.submissions;const fresh=all.filter(r=>r.username==='alice'&&r.grading==='manual')[0];request.submissions[1]=token(fresh);
 const deleted=await admin('/api/admin/submissions',request);assert.equal(deleted.status,200);assert.equal(deleted.data.reset,2);
 for(const table of ['answer_attempts','written_responses','solved','purchased_hints','earned_rewards','discovered_challenges','challenge_cutscenes'])assert.equal(s.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user=?`).get(uid).n,0,table);
 assert.equal((await admin('/api/admin/submissions')).data.total,1);assert.equal((await bob('/api/game')).data.score,c.points);
 const state=(await a('/api/game')).data;assert.equal(state.score,0);assert.deepEqual(state.inventory.keys,[]);assert.ok(!state.solved.includes(c.id));
 assert.equal((await admin('/api/admin/submissions',request)).status,409);
 assert.equal((await a('/api/game',{id:c.id,answer:c.flags[0]})).data.correct,true);assert.equal((await a('/api/game',{id:'written',answer:'New explanation',revision:0})).data.submitted,true);
 assert.equal((await admin('/api/admin/submissions',{action:'delete',submissions:[]})).status,400);
}finally{s.sqlite.close();}});

test('solved answer review returns the original own successful entry after login and never accepted flags or other players answers',async()=>{
 const s=setup();try{
  const alice=s.client(),bob=s.client(),admin=s.client(),guest=s.client();await login(alice,'alice');await login(bob,'bobby');await login(admin,'teacher');
  const c=s.challenges.find(c=>!c.caseSensitive&&/[a-z]/i.test(c.flags[0]));assert.ok(c);
  const review={action:'review-answer',id:c.id};
  assert.equal((await guest('/api/game',review)).status,401);
  assert.equal((await alice('/api/game',review)).status,403);
  assert.equal((await alice('/api/game',{id:c.id,answer:'wrong submission'})).data.correct,false);
  assert.equal((await alice('/api/game',review)).status,403);
  const original=`  ${c.flags[0].toUpperCase()}  `;
  assert.equal((await alice('/api/game',{id:c.id,answer:original})).data.correct,true);
  assert.deepEqual((await alice('/api/game',review)).data,{answer:original});
  assert.equal((await bob('/api/game',{...review,user:s.sqlite.prepare("SELECT id FROM students WHERE username='alice'").get().id})).status,403);
  assert.equal((await bob('/api/game',{id:c.id,answer:c.flags[0]})).data.correct,true);
  assert.deepEqual((await bob('/api/game',review)).data,{answer:c.flags[0]});
  assert.equal((await admin('/api/game',review)).status,403,'an admin reviewing their own game cannot substitute another player');
  const restarted=s.client();assert.equal((await restarted('/api/auth',{mode:'login',username:'alice',password:'student-password'})).status,200);
  assert.deepEqual((await restarted('/api/game',review)).data,{answer:original});
  // A later correct retry does not replace the answer that originally solved the challenge.
  const uid=s.sqlite.prepare("SELECT id FROM students WHERE username='alice'").get().id;
  s.sqlite.prepare('INSERT INTO answer_attempts(id,user,challenge,answer,question,object,correct,submitted_team,submitted_at) VALUES(?,?,?,?,?,?,1,?,?)').run('later',uid,c.id,'later correct answer',c.text,c.object,'',Date.now()+10000);
  assert.deepEqual((await alice('/api/game',review)).data,{answer:original});
  assert.ok(!(await alice('/api/game')).data.challenges.some(c=>'flags' in c));
 }finally{s.sqlite.close();}
});

test('solved answer review preserves graded written responses and reports missing legacy entries without substituting accepted flags',async()=>{
 const s=setup();try{
  const admin=s.client(),alice=s.client();await login(admin,'teacher');await login(alice,'alice');
  const answer='My original explanation.\nSecond line <script>literal text</script>';
  assert.equal((await alice('/api/game',{id:'written',answer,revision:0})).data.submitted,true);
  assert.equal((await alice('/api/game',{action:'review-answer',id:'written'})).status,403);
  const response=(await admin('/api/admin/review?status=all')).data.responses[0];
  assert.equal((await admin('/api/admin/review',{user:response.user,challenge:'written',revision:response.revision,grade:70,feedback:'Reviewed'})).status,200);
  assert.deepEqual((await alice('/api/game',{action:'review-answer',id:'written'})).data,{answer});
  const c=s.challenges[0],uid=response.user;
  s.sqlite.prepare('INSERT INTO solved(user,challenge,points) VALUES(?,?,?)').run(uid,c.id,c.points);
  assert.deepEqual((await alice('/api/game',{action:'review-answer',id:c.id})).data,{answer:null});
 }finally{s.sqlite.close();}
});
