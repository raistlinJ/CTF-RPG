import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  readFileSync,
  cpSync,
  mkdtempSync,
  writeFileSync,
  symlinkSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createApi } from "../server/api.mjs";
import { parseGame, parseChallenges } from "../lib/config-schema.mjs";
import { createSQLiteAdapter, initializeSchema } from "../server/sqlite.mjs";
import { createSnapshot, validateSnapshot } from "../server/backup.mjs";
function setup() {
  const sqlite = new DatabaseSync(":memory:");
  initializeSchema(sqlite);
  const config = parseGame(
      "characters:\n - id: web\n   name: Web\naccounts:\n allowRegistration: true\n users:\n  - username: teacher\n    role: admin\n    password: teacher-password",
    ),
    db = createSQLiteAdapter(sqlite),
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
async function prepare(s) {
  const admin = s.client(),
    a = s.client(),
    mate = s.client(),
    b = s.client(),
    outsider = s.client();
  await admin("/api/auth", {
    mode: "login",
    username: "teacher",
    password: "teacher-password",
    hero: "web",
  });
  for (const [f, n] of [
    [a, "alice"],
    [mate, "annika"],
    [b, "bobby"],
    [outsider, "carol"],
  ])
    await f("/api/auth", {
      mode: "register",
      username: n,
      password: "student-password",
      hero: "web",
    });
  const ta = (
      await a("/api/teams", {
        mode: "create",
        name: "Team Alpha",
        password: "team-password",
      })
    ).data.team,
    tb = (
      await b("/api/teams", {
        mode: "create",
        name: "Team Beta",
        password: "team-password",
      })
    ).data.team;
  await mate("/api/teams", {
    mode: "join",
    id: ta.id,
    password: "team-password",
  });
  await outsider("/api/teams", {
    mode: "create",
    name: "Team Other",
    password: "team-password",
  });
  return { admin, a, mate, b, outsider, ta, tb };
}
test("team cards aggregate net scores; each admin switch is enforced in student APIs with stale-save protection", async () => {
  const s = setup();
  try {
    const { admin, a, mate, ta, tb } = await prepare(s);
    await a("/api/game", { id: "lantern", action: "hint", hintId: "multiply" });
    await a("/api/game", { id: "lantern", answer: "24" });
    await mate("/api/game", { id: "lantern", answer: "24" });
    let cards = await a("/api/team-social");
    assert.equal(cards.status, 200);
    assert.equal(cards.data.teams.find((t) => t.id === ta.id).score, 190);
    assert.equal(cards.data.teams.find((t) => t.id === tb.id).score, 0);
    assert.equal((await a("/api/admin/team-social")).status, 403);
    assert.equal((await s.client()("/api/team-social")).status, 401);
    let settings = (await admin("/api/admin/team-social")).data;
    settings = (
      await admin("/api/admin/team-social", {
        ...settings,
        names: false,
        scores: false,
        messaging: false,
        everyone: { names: false, scores: false, messaging: false },
      })
    ).data;
    assert.equal(
      (
        await admin("/api/admin/team-social", {
          names: true,
          scores: true,
          messaging: true,
          revision: 0,
        })
      ).status,
      409,
    );
    cards = await a("/api/team-social");
    assert.ok(!JSON.stringify(cards.data).includes("Team Alpha"));
    assert.ok(cards.data.teams.every((t) => !("name" in t) && !("score" in t)));
    assert.ok(
      !JSON.stringify((await a("/api/teams")).data).includes("Team Alpha"),
    );
    assert.equal(
      (
        await a("/api/team-social", {
          id: crypto.randomUUID(),
          team: tb.id,
          text: "disabled",
        })
      ).status,
      403,
    );
    settings = (
      await admin("/api/admin/team-social", {
        ...settings,
        messaging: true,
        everyone: { ...settings.everyone, messaging: true },
      })
    ).data;
    assert.equal(settings.names, false);
    assert.equal(settings.scores, false);
    assert.equal(
      (
        await a("/api/team-social", {
          id: crypto.randomUUID(),
          team: tb.id,
          text: "hello",
        })
      ).status,
      200,
    );
    const data = (await a("/api/team-social?team=" + tb.id)).data;
    assert.equal(data.messages.length, 1);
    assert.ok(!JSON.stringify(data).includes("Team Alpha"));
    assert.ok(!("score" in data.team));
  } finally {
    s.sqlite.close();
  }
});
test("team messages deliver to all members, isolate other conversations, deduplicate retries, throttle, and restore with settings", async () => {
  const s = setup();
  let folder;
  try {
    const { admin, a, mate, b, outsider, ta, tb } = await prepare(s);
    const msg = {
      id: crypto.randomUUID(),
      team: tb.id,
      text: "hello\nworld <script>alert(1)</script>",
    };
    assert.equal((await a("/api/team-social", msg)).status, 200);
    assert.equal((await a("/api/team-social", msg)).status, 200);
    assert.equal(
      s.sqlite.prepare("SELECT COUNT(*) n FROM team_messages").get().n,
      1,
    );
    assert.equal(
      (await mate("/api/team-social?team=" + tb.id)).data.messages[0].text,
      msg.text,
    );
    assert.equal(
      (await b("/api/team-social?team=" + tb.id)).data.messages[0].text,
      msg.text,
    );
    assert.equal(
      (await outsider("/api/team-social?team=" + ta.id)).data.messages.length,
      0,
    );
    assert.ok((await b("/api/team-social")).data.latestMessageAt > 0);
    assert.equal(
      (
        await b("/api/team-social", {
          id: crypto.randomUUID(),
          team: ta.id,
          text: "reply",
        })
      ).status,
      200,
    );
    assert.equal(
      (await a("/api/team-social?team=" + ta.id)).data.messages.length,
      2,
    );
    for (let i = 0; i < 4; i++)
      assert.equal(
        (
          await a("/api/team-social", {
            id: crypto.randomUUID(),
            team: tb.id,
            text: "message " + i,
          })
        ).status,
        200,
      );
    assert.equal(
      (
        await a("/api/team-social", {
          id: crypto.randomUUID(),
          team: tb.id,
          text: "too many",
        })
      ).status,
      429,
    );
    assert.equal(
      (
        await a("/api/team-social", {
          id: crypto.randomUUID(),
          team: "missing",
          text: "hello",
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await a("/api/team-social", {
          id: crypto.randomUUID(),
          team: tb.id,
          text: "x".repeat(1001),
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await admin("/api/team-social", {
          id: crypto.randomUUID(),
          team: ta.id,
          text: "Instructor note",
        })
      ).status,
      200,
    );
    assert.equal(
      (await a("/api/team-social?team=" + ta.id)).data.messages.at(-1).sender,
      "Instructor",
    );
    let features = (await admin("/api/admin/team-social")).data;
    await admin("/api/admin/team-social", {
      ...features,
      messaging: false,
      everyone: { ...features.everyone, messaging: false },
    });
    assert.deepEqual(
      (await a("/api/team-social?team=" + tb.id)).data.messages,
      [],
    );
    const snap = await createSnapshot({
      db: s.db,
      config: s.config,
      challenges: s.challenges,
    });
    assert.equal(snap.teamFeatures.messaging, false);
    assert.equal(snap.teamFeatures.everyone.messaging, false);
    assert.equal(snap.teamMessages.length, 7);
    assert.throws(() =>
      validateSnapshot({
        ...snap,
        teamMessages: [{ ...snap.teamMessages[0], recipient_team: "missing" }],
      }),
    );
    const old = structuredClone(snap);
    delete old.teamMessages;
    delete old.teamFeatures;
    assert.deepEqual(validateSnapshot(old).teamMessages, []);
    folder = mkdtempSync(resolve(tmpdir(), "team-social-"));
    cpSync("server", resolve(folder, "server"), { recursive: true });
    cpSync("lib", resolve(folder, "lib"), { recursive: true });
    symlinkSync(
      resolve("node_modules"),
      resolve(folder, "node_modules"),
      "dir",
    );
    const file = resolve(folder, "backup.json"),
      dbpath = resolve(folder, "restored.sqlite");
    writeFileSync(file, JSON.stringify(snap));
    const restored = spawnSync(
      process.execPath,
      [resolve(folder, "server/restore.mjs"), file],
      { env: { ...process.env, DATABASE_PATH: dbpath }, encoding: "utf8" },
    );
    assert.equal(restored.status, 0, restored.stderr);
    const sql = new DatabaseSync(dbpath);
    assert.equal(
      sql.prepare("SELECT COUNT(*) n FROM team_messages").get().n,
      7,
    );
    assert.equal(
      sql.prepare("SELECT messaging FROM team_social_settings").get().messaging,
      0,
    );
    assert.equal(
      sql.prepare("SELECT everyone_messaging FROM team_social_settings").get()
        .everyone_messaging,
      0,
    );
    sql.close();
    assert.equal(
      (await admin("/api/admin/teams", { id: tb.id }, "DELETE")).status,
      200,
    );
    assert.equal(
      s.sqlite
        .prepare(
          "SELECT COUNT(*) n FROM team_messages WHERE recipient_team=? OR sender_team=?",
        )
        .get(tb.id, tb.id).n,
      0,
    );
    assert.equal((await a("/api/team-social?team=" + tb.id)).status, 404);
  } finally {
    s.sqlite.close();
    if (folder) rmSync(folder, { recursive: true, force: true });
  }
});

test("All players uses independent other-team permissions, including inbox history, metadata and message writes", async () => {
  const s = setup();
  try {
    const { admin, a, mate, b, ta, tb } = await prepare(s);
    await admin("/api/admin/presence", { visibility: "all", revision: 0 });
    await a("/api/team-social", {
      id: crypto.randomUUID(),
      team: ta.id,
      text: "internal hello",
    });
    await b("/api/team-social", {
      id: crypto.randomUUID(),
      team: ta.id,
      text: "cross-team hello",
    });
    const first = (await admin("/api/admin/team-social")).data;
    let flags = (
      await admin("/api/admin/team-social", {
        ...first,
        everyone: { names: false, scores: false, messaging: false },
      })
    ).data;
    assert.equal(flags.messaging, true);
    assert.equal(flags.everyone.messaging, false);
    const directory = (await a("/api/team-social")).data,
      own = directory.teams.find((t) => t.id === ta.id),
      other = directory.teams.find((t) => t.id === tb.id);
    assert.equal(own.name, "Team Alpha");
    assert.equal(own.score, 0);
    assert.equal(own.canMessage, true);
    assert.equal("name" in other, false);
    assert.equal("score" in other, false);
    assert.equal(other.canMessage, false);
    const others = (await a("/api/team-social?team=" + tb.id)).data;
    assert.equal(others.team.canReadMessages, false);
    assert.deepEqual(others.messages, []);
    const inbox = (await mate("/api/team-social?team=" + ta.id)).data;
    assert.deepEqual(
      inbox.messages.map((m) => m.text),
      ["internal hello"],
    );
    assert.equal(
      (
        await a("/api/team-social", {
          id: crypto.randomUUID(),
          team: tb.id,
          text: "blocked",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await a("/api/team-social", {
          id: crypto.randomUUID(),
          team: ta.id,
          text: "still internal",
        })
      ).status,
      200,
    );
    const joinList = (await a("/api/teams")).data;
    assert.equal(joinList.team.name, "Team Alpha");
    assert.ok(!JSON.stringify(joinList).includes("Team Beta"));
    // Seeing another sprite does not grant access to its team's disabled fields.
    await b("/api/presence", { map: "town", x: 18, y: 20, themeRevision: 0 });
    const presence = (
      await a("/api/presence", { map: "town", x: 18, y: 20, themeRevision: 0 })
    ).data;
    assert.ok(presence.players.some((p) => p.team === tb.id));
    assert.equal(presence.teamFeatures.everyone.messaging, false);
    const snapshot = await createSnapshot({
      db: s.db,
      config: s.config,
      challenges: s.challenges,
    });
    assert.equal(snapshot.teamFeatures.messaging, true);
    assert.equal(snapshot.teamFeatures.everyone.messaging, false);
    // The reverse policy allows other teams while hiding internal conversations.
    flags = (
      await admin("/api/admin/team-social", {
        ...flags,
        names: false,
        scores: false,
        messaging: false,
        everyone: { names: true, scores: true, messaging: true },
      })
    ).data;
    const reverse = (await a("/api/team-social")).data;
    assert.equal("name" in reverse.teams.find((t) => t.id === ta.id), false);
    assert.equal(reverse.teams.find((t) => t.id === tb.id).name, "Team Beta");
    assert.equal(reverse.teams.find((t) => t.id === tb.id).score, 0);
    assert.equal(
      (
        await a("/api/team-social", {
          id: crypto.randomUUID(),
          team: ta.id,
          text: "blocked internal",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await a("/api/team-social", {
          id: crypto.randomUUID(),
          team: tb.id,
          text: "allowed external",
        })
      ).status,
      200,
    );
    const reverseInbox = (await a("/api/team-social?team=" + ta.id)).data;
    assert.equal(reverseInbox.team.canMessage, false);
    assert.equal(reverseInbox.team.canReadMessages, true);
    assert.ok(reverseInbox.messages.every((m) => !m.text.includes("internal")));
    assert.ok(reverseInbox.messages.some((m) => m.text === "cross-team hello"));
  } finally {
    s.sqlite.close();
  }
});
test("legacy saved controls and legacy YAML retain their behavior for other teams", async () => {
  const s = setup();
  try {
    const { admin } = await prepare(s);
    s.sqlite
      .prepare(
        "INSERT INTO team_social_settings(id,names,scores,messaging,revision) VALUES('active',0,1,0,1)",
      )
      .run();
    const flags = (await admin("/api/admin/team-social")).data;
    assert.deepEqual(flags.everyone, {
      names: false,
      scores: true,
      messaging: false,
    });
    const cfg = parseGame(
      "characters:\n - id: web\n   name: Web\nteams:\n features:\n  names: false\n  scores: true\n  messaging: false",
    );
    assert.equal(cfg.teams.features.everyone, undefined);
    const yaml = parseGame(
      "characters:\n - id: web\n   name: Web\nteams:\n features:\n  messaging: true\n  everyone:\n   messaging: false",
    );
    assert.equal(yaml.teams.features.messaging, true);
    assert.equal(yaml.teams.features.everyone.messaging, false);
  } finally {
    s.sqlite.close();
  }
});
