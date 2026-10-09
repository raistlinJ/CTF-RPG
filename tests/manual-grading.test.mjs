import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  readFileSync,
  mkdtempSync,
  writeFileSync,
  cpSync,
  symlinkSync,
  rmSync,
} from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { stringify } from "yaml";
import { createApi } from "../server/api.mjs";
import { parseGame, parseChallenges } from "../lib/config-schema.mjs";
import { initializeSchema, createSQLiteAdapter } from "../server/sqlite.mjs";
import { createSnapshot, validateSnapshot } from "../server/backup.mjs";
const manual = {
  id: "reflection",
  map: "town",
  object: "Reasoning question",
  location: { x: 18, y: 19 },
  region: "Campus",
  text: "Explain your reasoning.",
  grading: "manual",
  points: 100,
  hints: [
    { id: "help", text: "Describe the steps.", cost: 10 },
    { id: "late", text: "Use a concrete example.", cost: 5 },
  ],
  downloads: [],
};
function setup() {
  const sqlite = new DatabaseSync(":memory:");
  initializeSchema(sqlite);
  const db = createSQLiteAdapter(sqlite),
    config = parseGame(
      "characters:\n - id: web\n   name: Web\naccounts:\n allowRegistration: true\n users:\n  - username: teacher\n    password: teacher-password\n    role: admin\n    hero: web",
    ),
    challenges = parseChallenges(
      stringify({
        challenges: [
          manual,
          ...parseChallenges(readFileSync("content/challenges.yaml", "utf8")),
        ],
      }),
    ),
    api = createApi({ db, config, challenges });
  function client() {
    let cookie = "";
    return async (path, body) => {
      const r = await api(
        new Request("http://quest.test" + path, {
          method: body ? "POST" : "GET",
          headers: {
            Origin: "http://quest.test",
            Cookie: cookie,
            "Content-Type": "application/json",
          },
          body: body ? JSON.stringify(body) : undefined,
        }),
      );
      if (r.headers.has("set-cookie"))
        cookie = r.headers.get("set-cookie").split(";")[0];
      return { status: r.status, data: await r.json() };
    };
  }
  return { sqlite, db, config, challenges, client };
}
async function login(call, name = "teacher", mode = "login") {
  assert.equal(
    (
      await call("/api/auth", {
        username: name,
        password: name === "teacher" ? "teacher-password" : "student-password",
        mode,
        hero: "web",
      })
    ).status,
    200,
  );
}
test("both answer modes validate and automatic remains the YAML default", () => {
  assert.equal(
    parseChallenges(readFileSync("content/challenges.yaml", "utf8"))[0].grading,
    "automatic",
  );
  assert.equal(
    parseChallenges(stringify({ challenges: [manual] }))[0].flags.length,
    0,
  );
  assert.throws(() =>
    parseChallenges(
      stringify({ challenges: [{ ...manual, grading: "automatic" }] }),
    ),
  );
  assert.throws(() =>
    parseChallenges(
      stringify({ challenges: [{ ...manual, grading: "unknown" }] }),
    ),
  );
});
test("private written answers persist, freeze hints, grade/regrade scores atomically, and restore", async () => {
  const { sqlite, db, config, challenges, client } = setup(),
    admin = client(),
    student = client(),
    other = client();
  assert.equal((await student("/api/admin/review")).status, 401);
  await login(admin);
  await login(student, "alice", "register");
  await login(other, "bobby", "register");
  assert.equal((await student("/api/admin/review")).status, 403);
  assert.equal(
    (await student("/api/game", { id: "reflection", answer: " ", revision: 0 }))
      .status,
    400,
  );
  await student("/api/game", {
    id: "reflection",
    action: "hint",
    hintId: "help",
  });
  const submitted = await student("/api/game", {
    id: "reflection",
    answer: "I plan, choose a tool, inspect its output, and revise.",
    revision: 0,
  });
  assert.equal(submitted.status, 200);
  assert.equal(submitted.data.submitted, true);
  assert.equal(submitted.data.score, 0);
  let q = submitted.data.challenges.find((c) => c.id === "reflection");
  assert.equal(q.submission.status, "pending");
  assert.equal(q.remainingPoints, 90);
  assert.equal(
    (
      await student("/api/game", {
        id: "reflection",
        action: "hint",
        hintId: "late",
      })
    ).status,
    409,
  );
  assert.equal(
    (await other("/api/game")).data.challenges.find(
      (c) => c.id === "reflection",
    ).submission,
    null,
  );
  await student("/api/game", {
    id: "reflection",
    answer: "Revised written answer.",
    revision: 1,
  });
  assert.equal(
    (
      await student("/api/game", {
        id: "reflection",
        answer: "Stale answer.",
        revision: 1,
      })
    ).status,
    409,
  );
  const reconnect = client();
  await login(reconnect, "alice");
  assert.equal(
    (await reconnect("/api/game")).data.challenges.find(
      (c) => c.id === "reflection",
    ).submission.answer,
    "Revised written answer.",
  );
  let review = (await admin("/api/admin/review")).data;
  assert.equal(review.total, 1);
  let row = review.responses[0];
  assert.equal(row.hintCost, 10);
  assert.equal(
    (
      await student("/api/admin/review", {
        user: row.user,
        challenge: row.challenge,
        revision: row.revision,
        grade: 100,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await admin("/api/admin/review", {
        user: row.user,
        challenge: row.challenge,
        revision: row.revision,
        grade: 101,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await admin("/api/admin/review", {
        user: row.user,
        challenge: row.challenge,
        revision: row.revision,
        grade: 85,
        feedback: "Good reasoning; add a stopping condition.",
      })
    ).status,
    200,
  );
  assert.equal((await student("/api/game")).data.score, 75);
  assert.equal(
    (
      await student("/api/game", {
        id: "reflection",
        answer: "After grading edit.",
        revision: 2,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await admin("/api/admin/review", {
        user: row.user,
        challenge: row.challenge,
        revision: row.revision,
        grade: 10,
      })
    ).status,
    409,
  );
  review = (await admin("/api/admin/review?status=graded")).data;
  row = review.responses[0];
  await admin("/api/admin/review?status=graded", {
    user: row.user,
    challenge: row.challenge,
    revision: row.revision,
    grade: 70,
    feedback: "Updated rubric: 70 before hint costs.",
  });
  const state = (await reconnect("/api/game")).data;
  assert.equal(state.score, 60);
  q = state.challenges.find((c) => c.id === "reflection");
  assert.equal(q.submission.status, "graded");
  assert.equal(q.submission.feedback, "Updated rubric: 70 before hint costs.");
  assert.equal(
    (await admin("/api/scoreboard?mode=individual")).data.players.find(
      (p) => p.username === "alice",
    ).score,
    60,
  );
  const catalog = (await admin("/api/admin/challenges")).data,
    change = {
      ...catalog.challenges.find((c) => c.id === "reflection"),
      grading: "automatic",
      flags: ["accepted"],
    };
  assert.equal(
    (
      await admin("/api/admin/challenges", {
        challenge: change,
        revision: catalog.revision,
        editingId: "reflection",
      })
    ).status,
    400,
  );
  const snapshot = await createSnapshot({ db, config, challenges });
  assert.equal(snapshot.writtenResponses[0].grade, 70);
  assert.throws(() =>
    validateSnapshot({
      ...snapshot,
      writtenResponses: [{ ...snapshot.writtenResponses[0], grade: 101 }],
    }),
  );
  const folder = mkdtempSync(resolve(tmpdir(), "quest-written-"));
  for (const directory of ["server", "lib", "themes"])
    cpSync(directory, resolve(folder, directory), { recursive: true });
  symlinkSync(resolve("node_modules"), resolve(folder, "node_modules"), "dir");
  const file = resolve(folder, "backup.json"),
    path = resolve(folder, "restore.sqlite");
  writeFileSync(file, JSON.stringify(snapshot));
  const r = spawnSync(
    process.execPath,
    [resolve(folder, "server/restore.mjs"), file],
    { env: { ...process.env, DATABASE_PATH: path }, encoding: "utf8" },
  );
  assert.equal(r.status, 0, r.stderr);
  const restored = new DatabaseSync(path);
  assert.equal(
    restored.prepare("SELECT answer FROM written_responses").get().answer,
    "Revised written answer.",
  );
  assert.equal(restored.prepare("SELECT points FROM solved").get().points, 60);
  restored.close();
  rmSync(folder, { recursive: true, force: true });
  sqlite.close();
});
test("two graders cannot overwrite one another using a stale response", async () => {
  const { sqlite, client } = setup(),
    a = client(),
    b = client(),
    student = client();
  await login(a);
  await login(b);
  await login(student, "alice", "register");
  await student("/api/game", {
    id: "reflection",
    answer: "My answer",
    revision: 0,
  });
  const row = (await a("/api/admin/review")).data.responses[0];
  const results = await Promise.all([
    a("/api/admin/review", {
      user: row.user,
      challenge: row.challenge,
      revision: row.revision,
      grade: 40,
    }),
    b("/api/admin/review", {
      user: row.user,
      challenge: row.challenge,
      revision: row.revision,
      grade: 90,
    }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  assert.equal(
    (await student("/api/game")).data.score,
    results[0].status === 200 ? 40 : 90,
  );
  sqlite.close();
});
