// CTF-RPG — Copyright (c) 2026 Jaime C Acosta
import {unzipSync,strFromU8} from 'fflate';
import {stringify} from 'yaml';
import {parseChallenges} from '../lib/config-schema.mjs';
import {createWorld} from '../lib/world-data.mjs';
import {passwordHash} from './passwords.mjs';
import {assetTypes,assertAsset,readAsset} from './packs.mjs';
const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const hash=async(bytes)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
function unpack(bytes){
 if(bytes.length>64*1024*1024)throw Error('CTFd export ZIP must be at most 64 MB.');
 let size=0,count=0;const names=new Set();
 return unzipSync(bytes,{filter:f=>{if(++count>10000||names.has(f.name)||f.name.startsWith('/')||f.name.includes('\\')||f.name.includes('\0')||f.name.split('/').includes('..'))throw Error('Unsafe or duplicate export path.');names.add(f.name);size+=f.originalSize;if(size>128*1024*1024||f.originalSize>32*1024*1024)throw Error('Expanded export exceeds 128 MB total or 32 MB per entry.');return !f.name.endsWith('/')&&(f.name.startsWith('db/')||f.name.startsWith('uploads/'));}});
}
function table(entries,name,required=false){const data=entries['db/'+name+'.json'];if(!data){if(required)throw Error('Missing CTFd table: '+name);return [];}const value=JSON.parse(strFromU8(data));const rows=Array.isArray(value)?value:value.results;if(!Array.isArray(rows)||rows.length>10000||rows.some(r=>!r||typeof r!=='object'||Array.isArray(r)))throw Error('Invalid CTFd table: '+name);return rows;}
function id(value){if(!Number.isSafeInteger(Number(value))||Number(value)<1)throw Error('CTFd IDs must be positive integers.');return String(value);}
function distinct(rows,name){const ids=rows.map(r=>id(r.id));if(new Set(ids).size!==ids.length)throw Error('Duplicate '+name+' IDs.');}
function hasRequirements(value){
 if(value===null||value===undefined||value==='')return false;
 const data=typeof value==='string'?JSON.parse(value):value;if(!data)return false;
 if(Array.isArray(data))return data.length>0;
 if(typeof data!=='object')throw Error('Malformed CTFd requirements.');
 return Object.entries(data).some(([key,v])=>key==='prerequisites'?Array.isArray(v)&&v.length>0:!!v);
}
function credential(){return Array.from(crypto.getRandomValues(new Uint8Array(18)),b=>b.toString(16).padStart(2,'0')).join('');}
function username(name,sourceId,used){let base=String(name||'user').toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,24);if(base.length<3)base='ctfd-'+sourceId;let candidate=base;let n=0;while(used.has(candidate)){const suffix='-'+sourceId+(n?'-'+n:'');candidate=base.slice(0,24-suffix.length)+suffix;n++;}used.add(candidate);return candidate;}
function teamName(name,sourceId,used){const base=String(name||'CTFd team '+sourceId).trim().slice(0,60)||'CTFd team '+sourceId;let candidate=base,n=0;while(used.has(candidate.toLowerCase())){const suffix=' (CTFd '+sourceId+(n?'-'+n:'')+')';candidate=base.slice(0,80-suffix.length)+suffix;n++;}used.add(candidate.toLowerCase());return candidate;}
async function state(db,config){const users=(await db.prepare('SELECT id,username,revision FROM students ORDER BY id').bind().all()).results,teams=(await db.prepare('SELECT id,name_key FROM teams ORDER BY id').bind().all()).results,members=(await db.prepare('SELECT user,team FROM team_members ORDER BY user').bind().all()).results,limit=(await db.prepare("SELECT max_members FROM team_settings WHERE id='active'").bind().first())?.max_members??config.teams.maxMembers;return{users,teams,members,limit,fingerprint:await hash(new TextEncoder().encode(JSON.stringify({users,teams,members,limit,roster:config.accounts.users.map(u=>u.username)})))};}
async function plan(entries,digest,options,{db,config,theme,themeRevision,challenges,contentRevision,readBaseAsset,assetStore}){
 const current=await state(db,config),warnings=[],prefix='ctfd-'+digest.slice(0,16)+'-',sourceChallenges=table(entries,'challenges',true),flags=table(entries,'flags'),hints=table(entries,'hints'),files=table(entries,'files'),tags=table(entries,'tags'),sourceUsers=options.users?table(entries,'users',true):[],sourceTeams=options.teams?table(entries,'teams',true):[];
 for(const [rows,label] of [[sourceChallenges,'challenge'],[sourceUsers,'user'],[sourceTeams,'team']])distinct(rows,label);
 if(options.teams&&!options.users)throw Error('Import users when importing team memberships.');
 const assets=new Map(),newChallenges=[],occupied=new Set(challenges.map(c=>`${c.map}:${c.location.x},${c.location.y}`)),world=createWorld(theme.world),spaces=[];
 for(const m of theme.world.maps)for(let y=0;y<28;y++)for(let x=0;x<40;x++)if(world.canPlaceChallenge(m.id,x,y)&&!occupied.has(`${m.id}:${x},${y}`))spaces.push({map:m.id,location:{x,y}});
 let seed=parseInt(digest.slice(0,8),16)||1;const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/4294967296;};for(let i=spaces.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[spaces[i],spaces[j]]=[spaces[j],spaces[i]];}
 const excluded=[];let assetSize=0;const oldPaths=new Set(challenges.flatMap(c=>c.downloads.map(d=>d.url)).filter(p=>p.startsWith('/')));
 for(const path of oldPaths){const bytes=await readAsset(path,assetStore,readBaseAsset);if(bytes)assetSize+=bytes.length;}
 if(assetSize>8*1024*1024)throw Error('Existing attachments exceed the 8 MB content-pack asset limit.');
 for(const row of sourceChallenges){
  const cid=id(row.id),name=String(row.name||'CTFd challenge '+cid),notes=[],sourceFlags=flags.filter(f=>String(f.challenge_id)===cid),sourceHints=hints.filter(h=>String(h.challenge_id)===cid),sourceTags=tags.filter(t=>String(t.challenge_id)===cid).map(t=>String(t.value));
  const rules=sourceFlags.filter(f=>f.type==='static'&&typeof f.content==='string'&&f.content.trim().length&&f.content.length<=500).map(f=>({value:f.content,caseSensitive:f.data!=='case_insensitive'}));
  let review=rules.length!==sourceFlags.length||!rules.length;
  if(review)notes.push('Unsupported/missing flags: imported for manual grading and hidden for review. Regex and plugin flag types are preserved in source details.');
  if(row.logic&&row.logic!=='any'){review=true;notes.push('Multi-flag logic requires review; flags are not combined automatically.');}
  if(hasRequirements(row.requirements)){review=true;notes.push('Prerequisites/unlock rules are preserved but not enforced; challenge hidden for review.');}
  if(Number(row.max_attempts)>0){review=true;notes.push('Attempt limits are preserved but not enforced; challenge hidden for review.');}
  if(!['standard','dynamic'].includes(row.type)){review=true;notes.push('Custom challenge plugin behavior is not executed; challenge hidden for review.');}
  if(row.type==='dynamic'||row.function&&row.function!=='static')notes.push('Dynamic scoring converted to fixed current value; original scoring parameters preserved.');
  if(row.next_id)notes.push('Next-challenge navigation is preserved in source details but not automated.');
  const points=Number(row.value);if(!Number.isInteger(points)||points<0||points>10000)throw Error(name+': points must fit the supported 0–10,000 range.');
  const position=spaces.pop();if(!position){excluded.push({id:prefix+cid,object:name});continue;}
  const downloads=[];let text=String(row.description||name);
  for(const f of files.filter(f=>String(f.challenge_id)===cid)){
   const location=String(f.location||'');if(/^https:\/\//i.test(location)){downloads.push({name:location.split('/').pop()||'File',url:location});continue;}
   const path=location.replace(/^\/?(?:uploads|files)\//,'').split('?')[0];const bytes=entries['uploads/'+path];if(!bytes){review=true;notes.push('Missing attachment: '+location);continue;}
   if(bytes.length>4*1024*1024)throw Error(name+': attachment exceeds the current 4 MB content-pack per-file limit.');
   const rawExt=path.split('.').pop().toLowerCase(),ext=assetTypes[rawExt]?rawExt:'bin';assertAsset(bytes,ext);const key=await hash(bytes)+'.'+ext;
   if(!assets.has(key)){if(!oldPaths.has('/api/assets/'+key))assetSize+=bytes.length;if(assetSize>8*1024*1024)throw Error('Referenced attachments exceed the current 8 MB content-pack limit.');assets.set(key,{key,bytes,type:assetTypes[ext]});}
   const url='/api/assets/'+key,filename=(path.split('/').pop()||'file').replace(/[^a-zA-Z0-9_.-]/g,'_');downloads.push({name:path.split('/').pop()||'File',url,filename});
   text=text.split('/files/'+path).join(url).split('/uploads/'+path).join(url);
  }
  const linkRegex=/\]\((https:\/\/[^\s)]+)(?:\s+"[^"]*")?\)/g;for(const match of text.matchAll(linkRegex))if(!downloads.some(d=>d.url===match[1]))downloads.push({name:match[1].slice(0,200),url:match[1]});
  if(row.connection_info)text+='\n\nConnection: '+row.connection_info;if(row.attribution)text+='\n\nAttribution: '+row.attribution;if(sourceTags.length)text+='\n\nTags: '+sourceTags.join(', ');
  const convertedHints=sourceHints.map(h=>({id:'ctfd-hint-'+id(h.id),label:String(h.title||'Hint '+h.id).slice(0,120),text:String(h.content||'(empty hint)'),cost:Number(h.cost??0)}));
  if(sourceHints.some(h=>hasRequirements(h.requirements))){review=true;notes.push('Hint prerequisites are preserved but not enforced; challenge hidden for review.');}
  if(sourceHints.some(h=>h.type&&h.type!=='standard')){review=true;notes.push('Custom hint behavior requires review.');}
  if(downloads.length>20||convertedHints.length>20)throw Error(name+': at most 20 files/links and 20 hints are supported.');
  notes.forEach(note=>warnings.push(name+': '+note));
  const definition={id:prefix+cid,...position,object:name,region:String(row.category||'CTFd'),text,points,flags:rules.map(r=>r.value),...(rules.length?{flagRules:rules}:{}),caseSensitive:rules.every(r=>r.caseSensitive),grading:review&&(!rules.length||rules.length!==sourceFlags.length||row.logic&&row.logic!=='any')?'manual':'automatic',visibility:review||row.state!=='visible'?'hidden':'visible',hints:convertedHints,downloads,ctfd:{challenge:row,flags:sourceFlags,hints:sourceHints,tags:sourceTags,solutions:table(entries,"solutions").filter(s=>String(s.challenge_id)===cid),notes}};
  if(challenges.some(c=>c.id===definition.id))throw Error('An imported challenge ID conflicts with existing content.');
  newChallenges.push(parseChallenges(stringify({challenges:[definition]}),theme.world.maps.map(m=>m.id))[0]);
 }
 const names=new Set([...current.users.map(u=>u.username),...config.accounts.users.map(u=>u.username)]),teamNames=new Set(current.teams.map(t=>t.name_key)),users=sourceUsers.map(u=>({sourceId:id(u.id),sourceName:String(u.name||''),id:prefix+'user-'+id(u.id),username:username(u.name,id(u.id),names),teamId:u.team_id===null||u.team_id===undefined?null:String(u.team_id),disabled:!!u.banned,wasAdmin:u.type==='admin'})),teams=sourceTeams.map(t=>({sourceId:id(t.id),sourceName:String(t.name||''),id:prefix+'team-'+id(t.id),name:teamName(t.name,id(t.id),teamNames),banned:!!t.banned})),teamById=new Map(teams.map(t=>[t.sourceId,t]));
 for(const u of users){if(teamById.get(u.teamId)?.banned)u.disabled=true;if(u.teamId&&!teamById.has(u.teamId)){warnings.push(u.sourceName+': team association not imported.');u.teamId=null;}if(u.wasAdmin)warnings.push(u.sourceName+': imported as a student; promote through Accounts if needed.');}
 const requiredMax=Math.max(current.limit,...teams.map(t=>users.filter(u=>u.teamId===t.sourceId).length));if(requiredMax>100)throw Error('An imported team exceeds the supported 100-member limit.');
 if(hints.length)warnings.push('Hint costs are retained; CTF-RPG deducts hints from that challenge reward and clamps at zero, rather than charging the CTFd scoreboard balance.');
 warnings.push('Markdown source and links are preserved. Embedded HTML, custom plugin interfaces and runtime services are not executed.');
 if(sourceUsers.length||sourceTeams.length)warnings.push('CTFd password hashes are not reused. New temporary user/team passwords will be provided in a credentials CSV after import.');
 if(sourceUsers.some(u=>u.hidden)||sourceTeams.some(t=>t.hidden))warnings.push('CTFd hidden-account/team scoreboard state is not imported; use scoreboard visibility controls or review accounts.');
 const skipped=['solves','fails','awards','solutions','notifications','pages','field_entries','ratings','comments'].filter(n=>table(entries,n).length);if(skipped.length)warnings.push('Not imported: '+skipped.join(', ')+'.');
 return{digest,users,teams,newChallenges,assets,current,report:{challenges:newChallenges.map(c=>({id:c.id,name:c.object,map:c.map,location:c.location,points:c.points,grading:c.grading,visibility:c.visibility})),users:users.map(u=>({sourceId:u.sourceId,sourceName:u.sourceName,username:u.username})),teams:teams.map(t=>({sourceId:t.sourceId,sourceName:t.sourceName,name:t.name})),warnings,excluded,requiredMax,currentMax:current.limit,fingerprint:current.fingerprint,themeRevision,contentRevision}};
}
export async function handleCtfdImport(req,state){
 const {db,config,user,platformAdmin,assetStore}=state,u=await user(req);if(!platformAdmin&&u?.role!=='admin')return reply({error:'Administrator access required.'},u?403:401);if(req.method!=='POST')return reply({error:'Method not allowed.'},405);
 try{
  if(Number(req.headers.get('content-length'))>65*1024*1024)throw Error('CTFd upload exceeds 64 MB.');const f=await req.formData(),file=f.get('file');if(!file||typeof file.arrayBuffer!=='function'||file.size>64*1024*1024)throw Error('Choose a CTFd export ZIP up to 64 MB.');const bytes=new Uint8Array(await file.arrayBuffer()),digest=await hash(bytes),prior=await db.prepare('SELECT report FROM ctfd_imports WHERE digest=?').bind(digest).first();if(prior)return reply({alreadyImported:true,report:JSON.parse(prior.report)});
  const current=await state.catalog(),options={users:f.get('users')==='true',teams:f.get('teams')==='true'},p=await plan(unpack(bytes),digest,options,{...state,challenges:current.challenges,contentRevision:current.revision});
  if(JSON.stringify(p.report).length>4000000)throw Error('Import report exceeds the supported size. Split the export into smaller batches.');
  if(f.get('action')!=='apply')return reply({preview:true,report:p.report});
  if(Number(f.get('themeRevision'))!==state.themeRevision||Number(f.get('contentRevision'))!==current.revision||f.get('fingerprint')!==p.current.fingerprint)return reply({error:'The theme, accounts or content changed. Preview the import again.'},409);
  if(p.report.excluded.length&&f.get('dropOverflow')!=='true')return reply({error:'Not enough reachable map tiles. Review and explicitly allow skipping unplaced challenges, or expand the map.'},400);
  if(p.report.requiredMax>p.current.limit&&f.get('raiseTeamLimit')!=='true')return reply({error:'Imported team size exceeds the team limit. Explicitly allow raising it in the preview.'},400);
  if(p.assets.size&&!assetStore)throw Error('Attachment storage is unavailable.');for(const a of p.assets.values())await assetStore.put(a.key,a.bytes,a.type);
  const run=crypto.randomUUID(),now=Date.now(),credentials=[],records=[];
  for(const t of p.teams){const password=credential(),salt=crypto.randomUUID();records.push({kind:'team',...t,salt,hash:await passwordHash(password,salt)});credentials.push({kind:'team',sourceName:t.sourceName,login:t.name,password});}
  for(const v of p.users){const password=credential(),salt=crypto.randomUUID();records.push({kind:'user',...v,salt,hash:await passwordHash(password,salt)});credentials.push({kind:'user',sourceName:v.sourceName,login:v.username,password});}
  const guard='EXISTS(SELECT 1 FROM ctfd_imports WHERE id=?)',statements=[db.prepare(`INSERT INTO ctfd_imports(id,digest,created_at,report) SELECT ?,?,?,? WHERE COALESCE((SELECT revision FROM theme_catalog WHERE id='active'),0)=? AND COALESCE((SELECT revision FROM challenge_catalog WHERE id='active'),0)=? AND (SELECT COUNT(*) FROM students)=? AND COALESCE((SELECT SUM(revision) FROM students),0)=? AND (SELECT COUNT(*) FROM teams)=? AND (SELECT COUNT(*) FROM team_members)=? AND COALESCE((SELECT max_members FROM team_settings WHERE id='active'),?)=?`).bind(run,digest,now,JSON.stringify(p.report),state.themeRevision,current.revision,p.current.users.length,p.current.users.reduce((n,r)=>n+r.revision,0),p.current.teams.length,p.current.members.length,config.teams.maxMembers,p.current.limit)];
  for(const r of records){if(r.kind==='team')statements.push(db.prepare(`INSERT INTO teams(id,name,name_key,hash,salt) SELECT ?,?,?,?,? WHERE ${guard}`).bind(r.id,r.name,r.name.toLowerCase(),r.hash,r.salt,run));else statements.push(db.prepare(`INSERT INTO students(id,username,hash,salt,hero,managed,provisioned,disabled,role) SELECT ?,?,?,?,?,1,1,?,'student' WHERE ${guard}`).bind(r.id,r.username,r.hash,r.salt,state.theme.characters[0].id,+r.disabled,run));}
  for(const v of p.users.filter(v=>v.teamId)){const t=p.teams.find(t=>t.sourceId===v.teamId);statements.push(db.prepare(`INSERT INTO team_members(user,team) SELECT ?,? WHERE ${guard}`).bind(v.id,t.id,run));}
  statements.push(db.prepare(`INSERT INTO challenge_catalog(id,payload,revision) SELECT 'active',?,? WHERE ${guard} ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,revision=excluded.revision`).bind(JSON.stringify([...current.challenges,...p.newChallenges]),current.revision+1,run));
  if(p.report.requiredMax>p.current.limit)statements.push(db.prepare(`INSERT INTO team_settings(id,max_members) SELECT 'active',? WHERE ${guard} ON CONFLICT(id) DO UPDATE SET max_members=excluded.max_members`).bind(p.report.requiredMax,run));
  let result;try {result=await db.batch(statements);}catch(e){const previous=await db.prepare('SELECT report FROM ctfd_imports WHERE digest=?').bind(digest).first();if(previous)return reply({alreadyImported:true,report:JSON.parse(previous.report)});throw e;}if(!(result[0].meta?.changes??result[0].changes)){const previous=await db.prepare('SELECT report FROM ctfd_imports WHERE digest=?').bind(digest).first();if(previous)return reply({alreadyImported:true,report:JSON.parse(previous.report)});return reply({error:'Another administrator changed the system. Preview again.'},409);}
  return reply({imported:true,report:p.report,credentials});
 }catch(e){return reply({error:e.issues?.map(i=>i.message).join('; ')||e.message||'CTFd import failed.'},400);}
}
