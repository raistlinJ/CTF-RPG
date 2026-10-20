import test from 'node:test';
import assert from 'node:assert/strict';
import {createAuthRateLimiter} from '../server/auth-rate-limit.mjs';

test('classmates on a shared IP get separate account budgets while repeated attempts and aggregate floods remain limited',()=>{
  let now=0;const limits=createAuthRateLimiter({clock:()=>now});
  for(let i=0;i<250;i++){assert.equal(limits.address('shared-ip'),false);assert.equal(limits.account('shared-ip','student'+i),false);}
  for(let i=1;i<20;i++)assert.equal(limits.account('shared-ip','student0'),false);
  assert.equal(limits.account('shared-ip','STUDENT0'),true);assert.equal(limits.account('shared-ip','student1'),false);
  for(let i=250;i<500;i++)assert.equal(limits.address('shared-ip'),false);
  assert.equal(limits.address('shared-ip'),true);assert.equal(limits.address('another-ip'),false);
  now=60000;assert.equal(limits.address('shared-ip'),false);assert.equal(limits.account('shared-ip','student0'),false);
});

test('limiter bounds stored keys, expires old buckets, and ignores invalid account labels',()=>{
  let now=0;const limits=createAuthRateLimiter({clock:()=>now,maxEntries:2,ipLimit:1,accountLimit:1});
  assert.equal(limits.address('one'),false);assert.equal(limits.address('two'),false);assert.equal(limits.address('three'),false);
  assert.equal(limits.address('one'),false);assert.equal(limits.address('one'),true);
  assert.equal(limits.account('one',{}),false);assert.equal(limits.account('one','bad name'),false);
  assert.equal(limits.account('one','alice'),false);assert.equal(limits.account('one','ALICE'),true);
  now=60001;assert.equal(limits.account('one','alice'),false);
});
