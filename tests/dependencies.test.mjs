import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, mkdtempSync, writeFileSync, cpSync, symlinkSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { stringify } from "yaml";
import { unzipSync, strFromU8, zipSync, strToU8 } from "fflate";
import { parseGame, parseChallenges } from "../lib/config-schema.mjs";
import { initializeSchema, createSQLiteAdapter } from "../server/sqlite.mjs";
import { createApi } from "../server/api.mjs";
import { createSnapshot, validateSnapshot } from "../server/backup.mjs";
const baseline = parseChallenges(readFileSync("content/challenges.yaml", "utf8"));
const ids = ["root-a","root-b","branch","leaf","written","written-child"];
const definitions = baseline.slice(0,ids.length).map((c,i) => ({
  ...c, id: ids[i], object: `Question ${ids[i]}`, text: `PRIVATE QUESTION ${ids[i]}`,
  flags: i === 4 ? [] : [`FLAG_${ids[i]}`], grading: i === 4 ? "manual" : "automatic",
  hints: [{id:"clue",text:`PRIVATE HINT ${ids[i]}`,cost:10}], downloads: [],
  dependsOn: [], visibility: "visible",
}));
function setup(dependencies = {}, platformAdmin = false) {
  const sqlite = new DatabaseSync(":memory:"); initializeSchema(sqlite);
  const base = createSQLiteAdapter(sqlite);
  let hook;
  const db = {
    ...base,
    prepare(sql) {
      const statement = base.prepare(sql);
      return { bind(...args) {
        const bound = statement.bind(...args);
        return { ...bound, _sql: sql, async run() { if (hook?.match(sql)) { const h = hook; hook = null; h.run(); } return bound.run(); } };
      } };
    },
    async batch(statements) { if (hook && statements.some((s) => hook.match(s._sql || ""))) { const h = hook; hook = null; h.run(); } return base.batch(statements); },
  };
  const config = parseGame("characters:\n - id: web\n   name: Web\naccounts:\n allowRegistration: true\n users:\n  - username: teacher\n    password: teacher-password\n    role: admin\n    hero: web"),
    challenges = parseChallenges(stringify({ challenges: definitions.map((c) => ({ ...c, dependsOn: dependencies[c.id] || [] })) })),
    api = createApi({ db, config, challenges, platformAdmin });
  function client() {
    let cookie = "";
    return async (path,body,method = body ? "POST" : "GET") => {
      const r = await api(new Request("http://quest.test" + path, {method,headers:{Origin:"http://quest.test",Cookie:cookie,...(body instanceof FormData ? {} : {"Content-Type":"application/json"})},body:body instanceof FormData ? body : body ? JSON.stringify(body) : undefined}));
      if (r.headers.has("set-cookie")) cookie = r.headers.get("set-cookie").split(";")[0];
      const type = r.headers.get("content-type") || "";
      return { status:r.status, data:type.includes("json") ? await r.json() : type.includes("zip") ? new Uint8Array(await r.arrayBuffer()) : await r.text() };
    };
  }
  return {sqlite,db,config,challenges,client,beforeWrite(match,run) { hook = {match,run}; }};
}
async function login(call,username="teacher") {
  assert.equal((await call("/api/auth",{username,password:username === "teacher" ? "teacher-password" : "student-password",hero:"web",mode:username === "teacher" ? "login" : "register"})).status,200);
}
const position = { map:"town",x:18,y:20,themeRevision:0 };
const visibleIds = (r) => r.data.challenges.map((c) => c.id);
function graphBody(catalog, overrides = {}) {
  return { revision:catalog.revision,themeRevision:catalog.themeRevision,dependencies:catalog.challenges.map((c)=>({id:c.id,dependsOn:overrides[c.id] || c.dependsOn})) };
}
test("YAML validates prerequisite IDs, self-links, duplicates and long cycles, with legacy definitions defaulting to no dependencies", () => {
  assert.deepEqual(baseline[0].dependsOn,[]);
  const parse = (deps) => parseChallenges(stringify({challenges:definitions.map((c)=>({...c,dependsOn:deps[c.id] || []}))}));
  assert.deepEqual(parse({branch:["root-a","root-b"],leaf:["branch"]})[2].dependsOn,["root-a","root-b"]);
  for (const deps of [{branch:["missing"]},{branch:["branch"]},{branch:["root-a","root-a"]},{"root-a":["leaf"],branch:["root-a"],leaf:["branch"]}]) assert.throws(()=>parse(deps));
});
test("all prerequisites gate private questions, map feeds, discovery, hints and answers per player; admin previews bypass locks", async () => {
  const {sqlite,client}=setup({branch:["root-a","root-b"],leaf:["branch"]});
  try {
    const admin=client(),a=client(),b=client(); await login(admin); await login(a,"alice"); await login(b,"bobby");
    const team=(await a("/api/teams",{mode:"create",name:"Class",password:"team-password"})).data.team;
    await b("/api/teams",{mode:"join",id:team.id,password:"team-password"});
    let game=await a("/api/game"); assert.ok(!visibleIds(game).includes("branch")); assert.ok(!JSON.stringify(game.data).includes("PRIVATE QUESTION branch")); assert.ok(!JSON.stringify(game.data).includes("PRIVATE HINT branch"));
    const feed=await a("/api/presence",position); assert.ok(!feed.data.challengeSolves.some((c)=>["branch","leaf"].includes(c.id)));
    assert.equal(visibleIds(await admin("/api/game")).length,definitions.length);
    for (const body of [{id:"branch",action:"discover"},{id:"branch",action:"hint",hintId:"clue"},{id:"branch",answer:"FLAG_branch"},{id:"branch",answer:"wrong"}]) assert.equal((await a("/api/game",body)).status,400);
    for (const table of ["discovered_challenges","purchased_hints","answer_attempts","solved"]) assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n,0);
    assert.equal((await a("/api/game",{id:"root-a",answer:"wrong"})).data.correct,false);
    assert.ok(!visibleIds(await a("/api/game")).includes("branch"));
    game=await a("/api/game",{id:"root-a",answer:"FLAG_root-a"}); assert.ok(!visibleIds(game).includes("branch"));
    game=await a("/api/game",{id:"root-b",answer:"FLAG_root-b"}); assert.ok(visibleIds(game).includes("branch")); assert.ok(!visibleIds(game).includes("leaf"));
    assert.ok(!visibleIds(await b("/api/game")).includes("branch"),"a teammate's progress does not bypass prerequisites");
    assert.equal((await a("/api/game",{id:"branch",action:"discover"})).status,200);
    assert.equal((await a("/api/game",{id:"branch",action:"hint",hintId:"clue"})).data.challenges.find((c)=>c.id==="branch").hints[0].text,"PRIVATE HINT branch");
    game=await a("/api/game",{id:"branch",answer:"FLAG_branch"}); assert.ok(visibleIds(game).includes("leaf"));
    const own=await a("/api/presence",position); assert.ok(own.data.challengeSolves.some((c)=>c.id==="leaf")); assert.notEqual(own.data.gameRevision,feed.data.gameRevision);
    // A saved graph can add a prerequisite without hiding an already completed challenge.
    const catalog=(await admin("/api/admin/challenge-dependencies")).data;
    assert.equal((await admin("/api/admin/challenge-dependencies",graphBody(catalog,{branch:["written"]}))).status,200);
    assert.ok(visibleIds(await a("/api/game")).includes("branch"));
    const full=(await admin("/api/admin/challenges")).data,branch=full.challenges.find((c)=>c.id==="branch");
    assert.equal((await admin("/api/admin/challenges",{revision:full.revision,editingId:branch.id,challenge:{...branch,visibility:"hidden"}})).status,200);
    assert.ok(!visibleIds(await a("/api/game")).includes("branch"),"individual visibility still applies to completed challenges");
  } finally {sqlite.close();}
});
test("manual prerequisites unlock only after grading and their completion reaches the live game revision", async () => {
  const {sqlite,client}=setup({"written-child":["written"]});
  try {
    const admin=client(),a=client(); await login(admin); await login(a,"alice");
    await a("/api/teams",{mode:"create",name:"Class",password:"team-password"});
    const before=(await a("/api/presence",position)).data.gameRevision;
    assert.equal((await a("/api/game",{id:"written",answer:"My reasoning",revision:0})).status,200);
    assert.ok(!visibleIds(await a("/api/game")).includes("written-child"));
    assert.equal((await a("/api/game",{id:"written-child",answer:"FLAG_written-child"})).status,400);
    const response=(await admin("/api/admin/review")).data.responses[0];
    assert.equal((await admin("/api/admin/review",{user:response.user,challenge:response.challenge,revision:response.revision,grade:30,feedback:"Good work"})).status,200);
    assert.ok(visibleIds(await a("/api/game")).includes("written-child"));
    assert.notEqual((await a("/api/presence",position)).data.gameRevision,before);
  } finally {sqlite.close();}
});
test("graph editing is admin-only, validates complete acyclic graphs, and protects concurrent saves and normal editor changes", async () => {
  const {sqlite,client}=setup();
  try {
    const admin=client(),a=client(),guest=client();
    assert.equal((await guest("/api/admin/challenge-dependencies")).status,401);
    await login(admin); await login(a,"alice");
    assert.equal((await a("/api/admin/challenge-dependencies")).status,403);
    let catalog=(await admin("/api/admin/challenge-dependencies")).data;
    assert.ok(catalog.challenges[0].summary.startsWith("PRIVATE QUESTION")); assert.ok(!JSON.stringify(catalog).includes("FLAG_")); assert.ok(!JSON.stringify(catalog).includes("PRIVATE HINT"));
    const invalid=[graphBody(catalog,{branch:["missing"]}),graphBody(catalog,{branch:["branch"]}),graphBody(catalog,{branch:["root-a","root-a"]}),graphBody(catalog,{"root-a":["leaf"],branch:["root-a"],leaf:["branch"]}),{...graphBody(catalog),dependencies:[]}];
    for (const body of invalid) assert.equal((await admin("/api/admin/challenge-dependencies",body)).status,400);
    assert.equal((await admin("/api/admin/challenge-dependencies")).data.revision,0);
    const body=graphBody(catalog,{branch:["root-a"],leaf:["branch"]}),results=await Promise.all([admin("/api/admin/challenge-dependencies",body),admin("/api/admin/challenge-dependencies",body)]);
    assert.deepEqual(results.map((r)=>r.status).sort(),[200,409]);
    catalog=(await admin("/api/admin/challenge-dependencies")).data;
    assert.equal((await admin("/api/admin/challenge-dependencies",{...graphBody(catalog),themeRevision:99})).status,409);
    const editor=(await admin("/api/admin/challenges")).data,branch=editor.challenges.find((c)=>c.id==="branch");
    assert.equal((await admin("/api/admin/challenges",{revision:editor.revision,editingId:branch.id,challenge:{...branch,object:"Edited title"}})).status,200);
    const kept=(await admin("/api/admin/challenge-dependencies")).data.challenges.find((c)=>c.id==="branch"); assert.deepEqual(kept.dependsOn,["root-a"]); assert.equal(kept.object,"Edited title");
    assert.equal((await admin("/api/admin/challenge-dependencies",graphBody(catalog))).status,409);
  } finally {sqlite.close();}
  const trusted=setup({},true); try { assert.equal((await trusted.client()("/api/admin/challenge-dependencies")).status,200); } finally {trusted.sqlite.close();}
});
test("dependencies survive YAML, content packs and full backup restoration, while malformed import graphs are rejected", async () => {
  const {sqlite,db,config,challenges,client}=setup({branch:["root-a","root-b"],leaf:["branch"]});
  try {
    const admin=client();await login(admin);
    const yaml=(await admin("/api/admin/challenges?format=yaml")).data;
    assert.deepEqual(parseChallenges(yaml).find((c)=>c.id==="branch").dependsOn,["root-a","root-b"]);
    const pack=(await admin("/api/admin/packs?kind=content")).data;
    const manifest=strFromU8(unzipSync(pack)["content.yaml"]); assert.match(manifest,/dependsOn:/); assert.match(manifest,/root-a/);
    const packState=(await admin("/api/admin/packs")).data;
    const upload = (bytes) => { const form = new FormData(); form.set("file",new Blob([bytes]),"content.zip"); form.set("themeRevision",String(packState.themeRevision)); form.set("contentRevision",String(packState.contentRevision)); return form; };
    const invalidPack=zipSync({"content.yaml":strToU8(stringify({format:"quest-content",version:1,challenges:challenges.map((c)=>c.id==="root-a"?{...c,dependsOn:["leaf"]}:c)}))});
    assert.equal((await admin("/api/admin/packs?kind=content",upload(invalidPack))).status,400);
    assert.equal((await admin("/api/admin/packs?kind=content",upload(pack))).status,200);
    assert.deepEqual((await admin("/api/admin/challenge-dependencies")).data.challenges.find((c)=>c.id==="branch").dependsOn,["root-a","root-b"]);
    const snapshot=await createSnapshot({db,config,challenges}); assert.deepEqual(validateSnapshot(snapshot).challenges.find((c)=>c.id==="leaf").dependsOn,["branch"]);
    assert.throws(()=>validateSnapshot({...snapshot,challenges:snapshot.challenges.map((c)=>c.id==="root-a"?{...c,dependsOn:["leaf"]}:c)}));
    const folder=mkdtempSync(resolve(tmpdir(),"quest-dependencies-"));
    try {
      cpSync("server",resolve(folder,"server"),{recursive:true});cpSync("lib",resolve(folder,"lib"),{recursive:true});symlinkSync(resolve("node_modules"),resolve(folder,"node_modules"),"dir");
      const file=resolve(folder,"backup.json"),path=resolve(folder,"restored.sqlite");writeFileSync(file,JSON.stringify(snapshot));
      const result=spawnSync(process.execPath,[resolve(folder,"server/restore.mjs"),file],{env:{...process.env,DATABASE_PATH:path},encoding:"utf8"});assert.equal(result.status,0,result.stderr);
      const restored=new DatabaseSync(path);const defs=JSON.parse(restored.prepare("SELECT payload FROM challenge_catalog").get().payload);assert.deepEqual(defs.find((c)=>c.id==="branch").dependsOn,["root-a","root-b"]);restored.close();
    } finally {rmSync(folder,{recursive:true,force:true});}
  } finally {sqlite.close();}
});
test("a dependency graph changed mid-request prevents stale discoveries, hint charges, answers and awards", async () => {
  for (const [body,table,match] of [
    [{id:"branch",action:"discover"},"discovered_challenges",/INSERT OR IGNORE INTO discovered_challenges/],
    [{id:"branch",action:"hint",hintId:"clue"},"purchased_hints",/INSERT OR IGNORE INTO purchased_hints/],
    [{id:"branch",answer:"wrong"},"answer_attempts",/INSERT INTO answer_attempts/],
    [{id:"branch",answer:"FLAG_branch"},"solved",/INSERT INTO answer_attempts/],
    [{id:"written",answer:"My reasoning",revision:0},"written_responses",/INSERT INTO written_responses/],
  ]) {
    const {sqlite,client,challenges,beforeWrite}=setup();
    try {
      const a=client();await login(a,"alice");
      beforeWrite((sql)=>match.test(sql),()=>sqlite.prepare("INSERT INTO challenge_catalog(id,payload,revision) VALUES('active',?,1)").run(JSON.stringify(challenges.map((c)=>c.id===body.id?{...c,dependsOn:["root-a"]}:c))));
      assert.equal((await a("/api/game",body)).status,409,body.action || body.answer);
      assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n,0);
      assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM answer_attempts").get().n,0);
    } finally {sqlite.close();}
  }
});

test("challenge info provides a bounded text preview and metadata only to admins", async () => {
  const {sqlite,client}=setup();
  try {
    const admin=client(),student=client();await login(admin);await login(student,"alice");
    const current=(await admin("/api/admin/challenges")).data, original=current.challenges[0];
    const text="A useful opening sentence.\n\n" + "Additional challenge details that extend the preview. ".repeat(30) + "END_OF_FULL_CHALLENGE";
    assert.equal((await admin("/api/admin/challenges",{revision:current.revision,editingId:original.id,challenge:{...original,text}})).status,200);
    const info=(await admin("/api/admin/challenge-dependencies")).data.challenges.find(c=>c.id===original.id);
    assert.ok(info.summary.startsWith("A useful opening sentence. Additional"));
    assert.ok(info.summary.length<=401);assert.ok(info.summary.endsWith("…"));assert.ok(!info.summary.includes("END_OF_FULL_CHALLENGE"));
    assert.equal(info.points,original.points);assert.equal(info.grading,original.grading);
    for (const field of ["flags","flagRules","hints","text"]) assert.ok(!(field in info));
    assert.equal((await student("/api/admin/challenge-dependencies")).status,403);
  } finally {sqlite.close();}
});
