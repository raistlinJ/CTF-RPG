// CTF-RPG — Copyright (c) 2026 Jaime C Acosta
import {
  cpSync,
  mkdtempSync,
  writeFileSync,
  symlinkSync,
  rmSync,
} from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { initializeSchema, createSQLiteAdapter } from "../server/sqlite.mjs";
import { createApi } from "../server/api.mjs";
import { parseGame, parseChallenges } from "../lib/config-schema.mjs";
import { createSnapshot, validateSnapshot } from "../server/backup.mjs";
function setup() {
  const sqlite = new DatabaseSync(":memory:");
  initializeSchema(sqlite);
  const db = createSQLiteAdapter(sqlite);
  const config = parseGame(
    "characters:\n - id: web\n   name: Web\naccounts:\n allowRegistration: true\n users:\n  - username: teacher\n    password: teacher-password\n    role: admin\n    hero: web",
  );
  const challenges = parseChallenges(
    readFileSync("content/challenges.yaml", "utf8"),
  );
  const api = createApi({ db, config, challenges });
  function client() {
    let cookie = "";
    return async (path, body, method = body ? "POST" : "GET") => {
      const r = await api(
        new Request("http://quest.test" + path, {
          method,
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
async function login(c, username) {
  assert.equal(
    (
      await c("/api/auth", {
        username,
        password:
          username === "teacher" ? "teacher-password" : "student-password",
        hero: "web",
        mode: username === "teacher" ? "login" : "register",
      })
    ).status,
    200,
  );
}
const position = { map: "town", x: 18, y: 20, themeRevision: 0 };
test("students reach instructor inbox; conversations isolate teams; replies and notifications work; mute blocks every outgoing channel", async () => {
  const { sqlite, db, config, challenges, client } = setup();
  try {
    const admin = client(),
      a = client(),
      b = client(),
      mate = client();
    await login(admin, "teacher");
    await login(a, "alice");
    await login(b, "bobby");
    await login(mate, "allie");
    const team = (
      await a("/api/teams", {
        mode: "create",
        name: "A team",
        password: "team-password",
      })
    ).data.team;
    await mate("/api/teams", {
      mode: "join",
      id: team.id,
      password: "team-password",
    });
    await b("/api/teams", {
      mode: "create",
      name: "B team",
      password: "team-password",
    });
    const message = {
      id: crypto.randomUUID(),
      team: "instructors",
      text: "Instructor help needed",
    };
    assert.equal((await a("/api/team-social", message)).status, 200);
    assert.equal((await a("/api/team-social", message)).status, 200);
    assert.equal(
      (await admin("/api/team-social?team=instructors")).data.messages.length,
      1,
    );
    assert.equal(
      (await b("/api/team-social?team=instructors")).data.messages.length,
      0,
    );
    assert.equal(
      (await mate("/api/team-social?team=instructors")).data.messages.length,
      1,
    );
    assert.equal(
      (await admin("/api/presence", position)).data.receivedCount,
      1,
    );
    const reply = {
      id: crypto.randomUUID(),
      team: team.id,
      text: "Instructor reply",
    };
    assert.equal((await admin("/api/team-social", reply)).status, 200);
    const conversation = (await a("/api/team-social?team=instructors")).data
      .messages;
    assert.equal(conversation.length, 2);
    assert.equal(
      conversation.find((m) => m.text === reply.text).outgoing,
      false,
    );
    assert.equal((await a("/api/presence", position)).data.receivedCount, 1);
    await mate("/api/team-social", {
      id: crypto.randomUUID(),
      team: team.id,
      text: "Teammate reply",
    });
    assert.equal((await a("/api/presence", position)).data.receivedCount, 2);
    assert.equal((await mate("/api/presence", position)).data.receivedCount, 1);
    assert.equal((await a("/api/admin/mute")).status, 403);
    const target = (await admin("/api/admin/mute")).data.users.find(
      (u) => u.username === "alice",
    );
    const muted = await admin("/api/admin/mute", { ...target, muted: true });
    assert.equal(muted.status, 200);
    assert.equal(
      (await admin("/api/admin/mute", { ...target, muted: false })).status,
      409,
    );
    for (const to of [team.id, "instructors"])
      assert.equal(
        (
          await a("/api/team-social", {
            id: crypto.randomUUID(),
            team: to,
            text: "Blocked message",
          })
        ).status,
        403,
      );
    assert.equal((await a("/api/team-social?team=instructors")).status, 200);
    assert.ok(
      (await a("/api/team-social")).data.teams.every((t) => !t.canMessage),
    );
    await a("/api/game", { id: challenges[0].id, action: "discover" });
    assert.ok(
      (await a("/api/game")).data.discovered.includes(challenges[0].id),
    );
    assert.ok(
      !(await b("/api/game")).data.discovered.includes(challenges[0].id),
    );
    const snapshot = await createSnapshot({ db, config, challenges });
    assert.equal(
      snapshot.accounts.find((a) => a.username === "alice").muted,
      1,
    );
    assert.equal(snapshot.instructorMessages.length, 1);
    assert.equal(
      validateSnapshot(snapshot).instructorMessages[0].id,
      message.id,
    );
    const restoredRoot = mkdtempSync(resolve(tmpdir(), "ctf-social-restore-"));
    try {
      for (const dir of ["server", "lib"])
        cpSync(dir, resolve(restoredRoot, dir), { recursive: true });
      symlinkSync(
        resolve("node_modules"),
        resolve(restoredRoot, "node_modules"),
        "dir",
      );
      writeFileSync(
        resolve(restoredRoot, "backup.json"),
        JSON.stringify(snapshot),
      );
      const database = resolve(restoredRoot, "data/quest.sqlite");
      const restore = spawnSync(
        process.execPath,
        [
          resolve(restoredRoot, "server/restore.mjs"),
          resolve(restoredRoot, "backup.json"),
        ],
        { env: { ...process.env, DATABASE_PATH: database }, encoding: "utf8" },
      );
      assert.equal(restore.status, 0, restore.stderr);
      const recovered = new DatabaseSync(database);
      assert.equal(
        recovered
          .prepare("SELECT muted FROM students WHERE username='alice'")
          .get().muted,
        1,
      );
      assert.equal(
        recovered.prepare("SELECT COUNT(*) AS n FROM instructor_messages").get()
          .n,
        1,
      );
      assert.equal(
        recovered.prepare("SELECT mode FROM scoreboard_settings").get().mode,
        "individual",
      );
      assert.equal(
        recovered
          .prepare("SELECT COUNT(*) AS n FROM discovered_challenges")
          .get().n,
        1,
      );
      recovered.close();
    } finally {
      rmSync(restoredRoot, { recursive: true, force: true });
    }

    await admin("/api/admin/mute", {
      username: "alice",
      muted: false,
      revision: muted.data.revision,
    });
    assert.equal(
      (
        await a("/api/team-social", {
          id: crypto.randomUUID(),
          team: "instructors",
          text: "Unmuted",
        })
      ).status,
      200,
    );
    const presence = (await a("/api/presence", position)).data;
    assert.ok(
      presence.players.some(
        (p) => p.username === "teacher" && p.role === "admin",
      ),
    );
    assert.ok(
      (await admin("/api/presence", position)).data.players.some(
        (p) => p.username === "alice",
      ),
    );
  } finally {
    sqlite.close();
  }
});
test("scoreboard access and mode are admin-controlled, private APIs deny students, team totals use eligible net scores, and backups keep settings", async () => {
  const { sqlite, db, config, challenges, client } = setup();
  try {
    const admin = client(),
      a = client(),
      b = client();
    await login(admin, "teacher");
    await login(a, "alice");
    await login(b, "bobby");
    const team = (
      await a("/api/teams", {
        mode: "create",
        name: "A team",
        password: "team-password",
      })
    ).data.team;
    await b("/api/teams", {
      mode: "join",
      id: team.id,
      password: "team-password",
    });
    const ids = sqlite.prepare("SELECT id,username FROM students").all();
    for (const s of ids)
      sqlite
        .prepare("INSERT INTO solved(user,challenge,points) VALUES(?,?,?)")
        .run(
          s.id,
          "points",
          s.username === "teacher" ? 999 : s.username === "alice" ? 30 : 20,
        );
    let settings = (await admin("/api/admin/scoreboard")).data;
    assert.equal(
      (await a("/api/admin/scoreboard", { ...settings, mode: "team" })).status,
      403,
    );
    settings = (
      await admin("/api/admin/scoreboard", {
        ...settings,
        visibility: "admins",
        mode: "team",
      })
    ).data;
    assert.equal((await a("/api/scoreboard")).status, 403);
    let scores = (await admin("/api/scoreboard")).data;
    assert.equal(scores.mode, "team");
    assert.equal(scores.players[0].score, 50);
    assert.equal(
      (
        await admin("/api/admin/scoreboard", {
          visibility: "all",
          mode: "individual",
          revision: 0,
        })
      ).status,
      409,
    );
    settings = (
      await admin("/api/admin/scoreboard", { ...settings, visibility: "all" })
    ).data;
    scores = (await a("/api/scoreboard")).data;
    assert.equal(scores.players[0].score, 50);
    assert.equal(scores.players[0].isYou, true);
    sqlite
      .prepare("UPDATE students SET disabled=1 WHERE username='bobby'")
      .run();
    assert.equal((await a("/api/scoreboard")).data.players[0].score, 30);
    const snapshot = await createSnapshot({ db, config, challenges });
    assert.equal(snapshot.scoreboardSettings.mode, "team");
    const legacy = structuredClone(snapshot);
    delete legacy.scoreboardSettings;
    delete legacy.instructorMessages;
    for (const a of legacy.accounts) delete a.muted;
    assert.equal(validateSnapshot(legacy).accounts[0].muted, 0);
  } finally {
    sqlite.close();
  }
});
