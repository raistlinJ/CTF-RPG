import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {initializeSchema,createSQLiteAdapter} from '../server/sqlite.mjs';
import {createWorkerSQLiteAdapter} from '../server/sqlite-worker-adapter.mjs';
import {activeTheme} from '../server/packs.mjs';
import {defaultGameConfig} from '../lib/runtime-config.mjs';
import {notificationStats} from '../server/notifications.mjs';

test('prepared statements are bounded, reused, and retain independent bindings',async()=>{
 const sqlite=new DatabaseSync(':memory:');initializeSchema(sqlite);let prepares=0;
 const wrapper={prepare(sql){prepares++;return sqlite.prepare(sql);},exec:sql=>sqlite.exec(sql)};
 const db=createSQLiteAdapter(wrapper,{statementLimit:2});prepares=0;
 try {
  const a=db.prepare('SELECT ? value').bind(1),b=db.prepare('SELECT ? value').bind(2);
  assert.equal((await a.first()).value,1);assert.equal((await b.first()).value,2);assert.equal(prepares,1);
  await db.prepare('SELECT 3').bind().first();await db.prepare('SELECT 4').bind().first();await db.prepare('SELECT ? value').bind(5).first();assert.equal(prepares,4);
 } finally {sqlite.close();}
});

test('theme cache isolates drafts and observes same-revision payload changes and deletions',async()=>{
 const sqlite=new DatabaseSync(':memory:');initializeSchema(sqlite);const db=createSQLiteAdapter(sqlite),config=defaultGameConfig();
 try {
  const first=await activeTheme(db,config);first.theme.title='mutated';
  const second=await activeTheme(db,config);assert.notEqual(second.theme.title,'mutated');
  const theme=second.theme;theme.title='saved';sqlite.prepare('INSERT INTO theme_catalog VALUES(?,?,?)').run('active',JSON.stringify(theme),1);
  assert.equal((await activeTheme(db,config)).theme.title,'saved');theme.title='same revision';sqlite.prepare('UPDATE theme_catalog SET payload=?').run(JSON.stringify(theme));assert.equal((await activeTheme(db,config)).theme.title,'same revision');
  sqlite.prepare('DELETE FROM theme_catalog').run();assert.equal((await activeTheme(db,config)).revision,0);assert.notEqual((await activeTheme(db,config)).theme.title,'same revision');
 } finally {sqlite.close();}
});

test('notification cache immediately observes audiences, reads and deletes across connections',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'ctf-notification-cache-'));const path=join(dir,'db.sqlite'),sqlite=new DatabaseSync(path);initializeSchema(sqlite);const other=new DatabaseSync(path),db=createSQLiteAdapter(sqlite);
 try {
  sqlite.prepare("INSERT INTO students(id,username,hash,salt,hero) VALUES('alice','alice','h','s','web')").run();const user={id:'alice',username:'alice'};
  const sql="INSERT INTO notifications VALUES('note','Title','Body','teacher','users','[]',100)";other.exec(sql);
  assert.equal((await notificationStats(db,user)).unread,0);
  other.exec("INSERT INTO notification_recipients VALUES('note','alice')");assert.equal((await notificationStats(db,user)).unread,1);
  other.exec("INSERT INTO notification_reads VALUES('note','alice',200)");assert.equal((await notificationStats(db,user)).unread,0);
  other.exec("DELETE FROM notification_reads");assert.equal((await notificationStats(db,user)).unread,1);
  other.exec("DELETE FROM notification_recipients");assert.equal((await notificationStats(db,user)).unread,0);
  other.exec("UPDATE notifications SET scope='all'");assert.equal((await notificationStats(db,user)).unread,1);
  other.exec("DELETE FROM notifications");assert.equal((await notificationStats(db,user)).unread,0);
 } finally {other.close();sqlite.close();rmSync(dir,{recursive:true,force:true});}
});

test('database worker keeps transactions atomic, isolates connections, and leaves the event loop responsive',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'ctf-db-worker-'));const db=await createWorkerSQLiteAdapter(join(dir,'db.sqlite'));
 try {
  assert.equal((await db.prepare('SELECT ? value').bind(42).first()).value,42);
  await db.prepare('CREATE TABLE worker_test(id INTEGER PRIMARY KEY)').bind().run();
  await assert.rejects(db.batch([db.prepare('INSERT INTO worker_test VALUES(?)').bind(1),db.prepare('INSERT INTO worker_test VALUES(?)').bind(1)]),/UNIQUE/);
  assert.equal((await db.prepare('SELECT COUNT(*) count FROM worker_test').bind().first()).count,0);
  let completed=false;
  const slow=db.prepare('WITH RECURSIVE numbers(x) AS (VALUES(0) UNION ALL SELECT x+1 FROM numbers WHERE x<1000000) SELECT sum(x) total FROM numbers').bind().first().then(value=>{completed=true;return value;});
  await new Promise(resolve=>setTimeout(resolve,5));assert.equal(completed,false);assert.equal((await slow).total,500000500000);
 } finally {await db.close();rmSync(dir,{recursive:true,force:true});}
 await assert.rejects(db.prepare('SELECT 1').bind().first(),/closing|exited/);
});

test('social retention previews without writes, archives before deleting and preserves newer data',()=>{
 const dir=mkdtempSync(join(tmpdir(),'ctf-retention-')),database=join(dir,'db.sqlite'),archive=join(dir,'archive.jsonl');let db=new DatabaseSync(database);initializeSchema(db);
 try {
  db.exec("INSERT INTO students(id,username,hash,salt,hero) VALUES('alice','alice','h','s','web');INSERT INTO teams VALUES('team','Team','team','h','s',0,0,0);INSERT INTO team_members VALUES('alice','team');INSERT INTO team_messages VALUES('old','alice','team','team','alice','Archive me',100);INSERT INTO team_messages VALUES('new','alice','team','team','alice','Keep me',2000);INSERT INTO notifications VALUES('old-note','Old','Body','teacher','all','[]',100);INSERT INTO notification_reads VALUES('old-note','alice',200);INSERT INTO notification_recipients VALUES('old-note','alice');");db.close();db=null;
  const args=['scripts/archive-social.mjs','--database='+database,'--before=1970-01-01T00:00:01Z'];
  const preview=spawnSync(process.execPath,args,{encoding:'utf8'});assert.equal(preview.status,0,preview.stderr);assert.equal(JSON.parse(preview.stdout).counts.team_messages,1);
  const applied=spawnSync(process.execPath,[...args,'--apply','--archive='+archive],{encoding:'utf8'});assert.equal(applied.status,0,applied.stderr);
  const rows=readFileSync(archive,'utf8').trim().split('\n').map(line=>JSON.parse(line));assert.equal(rows[0].format,'ctf-social-archive');assert.ok(rows.some(row=>row.table==='team_messages'&&row.row.id==='old'));
  db=new DatabaseSync(database);assert.deepEqual(db.prepare('SELECT id FROM team_messages').all().map(row=>row.id),['new']);assert.equal(db.prepare('SELECT COUNT(*) n FROM students').get().n,1);assert.equal(db.prepare('SELECT COUNT(*) n FROM notification_reads').get().n,0);db.close();db=null;
  const refused=spawnSync(process.execPath,[...args,'--apply','--archive='+archive],{encoding:'utf8'});assert.notEqual(refused.status,0);
 } finally {db?.close();rmSync(dir,{recursive:true,force:true});}
});

test('map edits use asset metadata and preserve existing asset paths without rewriting storage',async()=>{
 const {updateMap}=await import('../server/maps.mjs');
 const {defaultTheme}=await import('../lib/theme-schema.mjs');
 const sqlite=new DatabaseSync(':memory:');initializeSchema(sqlite);
 const db=createSQLiteAdapter(sqlite),config=defaultGameConfig(),theme=defaultTheme(config);
 let bytesRead=0,writes=0;
 const readBase=()=>{bytesRead++;throw Error('Existing assets should not be read.');};readBase.stat=async()=>({size:100});
 const store={stat:async()=>({size:100}),get:async()=>{bytesRead++;throw Error('Unexpected asset read.');},put:async()=>{writes++;}};
 const form=new FormData();form.set('action','update-entities');form.set('entities','[]');form.set('map',JSON.stringify({id:theme.world.startMap}));form.set('themeRevision','0');form.set('contentRevision','0');
 try {
  const result=await updateMap(new Request('http://test/api/admin/maps',{method:'POST',body:form}),{db,config,theme,themeRevision:0,challenges:[],contentRevision:0,store,readBaseAsset:readBase});
  assert.equal(result.themeRevision,1);assert.equal(bytesRead,0);assert.equal(writes,0);
  assert.deepEqual((await activeTheme(db,config)).theme.world.maps,theme.world.maps);
 }finally{sqlite.close();}
});


test('disk-backed uploads clean staging files after successful, oversized, and interrupted requests',async()=>{
 const {spoolUpload}=await import('../server/native-upload.mjs');
 const {PassThrough}=await import('node:stream');
 const {readdirSync}=await import('node:fs');
 const dir=mkdtempSync(join(tmpdir(),'ctf-upload-test-'));
 try {
  const source=new PassThrough();const saving=spoolUpload(source,10,dir);source.end(Buffer.from('payload'));
  const saved=await saving;assert.equal(await new Response(saved.body).text(),'payload');await saved.cleanup();assert.deepEqual(readdirSync(dir),[]);
  const large=new PassThrough();const rejected=spoolUpload(large,5,dir);large.end(Buffer.from('too large'));await assert.rejects(rejected,error=>error.status===413);assert.deepEqual(readdirSync(dir),[]);
  const interrupted=new PassThrough();const abandoned=spoolUpload(interrupted,10,dir);
  // Wait for the spooler to attach its listeners, then simulate a dropped client.
  while(!interrupted.listenerCount('aborted'))await new Promise(resolve=>setImmediate(resolve));
  interrupted.emit('aborted');await assert.rejects(abandoned,/interrupted/);assert.deepEqual(readdirSync(dir),[]);
 }finally{rmSync(dir,{recursive:true,force:true});}
});


test('restored music limits keep an already-expanded saved theme readable without deleting tracks',async()=>{
 const {defaultTheme,parseTheme}=await import('../lib/theme-schema.mjs');
 const sqlite=new DatabaseSync(':memory:');initializeSchema(sqlite);const db=createSQLiteAdapter(sqlite),config=defaultGameConfig();
 try {
  const theme=defaultTheme(config);theme.audio.playlist=Array.from({length:100},(_,i)=>({name:'Legacy '+i,midi:'/audio/legacy-'+i+'.mid'}));
  assert.throws(()=>parseTheme(theme));
  sqlite.prepare("INSERT INTO theme_catalog VALUES('active',?,1)").run(JSON.stringify(theme));
  assert.equal((await activeTheme(db,config)).theme.audio.playlist.length,100);
  const {createSnapshot,validateSnapshot}=await import('../server/backup.mjs');
  assert.equal(validateSnapshot(await createSnapshot({db,config:{...config,audio:theme.audio},challenges:[]})).theme.audio.playlist.length,100);
  assert.equal(JSON.parse(sqlite.prepare("SELECT payload FROM theme_catalog WHERE id='active'").get().payload).audio.playlist.length,100);
 }finally{sqlite.close();}
});
