import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { cpSync, symlinkSync, readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { parseGame, parseChallenges } from "../lib/config-schema.mjs";
import { createApi } from "../server/api.mjs";
import { createSQLiteAdapter, initializeSchema } from "../server/sqlite.mjs";
import { createSnapshot, validateSnapshot } from "../server/backup.mjs";
function fixture() {
  const sqlite = new DatabaseSync(":memory:"); initializeSchema(sqlite);
  const db = createSQLiteAdapter(sqlite), config = parseGame("characters:\n - id: web\n   name: Web\naccounts:\n allowRegistration: true\n users:\n  - username: teacher\n    password: teacher-password\n    role: admin\n"), challenges = parseChallenges(readFileSync("content/challenges.yaml", "utf8")), api = createApi({ db, config, challenges });
  function client() {
    let cookie = "";
    return async (path, body, method = body ? "POST" : "GET") => {
      const r = await api(new Request("http://quest.test" + path, { method, headers: { Origin: "http://quest.test", Cookie: cookie, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }));
      if (r.headers.has("set-cookie")) cookie = r.headers.get("set-cookie").split(";")[0];
      return { status: r.status, data: await r.json() };
    };
  }
  return { sqlite, db, config, challenges, client };
}
test("team gifts count once, retry safely, remain private to members, and survive backup restoration", async () => {
  const f = fixture(), { sqlite, db, config, challenges, client } = f;
  try {
    const admin = client(), a = client(), b = client(), c = client();
    await admin("/api/auth", { username: "teacher", password: "teacher-password", hero: "web", mode: "login" });
    for (const [call, username] of [[a,"alice"], [b,"bobby"], [c,"carol"]]) await call("/api/auth", { username, password: "student-password", hero: "web", mode: "register" });
    const team = (await a("/api/teams", { mode: "create", name: "Snow Squad", password: "team-password" })).data.team;
    await b("/api/teams", { mode: "join", id: team.id, password: "team-password" });
    const other = (await c("/api/teams", { mode: "create", name: "Other Team", password: "team-password" })).data.team;
    for (const [name, points] of [["alice",30],["bobby",20]]) sqlite.prepare("INSERT INTO solved(user,challenge,points) SELECT id,?,? FROM students WHERE username=?").run(challenges[0].id,points,name);
    const gift = { action: "gift", id: team.id, awardId: crypto.randomUUID(), points: 75, comment: "  Great teamwork!  " };
    assert.equal((await a("/api/admin/teams", gift)).status, 403);
    const results = await Promise.all([admin("/api/admin/teams", gift), admin("/api/admin/teams", gift)]);
    assert.ok(results.every((r) => r.status === 200),JSON.stringify(results));
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM team_point_awards").get().n, 1);
    assert.equal(results[0].data.award.comment, "Great teamwork!");
    assert.equal((await admin("/api/admin/teams", { ...gift, points: 76 })).status, 409);
    assert.equal((await admin("/api/admin/teams", { ...gift, id: other.id })).status, 409);
    for (const points of [0,-1,1.5,10001,"5"]) assert.equal((await admin("/api/admin/teams", { ...gift, awardId: crypto.randomUUID(), points })).status, 400);
    for (const comment of ["", "   ", "a".repeat(1001)]) assert.equal((await admin("/api/admin/teams", { ...gift, awardId: crypto.randomUUID(), comment })).status, 400);
    assert.equal((await admin("/api/admin/teams", { ...gift, awardId: crypto.randomUUID(), id: "disbanded" })).status, 404);
    const board = (await a("/api/scoreboard")).data;
    assert.equal(board.mode, "team"); assert.equal(board.players.find((p) => p.id === team.id).score, 125);
    const individuals = (await admin("/api/scoreboard?mode=individual")).data.players;
    assert.equal(individuals.find((p) => p.username === "alice").score, 30);
    assert.equal(individuals.find((p) => p.username === "bobby").score, 20);
    const own = (await a("/api/teams")).data.team;
    assert.equal(own.pointAwards[0].points, 75); assert.equal(own.pointAwards[0].comment, "Great teamwork!");
    const outsider = (await c("/api/teams")).data;
    assert.deepEqual(outsider.team.pointAwards, []); assert.equal(outsider.teams.find((t) => t.id === team.id).pointAwards, undefined);
    const managed = (await admin("/api/admin/teams")).data.teams.find((t) => t.id === team.id);
    assert.equal(managed.score, 125); assert.equal(managed.pointAwards.length, 1);
    const snap = await createSnapshot({ db,config,challenges }); assert.equal(snap.teamPointAwards.length, 1);
    assert.throws(() => validateSnapshot({ ...snap, teamPointAwards: [snap.teamPointAwards[0],snap.teamPointAwards[0]] }));
    assert.throws(() => validateSnapshot({ ...snap, teamPointAwards: [{ ...snap.teamPointAwards[0], team: "missing" }] }));
    const legacy = { ...snap }; delete legacy.teamPointAwards; assert.deepEqual(validateSnapshot(legacy).teamPointAwards, []);
    const folder = mkdtempSync(resolve(tmpdir(),"quest-gifts-"));
    try {
      cpSync("server",resolve(folder,"server"),{recursive:true}); cpSync("lib",resolve(folder,"lib"),{recursive:true}); symlinkSync(resolve("node_modules"),resolve(folder,"node_modules"),"dir");
      const file = resolve(folder,"backup.json"), path = resolve(folder,"restored.sqlite"); writeFileSync(file,JSON.stringify(snap));
      const result = spawnSync(process.execPath,[resolve(folder,"server/restore.mjs"),file],{env:{...process.env,DATABASE_PATH:path},encoding:"utf8"}); assert.equal(result.status,0,result.stderr);
      const restored = new DatabaseSync(path);
      assert.deepEqual({...restored.prepare("SELECT * FROM team_point_awards").get()},snap.teamPointAwards[0]); restored.close();
    } finally { rmSync(folder,{recursive:true,force:true}); }
    await admin("/api/admin/teams", {id:team.id}, "DELETE");
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM team_point_awards").get().n, 0);
    assert.equal((await admin("/api/scoreboard?mode=individual")).data.players.find((p) => p.username === "alice").score, 30);
  } finally { sqlite.close(); }
});
test("player scoreboards always use teams while admin toggles respect visibility, ties, and exclude disabled earned scores", async () => {
  const {sqlite,client} = fixture();
  try {
    const admin = client(), a = client(), b = client();
    assert.equal((await a("/api/scoreboard")).status,401);
    await admin("/api/auth",{username:"teacher",password:"teacher-password",hero:"web",mode:"login"});
    for (const [call,username] of [[a,"alice"],[b,"bobby"]]) await call("/api/auth",{username,password:"student-password",hero:"web",mode:"register"});
    const t1=(await a("/api/teams",{mode:"create",name:"Alpha",password:"team-password"})).data.team, t2=(await b("/api/teams",{mode:"create",name:"Beta",password:"team-password"})).data.team;
    for (const id of [t1.id,t2.id]) await admin("/api/admin/teams",{action:"gift",id,awardId:crypto.randomUUID(),points:50,comment:"Participation"});
    let data=(await a("/api/scoreboard?mode=individual")).data; assert.equal(data.mode,"team"); assert.equal(data.admin,false); assert.deepEqual(data.players.map((p)=>p.rank),[1,1]); assert.deepEqual(data.players.map((p)=>p.username),["Alpha","Beta"]);
    assert.equal((await admin("/api/scoreboard?mode=individual")).data.mode,"individual"); assert.equal((await admin("/api/scoreboard?mode=team")).data.mode,"team"); assert.equal((await admin("/api/scoreboard?mode=bad")).status,400);
    const settings=(await admin("/api/admin/scoreboard")).data;
    await admin("/api/admin/scoreboard",{...settings,visibility:"admins"});
    assert.equal((await a("/api/scoreboard?mode=team")).status,403); assert.equal((await admin("/api/scoreboard?mode=team")).status,200);
    sqlite.prepare("INSERT INTO solved(user,challenge,points) SELECT id,'fixture',30 FROM students WHERE username='alice'").run();
    assert.equal((await admin("/api/scoreboard?mode=team")).data.players.find((p)=>p.id===t1.id).score,80);
    sqlite.prepare("UPDATE students SET disabled=1 WHERE username='alice'").run();
    data=(await admin("/api/scoreboard?mode=team")).data; assert.equal(data.players.find((p)=>p.id===t1.id).score,50);
    assert.deepEqual(data.players.map((p)=>p.rank),[1,1]); assert.ok(!(await admin("/api/scoreboard?mode=individual")).data.players.some((p)=>p.username==="alice"));
    assert.equal((await admin("/api/admin/scoreboard")).data.mode,settings.mode);
  } finally { sqlite.close(); }
});
