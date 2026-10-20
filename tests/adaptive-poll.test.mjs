import test from 'node:test';
import assert from 'node:assert/strict';
import {startPolling} from '../lib/adaptive-poll.mjs';

function fixture(task,options={}) {
  let now=0,id=0;const timers=new Map(),document=new EventTarget();document.hidden=false;
  const poller=startPolling(task,{interval:100,timeout:1000,random:()=>0,document,setTimeout:(run,delay)=>{timers.set(++id,{run,at:now+delay});return id;},clearTimeout:id=>timers.delete(id),...options});
  async function tick(ms=0){const end=now+ms;for(let limit=0;limit<100;limit++){const next=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;now=next[1].at;timers.delete(next[0]);next[1].run();for(let i=0;i<10;i++)await Promise.resolve();}now=end;}
  const visible=value=>{document.hidden=!value;document.dispatchEvent(new Event('visibilitychange'));};
  return {poller,tick,visible,timers};
}

test('polling serializes slow requests and queued refreshes; stop aborts and removes future work',async()=>{
  const requests=[];let finish;
  const f=fixture(signal=>{requests.push(signal);return new Promise(resolve=>{finish=resolve;});});
  await f.tick();assert.equal(requests.length,1);
  f.poller.refresh();f.poller.refresh();await f.tick(500);assert.equal(requests.length,1);
  finish();await f.tick();await f.tick();assert.equal(requests.length,2);
  f.poller.stop();assert.equal(requests[1].aborted,true);finish();await f.tick(10000);assert.equal(requests.length,2);assert.equal(f.timers.size,0);
});

test('hidden tabs abort the active request, pause traffic, and resume immediately on visibility',async()=>{
  let requests=0,hidden=0;
  const f=fixture(signal=>{requests++;return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true}));},{onHidden:()=>hidden++});
  await f.tick();f.visible(false);await f.tick(5000);assert.equal(requests,1);assert.equal(hidden,1);assert.equal(f.timers.size,0);
  f.visible(true);await f.tick();assert.equal(requests,2);f.poller.stop();await f.tick();
});

test('polling backs off on failures, caps retries, and resets the delay after recovery',async()=>{
  let requests=0,errors=0,fail=true;
  const f=fixture(async()=>{requests++;if(fail)throw Error('offline');},{maxDelay:400,onError:()=>errors++});
  await f.tick();assert.equal(requests,1);await f.tick(199);assert.equal(requests,1);await f.tick(1);assert.equal(requests,2);
  await f.tick(400);assert.equal(requests,3);assert.equal(errors,3);
  fail=false;await f.tick(400);assert.equal(requests,4);await f.tick(100);assert.equal(requests,5);f.poller.stop();
});

test('request deadlines abort hung fetches and hidden tabs do not start initial requests',async()=>{
  let aborted=false,requests=0;
  const f=fixture(signal=>{requests++;return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(Error('timeout'));},{once:true}));});
  f.visible(false);await f.tick(2000);assert.equal(requests,0);
  f.visible(true);await f.tick();await f.tick(1000);assert.equal(aborted,true);assert.equal(requests,1);f.poller.stop();
});
