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
import {musicTracks,shuffledTracks} from '../lib/midi-playlist.mjs';
import {createSnapshot,validateSnapshot} from '../server/backup.mjs';
function midi(pitch=60){const m=new Midi();m.addTrack().addNote({midi:pitch,time:0,duration:.3,velocity:.8});return m.toArray();}
function setup(){const sqlite=new DatabaseSync(':memory:');initializeSchema(sqlite);const db=createSQLiteAdapter(sqlite);const config=parseGame('characters:\n - id: web\n   name: Web\naccounts:\n allowRegistration: true\n users:\n  - username: teacher\n    password: teacher-password\n    role: admin\n    hero: web');const challenges=parseChallenges(readFileSync('content/challenges.yaml','utf8'));const files=new Map();const api=createApi({db,config,challenges,assetStore:{async get(k){return files.get(k)||null},async put(k,v){files.set(k,v)}},readBaseAsset:p=>new Uint8Array(readFileSync('public'+p))});function client(){let cookie='';return async(path,body)=>{const r=await api(new Request('http://quest.test'+path,{method:body?'POST':'GET',headers:{Origin:'http://quest.test',Cookie:cookie,...(body&&!(body instanceof FormData)?{'Content-Type':'application/json'}:{})},body:body instanceof FormData?body:body?JSON.stringify(body):undefined}));if(r.headers.has('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return {status:r.status,data:r.headers.get('content-type')?.includes('json')?await r.json():null,r};};}return{sqlite,db,config,challenges,files,client};}
function form(state,files=[],playlist=state.audio.playlist){const f=new FormData();f.set('revision',String(state.revision));f.set('playlist',JSON.stringify(playlist));f.set('volume','.2');f.set('loop','true');for(const [name,bytes] of files)f.append('files',new File([bytes],name));return f;}
test('shuffle visits each track once and avoids round-boundary repeats; single-file YAML remains compatible',()=>{const tracks=[{name:'A',midi:'/a.mid'},{name:'B',midi:'/b.mid'},{name:'C',midi:'/c.mid'}];const queue=shuffledTracks(tracks,'/b.mid',()=>.5);assert.equal(new Set(queue.map(t=>t.midi)).size,3);assert.notEqual(queue[0].midi,'/b.mid');assert.deepEqual(tracks.map(t=>t.name),['A','B','C']);assert.deepEqual(musicTracks({midi:'/single.mid'}),[{name:'single.mid',midi:'/single.mid'}]);assert.deepEqual(musicTracks({midi:'/single.mid',playlist:tracks}),tracks);const config=parseGame('characters:\n - id: web\n   name: Web\naudio:\n midi: null\n playlist:\n  - name: Example\n    midi: /example.mid');assert.equal(defaultTheme(config).audio.playlist.length,1);});
test('admin audio uploads multiple MIDI files, preserves world/content, denies students, protects revisions and exports all tracks',async()=>{const s=setup();try{const admin=s.client(),student=s.client();await admin('/api/auth',{username:'teacher',password:'teacher-password',mode:'login'});await student('/api/auth',{username:'alice',password:'student-password',hero:'web',mode:'register'});assert.equal((await student('/api/admin/theme-audio')).status,403);const initial=(await admin('/api/admin/theme-audio')).data;assert.equal(initial.audio.playlist.length,0);const uploaded=await admin('/api/admin/theme-audio',form(initial,[['One.mid',midi()],['Two.midi',midi(65)]]));assert.equal(uploaded.status,200,JSON.stringify(uploaded.data));const state=uploaded.data;assert.equal(state.audio.playlist.length,2);assert.equal((await admin('/api/admin/theme-audio',form(initial))).status,409);const pack=(await admin('/api/admin/packs')).data;assert.deepEqual(pack.theme.world,defaultTheme(s.config).world);assert.equal(pack.contentRevision,0);assert.equal((await admin('/api/config')).data.audio.playlist.length,2);for(const t of state.audio.playlist)assert.equal((await student(t.midi)).status,200);const response=await admin('/api/admin/packs?kind=theme');assert.equal(response.status,200);const zipped=unzipSync(new Uint8Array(await response.r.arrayBuffer()));for(const t of state.audio.playlist)assert.ok(zipped['assets'+t.midi]);const snapshot=await createSnapshot({db:s.db,config:s.config,challenges:s.challenges});assert.equal(validateSnapshot(snapshot).theme.audio.playlist.length,2);const mapped=mapThemeAssets(pack.theme,p=>p.startsWith('/api/assets/')?'/new/'+p.split('/').pop():p);assert.ok(mapped.audio.playlist.every(t=>t.midi.startsWith('/new/')));assert.equal(themeAssetPaths(parseTheme(mapped)).filter(p=>p.startsWith('/new/')).length,2);const removed=await admin('/api/admin/theme-audio',form(state,[],[state.audio.playlist[1]]));assert.equal(removed.data.audio.playlist.length,1);assert.equal((await admin('/api/admin/theme-audio',form(removed.data,[],[]))).data.audio.playlist.length,0);}finally{s.sqlite.close();}});
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
