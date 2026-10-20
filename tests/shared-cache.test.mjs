import test from 'node:test';
import assert from 'node:assert/strict';
import {sharedAggregate,invalidateSharedCache} from '../server/shared-cache.mjs';

test('shared aggregates coalesce concurrent reads, isolate databases, and do not repopulate stale results after invalidation',async()=>{
  const db={},other={};let loads=0,finish;
  const loader=()=>{loads++;return new Promise(resolve=>{finish=resolve;});};
  const first=sharedAggregate(db,'scores',loader),second=sharedAggregate(db,'scores',loader);await Promise.resolve();assert.equal(loads,1);
  assert.equal(await sharedAggregate(other,'scores',()=>99),99);
  invalidateSharedCache(db);assert.equal(await sharedAggregate(db,'scores',()=>42),42);
  finish(10);assert.deepEqual(await Promise.all([first,second]),[10,10]);assert.equal(await sharedAggregate(db,'scores',()=>0),42);
});

test('expired entries refresh, failures can retry, and many aggregate keys cannot grow the cache without bound',async()=>{
  const db={};assert.equal(await sharedAggregate(db,'key',()=>1,0),1);assert.equal(await sharedAggregate(db,'key',()=>2),2);
  await assert.rejects(sharedAggregate(db,'failure',()=>{throw Error('offline');}),/offline/);assert.equal(await sharedAggregate(db,'failure',()=>3),3);
  for(let i=0;i<130;i++)await sharedAggregate(db,'team-'+i,()=>i);
  assert.equal(await sharedAggregate(db,'key',()=>4),4);
});
