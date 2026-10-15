// CTF-RPG — Copyright (c) 2026 Jaime C Acosta
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import ts from 'typescript';
import midiPackage from '@tonejs/midi';
const module = {exports:{}};
const code = ts.transpileModule(readFileSync('lib/midi-player.ts','utf8'), {
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;
new Function('require','module','exports',code)(createRequire(resolve('lib/midi-player.ts')),module,module.exports);
const {MidiPlayer}=module.exports;
function fixture(initialState='suspended') {
  const originals={AudioContext:globalThis.AudioContext,fetch:globalThis.fetch,setInterval:globalThis.setInterval,clearInterval:globalThis.clearInterval};
  const contexts=[],timers=new Map(),fetchPaths=[];let fetches=0,started=0;
  const gain=()=>({gain:{value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}});
  class AudioContext {
    constructor(){this.state=initialState;this.currentTime=0;this.destination={};this.resumes=0;this.suspends=0;this.closes=0;contexts.push(this);}
    createGain(){return gain();}
    createOscillator(){return{frequency:{value:0},connect(){},disconnect(){},start(){started++;},stop(){}};}
    async resume(){this.resumes++;this.state='running';}
    async suspend(){this.suspends++;this.state='suspended';}
    async close(){this.closes++;this.state='closed';}
  }
  const midi=new midiPackage.Midi();midi.addTrack().addNote({midi:60,time:0,duration:.3,velocity:.8});
  globalThis.AudioContext=AudioContext;
  globalThis.fetch=async(path)=>{fetches++;fetchPaths.push(path);return{ok:true,arrayBuffer:async()=>midi.toArray().buffer};};
  globalThis.setInterval=callback=>{const id={};timers.set(id,callback);return id;};
  globalThis.clearInterval=id=>timers.delete(id);
  return {contexts,fetchPaths,get fetches(){return fetches;},get started(){return started;},tick(){for(const callback of timers.values())callback();},restore(){Object.assign(globalThis,originals);}};
}
const config={midi:'/audio/test.mid',loop:true,volume:.15};
test('blocked autoplay waits for interaction without requesting resume or loading a track; play unlocks audio',async()=>{
  const f=fixture();let player;
  try {
    player=new MidiPlayer(config);await player.playIfAllowed();
    assert.equal(f.contexts[0].resumes,0);assert.equal(f.fetches,0);assert.equal(f.started,0);
    await player.play();f.tick();assert.equal(f.contexts[0].resumes,1);assert.equal(f.fetches,1);assert.equal(f.started,1);
    await player.mute();assert.equal(f.contexts[0].state,'suspended');
    await player.playIfAllowed();assert.equal(f.contexts[0].state,'running');assert.equal(f.fetches,1,'cutscene resume keeps the current track');
    player.dispose();await player.playIfAllowed();await player.play();assert.equal(f.contexts[0].state,'closed');assert.equal(f.contexts[0].resumes,2,'disposed players do not reactivate');
    player.dispose();assert.equal(f.contexts[0].closes,1,'cleanup closes the context only once');
  } finally {player?.dispose();f.restore();}
});
test('permitted autoplay loads music immediately; suspend stops scheduling and explicit unmute resumes without reloading',async()=>{
  const f=fixture('running');let player;
  try {
    player=new MidiPlayer(config);await player.playIfAllowed();f.tick();
    assert.equal(f.contexts[0].resumes,0);assert.equal(f.fetches,1);assert.equal(f.started,1);
    await player.mute();f.contexts[0].currentTime=1;f.tick();assert.equal(f.fetches,1,'muted playback cannot advance its playlist');
    await player.play();assert.equal(f.contexts[0].state,'running');assert.equal(f.fetches,1);
  } finally {player?.dispose();f.restore();}
});
test('map track selection keeps the same track playing and switches only for a different choice',async()=>{
  const f=fixture();let player;
  try {
    player=new MidiPlayer({...config,playlist:[{name:'First',midi:'/audio/test.mid'},{name:'Other',midi:'/audio/other.mid'}]});
    await player.selectTrack('/audio/test.mid');
    await player.play();
    assert.deepEqual(f.fetchPaths,['/audio/test.mid']);
    const started=f.started;
    await player.selectTrack('/audio/test.mid');
    assert.equal(f.fetches,1);
    assert.equal(f.started,started);
    await player.selectTrack('/audio/other.mid');
    assert.deepEqual(f.fetchPaths,['/audio/test.mid','/audio/other.mid']);
    await player.selectTrack('/audio/other.mid');
    assert.equal(f.fetches,2);
    await player.mute();
    await player.selectTrack('/audio/test.mid');
    assert.equal(f.fetches,2,'muted transitions wait until playback resumes');
    await player.play();
    assert.deepEqual(f.fetchPaths,['/audio/test.mid','/audio/other.mid','/audio/test.mid']);
  } finally {player?.dispose();f.restore();}
});
