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
import { EMOTE_DURATION_MS, PLAYER_EMOTES } from "../lib/player-emotes.mjs";
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
test("only administrators can list map occupants or warp; counts include active users and team names across maps", async () => {
  const { sqlite, client } = setup();
  try {
    const admin = client(), alice = client(), mate = client(), bobby = client(), guest = client();
    await auth(admin, "teacher", "login");
    await auth(alice, "alice"); await auth(mate, "annika"); await auth(bobby, "bobby");
    const alpha = (await alice("/api/teams", { mode: "create", name: "Alpha", password: "team-password" })).data.team;
    await mate("/api/teams", { mode: "join", id: alpha.id, password: "team-password" });
    const beta = (await bobby("/api/teams", { mode: "create", name: "Beta", password: "team-password" })).data.team;
    const town = { map: "town", x: 18, y: 20, themeRevision: 0 };
    const castle = { map: "castle", x: 20, y: 23, themeRevision: 0 };
    await admin("/api/presence", town); await alice("/api/presence", town); await mate("/api/presence", town); await bobby("/api/presence", castle);
    assert.equal((await guest("/api/admin/warp")).status, 401);
    assert.equal((await guest("/api/admin/warp", { map: "castle", themeRevision: 0 })).status, 401);
    assert.equal((await alice("/api/admin/warp")).status, 403);
    assert.equal((await alice("/api/admin/warp", { map: "castle", themeRevision: 0 })).status, 403);
    assert.equal((await admin("/api/admin/warp", undefined, "DELETE")).status, 405);
    // Multiple live sessions must not double-count an explorer.
    sqlite.prepare("INSERT INTO sessions(token,user,expires) SELECT 'another-session',id,? FROM students WHERE username='alice'").run(Date.now() + 60000);
    let roster = (await admin("/api/admin/warp")).data;
    assert.deepEqual(roster.maps.map(map => map.id), defaultWorld.maps.map(map => map.id));
    assert.equal(roster.maps.find(map => map.id === "town").playerCount, 3);
    const visitors = roster.maps.find(map => map.id === "castle");
    assert.equal(visitors.playerCount, 1);
    assert.deepEqual(visitors.players, [{ username: "bobby", role: "student", team: { id: beta.id, name: "Beta" } }]);
    assert.deepEqual(roster.maps.find(map => map.id === "town").players.find(player => player.username === "alice").team, { id: alpha.id, name: "Alpha" });
    assert.ok(roster.maps.some(map => map.playerCount === 0 && map.players.length === 0));
    await bobby("/api/presence", town);
    roster = (await admin("/api/admin/warp")).data;
    assert.equal(roster.maps.find(map => map.id === "town").playerCount, 4);
    assert.equal(roster.maps.find(map => map.id === "castle").playerCount, 0);
    sqlite.prepare("UPDATE player_presence SET updated_at=? WHERE user=(SELECT id FROM students WHERE username='bobby')").run(Date.now() - 20001);
    sqlite.prepare("UPDATE teams SET disabled=1 WHERE id=?").run(alpha.id);
    roster = (await admin("/api/admin/warp")).data;
    assert.deepEqual(roster.maps.flatMap(map => map.players).map(player => player.username), ["teacher"]);
    sqlite.prepare("UPDATE teams SET disabled=0 WHERE id=?").run(alpha.id);
    sqlite.prepare("UPDATE students SET disabled=1 WHERE username='alice'").run();
    sqlite.prepare("DELETE FROM sessions WHERE user=(SELECT id FROM students WHERE username='annika')").run();
    roster = (await admin("/api/admin/warp")).data;
    assert.deepEqual(roster.maps.flatMap(map => map.players).map(player => player.username), ["teacher"]);
  } finally { sqlite.close(); }
});

test("admin warp accepts every current map, updates only the acting admin's live position, and rejects forged or stale destinations", async () => {
  const { sqlite, client } = setup();
  try {
    const admin = client();
    await auth(admin, "teacher", "login");
    const originalSpawn = (await admin("/api/auth")).data.user.spawn;
    const roster = (await admin("/api/admin/warp")).data;
    for (const map of roster.maps) {
      const response = await admin("/api/admin/warp", { map: map.id, themeRevision: roster.themeRevision });
      assert.equal(response.status, 200, JSON.stringify(response.data));
      assert.deepEqual(response.data.pos, defaultWorld.maps.find(info => info.id === map.id).spawn);
      const position = sqlite.prepare("SELECT map,x,y FROM player_presence WHERE user=(SELECT id FROM students WHERE username='teacher')").get();
      assert.deepEqual({ ...position }, { map: map.id, x: response.data.pos.x, y: response.data.pos.y });
    }
    const before = sqlite.prepare("SELECT * FROM player_presence").all();
    assert.equal((await admin("/api/admin/warp", { map: "not-a-map", themeRevision: 0 })).status, 400);
    assert.equal((await admin("/api/admin/warp", { map: "castle", themeRevision: 99 })).status, 409);
    for (const body of [[], { map: "castle" }, { map: "castle", themeRevision: "0" }, { map: "castle", themeRevision: 0, username: "someone-else" }, { map: "castle", themeRevision: 0, pos: { x: 0, y: 0 } }])
      assert.equal((await admin("/api/admin/warp", body)).status, 400);
    assert.deepEqual(sqlite.prepare("SELECT * FROM player_presence").all(), before);
    assert.deepEqual((await admin("/api/auth")).data.user.spawn, originalSpawn);
    assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM unlocked_transports").get().n, 0);
    assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM solved").get().n, 0);
    const response = await admin("/api/admin/warp", { map: "castle", themeRevision: 0 });
    assert.equal(response.status, 200);
    assert.equal((await admin("/api/admin/warp")).data.maps.find(map => map.id === "castle").playerCount, 1);
  } finally { sqlite.close(); }
});

test("warp remains available when player visibility is off, with unavailable counts and no live tracking writes", async () => {
  const { sqlite, client } = setup();
  try {
    const admin = client(); await auth(admin, "teacher", "login");
    await admin("/api/admin/presence", { visibility: "off", revision: 0 });
    const roster = (await admin("/api/admin/warp")).data;
    assert.equal(roster.visibility, "off");
    assert.ok(roster.maps.every(map => map.playerCount === null && map.players.length === 0));
    const destination = (await admin("/api/admin/warp", { map: "castle", themeRevision: 0 })).data;
    assert.equal(destination.map, "castle");
    assert.deepEqual(destination.pos, defaultWorld.maps.find(map => map.id === "castle").spawn);
    assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM player_presence").get().n, 0);
  } finally { sqlite.close(); }
});
test("player reactions are shared with visible players, expire after five seconds without poll renewal, and are removed on leave", async t => {
  const { sqlite, client } = setup();
  try {
    const alice = client(), mate = client(), outsider = client(), admin = client();
    await auth(admin, "teacher", "login");
    await auth(alice, "alice");
    await auth(mate, "annika");
    await auth(outsider, "bobby");
    const team = (await alice("/api/teams", { mode: "create", name: "Alpha", password: "team-password" })).data.team;
    await mate("/api/teams", { mode: "join", id: team.id, password: "team-password" });
    await outsider("/api/teams", { mode: "create", name: "Beta", password: "team-password" });
    const position = { map: "town", x: 18, y: 20, themeRevision: 0 };
    let now = Date.now();
    t.mock.method(Date, "now", () => now);
    for (const { emoji } of PLAYER_EMOTES) {
      const sent = await alice("/api/presence", { ...position, emote: emoji, username: "bobby", expiresAt: now + 100000 });
      assert.equal(sent.status, 200);
      const seen = (await mate("/api/presence", position)).data.players.find(p => p.username === "alice");
      assert.deepEqual(seen.emote, { emoji, remainingMs: EMOTE_DURATION_MS });
    }
    for (const emote of ["not-an-emoji", "🎉", "", null, {}, ["👋"]])
      assert.equal((await alice("/api/presence", { ...position, emote })).status, 400);
    assert.equal((await client()("/api/presence", { ...position, emote: "👋" })).status, 401);
    assert.equal((await outsider("/api/presence", position)).data.players.some(p => p.username === "alice"), false);
    now += EMOTE_DURATION_MS - 1;
    await alice("/api/presence", { ...position, x: 19 });
    let seen = (await mate("/api/presence", position)).data.players.find(p => p.username === "alice");
    assert.deepEqual(seen.emote, { emoji: "😢", remainingMs: 1 });
    now += 1;
    seen = (await mate("/api/presence", position)).data.players.find(p => p.username === "alice");
    assert.equal(seen.emote, undefined);
    await alice("/api/presence", { ...position, emote: "👋" });
    now += 1000;
    await alice("/api/presence", { ...position, emote: "👍" });
    seen = (await mate("/api/presence", position)).data.players.find(p => p.username === "alice");
    assert.deepEqual(seen.emote, { emoji: "👍", remainingMs: EMOTE_DURATION_MS });
    await admin("/api/admin/presence", { visibility: "all", revision: 0 });
    seen = (await outsider("/api/presence", position)).data.players.find(p => p.username === "alice");
    assert.equal(seen.emote.emoji, "👍");
    await admin("/api/admin/presence", { visibility: "off", revision: 1 });
    assert.deepEqual((await mate("/api/presence", position)).data.players, []);
    await alice("/api/presence", { ...position, emote: "👎" });
    assert.equal(sqlite.prepare("SELECT emoji FROM player_emotes WHERE user=(SELECT id FROM students WHERE username='alice')").get().emoji, "👍");
    await alice("/api/presence", undefined, "DELETE");
    assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM player_emotes").get().n, 0);
  } finally {
    sqlite.close();
  }
});

test("existing native and D1 databases can add transient player reactions", () => {
  for (const native of [true, false]) {
    const sqlite = new DatabaseSync(":memory:");
    try {
      initializeSchema(sqlite);
      sqlite.exec("DROP TABLE player_emotes");
      if (native) initializeSchema(sqlite);
      else sqlite.exec(readFileSync("drizzle/0032_player_emotes.sql", "utf8"));
      assert.ok(sqlite.prepare("SELECT name FROM sqlite_master WHERE name='player_emotes'").get());
      assert.ok(sqlite.prepare("PRAGMA foreign_key_list(player_emotes)").all().some(key => key.table === "player_presence" && key.on_delete === "CASCADE"));
    } finally { sqlite.close(); }
  }
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
      "crowned",
      "hero",
      "role",
      "team",
      "teammate",
      "username",
      "x",
      "y",
    ]);
    assert.ok(result.data.players.every((p) => p.role === "student"));
    await admin("/api/presence", position);
    const instructor = (await a("/api/presence", position)).data.players.find(
      (p) => p.username === "teacher",
    );
    assert.equal(instructor.role, "admin");
    assert.equal(instructor.team, null);
    await admin("/api/presence", undefined, "DELETE");
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

test("team crowns use global net team scores, share positive ties, update after awards and respect score visibility", async () => {
  const { sqlite, client } = setup();
  try {
    const admin = client(),
      a = client(),
      mate = client(),
      other = client();
    await auth(admin, "teacher", "login");
    for (const [f, n] of [
      [a, "alice"],
      [mate, "annika"],
      [other, "bobby"],
    ])
      await auth(f, n);
    const team = (
      await a("/api/teams", {
        mode: "create",
        name: "Alpha",
        password: "team-password",
      })
    ).data.team;
    await mate("/api/teams", {
      mode: "join",
      id: team.id,
      password: "team-password",
    });
    await other("/api/teams", {
      mode: "create",
      name: "Beta",
      password: "team-password",
    });
    await admin("/api/admin/presence", { visibility: "all", revision: 0 });
    const pos = { map: "town", x: 18, y: 20, themeRevision: 0 };
    await mate("/api/presence", pos);
    await other("/api/presence", pos);
    let state = (await a("/api/presence", pos)).data;
    assert.equal(state.self.teammate, true);
    assert.equal(state.self.crowned, false);
    assert.ok(state.players.every((p) => !p.crowned));
    await a("/api/game", { id: "lantern", answer: "24" });
    state = (await a("/api/presence", pos)).data;
    assert.equal(state.self.crowned, true);
    assert.equal(
      state.players.find((p) => p.username === "annika").crowned,
      true,
    );
    assert.equal(
      state.players.find((p) => p.username === "bobby").crowned,
      false,
    );
    await other("/api/game", { id: "lantern", answer: "24" });
    state = (await a("/api/presence", pos)).data;
    assert.ok(state.players.every((p) => p.crowned));
    await mate("/api/game", {
      id: "lantern",
      action: "hint",
      hintId: "multiply",
    });
    await mate("/api/game", { id: "lantern", answer: "24" });
    await a("/api/presence", undefined, "DELETE");
    state = (await other("/api/presence", pos)).data;
    assert.equal(state.self.crowned, true); // repeated teammate solves keep the teams tied
    assert.ok(
      state.players.filter((p) => p.teammate === false).every((p) => p.crowned),
    );
    let settings = (await admin("/api/admin/team-social")).data;
    settings = (
      await admin("/api/admin/team-social", {
        ...settings,
        scores: false,
        everyone: { ...settings.everyone, scores: false },
      })
    ).data;
    state = (await a("/api/presence", pos)).data;
    assert.equal(state.self.crowned, false);
    assert.ok(state.players.every((p) => !p.crowned));
    settings = (
      await admin("/api/admin/team-social", { ...settings, scores: true })
    ).data;
    state = (await a("/api/presence", pos)).data;
    assert.equal(state.self.crowned, true);
    assert.equal(
      state.players.find((p) => p.username === "annika").crowned,
      true,
    );
    state = (await other("/api/presence", pos)).data;
    assert.ok(state.players.every((p) => !p.crowned));
    // The leader's offline members still contribute; disabled accounts do not.
    // Use the admin action so this also verifies immediate score-cache invalidation.
    const roster = (await admin("/api/admin/users")).data;
    const alice = roster.users.find(user => user.username === "alice");
    assert.equal((await admin("/api/admin/users", {action:"disable",users:[{username:alice.username,revision:alice.revision}]})).status,200);
    state = (await mate("/api/presence", pos)).data;
    assert.equal(state.self.crowned, false);
    assert.equal(
      state.players.find((p) => p.username === "bobby").crowned,
      false,
    ); // other team's score is hidden
    settings = (
      await admin("/api/admin/team-social", {
        ...settings,
        everyone: { ...settings.everyone, scores: true },
      })
    ).data;
    state = (await mate("/api/presence", pos)).data;
    assert.equal(
      state.players.find((p) => p.username === "bobby").crowned,
      true,
    );
  } finally {
    sqlite.close();
  }
});
