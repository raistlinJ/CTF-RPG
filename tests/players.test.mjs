import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { stringify } from "yaml";
import { parseGame, parseChallenges } from "../lib/config-schema.mjs";
import { createApi } from "../server/api.mjs";
import { createSQLiteAdapter, initializeSchema } from "../server/sqlite.mjs";
import { createSnapshot, validateSnapshot } from "../server/backup.mjs";
import { defaultWorld } from "../lib/world-data.mjs";
function setup() {
  const sqlite = new DatabaseSync(":memory:");
  initializeSchema(sqlite);
  const config = parseGame(
    stringify({
      characters: [{ id: "web", name: "Web" }],
      accounts: {
        allowRegistration: true,
        users: [
          {
            username: "teacher",
            password: "teacher-password",
            role: "admin",
            hero: "web",
          },
          {
            username: "assigned",
            password: "student-password",
            spawn: { map: "castle", location: { x: 20, y: 23 } },
          },
        ],
      },
    }),
  );
  const db = createSQLiteAdapter(sqlite),
    challenges = parseChallenges(
      readFileSync("content/challenges.yaml", "utf8"),
    ),
    api = createApi({ db, config, challenges });
  function client() {
    let cookie = "";
    return async (path, body, method = body ? "POST" : "GET") => {
      const r = await api(
        new Request("https://quest.test" + path, {
          method,
          headers: {
            Origin: "https://quest.test",
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
const auth = (c, username, mode = "register") =>
  c("/api/auth", {
    username,
    password: username === "teacher" ? "teacher-password" : "student-password",
    hero: "web",
    mode,
  });
test("admin assigns user spawn; students cannot override; invalid/stale tiles reject; backups keep assignments with old-backup compatibility", async () => {
  const { sqlite, db, config, challenges, client } = setup();
  try {
    const admin = client(),
      student = client();
    await auth(admin, "teacher", "login");
    const signed = await auth(student, "assigned", "login");
    assert.equal(signed.data.user.spawn.map, "castle");
    const list = (await admin("/api/admin/users")).data;
    let account = list.users.find((a) => a.username === "assigned");
    const body = {
      ...account,
      editing: true,
      themeRevision: list.themeRevision,
      spawn: { map: "town", location: { x: 19, y: 20 } },
    };
    assert.equal((await student("/api/admin/users", body)).status, 403);
    assert.equal(
      (
        await admin("/api/admin/users", {
          ...body,
          spawn: { map: "town", location: { x: 0, y: 0 } },
        })
      ).status,
      400,
    );
    assert.equal(
      (await admin("/api/admin/users", { ...body, themeRevision: 99 })).status,
      409,
    );
    const saved = await admin("/api/admin/users", body);
    assert.equal(saved.status, 200);
    assert.deepEqual((await student("/api/auth")).data.user.spawn, body.spawn);
    await student("/api/auth", {
      username: "assigned",
      password: "student-password",
      hero: "web",
      mode: "login",
      spawn: { map: "town", location: { x: 1, y: 1 } },
    });
    assert.deepEqual((await student("/api/auth")).data.user.spawn, body.spawn);
    const snapshot = await createSnapshot({ db, config, challenges });
    assert.deepEqual(
      snapshot.accounts.find((a) => a.username === "assigned").spawn,
      body.spawn,
    );
    const old = structuredClone(snapshot);
    old.accounts.forEach((a) => delete a.spawn);
    delete old.playerVisibility;
    assert.equal(validateSnapshot(old).accounts[0].spawn, null);
    // A theme change that removes/blocks the saved tile safely falls back to the new default.
    const world = structuredClone(defaultWorld);
    world.maps
      .find((m) => m.id === "town")
      .obstacles.push({ x: 19, y: 20, w: 1, h: 1 });
    sqlite
      .prepare(
        "INSERT INTO theme_catalog(id,payload,revision) VALUES('active',?,1)",
      )
      .run(JSON.stringify({ ...list.theme, world }));
    assert.deepEqual((await student("/api/auth")).data.user.spawn, {
      map: "town",
      location: world.maps[0].spawn,
    });
  } finally {
    sqlite.close();
  }
});
test("presence isolates teams, allows admin-controlled all/off, expires ghosts, rejects forged positions and preserves visibility in backups", async () => {
  const { sqlite, db, config, challenges, client } = setup();
  try {
    const admin = client(),
      a = client(),
      b = client(),
      c = client(),
      guest = client();
    await auth(admin, "teacher", "login");
    for (const [f, name] of [
      [a, "alice"],
      [b, "bobby"],
      [c, "carol"],
    ])
      assert.equal((await auth(f, name)).status, 200);
    const position = { map: "town", x: 18, y: 20, themeRevision: 0 };
    assert.equal((await guest("/api/presence", position)).status, 401);
    assert.equal((await a("/api/presence", position)).status, 403);
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
    await c("/api/teams", {
      mode: "create",
      name: "C team",
      password: "team-password",
    });
    assert.equal(
      (await a("/api/admin/presence", { visibility: "all", revision: 0 }))
        .status,
      403,
    );
    assert.equal(
      (await a("/api/presence", { ...position, x: 0, y: 0 })).status,
      400,
    );
    assert.equal(
      (await a("/api/presence", { ...position, themeRevision: 3 })).status,
      409,
    );
    await b("/api/presence", { ...position, x: 19, username: "fake" });
    await c("/api/presence", position);
    let result = await a("/api/presence", position);
    assert.deepEqual(
      result.data.players.map((p) => p.username),
      ["bobby"],
    );
    assert.equal(result.data.players[0].teammate, true);
    let setting = (await admin("/api/admin/presence")).data;
    assert.equal(setting.visibility, "team");
    setting = (
      await admin("/api/admin/presence", {
        visibility: "all",
        revision: setting.revision,
      })
    ).data;
    assert.equal(
      (await admin("/api/admin/presence", { visibility: "off", revision: 0 }))
        .status,
      409,
    );
    result = await a("/api/presence", position);
    assert.deepEqual(result.data.players.map((p) => p.username).sort(), [
      "bobby",
      "carol",
    ]);
    assert.equal(
      result.data.players.find((p) => p.username === "carol").teammate,
      false,
    );
    assert.deepEqual(Object.keys(result.data.players[0]).sort(), [
      "hero",
      "team",
      "teammate",
      "username",
      "x",
      "y",
    ]);
    await b("/api/presence", { map: "castle", x: 20, y: 23, themeRevision: 0 });
    assert.deepEqual(
      (await a("/api/presence", position)).data.players.map((p) => p.username),
      ["carol"],
    );
    sqlite
      .prepare(
        "UPDATE player_presence SET updated_at=0 WHERE user=(SELECT id FROM students WHERE username=?)",
      )
      .run("carol");
    assert.deepEqual((await a("/api/presence", position)).data.players, []);
    await b("/api/presence", position);
    await b("/api/auth", {}, "DELETE");
    assert.deepEqual((await a("/api/presence", position)).data.players, []);
    setting = (
      await admin("/api/admin/presence", {
        visibility: "off",
        revision: setting.revision,
      })
    ).data;
    assert.equal(setting.visibility, "off");
    assert.deepEqual((await a("/api/presence", position)).data.players, []);
    const snapshot = await createSnapshot({ db, config, challenges });
    assert.equal(snapshot.playerVisibility, "off");
    assert.equal("playerPresence" in snapshot, false);
    assert.match(
      sqlite
        .prepare(
          "EXPLAIN QUERY PLAN SELECT user FROM player_presence WHERE map=? AND theme_revision=? AND updated_at>?",
        )
        .all("town", 0, 0)
        .map((r) => r.detail)
        .join(" "),
      /idx_player_presence/,
    );
  } finally {
    sqlite.close();
  }
});
