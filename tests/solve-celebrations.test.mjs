import test from "node:test";
import assert from "node:assert/strict";
import { solveCelebrationProgress, advanceSolveCelebrations, celebrationLandmark } from "../lib/solve-celebrations.mjs";

const challenge = (id, dependsOn = [], extra = {}) => ({ id, object: `Challenge ${id}`, map:"town", location:{x:12,y:15}, dependsOn, ...extra });
const linear = length => Array.from({length},(_,i)=>challenge(`step-${i+1}`,i?[`step-${i}`]:[]));
const progress = (catalog, solved, scope="alice:alpha", complete=false, entities=[]) => solveCelebrationProgress(catalog,entities,solved,scope,complete);
const baseline = snapshot => advanceSolveCelebrations(null,snapshot).state;

test("chain size counts unique prerequisite challenges across branches and NPC dialogue paths", () => {
  const catalog=[challenge("first"),challenge("left",["first"]),challenge("right",["first"]),challenge("boss",["left","right"],{icon:"boss"})];
  const snapshot=progress(catalog,catalog.map(c=>c.id));
  assert.equal(snapshot.completed.find(c=>c.id==="boss").chainLength,4,"a shared ancestor counts once");
  assert.equal(snapshot.completed.find(c=>c.id==="boss").chainComplete,true);
  assert.equal(snapshot.completed.find(c=>c.id==="left").chainComplete,false);
  assert.equal(progress(catalog,["boss"]).completed[0].chainLength,1,"an admin bypass cannot claim an unsolved prerequisite chain");
  const entities=[{id:"guide",dependsOn:["first"],nodes:[{id:"done",choices:[]}]}];
  const routed=[challenge("first"),challenge("after-npc",["npe:guide:done"])];
  assert.equal(progress(routed,["first","after-npc"],"alice:alpha",false,entities).completed[1].chainLength,2);
  assert.equal(progress(routed,["first"],"alice:alpha",false,entities).completed[0].chainComplete,false);
  const restricted=solveCelebrationProgress(catalog,[],catalog.map(c=>c.id),"alice:alpha",false,["first"]);
  assert.deepEqual(restricted.completed.map(c=>c.id),["first"],"hidden challenge titles and identifiers are not exposed");
});

test("new solves escalate from small celebrations to bosses and longer chain finales", () => {
  const catalog=linear(8);
  const start=baseline(progress(catalog,[]));
  const first=advanceSolveCelebrations(start,progress(catalog,["step-1"]));
  assert.equal(first.celebration.tier,1);
  assert.equal(first.celebration.title,"Challenge solved!");
  const second=advanceSolveCelebrations(first.state,progress(catalog,["step-1","step-2"]));
  assert.equal(second.celebration.tier,2);
  assert.match(second.celebration.detail,/Chain progress: 2 challenges/);
  for (const length of [2,5,8]) {
    const chain=linear(length), before=chain.slice(0,-1).map(c=>c.id);
    const result=advanceSolveCelebrations(baseline(progress(chain,before)),progress(chain,chain.map(c=>c.id)));
    assert.equal(result.celebration.tier,length===2?2:length===5?4:5);
    assert.match(result.celebration.detail,new RegExp(`${length}-challenge chain complete`));
  }
  const boss=challenge("boss",[],{icon:"boss"});
  const result=advanceSolveCelebrations(baseline(progress([boss],[])),progress([boss],["boss"]));
  assert.equal(result.celebration.title,"Boss defeated!"); assert.equal(result.celebration.tier,3);
  const bossChain=linear(5); bossChain[4].icon="boss";
  const finale=advanceSolveCelebrations(baseline(progress(bossChain,bossChain.slice(0,4).map(c=>c.id))),progress(bossChain,bossChain.map(c=>c.id)));
  assert.equal(finale.celebration.boss,true);assert.equal(finale.celebration.tier,4);assert.match(finale.celebration.detail,/5-challenge chain complete/);
});

test("history, repeated solves, regrades and team changes do not replay celebrations", () => {
  const catalog=linear(3), solved=catalog.map(c=>c.id);
  const loaded=advanceSolveCelebrations(null,progress(catalog,solved));
  assert.equal(loaded.celebration,null);
  assert.equal(advanceSolveCelebrations(loaded.state,progress(catalog,solved)).celebration,null);
  const removed=advanceSolveCelebrations(loaded.state,progress(catalog,[]));
  assert.equal(advanceSolveCelebrations(removed.state,progress(catalog,solved)).celebration,null);
  assert.equal(advanceSolveCelebrations(loaded.state,progress(catalog,solved,"alice:beta")).celebration,null);
  const initial=baseline(progress(catalog,[]));
  assert.equal(advanceSolveCelebrations(initial,progress(catalog,[])).celebration,null,"pending written submissions are not completions");
  const graded=advanceSolveCelebrations(initial,progress(catalog,["step-1"]));
  assert.equal(graded.celebration.title,"Challenge solved!");
  assert.equal(advanceSolveCelebrations(graded.state,progress(catalog,["step-1"])).celebration,null,"zero-point solves and regrading use the completion ID rather than points");
});

test("milestones celebrate each five team completions and the expedition finale once", () => {
  const catalog=Array.from({length:11},(_,i)=>challenge(`c-${i}`));
  const four=catalog.slice(0,4).map(c=>c.id), five=catalog.slice(0,5).map(c=>c.id);
  const fifth=advanceSolveCelebrations(baseline(progress(catalog,four)),progress(catalog,five));
  assert.equal(fifth.celebration.milestone,5);assert.equal(fifth.celebration.tier,3);
  const ten=advanceSolveCelebrations(fifth.state,progress(catalog,catalog.slice(0,10).map(c=>c.id)));
  assert.equal(ten.celebration.milestone,10);
  const final=advanceSolveCelebrations(ten.state,progress(catalog,catalog.map(c=>c.id),"alice:alpha",true));
  assert.equal(final.celebration.title,"Expedition complete!");assert.equal(final.celebration.tier,5);
  assert.equal(advanceSolveCelebrations(final.state,progress(catalog,catalog.map(c=>c.id),"alice:alpha",true)).celebration,null);
});

test("landmark lighting uses the matching themed building, then the largest landmark or room spawn", () => {
  const world={startMap:"outside",buildings:[{id:"workshop",x:3,y:4,w:4,h:3},{id:"castle",x:20,y:5,w:8,h:6}],maps:[{id:"outside",spawn:{x:18,y:20}},{id:"workshop",spawn:{x:10,y:16}}]};
  assert.deepEqual(celebrationLandmark(world,"outside",{map:"workshop"}),{x:5,y:5.5,w:4,h:3});
  assert.deepEqual(celebrationLandmark(world,"outside",{map:"outside"}),{x:24,y:8,w:8,h:6});
  assert.deepEqual(celebrationLandmark(world,"workshop",{map:"workshop"}),{x:10,y:16,w:5,h:5});
});
