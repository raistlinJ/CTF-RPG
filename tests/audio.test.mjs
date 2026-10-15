// CTF-RPG — Copyright (c) 2026 Jaime C Acosta
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import midiPackage from '@tonejs/midi';
const {Midi} = midiPackage;
import {unzipSync} from 'fflate';
import {createApi} from '../server/api.mjs';
import {initializeSchema,createSQLiteAdapter} from '../server/sqlite.mjs';
import {parseGame,parseChallenges} from '../lib/config-schema.mjs';
import {defaultTheme,parseTheme,themeAssetPaths,mapThemeAssets} from '../lib/theme-schema.mjs';
import {defaultGameConfig} from '../lib/runtime-config.mjs';
import {themePresets} from '../lib/theme-presets.mjs';
import {SOUND_EVENTS} from '../lib/sound-events.mjs';
import {musicTracks,shuffledTracks} from '../lib/midi-playlist.mjs';
import {createSnapshot,validateSnapshot} from '../server/backup.mjs';
import {activeTheme} from '../server/packs.mjs';
function midi(pitch=60){const m=new Midi();m.addTrack().addNote({midi:pitch,time:0,duration:.3,velocity:.8});return m.toArray();}
function wav(){const bytes=new Uint8Array(844),view=new DataView(bytes.buffer);const word=(at,value)=>{for(let i=0;i<value.length;i++)bytes[at+i]=value.charCodeAt(i);};word(0,'RIFF');view.setUint32(4,836,true);word(8,'WAVE');word(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,8000,true);view.setUint32(28,8000,true);view.setUint16(32,1,true);view.setUint16(34,8,true);word(36,'data');view.setUint32(40,800,true);bytes.fill(128,44);return bytes;}
function setup(){const sqlite=new DatabaseSync(':memory:');initializeSchema(sqlite);const db=createSQLiteAdapter(sqlite);const config=parseGame('characters:\n - id: web\n   name: Web\naccounts:\n allowRegistration: true\n users:\n  - username: teacher\n    password: teacher-password\n    role: admin\n    hero: web');const challenges=parseChallenges(readFileSync('content/challenges.yaml','utf8'));const files=new Map();const api=createApi({db,config,challenges,assetStore:{async get(k){return files.get(k)||null},async put(k,v){files.set(k,v)}},readBaseAsset:p=>new Uint8Array(readFileSync('public'+p))});function client(){let cookie='';return async(path,body)=>{const r=await api(new Request('http://quest.test'+path,{method:body?'POST':'GET',headers:{Origin:'http://quest.test',Cookie:cookie,...(body&&!(body instanceof FormData)?{'Content-Type':'application/json'}:{})},body:body instanceof FormData?body:body?JSON.stringify(body):undefined}));if(r.headers.has('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return {status:r.status,data:r.headers.get('content-type')?.includes('json')?await r.json():null,r};};}return{sqlite,db,config,challenges,files,client};}
function form(state,files=[],playlist=state.audio.playlist){const f=new FormData();f.set('revision',String(state.revision));f.set('playlist',JSON.stringify(playlist));f.set('volume','.2');f.set('loop','true');for(const [name,bytes] of files)f.append('files',new File([bytes],name));return f;}
test('shuffle visits each track once and avoids round-boundary repeats; single-file YAML remains compatible',()=>{const tracks=[{name:'A',midi:'/a.mid'},{name:'B',midi:'/b.mid'},{name:'C',midi:'/c.mid'}];const queue=shuffledTracks(tracks,'/b.mid',()=>.5);assert.equal(new Set(queue.map(t=>t.midi)).size,3);assert.notEqual(queue[0].midi,'/b.mid');assert.deepEqual(tracks.map(t=>t.name),['A','B','C']);assert.deepEqual(musicTracks({midi:'/single.mid'}),[{name:'single.mid',midi:'/single.mid'}]);assert.deepEqual(musicTracks({midi:'/single.mid',playlist:tracks}),tracks);const config=parseGame('characters:\n - id: web\n   name: Web\naudio:\n midi: null\n playlist:\n  - name: Example\n    midi: /example.mid');assert.equal(defaultTheme(config).audio.playlist.length,1);});
test('map music defaults to none, requires a playlist track, and follows asset remapping',()=>{
  const config=parseGame('characters:\n - id: web\n   name: Web');
  const theme=defaultTheme(config);
  assert.equal(theme.world.maps[0].music,null);
  theme.audio.playlist=[{name:'Map song',midi:'/music/map.mid'}];
  theme.world.maps[0].music='/music/map.mid';
  assert.equal(parseTheme(theme).world.maps[0].music,'/music/map.mid');
  const mapped=mapThemeAssets(theme,path=>'/copied'+path);
  assert.equal(mapped.world.maps[0].music,'/copied/music/map.mid');
  assert.ok(themeAssetPaths(theme).includes('/music/map.mid'));
  theme.world.maps[0].music='/music/missing.mid';
  assert.throws(()=>parseTheme(theme),/Map music must be selected/);
});
test('built-in themes assign playable defaults for every map and event',()=>{
  assert.equal(SOUND_EVENTS.length,16);
  const themes=[defaultTheme(defaultGameConfig()),...themePresets.flatMap(preset=>[preset.theme,preset.demoTheme])];
  for(const theme of themes){
    const contents=new Set();
    assert.equal(theme.sounds.clips.length,SOUND_EVENTS.length+1);
    for(const map of theme.world.maps)assert.ok(theme.sounds.maps[map.id]);
    for(const event of SOUND_EVENTS)assert.ok(theme.sounds.events[event.id],event.id);
    for(const clip of theme.sounds.clips){
      assert.equal(clip.source,'theme');
      const bytes=readFileSync('public'+clip.src);
      assert.equal(bytes.toString('ascii',0,4),'RIFF');
      assert.equal(bytes.toString('ascii',8,12),'WAVE');
      assert.ok(bytes.length>44);
      contents.add(bytes.toString('base64'));
      assert.ok(themeAssetPaths(theme).includes(clip.src));
    }
    assert.equal(contents.size,theme.sounds.clips.length);
  }
});
test('saved built-in themes created before Sounds gain defaults without overriding explicit None',async()=>{
  const s=setup();
  try {
    const legacy=structuredClone(themePresets.find(preset=>preset.id==='agentic-circuit').theme);
    delete legacy.sounds;
    s.sqlite.prepare("INSERT INTO theme_catalog(id,payload,revision) VALUES('active',?,1)").run(JSON.stringify(legacy));
    const restored=await activeTheme(s.db,s.config);
    assert.equal(restored.revision,1);
    assert.equal(restored.theme.title,legacy.title);
    assert.equal(restored.theme.sounds.clips.length,SOUND_EVENTS.length+1);
    for(const event of SOUND_EVENTS)assert.ok(restored.theme.sounds.events[event.id],event.id);
    for(const map of restored.theme.world.maps)assert.ok(restored.theme.sounds.maps[map.id],map.id);
    s.sqlite.prepare("UPDATE theme_catalog SET payload=?,revision=2 WHERE id='active'").run(JSON.stringify({...legacy,sounds:{clips:[],maps:{},events:{}}}));
    assert.equal((await activeTheme(s.db,s.config)).theme.sounds.clips.length,SOUND_EVENTS.length+1);
    const explicit={...legacy,sounds:{clips:[],maps:{town:null},events:{interaction:null}}};
    s.sqlite.prepare("UPDATE theme_catalog SET payload=?,revision=3 WHERE id='active'").run(JSON.stringify(explicit));
    const untouched=await activeTheme(s.db,s.config);
    assert.deepEqual(untouched.theme.sounds,explicit.sounds);
    const previous=structuredClone(themePresets.find(preset=>preset.id==='agentic-circuit').theme);
    previous.sounds.clips=previous.sounds.clips.filter(clip=>!clip.src.endsWith('/footsteps.wav'));
    delete previous.sounds.events.footsteps;
    s.sqlite.prepare("UPDATE theme_catalog SET payload=?,revision=4 WHERE id='active'").run(JSON.stringify(previous));
    const upgraded=await activeTheme(s.db,s.config);
    assert.equal(upgraded.theme.sounds.events.footsteps,'/themes/agentic-circuit/audio/sounds/footsteps.wav');
    assert.ok(upgraded.theme.sounds.clips.some(clip=>clip.src===upgraded.theme.sounds.events.footsteps));
    previous.sounds.events.footsteps=null;
    s.sqlite.prepare("UPDATE theme_catalog SET payload=?,revision=5 WHERE id='active'").run(JSON.stringify(previous));
    assert.equal((await activeTheme(s.db,s.config)).theme.sounds.events.footsteps,null);
    delete previous.sounds.events.footsteps;
    const moved=new Map(previous.sounds.clips.map((clip,index)=>[clip.src,`/api/assets/${String(index+1).padStart(64,'0')}.wav`]));
    const imported=mapThemeAssets(previous,path=>moved.get(path)||path);
    s.sqlite.prepare("UPDATE theme_catalog SET payload=?,revision=6 WHERE id='active'").run(JSON.stringify(imported));
    const upgradedImport=await activeTheme(s.db,s.config);
    assert.equal(upgradedImport.theme.sounds.events.footsteps,'/themes/agentic-circuit/audio/sounds/footsteps.wav');
    assert.ok(upgradedImport.theme.sounds.clips.some(clip=>clip.src===upgradedImport.theme.sounds.events.footsteps));
  } finally {s.sqlite.close();}
});
test('sound library uploads, map and event assignments, exports, and removal',async()=>{
  const s=setup();
  try {
    const admin=s.client(),student=s.client();
    await admin('/api/auth',{username:'teacher',password:'teacher-password',mode:'login'});
    await student('/api/auth',{username:'alice',password:'student-password',hero:'web',mode:'register'});
    assert.equal((await student('/api/admin/theme-sounds')).status,403);
    const initial=(await admin('/api/admin/theme-sounds')).data;
    assert.deepEqual(initial.sounds,{clips:[],maps:{},events:{}});
    const invalid=new FormData();invalid.set('revision',String(initial.revision));invalid.append('files',new File([new Uint8Array(64)],'fake.wav'));
    assert.equal((await admin('/api/admin/theme-sounds',invalid)).status,400);
    const form=new FormData();form.set('revision',String(initial.revision));form.append('files',new File([wav()],'chime.wav'));
    const uploaded=await admin('/api/admin/theme-sounds',form);
    assert.equal(uploaded.status,200,JSON.stringify(uploaded.data));
    const clip=uploaded.data.sounds.clips[0];
    assert.equal(clip.source,'upload');
    assert.equal((await student(clip.src)).status,200);
    const mapId=uploaded.data.maps[0].id;
    const assignments={action:'assign',revision:uploaded.data.revision,maps:{[mapId]:clip.src},events:{correct:clip.src,transport:clip.src}};
    const saved=await admin('/api/admin/theme-sounds',assignments);
    assert.equal(saved.status,200,JSON.stringify(saved.data));
    assert.equal((await admin('/api/config')).data.theme.sounds.maps[mapId],clip.src);
    assert.equal((await admin('/api/admin/theme-sounds',{...assignments,revision:saved.data.revision,events:{unknown:clip.src}})).status,400);
    const exported=await admin('/api/admin/packs?kind=theme');
    const archive=new Uint8Array(await exported.r.arrayBuffer());
    const entries=unzipSync(archive);
    assert.ok(entries['assets'+clip.src]);
    const mapped=mapThemeAssets((await admin('/api/admin/packs')).data.theme,path=>'/copied'+path);
    assert.equal(mapped.sounds.maps[mapId],'/copied'+clip.src);
    assert.equal(mapped.sounds.events.correct,'/copied'+clip.src);
    const removed=await admin('/api/admin/theme-sounds',{action:'delete',revision:saved.data.revision,src:clip.src});
    assert.equal(removed.status,200,JSON.stringify(removed.data));
    assert.deepEqual(removed.data.sounds.clips,[]);
    assert.equal(removed.data.sounds.maps[mapId],null);
    assert.equal(removed.data.sounds.events.correct,null);
    const revisions=(await admin('/api/admin/packs')).data;
    const importForm=new FormData();
    importForm.set('file',new Blob([archive],{type:'application/zip'}),'sounds-theme.zip');
    importForm.set('themeRevision',String(revisions.themeRevision));
    importForm.set('contentRevision',String(revisions.contentRevision));
    const imported=await admin('/api/admin/packs?kind=theme',importForm);
    assert.equal(imported.status,200,JSON.stringify(imported.data));
    const restored=(await admin('/api/admin/packs')).data.theme.sounds;
    assert.equal(restored.clips[0].source,'theme');
    assert.equal(restored.maps[mapId],restored.clips[0].src);
  } finally {s.sqlite.close();}
});
test('admin audio uploads multiple MIDI files, preserves world/content, denies students, protects revisions and exports all tracks',async()=>{const s=setup();try{const admin=s.client(),student=s.client();await admin('/api/auth',{username:'teacher',password:'teacher-password',mode:'login'});await student('/api/auth',{username:'alice',password:'student-password',hero:'web',mode:'register'});assert.equal((await student('/api/admin/theme-audio')).status,403);const initial=(await admin('/api/admin/theme-audio')).data;assert.equal(initial.audio.playlist.length,0);const uploaded=await admin('/api/admin/theme-audio',form(initial,[['One.mid',midi()],['Two.midi',midi(65)]]));assert.equal(uploaded.status,200,JSON.stringify(uploaded.data));const state=uploaded.data;assert.equal(state.audio.playlist.length,2);assert.equal((await admin('/api/admin/theme-audio',form(initial))).status,409);const pack=(await admin('/api/admin/packs')).data;assert.deepEqual(pack.theme.world,defaultTheme(s.config).world);assert.equal(pack.contentRevision,0);assert.equal((await admin('/api/config')).data.audio.playlist.length,2);for(const t of state.audio.playlist)assert.equal((await student(t.midi)).status,200);const response=await admin('/api/admin/packs?kind=theme');assert.equal(response.status,200);const zipped=unzipSync(new Uint8Array(await response.r.arrayBuffer()));for(const t of state.audio.playlist)assert.ok(zipped['assets'+t.midi]);const snapshot=await createSnapshot({db:s.db,config:s.config,challenges:s.challenges});assert.equal(validateSnapshot(snapshot).theme.audio.playlist.length,2);const mapped=mapThemeAssets(pack.theme,p=>p.startsWith('/api/assets/')?'/new/'+p.split('/').pop():p);assert.ok(mapped.audio.playlist.every(t=>t.midi.startsWith('/new/')));assert.equal(themeAssetPaths(parseTheme(mapped)).filter(p=>p.startsWith('/new/')).length,2);const removed=await admin('/api/admin/theme-audio',form(state,[],[state.audio.playlist[1]]));assert.equal(removed.data.audio.playlist.length,1);assert.equal((await admin('/api/admin/theme-audio',form(removed.data,[],[]))).data.audio.playlist.length,0);}finally{s.sqlite.close();}});
test('removing a playlist track clears maps assigned to it',async()=>{
  const s=setup();
  try {
    const admin=s.client();
    await admin('/api/auth',{username:'teacher',password:'teacher-password',mode:'login'});
    const initial=(await admin('/api/admin/theme-audio')).data;
    const uploaded=await admin('/api/admin/theme-audio',form(initial,[['One.mid',midi()],['Two.mid',midi(65)]]));
    assert.equal(uploaded.status,200);
    const theme=(await admin('/api/admin/packs')).data.theme;
    theme.world.maps[0].music=uploaded.data.audio.playlist[0].midi;
    s.sqlite.prepare("UPDATE theme_catalog SET payload=?,revision=revision+1 WHERE id='active'").run(JSON.stringify(parseTheme(theme)));
    const current=(await admin('/api/admin/theme-audio')).data;
    const remaining=[current.audio.playlist[1]];
    const saved=await admin('/api/admin/theme-audio',form(current,[],remaining));
    assert.equal(saved.status,200,JSON.stringify(saved.data));
    assert.equal((await admin('/api/admin/packs')).data.theme.world.maps[0].music,null);
  } finally {s.sqlite.close();}
});
test('Media Library saves map music assignments alongside playlist changes',async()=>{
  const s=setup();
  try {
    const admin=s.client();
    await admin('/api/auth',{username:'teacher',password:'teacher-password',mode:'login'});
    const initial=(await admin('/api/admin/theme-audio')).data;
    const uploaded=await admin('/api/admin/theme-audio',form(initial,[['Map.mid',midi()]]));
    assert.equal(uploaded.status,200);
    const mapId=uploaded.data.maps[0].id,track=uploaded.data.audio.playlist[0].midi;
    const selected=form(uploaded.data);selected.set('maps',JSON.stringify({[mapId]:track}));
    const saved=await admin('/api/admin/theme-audio',selected);
    assert.equal(saved.status,200,JSON.stringify(saved.data));
    assert.equal(saved.data.maps.find(map=>map.id===mapId).music,track);
    assert.equal((await admin('/api/config')).data.theme.world.maps.find(map=>map.id===mapId).music,track);
    const invalid=form(saved.data);invalid.set('maps',JSON.stringify({[mapId]:'/music/unknown.mid'}));
    assert.equal((await admin('/api/admin/theme-audio',invalid)).status,400);
    const removed=form(saved.data,[],[]);removed.set('maps',JSON.stringify({[mapId]:null}));
    const cleared=await admin('/api/admin/theme-audio',removed);
    assert.equal(cleared.status,200);
    assert.equal(cleared.data.maps.find(map=>map.id===mapId).music,null);
  } finally {s.sqlite.close();}
});
test('Sounds saves map music and effects together',async()=>{
  const s=setup();
  try {
    const admin=s.client();
    await admin('/api/auth',{username:'teacher',password:'teacher-password',mode:'login'});
    const initialAudio=(await admin('/api/admin/theme-audio')).data;
    const uploaded=await admin('/api/admin/theme-audio',form(initialAudio,[['Map.mid',midi()]]));
    assert.equal(uploaded.status,200);
    const track=uploaded.data.audio.playlist[0].midi;
    const initial=(await admin('/api/admin/theme-sounds')).data;
    const mapId=initial.maps[0].id;
    assert.equal(initial.tracks[0].midi,track);
    const saved=await admin('/api/admin/theme-sounds',{action:'assign',revision:initial.revision,maps:{},events:{},mapMusic:{[mapId]:track}});
    assert.equal(saved.status,200,JSON.stringify(saved.data));
    assert.equal(saved.data.maps.find(map=>map.id===mapId).music,track);
    assert.equal((await admin('/api/config')).data.theme.world.maps.find(map=>map.id===mapId).music,track);
    assert.equal((await admin('/api/admin/theme-sounds',{action:'assign',revision:saved.data.revision,maps:{},events:{},mapMusic:{[mapId]:'/missing.mid'}})).status,400);
    const cleared=await admin('/api/admin/theme-sounds',{action:'assign',revision:saved.data.revision,maps:{},events:{},mapMusic:{[mapId]:null}});
    assert.equal(cleared.status,200);
    assert.equal(cleared.data.maps.find(map=>map.id===mapId).music,null);
  } finally {s.sqlite.close();}
});
test('Media Library assigns map backgrounds without changing appearances',async()=>{
  const s=setup();
  try {
    const admin=s.client();
    await admin('/api/auth',{username:'teacher',password:'teacher-password',mode:'login'});
    const initial=(await admin('/api/admin/theme-media')).data;
    const map=initial.maps[0],src='/sprites/web.png';
    const saved=await admin('/api/admin/theme-media',{action:'backgrounds',revision:initial.revision,mapBackgrounds:{[map.id]:src}});
    assert.equal(saved.status,200,JSON.stringify(saved.data));
    assert.equal(saved.data.maps.find(item=>item.id===map.id).background,src);
    assert.equal(saved.data.maps.find(item=>item.id===map.id).originalBackground,map.background);
    assert.deepEqual(saved.data.characters,initial.characters);
    assert.equal((await admin('/api/admin/theme-media',{action:'backgrounds',revision:saved.data.revision,mapBackgrounds:{[map.id]:'/missing.png'}})).status,400);
    assert.equal((await admin('/api/admin/theme-media',{action:'backgrounds',revision:initial.revision,mapBackgrounds:{[map.id]:null}})).status,409);
    const restored=await admin('/api/admin/theme-media',{action:'backgrounds',revision:saved.data.revision,mapBackgrounds:{[map.id]:map.background}});
    assert.equal(restored.status,200);
    assert.equal(restored.data.maps.find(item=>item.id===map.id).background,map.background);
  } finally {s.sqlite.close();}
});
test('malformed, empty or foreign MIDI uploads leave theme unchanged',async()=>{const s=setup();try{const admin=s.client();await admin('/api/auth',{username:'teacher',password:'teacher-password',mode:'login'});const initial=(await admin('/api/admin/theme-audio')).data;for(const uploads of [[['bad.mid',new Uint8Array(20)]],[['wrong.txt',midi()]],[['empty.mid',new Midi().toArray()]],[['valid.mid',midi()],['bad.mid',new Uint8Array(20)]]]){assert.equal((await admin('/api/admin/theme-audio',form(initial,uploads))).status,400);assert.equal((await admin('/api/admin/theme-audio')).data.revision,0);}assert.equal((await admin('/api/admin/theme-audio',form(initial,[],[{name:'Forged',midi:'/elsewhere.mid'}]))).status,400);assert.equal(s.files.size,0);}finally{s.sqlite.close();}});

test('batch uploads skip repeated MIDI content and still save new tracks', async () => {
  const s = setup();
  try {
    const admin = s.client();
    await admin('/api/auth', {username:'teacher', password:'teacher-password', mode:'login'});
    const initial = (await admin('/api/admin/theme-audio')).data;
    const first = await admin('/api/admin/theme-audio', form(initial, [
      ['One.mid', midi(60)], ['Same song.midi', midi(60)], ['Two.mid', midi(65)],
    ]));
    assert.equal(first.status, 200, JSON.stringify(first.data));
    assert.equal(first.data.uploaded, 2);
    assert.deepEqual(first.data.skipped, ['Same song.midi']);
    assert.deepEqual(first.data.audio.playlist.map(t => t.name), ['One.mid', 'Two.mid']);
    const second = await admin('/api/admin/theme-audio', form(first.data, [
      ['Already saved.mid', midi(60)], ['Three.mid', midi(70)],
    ]));
    assert.equal(second.status, 200, JSON.stringify(second.data));
    assert.equal(second.data.uploaded, 1);
    assert.deepEqual(second.data.skipped, ['Already saved.mid']);
    assert.equal(second.data.audio.playlist.length, 3);
    assert.equal(s.files.size, 3);
    const repeat = await admin('/api/admin/theme-audio', form(second.data, [['Three again.mid', midi(70)]]));
    assert.equal(repeat.status, 200);
    assert.equal(repeat.data.uploaded, 0);
    assert.deepEqual(repeat.data.skipped, ['Three again.mid']);
    assert.equal(repeat.data.audio.playlist.length, 3);
    // A removed song can be added again; existing storage alone does not skip it.
    const readded = await admin('/api/admin/theme-audio', form(repeat.data, [['Renamed One.mid', midi(60)]], repeat.data.audio.playlist.slice(1)));
    assert.equal(readded.status, 200);
    assert.equal(readded.data.uploaded, 1);
    assert.deepEqual(readded.data.skipped, []);
    assert.equal(readded.data.audio.playlist.at(-1).name, 'Renamed One.mid');
  } finally { s.sqlite.close(); }
});

test('a duplicate in a batch does not count toward the saved playlist limit', async () => {
  const s = setup();
  try {
    const admin = s.client();
    await admin('/api/auth', {username:'teacher', password:'teacher-password', mode:'login'});
    const initial = (await admin('/api/admin/theme-audio')).data;
    const first = await admin('/api/admin/theme-audio', form(initial, Array.from({length:19}, (_, i) => [`Track ${i}.mid`, midi(40 + i)])));
    assert.equal(first.status, 200, JSON.stringify(first.data));
    const full = await admin('/api/admin/theme-audio', form(first.data, [['Repeat.mid', midi(40)], ['Last.mid', midi(80)]]));
    assert.equal(full.status, 200, JSON.stringify(full.data));
    assert.equal(full.data.audio.playlist.length, 20);
    assert.equal(full.data.uploaded, 1);
    assert.deepEqual(full.data.skipped, ['Repeat.mid']);
    const rejected = await admin('/api/admin/theme-audio', form(full.data, [['Over limit.mid', midi(81)]]));
    assert.equal(rejected.status, 400);
    assert.equal((await admin('/api/admin/theme-audio')).data.revision, full.data.revision);
    assert.equal(s.files.size, 20);
  } finally { s.sqlite.close(); }
});

test('MIDI validation errors identify the failing file without saving the batch', async () => {
  const s = setup();
  try {
    const admin = s.client();
    await admin('/api/auth', {username:'teacher', password:'teacher-password', mode:'login'});
    const initial = (await admin('/api/admin/theme-audio')).data;
    const rejected = await admin('/api/admin/theme-audio', form(initial, [['Good.mid', midi()], ['Broken.mid', new Uint8Array(20)]]));
    assert.equal(rejected.status, 400);
    assert.match(rejected.data.error, /Broken\.mid/);
    assert.equal((await admin('/api/admin/theme-audio')).data.revision, initial.revision);
    assert.equal(s.files.size, 0);
  } finally { s.sqlite.close(); }
});

test('batch uploads recognize an existing public MIDI by its content', async () => {
  const s = setup();
  try {
    const theme = defaultTheme(s.config);
    theme.audio = {...theme.audio, midi:'/audio/north-pole.mid', playlist:[]};
    await s.db.prepare("INSERT INTO theme_catalog(id,payload,revision) VALUES('active',?,1)").bind(JSON.stringify(theme)).run();
    const admin = s.client();
    await admin('/api/auth', {username:'teacher', password:'teacher-password', mode:'login'});
    const initial = (await admin('/api/admin/theme-audio')).data;
    const uploaded = await admin('/api/admin/theme-audio', form(initial, [
      ['Renamed existing.mid', new Uint8Array(readFileSync('public/audio/north-pole.mid'))],
      ['New song.mid', midi(72)],
    ]));
    assert.equal(uploaded.status, 200, JSON.stringify(uploaded.data));
    assert.equal(uploaded.data.uploaded, 1);
    assert.deepEqual(uploaded.data.skipped, ['Renamed existing.mid']);
    assert.equal(uploaded.data.audio.playlist.length, 2);
    assert.equal(uploaded.data.audio.playlist[0].midi, '/audio/north-pole.mid');
    assert.equal(s.files.size, 1);
  } finally { s.sqlite.close(); }
});
