import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  readFileSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  symlinkSync,
  rmSync,
} from "node:fs";
import { resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { unzipSync, strFromU8 } from "fflate";
import { parseGame, parseChallenges } from "../lib/config-schema.mjs";
import { createApi } from "../server/api.mjs";
import { createSQLiteAdapter, initializeSchema } from "../server/sqlite.mjs";
import {
  createSnapshot,
  exportFullBackup,
  validateSnapshot,
} from "../server/backup.mjs";
const baseline = parseChallenges(
  readFileSync("content/challenges.yaml", "utf8"),
);
function config() {
  return parseGame(
    `characters:\n  - id: web\n    name: Web\n  - id: thunder\n    name: Thunder\naccounts:\n  allowRegistration: true\n  users:\n    - username: teacher01\n      password: private-teacher-pass-unique\n      role: admin\n      hero: web\n    - username: pending01\n      password: private-pending-pass-unique\n      hero: web\n`,
  );
}
function setup() {
  const sqlite = new DatabaseSync(":memory:");
  initializeSchema(sqlite);
  const cfg = config(),
    db = createSQLiteAdapter(sqlite);
  const api = createApi({
    db,
    config: cfg,
    challenges: baseline,
    exportBackup: (state) => exportFullBackup(state),
  });
  return { sqlite, cfg, db, client: () => client(api) };
}
function client(api) {
  let cookie = "";
  return async (path, body) => {
    const r = await api(
      new Request("https://quest.test" + path, {
        method: body ? "POST" : "GET",
        headers: {
          Origin: "https://quest.test",
          "Content-Type": "application/json",
          Cookie: cookie,
        },
        body: body ? JSON.stringify(body) : undefined,
      }),
    );
    if (r.headers.has("set-cookie"))
      cookie = r.headers.get("set-cookie").split(";")[0];
    const bytes = new Uint8Array(await r.arrayBuffer());
    return {
      status: r.status,
      data: r.headers.get("content-type")?.includes("json")
        ? JSON.parse(strFromU8(bytes))
        : null,
      bytes,
      headers: r.headers,
    };
  };
}
async function teacher(call) {
  assert.equal(
    (
      await call("/api/auth", {
        username: "teacher01",
        password: "private-teacher-pass-unique",
        mode: "login",
        hero: "web",
      })
    ).status,
    200,
  );
}
async function create(admin, username, role = "student") {
  const r = await admin("/api/admin/users", {
    username,
    password: "new-student-password",
    role,
    hero: "thunder",
    disabled: false,
    revision: 0,
    editing: false,
  });
  assert.equal(r.status, 200);
  return r.data.users.find((a) => a.username === username);
}
test("user management authorizes admins, resets passwords/sessions, manages roles and preserves progress", async () => {
  const { sqlite, cfg, client } = setup();
  try {
    const guest = client();
    assert.equal((await guest("/api/admin/users")).status, 401);
    assert.equal((await guest("/api/admin/backup")).status, 401);
    const admin = client();
    await teacher(admin);
    let list = (await admin("/api/admin/users")).data.users;
    assert.ok(list.some((a) => a.username === "pending01" && a.id === null));
    assert.ok(!JSON.stringify(list).includes("private-pending-pass-unique"));
    assert.ok(!JSON.stringify(list).includes("hash"));
    let a = await create(admin, "alice");
    cfg.accounts.allowRegistration = false;
    const alice = client();
    assert.equal(
      (
        await alice("/api/auth", {
          username: "alice",
          password: "new-student-password",
          mode: "login",
        })
      ).status,
      200,
    );
    assert.equal((await alice("/api/admin/users")).status, 403);
    assert.equal((await alice("/api/admin/backup")).status, 403);
    await alice("/api/game", { id: "lantern", answer: "24" });
    let r = await admin("/api/admin/users", {
      username: "alice",
      password: "reset-alice-password",
      role: "student",
      hero: "web",
      disabled: false,
      revision: a.revision,
      editing: true,
    });
    assert.equal(r.status, 200);
    a = r.data.users.find((a) => a.username === "alice");
    assert.equal((await alice("/api/game")).status, 401);
    assert.equal(
      (
        await alice("/api/auth", {
          username: "alice",
          password: "new-student-password",
          mode: "login",
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await alice("/api/auth", {
          username: "alice",
          password: "reset-alice-password",
          mode: "login",
        })
      ).status,
      200,
    );
    assert.equal((await alice("/api/game")).data.score, 100);
    assert.equal((await alice("/api/auth")).data.user.hero, "web");
    r = await admin("/api/admin/users", {
      username: "alice",
      role: "student",
      hero: "web",
      disabled: true,
      revision: a.revision,
      editing: true,
    });
    assert.equal(r.status, 200);
    a = r.data.users.find((a) => a.username === "alice");
    assert.equal((await alice("/api/game")).status, 401);
    assert.equal(
      (
        await alice("/api/auth", {
          username: "alice",
          password: "reset-alice-password",
          mode: "login",
        })
      ).status,
      403,
    );
    r = await admin("/api/admin/users", {
      username: "alice",
      role: "student",
      hero: "web",
      disabled: false,
      revision: a.revision,
      editing: true,
    });
    assert.equal(r.status, 200);
    assert.equal(
      (
        await alice("/api/auth", {
          username: "alice",
          password: "reset-alice-password",
          mode: "login",
        })
      ).status,
      200,
    );
    assert.equal((await alice("/api/game")).data.score, 100);
    assert.equal(
      (
        await admin("/api/admin/users", {
          username: "alice",
          role: "student",
          hero: "web",
          disabled: false,
          revision: 1,
          editing: true,
        })
      ).status,
      409,
    );
    const own = list.find((a) => a.username === "teacher01");
    assert.equal(
      (
        await admin("/api/admin/users", {
          username: "teacher01",
          role: "student",
          hero: "web",
          disabled: false,
          revision: own.revision,
          editing: true,
        })
      ).status,
      400,
    );
    await create(admin, "secondadmin", "admin");
    const second = client();
    assert.equal(
      (
        await second("/api/auth", {
          username: "secondadmin",
          password: "new-student-password",
          mode: "login",
        })
      ).status,
      200,
    );
    assert.equal((await second("/api/admin/users")).status, 200);
  } finally {
    sqlite.close();
  }
});
test("scoreboard uses earned net points, shares tie ranks and excludes admins and disabled users", async () => {
  const { sqlite, client } = setup();
  try {
    const admin = client();
    await teacher(admin);
    assert.equal((await client()("/api/scoreboard")).status, 401);
    for (const name of ["alice", "bob", "carol"]) {
      await create(admin, name);
      const c = client();
      await c("/api/auth", {
        username: name,
        password: "new-student-password",
        mode: "login",
      });
      if (name === "carol")
        await c("/api/game", {
          id: "lantern",
          action: "hint",
          hintId: "multiply",
        });
      await c("/api/game", { id: "lantern", answer: "24" });
    }
    let players = (await admin("/api/scoreboard")).data.players;
    assert.deepEqual(
      players
        .filter((p) => p.score > 0)
        .map((p) => [p.username, p.rank, p.score]),
      [
        ["alice", 1, 100],
        ["bob", 1, 100],
        ["carol", 3, 90],
      ],
    );
    assert.ok(!players.some((p) => p.username === "teacher01"));
    assert.ok(!JSON.stringify(players).includes("hash"));
    const bob = (await admin("/api/admin/users")).data.users.find(
      (a) => a.username === "bob",
    );
    await admin("/api/admin/users", {
      username: "bob",
      role: "student",
      hero: "thunder",
      disabled: true,
      revision: bob.revision,
      editing: true,
    });
    players = (await admin("/api/scoreboard")).data.players;
    assert.ok(!players.some((p) => p.username === "bob"));
  } finally {
    sqlite.close();
  }
});
test("full ZIP recreates accounts/passwords/progress, configuration, assets and application on a fresh database", async () => {
  const { sqlite, db, cfg, client: makeClient } = setup();
  const dir = mkdtempSync(resolve(tmpdir(), "north-restore-"));
  try {
    const admin = makeClient();
    await teacher(admin);
    const created = await create(admin, "alice");
    const spawn = { map: "castle", location: { x: 20, y: 23 } };
    assert.equal(
      (
        await admin("/api/admin/users", {
          ...created,
          editing: true,
          spawn,
          themeRevision: 0,
        })
      ).status,
      200,
    );
    assert.equal(
      (await admin("/api/admin/presence", { visibility: "all", revision: 0 }))
        .status,
      200,
    );
    const alice = makeClient();
    await alice("/api/auth", {
      username: "alice",
      password: "new-student-password",
      mode: "login",
    });
    await alice("/api/game", {
      id: "lantern",
      action: "hint",
      hintId: "multiply",
    });
    await alice("/api/game", { id: "lantern", answer: "24" });
    const snapshot = await createSnapshot({
      db,
      config: cfg,
      challenges: baseline,
    });
    assert.ok(snapshot.accounts.some((a) => a.username === "pending01"));
    assert.ok(
      !JSON.stringify(snapshot).includes("private-pending-pass-unique"),
    );
    assert.ok(
      !JSON.stringify(snapshot).includes("private-teacher-pass-unique"),
    );
    assert.ok(!("sessions" in snapshot));
    const exported = await admin("/api/admin/backup");
    assert.equal(exported.status, 200);
    assert.equal(exported.headers.get("content-type"), "application/zip");
    const entries = unzipSync(exported.bytes);
    for (const path of [
      "package.json",
      "package-lock.json",
      "server/selfhost.mjs",
      "server/restore.mjs",
      "server/recreation-kit.mjs",
      "selfhost/dist/index.html",
      "public/audio/north-pole.mid",
      "public/downloads/packing-list.txt",
      "backup.json",
      "content/game.yaml",
      "content/challenges.yaml",
      "app/page.tsx",
    ])
      assert.ok(entries[path], path);
    assert.ok(
      !JSON.parse(strFromU8(entries[".openai/hosting.json"])).project_id,
    );
    assert.ok(
      parseGame(strFromU8(entries["content/game.yaml"])).accounts.users.every(
        (a) => !a.password && a.passwordHash,
      ),
    );
    for (const [path, bytes] of Object.entries(entries)) {
      assert.ok(!path.startsWith("/") && !path.split("/").includes(".."));
      const target = resolve(dir, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, bytes);
    }
    symlinkSync(resolve("node_modules"), resolve(dir, "node_modules"), "dir");
    const result = spawnSync("node", ["server/restore.mjs", "backup.json"], {
      cwd: dir,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    const restored = new DatabaseSync(resolve(dir, "data/quest.sqlite"));
    try {
      const restoredConfig = parseGame(
        readFileSync(resolve(dir, "content/game.yaml"), "utf8"),
      );
      const api = createApi({
        db: createSQLiteAdapter(restored),
        config: restoredConfig,
        challenges: baseline,
      });
      const restoredAlice = client(api);
      assert.equal(
        (
          await restoredAlice("/api/auth", {
            username: "alice",
            password: "new-student-password",
            mode: "login",
          })
        ).status,
        200,
      );
      assert.deepEqual(
        (await restoredAlice("/api/auth")).data.user.spawn,
        spawn,
      );
      assert.equal(
        restored.prepare("SELECT visibility FROM presence_settings").get()
          .visibility,
        "all",
      );
      assert.equal((await restoredAlice("/api/game")).data.score, 90);
      assert.equal(
        (await restoredAlice("/api/game")).data.challenges[0].hints[0].unlocked,
        true,
      );
      const restoredPending = client(api);
      assert.equal(
        (
          await restoredPending("/api/auth", {
            username: "pending01",
            password: "private-pending-pass-unique",
            mode: "login",
            hero: "web",
          })
        ).status,
        200,
      );
      const restoredAdmin = client(api);
      await teacher(restoredAdmin);
      assert.equal((await restoredAdmin("/api/admin/users")).status, 200);
      assert.equal(
        restored.prepare("SELECT COUNT(*) AS n FROM sessions").get().n,
        3,
      );
    } finally {
      restored.close();
    }
    const refused = spawnSync("node", ["server/restore.mjs", "backup.json"], {
      cwd: dir,
      encoding: "utf8",
    });
    assert.notEqual(refused.status, 0);
    assert.match(refused.stderr, /empty database/);
    assert.throws(() =>
      validateSnapshot({
        ...snapshot,
        accounts: [...snapshot.accounts, snapshot.accounts[0]],
      }),
    );
  } finally {
    sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
