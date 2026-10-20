// Exercise the actual native HTTP server against a disposable database. No
// production URL, credentials, database, or asset directory are used.
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,writeFileSync,rmSync,existsSync,readFileSync,copyFileSync,mkdirSync} from 'node:fs';
import {tmpdir,cpus,totalmem} from 'node:os';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {initializeSchema} from '../server/sqlite.mjs';
import {parseChallenges} from '../lib/config-schema.mjs';
import {parseTheme,defaultTheme,themeAssetPaths} from '../lib/theme-schema.mjs';
import {defaultGameConfig} from '../lib/runtime-config.mjs';
import {parse} from 'yaml';
import {passwordHash} from '../server/passwords.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const flags=Object.fromEntries(process.argv.slice(2).map(arg=>{const [key,...value]=arg.replace(/^--/,'').split('=');return[key,value.join('=')];}));
if(flags.help!==undefined){console.log('npm run load-test -- --users=50,100,250 --duration=30 --messages=100000 --chat-ratio=1 --out=/tmp/ctf-load.json\nRuns an isolated native server on this machine. Options: --catalog=content/challenges.yaml --theme=/path/theme.yaml --assets-from=/path/pack-assets --media-ratio=0.2 --login-burst=100 --login-concurrency=25 --db-mode=main|worker --search=literal. All storage is isolated. Browser rendering and Internet latency are excluded.');process.exit(0);}
if(Object.keys(flags).some(key=>!['users','duration','messages','chat-ratio','out','catalog','theme','assets-from','media-ratio','login-burst','login-concurrency','db-mode','search'].includes(key)))throw Error('Unknown option. Use --help.');
const users=(flags.users||'50,100,250').split(',').map(Number), duration=Number(flags.duration||30), messageCount=Number(flags.messages||100000), chatRatio=Number(flags['chat-ratio']??1);
if(!users.length||users.some(n=>!Number.isSafeInteger(n)||n<1||n>2000)||!Number.isFinite(duration)||duration<1||duration>3600||!Number.isSafeInteger(messageCount)||messageCount<0||messageCount>2000000||!Number.isFinite(chatRatio)||chatRatio<0||chatRatio>1)throw Error('Invalid load options. Use --help.');
const mediaRatio=Number(flags['media-ratio']??0),loginBurst=Number(flags['login-burst']??0),loginConcurrency=Number(flags['login-concurrency']??25),dbMode=flags['db-mode']||'main';
if(!Number.isFinite(mediaRatio)||mediaRatio<0||mediaRatio>1||!Number.isSafeInteger(loginBurst)||loginBurst<0||loginBurst>Math.max(...users)||!Number.isSafeInteger(loginConcurrency)||loginConcurrency<1||loginConcurrency>500||!['main','worker'].includes(dbMode))throw Error('Invalid extended load options. Use --help.');
if(!existsSync(resolve(root,'selfhost/dist/index.html')))throw Error('Build the frontend first: npm run build:selfhost');
const folder=mkdtempSync(resolve(tmpdir(),'ctf-load-')), database=resolve(folder,'quest.sqlite'), actors=[];
let child, logs='';
const interrupted=new AbortController();
function interrupt(){interrupted.abort();child?.kill();}
process.once('SIGINT',interrupt);process.once('SIGTERM',interrupt);
async function wait(ms){try{await sleep(ms,undefined,{signal:interrupted.signal});}catch(error){if(!interrupted.signal.aborted)throw error;}}
const fixtureChallenges='challenges:\n  - id: load-question\n    object: Load-test checkpoint\n    region: Load-test area\n    location: {x: 11, y: 19}\n    text: Load-test answer\n    points: 100\n    flags: [load-answer]\n';
try {
const catalogText=flags.catalog?readFileSync(resolve(flags.catalog),'utf8'):fixtureChallenges;
const catalog=parseChallenges(catalogText,null);
const theme=flags.theme?parseTheme(parse(readFileSync(resolve(flags.theme),'utf8'))):defaultTheme(defaultGameConfig());
const hero=theme.characters.find(character=>character.appearanceFor!=='entity').id;
const startMap=theme.world.maps.find(map=>map.id===theme.world.startMap);
const answerable=catalog.find(challenge=>challenge.grading==='automatic'&&challenge.flags?.length);
writeFileSync(resolve(folder,'challenges.yaml'),catalogText);
mkdirSync(resolve(folder,'assets'));
const mediaPaths=[];
for(const path of themeAssetPaths(theme)) {
  if(path.startsWith('/api/assets/')) {
    const key=path.slice('/api/assets/'.length);
    if(flags['assets-from'] && /^[a-f0-9]{64}\.[a-z0-9]+$/.test(key) && existsSync(resolve(flags['assets-from'],key))) {copyFileSync(resolve(flags['assets-from'],key),resolve(folder,'assets',key));mediaPaths.push(path);}
  } else if(existsSync(resolve(root,'public','.'+path)))mediaPaths.push(path);
}
if(mediaRatio && !mediaPaths.length)throw Error('No local media is available for this theme. Provide --assets-from for uploaded assets.');
function randomizer(seed=123456789){return()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};}
const random=randomizer();
const percentile=(values,p)=>values.length?Number([...values].sort((a,b)=>a-b)[Math.min(values.length-1,Math.ceil(p*values.length)-1)].toFixed(2)):null;
  const sqlite=new DatabaseSync(database);initializeSchema(sqlite);
  const salt=crypto.randomUUID(),loadPassword=crypto.randomUUID(),hash=await passwordHash(loadPassword,salt),now=Date.now(),largest=Math.max(...users),teamCount=Math.ceil(largest/4);
  sqlite.exec('BEGIN');
  if(flags.theme)sqlite.prepare("INSERT INTO theme_catalog VALUES('active',?,1)").run(JSON.stringify(theme));
  const student=sqlite.prepare('INSERT INTO students(id,username,hash,salt,hero,role,managed,provisioned,hero_selected) VALUES(?,?,?,?,?,?,1,1,1)');
  const team=sqlite.prepare('INSERT INTO teams(id,name,name_key,hash,salt) VALUES(?,?,?,?,?)'),member=sqlite.prepare('INSERT INTO team_members(user,team) VALUES(?,?)'),session=sqlite.prepare('INSERT INTO sessions(token,user,expires) VALUES(?,?,?)');
  student.run('load-admin','loadadmin',hash,salt,hero,'admin');const adminToken=crypto.randomUUID();session.run(adminToken,'load-admin',now+86400000);
  for(let i=0;i<teamCount;i++)team.run('load-team-'+i,'Load team '+i,'load team '+i,hash,salt);
  const solved=sqlite.prepare('INSERT INTO solved(user,challenge,points) VALUES(?,?,?)');
  for(let i=0;i<largest;i++){
    const actor={id:'load-user-'+i,username:'loaduser'+String(i).padStart(4,'0'),team:'load-team-'+Math.floor(i/4),token:crypto.randomUUID()};actors.push(actor);
    student.run(actor.id,actor.username,hash,salt,hero,'student');member.run(actor.id,actor.team);session.run(actor.token,actor.id,now+86400000);
    if(i%3===0 && answerable)solved.run(actor.id,answerable.id,answerable.points);
    if(i%13===0)sqlite.prepare('INSERT INTO personal_chat_settings(user,mute_all,revision) VALUES(?,1,1)').run(actor.id);
    if(i%17===0)sqlite.prepare('INSERT INTO chat_history_settings(user,cleared_through) VALUES(?,?)').run(actor.id,now-86400000);
  }
  const teamMessage=sqlite.prepare('INSERT INTO team_messages VALUES(?,?,?,?,?,?,?)'),instructorMessage=sqlite.prepare('INSERT INTO instructor_messages VALUES(?,?,?,?,?,?)');
  for(let i=0;i<messageCount;i++){
    const sender=actors[i%largest],at=now-600000-Math.floor(i/Math.max(1,messageCount)*172800000);
    if(i%5===0)instructorMessage.run('load-message-'+i,sender.id,sender.team,sender.username,'Load-test instructor message '+i,at);
    else teamMessage.run('load-message-'+i,sender.id,sender.team,'load-team-'+((Math.floor(i/4)+1)%teamCount),sender.username,'Load-test team message '+i,at);
  }
  for(let i=0;i<100;i++)sqlite.prepare('INSERT INTO notifications VALUES(?,?,?,?,?,?,?)').run('load-notice-'+i,'Load notice '+i,'Load-test announcement','loadadmin','all','[]',now-i*60000);
  sqlite.exec('COMMIT');sqlite.exec('ANALYZE');sqlite.close();
  const env={...process.env,HOST:'127.0.0.1',PORT:'0',DATABASE_PATH:database,ASSET_PATH:resolve(folder,'assets'),CHALLENGES_CONFIG:resolve(folder,'challenges.yaml'),ADMIN_USERNAME:'loadadmin',ADMIN_PASSWORD:'',PUBLIC_ORIGIN:'',SECURE_COOKIES:'false',DATABASE_EXECUTION:dbMode};
  child=spawn(process.execPath,['--import',resolve(root,'scripts/load-test-metrics.mjs'),resolve(root,'server/selfhost.mjs')],{cwd:root,env,stdio:['ignore','pipe','pipe','ipc']});
  child.stderr.on('data',chunk=>{logs=(logs+chunk).slice(-4000);});
  const base=await new Promise((done,fail)=>{
    const timer=setTimeout(()=>fail(Error('Load server startup timed out: '+logs)),15000);
    const exited=code=>{clearTimeout(timer);fail(Error('Load server exited: '+code+' '+logs));};child.once('exit',exited);
    child.stdout.on('data',chunk=>{const match=/listening on (http:\/\/127\.0\.0\.1:\d+)/.exec(chunk.toString());if(match){clearTimeout(timer);child.removeListener('exit',exited);done(match[1]);}});
  });
  let metricId=0;
  async function metrics(){return new Promise((done,fail)=>{const id=++metricId,timer=setTimeout(()=>{child.off('message',receive);fail(Error('Metrics timed out.'));},5000);function receive(message){if(message.type==='load-metrics'&&message.id===id){clearTimeout(timer);child.off('message',receive);done(message);}}child.on('message',receive);child.send({type:'load-metrics',id});});}
  const report={runtime:process.version,machine:{platform:process.platform,arch:process.arch,cpu:cpus()[0]?.model,logicalCpus:cpus().length,memoryMiB:Math.round(totalmem()/1048576)},generatedAt:new Date().toISOString(),dataset:{users:largest,teams:teamCount,messages:messageCount,notifications:100,challenges:catalog.length,mediaAssets:mediaPaths.length},databaseExecution:dbMode,scope:'Isolated native server on loopback; gameplay uses pre-authenticated users. Login bursts and cold media downloads are reported when enabled; excludes browser rendering and Internet latency.',phases:[]};
  if(loginBurst) {
    const times=[],statuses={};let index=0;
    await metrics();const start=performance.now();
    await Promise.all(Array.from({length:Math.min(loginConcurrency,loginBurst)},async()=>{
      while(index<loginBurst) {
        const actor=actors[index++],began=performance.now();let status='network-error';
        try {const response=await fetch(base+'/api/auth',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({mode:'login',username:actor.username,password:loadPassword,hero}),signal:AbortSignal.timeout(30000)});status=String(response.status);await response.arrayBuffer();}catch{}
        statuses[status]=(statuses[status]||0)+1;times.push(performance.now()-began);
      }
    }));
    const server=await metrics();delete server.id;delete server.type;
    report.loginBurst={users:loginBurst,concurrency:loginConcurrency,elapsedSeconds:(performance.now()-start)/1000,statuses,errors:loginBurst-(statuses['200']||0),p50Ms:percentile(times,.5),p95Ms:percentile(times,.95),p99Ms:percentile(times,.99),server};
    console.log(JSON.stringify({loginBurst:report.loginBurst},null,2));
  }
  for(const count of users){
    const timings=new Map(),statuses={},errors=[],pending=new Set();let requests=0,downloadedBytes=0;
    async function request(actor,path,body){
      const name=path.split('?')[0],start=performance.now();let status='network-error';
      try{const response=await fetch(base+path,{method:body?'POST':'GET',headers:{Origin:base,Cookie:'quest_session='+actor.token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(12000)});status=String(response.status);const bytes=await response.arrayBuffer();downloadedBytes+=bytes.byteLength;const result=response.headers.get('content-type')?.includes('json')?JSON.parse(new TextDecoder().decode(bytes)):{};if(!response.ok&&errors.length<10)errors.push({path,status,error:result.error});}
      catch(error){if(errors.length<10)errors.push({path,status,error:error.message});}
      requests++;statuses[status]=(statuses[status]||0)+1;if(!timings.has(name))timings.set(name,[]);timings.get(name).push(performance.now()-start);
    }
    const started=performance.now(),until=started+duration*1000;
    async function loop(actor,path,body,interval){
      await wait(Math.min(random()*interval,Math.max(0,until-performance.now())));
      while(!interrupted.signal.aborted&&performance.now()<until){await request(actor,path,typeof body==='function'?body():body);const delay=Math.min(interval*(1+random()*0.1),until-performance.now());if(delay>0)await wait(delay);}
    }
    function track(promise){pending.add(promise);promise.finally(()=>pending.delete(promise));}
    await metrics();
    for(const [i,actor] of actors.slice(0,count).entries()){
      track(loop(actor,'/api/presence',{map:startMap.id,x:startMap.spawn.x,y:startMap.spawn.y,themeRevision:flags.theme?1:0},3000));
      if(i/count<chatRatio)track(loop(actor,'/api/team-social?team='+actor.team,undefined,5000));
      track(loop(actor,'/api/team-social',()=>({id:crypto.randomUUID(),team:i%2?'instructors':actor.team,text:'Load-test live message'}),30000));
      if(answerable)track(loop(actor,'/api/game',{id:answerable.id,answer:answerable.flags[0]},45000));
      if(i/count<mediaRatio)track(loop(actor,mediaPaths[i%mediaPaths.length],undefined,30000));
    }
    track(loop({token:adminToken},'/api/admin/chats'+(flags.search?'?'+new URLSearchParams({q:flags.search}):''),undefined,10000));
    await Promise.all([...pending]);
    if(interrupted.signal.aborted)throw Error("Load test interrupted.");
    const elapsed=(performance.now()-started)/1000,server=await metrics();delete server.id;delete server.type;
    const successful=Object.entries(statuses).filter(([status])=>Number(status)>=200&&Number(status)<300).reduce((sum,[,n])=>sum+n,0);
    const phase={users:count,durationSeconds:duration,elapsedSeconds:Number(elapsed.toFixed(2)),chatRatio,mediaRatio,downloadedBytes,requests,requestsPerSecond:Number((requests/elapsed).toFixed(2)),errors:requests-successful,statuses,server:Object.fromEntries(Object.entries(server).map(([k,v])=>[k,Number(v.toFixed(3))])),endpoints:Object.fromEntries([...timings].map(([path,times])=>[path,{requests:times.length,p50Ms:percentile(times,.5),p95Ms:percentile(times,.95),p99Ms:percentile(times,.99)}])),sampleErrors:errors};
    report.phases.push(phase);console.log(JSON.stringify(phase,null,2));
  }
  if(flags.out)writeFileSync(resolve(flags.out),JSON.stringify(report,null,2)+'\n');
  if(report.loginBurst?.errors || report.phases.some(phase=>phase.errors))process.exitCode=1;
} finally {
  if(child&&child.exitCode===null){await new Promise(done=>{const timer=setTimeout(()=>child.kill('SIGKILL'),3000);child.once('exit',()=>{clearTimeout(timer);done();});child.kill();});}
  rmSync(folder,{recursive:true,force:true});
  process.removeListener("SIGINT",interrupt);process.removeListener("SIGTERM",interrupt);
}
