// Copyright Jaime C Acosta 2026
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stringify} from 'yaml';
import {parseChallenges} from '../lib/config-schema.mjs';
import {BOSS_STYLES,challengeTiles,challengeDistance,challengeBounds,drawChallengeFootprint,drawBossIcon} from '../lib/challenge-icon.mjs';
import {challengeLocationAvailable} from '../lib/challenge-placement.mjs';
const boss={id:'boss',map:'town',object:'Boss',region:'Arena',location:{x:4,y:4},text:'Answer',flags:['yes'],points:100,icon:'boss',iconSize:3};
test('resizing and moving a boss keeps its sprite and selection aligned to every allocated tile',()=>{
 const image={naturalWidth:96};
 for(const size of [1,3,2,1]) {
  const challenge={...boss,iconSize:size};
  for(const location of [boss.location,{x:9,y:12}]) {
   const bounds=challengeBounds(challenge,24,location),tiles=challengeTiles(challenge,location),sprite=[],fill=[],outline=[];
   drawBossIcon({save(){},restore(){},drawImage(...args){sprite.push(args)}},bounds.left,bounds.top,bounds.width,'classic',image);
   drawChallengeFootprint({fillRect(...args){fill.push(args)},strokeRect(...args){outline.push(args)}},challenge,24,location);
   const left=Math.min(...tiles.map(t=>t.x))*24,top=Math.min(...tiles.map(t=>t.y))*24;
   const right=(Math.max(...tiles.map(t=>t.x))+1)*24,bottom=(Math.max(...tiles.map(t=>t.y))+1)*24;
   assert.deepEqual(sprite,[[image,left,top,right-left,bottom-top]]);
   assert.deepEqual(fill,[[left,top,right-left,bottom-top]]);
   assert.deepEqual(outline,[[left+1,top+1,right-left-2,bottom-top-2]]);
  }
 }
 const star={...boss,icon:'star'};assert.equal(challengeBounds(star,24).width,24);
});
test('challenge icons default to the star and roundtrip boss sizes; footprints reject edges and overlaps',()=>{
 for(const size of [1,2,3]) { const [c]=parseChallenges(stringify({challenges:[{...boss,iconSize:size}]}));assert.equal(c.iconSize,size);assert.equal(challengeTiles(c).length,size*size); }
 const star={...boss};delete star.icon;delete star.iconSize;assert.equal(parseChallenges(stringify({challenges:[star]}))[0].icon,'star');
 assert.throws(()=>parseChallenges(stringify({challenges:[{...boss,location:{x:39,y:4}}]})),/outside/);
 assert.throws(()=>parseChallenges(stringify({challenges:[boss,{...star,id:'other',location:{x:6,y:6}}]})),/Duplicate/);
 assert.equal(challengeDistance(boss,{x:7,y:6}),1);
});
test('boss placement validates every tile, other footprints, and characters',()=>{
 const world={world:{entities:[]},canPlaceChallenge:(_m,x,y)=>x>=0&&x<10&&y>=0&&y<10&&!(x===6&&y===6)};
 assert.equal(challengeLocationAvailable(world,[],'town',4,4,'boss',boss),false);
 assert.equal(challengeLocationAvailable(world,[],'town',1,1,'boss',boss),true);
 assert.equal(challengeLocationAvailable(world,[{...boss,location:{x:1,y:1}}],'town',3,3,'other'),false);
 world.world.entities=[{map:'town',location:{x:3,y:3}}];assert.equal(challengeLocationAvailable(world,[],'town',1,1,'boss',boss),false);
});
test('boss appearances roundtrip and draw distinct icons',()=>{
 const drawings=new Set();
 for(const style of BOSS_STYLES){
  assert.ok(readFileSync('public'+style.sprite).length,style.id);
  const [parsed]=parseChallenges(stringify({challenges:[{...boss,bossStyle:style.id}]}));
  assert.equal(parsed.bossStyle,style.id);
  const pixels=[];
  drawBossIcon({fillStyle:'',fillRect(...args){pixels.push([this.fillStyle,...args])}},0,0,16,style.id);
  drawings.add(JSON.stringify(pixels));
 }
 assert.equal(drawings.size,6);
 assert.throws(()=>parseChallenges(stringify({challenges:[{...boss,bossStyle:'unknown'}]})));
 const calls=[],image={naturalWidth:96};
 drawBossIcon({save(){},restore(){},drawImage(...args){calls.push(args)},imageSmoothingEnabled:true},0,0,48,'classic',image);
 assert.deepEqual(calls,[[image,0,0,48,48]]);
});
