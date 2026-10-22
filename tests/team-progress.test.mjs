import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { stringify } from "yaml";
import { createApi } from "../server/api.mjs";
import { createSQLiteAdapter, initializeSchema } from "../server/sqlite.mjs";
import { createSnapshot, validateSnapshot } from "../server/backup.mjs";
import { playerHints } from "../server/hint-rewards.mjs";
import { parseGame, parseChallenges } from "../lib/config-schema.mjs";

async function setup(extraChallenges = []) {
  const sqlite = new DatabaseSync(":memory:");
  initializeSchema(sqlite);
  const config = parseGame(`characters:
  - id: web
    name: Web
accounts:
  allowRegistration: true
  users:
    - username: teacher
      password: teacher-password
      role: admin
      hero: web`);
  const challenges = parseChallenges(stringify({ challenges: [
    { id: "first", object: "First", location: { x: 11, y: 19 }, region: "Town", text: "Find the flag.", points: 100, flags: ["FLAG"], hints: [{ id: "help", text: "A clue", cost: 10 }], rewards: { keys: ["red"], incantations: [] }, solveVideo: "/videos/solve.mp4" },
    { id: "next", object: "Next", location: { x: 8, y: 8 }, region: "Town", text: "Next question.", points: 50, flags: ["NEXT"], dependsOn: ["first"] },
    { id: "written", object: "Written", location: { x: 18, y: 19 }, region: "Town", text: "Explain.", points: 100, grading: "manual", rewards: { keys: ["blue"], incantations: [] }, hints: [{ id: "help", text: "Written clue", cost: 10 }, { id: "late", text: "Late clue", cost: 5 }] },
    ...extraChallenges,
  ] }));
  const db = createSQLiteAdapter(sqlite), api = createApi({ db, config, challenges });
  function client() {
    let cookie = "";
    return async (path, body) => {
      const r = await api(new Request("https://quest.test" + path, {
        method: body ? "POST" : "GET",
        headers: { Origin: "https://quest.test", Cookie: cookie, "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      }));
      if (r.headers.has("set-cookie")) cookie = r.headers.get("set-cookie").split(";")[0];
      return { status: r.status, data: await r.json() };
    };
  }
  const alice = client(), bob = client(), other = client(), admin = client();
  for (const [call, username] of [[alice, "alice"], [bob, "bobby"], [other, "carol"], [admin, "teacher"]]) {
    assert.equal((await call("/api/auth", { username, password: username === "teacher" ? "teacher-password" : "student-password", hero: "web", mode: username === "teacher" ? "login" : "register" })).status, 200);
  }
  const team = (await alice("/api/teams", { mode: "create", name: "Alpha", password: "team-password" })).data.team;
  assert.equal((await bob("/api/teams", { mode: "join", id: team.id, password: "team-password" })).status, 200);
  await other("/api/teams", { mode: "create", name: "Beta", password: "team-password" });
  return { sqlite, db, config, challenges, alice, bob, other, admin, team, client };
}
const position = { map: "town", x: 18, y: 20, themeRevision: 0 };

test("a team solve shares score, completion, prerequisites, rewards, review and live updates; repeats award nothing", async () => {
  const { sqlite, alice, bob, other, admin, team, client } = await setup();
  try {
    const before = (await bob("/api/presence", position)).data.gameRevision;
    await alice("/api/game", { id: "first", action: "hint", hintId: "help" });
    const solved = await alice("/api/game", { id: "first", answer: "FLAG" });
    assert.equal(solved.status, 200);
    assert.equal(solved.data.awardedPoints, 90);
    assert.equal(solved.data.score, 90);
    const shared = (await bob("/api/game")).data;
    assert.deepEqual(shared.solved, ["first"]);
    assert.equal(shared.score, 90);
    assert.equal(shared.challenges.find(c => c.id === "first").awardedPoints, 90);
    assert.ok(shared.challenges.some(c => c.id === "next"));
    assert.deepEqual(shared.inventory.keys, ["red"]);
    const after = (await bob("/api/presence", position)).data;
    assert.notEqual(after.gameRevision, before);
    assert.ok(after.challengeSolves.some(c => c.id === "next"));
    assert.equal((await bob("/api/game", { id: "first", action: "review-answer" })).data.answer, "FLAG");
    assert.equal((await bob("/api/game", { id: "first", action: "cutscene", phase: "solve" })).data.play, true);
    for (const call of [bob, alice, bob]) {
      const repeat = await call("/api/game", { id: "first", answer: "FLAG" });
      assert.equal(repeat.status, 200);
      assert.equal(repeat.data.correct, true);
      assert.equal(repeat.data.awardedPoints, 0);
      assert.equal(repeat.data.score, 90);
    }
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM solved").get().n, 1);
    assert.equal((await bob("/api/game", { id: "first", action: "hint", hintId: "help" })).status, 200);
    assert.equal((await bob("/api/scoreboard")).data.players.find(t => t.id === team.id).score, 90);
    assert.equal((await bob("/api/team-social")).data.teams.find(t => t.id === team.id).score, 90);
    const users = (await admin("/api/scoreboard?mode=individual")).data.players;
    for (const name of ["alice", "bobby"]) {
      assert.equal(users.find(u => u.username === name).score, 90);
      assert.equal(users.find(u => u.username === name).completed, 1);
    }
    assert.equal((await other("/api/game")).data.score, 0);
    assert.deepEqual((await other("/api/game")).data.solved, []);
    assert.equal((await other("/api/game", { id: "first", action: "review-answer" })).status, 403);
    const newcomer = client();
    await newcomer("/api/auth", { username: "diana", password: "student-password", hero: "web", mode: "register" });
    await newcomer("/api/teams", { mode: "join", id: team.id, password: "team-password" });
    assert.equal((await newcomer("/api/game")).data.score, 90);
    assert.deepEqual((await newcomer("/api/game")).data.solved, ["first"]);
  } finally { sqlite.close(); }
});

test("simultaneous teammate submissions award once, and another team can earn its own award", async () => {
  const { sqlite, alice, bob, other } = await setup();
  try {
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => (i % 2 ? alice : bob)("/api/game", { id: "first", answer: "FLAG" })));
    assert.ok(results.every(r => r.status === 200 && r.data.correct));
    assert.equal(results.reduce((sum, r) => sum + r.data.awardedPoints, 0), 100);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM solved").get().n, 1);
    for (const call of [alice, bob]) assert.equal((await call("/api/game")).data.score, 100);
    assert.equal((await other("/api/game", { id: "first", answer: "FLAG" })).data.awardedPoints, 100);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM solved").get().n, 2);
  } finally { sqlite.close(); }
});

test("grading a written response completes it for the team, another grade adds no award, and regrading updates the shared award", async () => {
  const { sqlite, alice, bob, admin } = await setup();
  try {
    for (const call of [alice, bob]) assert.equal((await call("/api/game", { id: "written", answer: "My explanation", revision: 0 })).status, 200);
    const rows = (await admin("/api/admin/review")).data.responses;
    const a = rows.find(r => r.username === "alice"), b = rows.find(r => r.username === "bobby");
    const grade = (r, points, revision = r.revision) => admin("/api/admin/review", { user: r.user, challenge: r.challenge, revision, grade: points, feedback: "Reviewed" });
    assert.equal((await grade(a, 70)).status, 200);
    const before = (await bob("/api/presence", position)).data.gameRevision;
    for (const call of [alice, bob]) {
      const game = (await call("/api/game")).data;
      assert.equal(game.score, 70);
      assert.deepEqual(game.solved, ["written"]);
      assert.deepEqual(game.inventory.keys, ["blue"]);
      assert.equal(game.challenges.find(c => c.id === "written").submission.status, "graded");
      assert.equal(game.challenges.find(c => c.id === "written").submission.grade, 70);
    }
    assert.equal((await grade(b, 100)).status, 200);
    assert.equal((await bob("/api/game")).data.score, 70);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM solved").get().n, 1);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM earned_rewards").get().n, 1);
    assert.equal((await grade(a, 80, a.revision + 1)).status, 200);
    for (const call of [alice, bob]) assert.equal((await call("/api/game")).data.score, 80);
    assert.notEqual((await bob("/api/presence", position)).data.gameRevision, before);
    assert.equal((await grade(a, 90)).status, 409);
    assert.equal((await bob("/api/game", { id: "written", answer: "Try again", revision: 2 })).status, 409);
  } finally { sqlite.close(); }
});

test("legacy duplicate awards count the highest saved points once in games and team scores", async () => {
  const { sqlite, alice, bob, team } = await setup();
  try {
    const insert = sqlite.prepare("INSERT INTO solved(user,challenge,points) SELECT id,'first',? FROM students WHERE username=?");
    insert.run(30, "alice"); insert.run(50, "bobby");
    for (const call of [alice, bob]) {
      const game = (await call("/api/game")).data;
      assert.equal(game.score, 50);
      assert.deepEqual(game.solved, ["first"]);
      assert.equal((await call("/api/scoreboard")).data.players.find(t => t.id === team.id).score, 50);
    }
  } finally { sqlite.close(); }
});

test("a hint unlocks for all teammates, charges once, updates live state, and reduces a different solver's award", async () => {
  const { sqlite, alice, bob, other, team } = await setup();
  try {
    const before = (await bob("/api/presence", position)).data.gameRevision;
    const requests = await Promise.all(Array.from({ length: 8 }, (_, i) => (i % 2 ? alice : bob)("/api/game", { id: "first", action: "hint", hintId: "help" })));
    assert.ok(requests.every(r => r.status === 200));
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM purchased_hints").get().n, 1);
    const buyer = sqlite.prepare("SELECT s.username FROM purchased_hints h JOIN students s ON s.id=h.user").get().username;
    const solver = buyer === "alice" ? bob : alice;
    for (const call of [alice, bob]) {
      const challenge = (await call("/api/game")).data.challenges.find(c => c.id === "first");
      assert.equal(challenge.hintCost, 10);
      assert.equal(challenge.remainingPoints, 90);
      assert.equal(challenge.hints[0].unlocked, true);
      assert.equal(challenge.hints[0].text, "A clue");
    }
    assert.notEqual((await bob("/api/presence", position)).data.gameRevision, before);
    const privateHint = (await other("/api/game")).data.challenges.find(c => c.id === "first");
    assert.equal(privateHint.hintCost, 0);
    assert.equal(privateHint.hints[0].unlocked, false);
    assert.ok(!("text" in privateHint.hints[0]));
    const answer = await solver("/api/game", { id: "first", answer: "FLAG" });
    assert.equal(answer.status, 200);
    assert.equal(answer.data.awardedPoints, 90);
    for (const call of [alice, bob]) assert.equal((await call("/api/game")).data.score, 90);
    assert.equal((await bob("/api/scoreboard")).data.players.find(t => t.id === team.id).score, 90);
  } finally { sqlite.close(); }
});

test("a teammate's hint cost is frozen into written submissions and grading, with later team purchases blocked", async () => {
  const { sqlite, alice, bob, admin } = await setup();
  try {
    assert.equal((await alice("/api/game", { id: "written", action: "hint", hintId: "help" })).status, 200);
    const before = (await alice("/api/presence", position)).data.gameRevision;
    const submitted = await bob("/api/game", { id: "written", answer: "My reasoning", revision: 0 });
    assert.equal(submitted.status, 200);
    assert.equal(submitted.data.challenges.find(c => c.id === "written").hintCost, 10);
    assert.equal((await alice("/api/game")).data.challenges.find(c => c.id === "written").hintsLocked, true);
    assert.notEqual((await alice("/api/presence", position)).data.gameRevision, before);
    assert.equal((await alice("/api/game", { id: "written", action: "hint", hintId: "late" })).status, 409);
    const row = (await admin("/api/admin/review")).data.responses[0];
    assert.equal(row.hintCost, 10);
    assert.equal((await admin("/api/admin/review", { user: row.user, challenge: row.challenge, revision: row.revision, grade: 80 })).status, 200);
    for (const call of [alice, bob]) assert.equal((await call("/api/game")).data.score, 70);
  } finally { sqlite.close(); }
});

test("different teammates' hint costs accumulate, while free and repeated hints add no extra cost", async () => {
  const challenge = {
    id: "points", object: "Points", location: { x: 12, y: 19 }, region: "Town", text: "Use clues.", points: 100, flags: ["POINTS"],
    hints: [{ id: "one", text: "First clue", cost: 10 }, { id: "two", text: "Second clue", cost: 20 }, { id: "free", text: "Free clue" }],
  };
  const { sqlite, alice, bob } = await setup([challenge]);
  try {
    const requests = await Promise.all([
      alice("/api/game", { id: "points", action: "hint", hintId: "one" }),
      bob("/api/game", { id: "points", action: "hint", hintId: "two" }),
      alice("/api/game", { id: "points", action: "hint", hintId: "free" }),
    ]);
    assert.ok(requests.every(r => r.status === 200));
    await bob("/api/game", { id: "points", action: "hint", hintId: "one" });
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM purchased_hints").get().n, 3);
    for (const call of [alice, bob]) {
      const shared = (await call("/api/game")).data.challenges.find(c => c.id === "points");
      assert.equal(shared.hintCost, 30);
      assert.equal(shared.remainingPoints, 70);
      assert.ok(shared.hints.every(h => h.unlocked));
    }
    assert.equal((await bob("/api/game", { id: "points", answer: "POINTS" })).data.awardedPoints, 70);
  } finally { sqlite.close(); }
});

test("team hint/solve and hint/submission races produce matching costs and rewards", async () => {
  for (const manual of [false, true]) {
    const { sqlite, alice, bob, admin } = await setup();
    try {
      const id = manual ? "written" : "first";
      const results = await Promise.all([
        bob("/api/game", { id, answer: manual ? "My reasoning" : "FLAG", ...(manual ? { revision: 0 } : {}) }),
        alice("/api/game", { id, action: "hint", hintId: "help" }),
      ]);
      assert.equal(results[0].status, 200);
      const purchased = sqlite.prepare("SELECT COUNT(*) AS n FROM purchased_hints").get().n;
      assert.equal(results[1].status, purchased ? 200 : 409);
      if (manual) {
        const row = (await admin("/api/admin/review")).data.responses[0];
        assert.equal(row.hintCost, purchased * 10);
        assert.equal((await admin("/api/admin/review", { user: row.user, challenge: row.challenge, revision: row.revision, grade: 100 })).status, 200);
      }
      for (const call of [alice, bob]) assert.equal((await call("/api/game")).data.score, 100 - purchased * 10);
    } finally { sqlite.close(); }
  }
});

const itemChallenge = {
  id: "items", object: "Items", location: { x: 12, y: 19 }, region: "Town", text: "Find items.", points: 100, flags: ["ITEMS"],
  rewards: { keys: ["red", "blue"], incantations: ["Secret phrase"] },
  hints: [
    { id: "first", text: "Item clue", cost: 10, rewardCost: { keys: ["red"], incantations: ["secret phrase"] } },
    { id: "alternative", text: "Alternative clue", cost: 20, rewardCost: { keys: ["red"] } },
  ],
};

test("teammates cannot spend the same hint reward twice, and forfeited items stay withheld for the whole team", async () => {
  const { sqlite, alice, bob } = await setup([itemChallenge]);
  try {
    const results = await Promise.all([
      alice("/api/game", { id: "items", action: "hint", hintId: "first" }),
      bob("/api/game", { id: "items", action: "hint", hintId: "alternative" }),
    ]);
    assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
    const winner = results[0].status === 200 ? 0 : 1;
    const game = (await bob("/api/game")).data.challenges.find(c => c.id === "items");
    assert.ok(!JSON.stringify(game).toLowerCase().includes("secret phrase"));
    assert.ok(!JSON.stringify((await bob("/api/presence", position)).data).toLowerCase().includes("secret phrase"));
    assert.equal(game.hints[winner].unlocked, true);
    assert.equal(game.hints[1 - winner].available, false);
    const solver = winner === 0 ? bob : alice;
    const solved = await solver("/api/game", { id: "items", answer: "ITEMS" });
    assert.equal(solved.data.awardedPoints, winner === 0 ? 90 : 80);
    for (const call of [alice, bob]) {
      const shared = (await call("/api/game")).data;
      assert.deepEqual(shared.inventory.keys, ["blue"]);
      assert.deepEqual(shared.inventory.incantations, winner === 0 ? [] : ["Secret phrase"]);
    }
  } finally { sqlite.close(); }
});

test("legacy duplicate hint purchases charge once and retain every recorded reward forfeiture through backups", async () => {
  const { sqlite, db, config, challenges, alice, bob } = await setup([itemChallenge]);
  try {
    const insert = sqlite.prepare("INSERT INTO purchased_hints(user,challenge,hint,cost,reward_cost) SELECT id,'items','first',?,? FROM students WHERE username=?");
    insert.run(10, JSON.stringify({ keys: ["red"], incantations: [] }), "alice");
    insert.run(20, JSON.stringify({ keys: [], incantations: ["secret phrase"] }), "bobby");
    for (const call of [alice, bob]) {
      const challenge = (await call("/api/game")).data.challenges.find(c => c.id === "items");
      assert.equal(challenge.hintCost, 20);
      assert.equal(challenge.hints[0].unlocked, true);
      assert.deepEqual(challenge.hints[0].rewardCost, { keys: ["red"], incantationCount: 1 });
      assert.deepEqual(challenge.rewards, { keys: ["blue"], incantationCount: 0 });
    }
    const snapshot = validateSnapshot(JSON.parse(JSON.stringify(await createSnapshot({ db, config, challenges }))));
    sqlite.exec("DELETE FROM purchased_hints");
    const restore = sqlite.prepare("INSERT INTO purchased_hints(user,challenge,hint,cost,reward_cost) VALUES(?,?,?,?,?)");
    for (const hint of snapshot.purchasedHints) restore.run(hint.user, hint.challenge, hint.hint, hint.cost, JSON.stringify(hint.rewardCost));
    assert.equal((await playerHints(db, snapshot.purchasedHints[0].user))[0].cost, 20);
    assert.equal((await bob("/api/game", { id: "items", answer: "ITEMS" })).data.awardedPoints, 80);
    assert.deepEqual((await alice("/api/game")).data.inventory, { keys: ["blue"], incantations: [] });
  } finally { sqlite.close(); }
});
