import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { parseChallenges, parseGame } from "../lib/config-schema.mjs";
import { createApi } from "../server/api.mjs";
const baseline = parseChallenges(
  readFileSync("content/challenges.yaml", "utf8"),
);
const fixture = {
  characters: [{ id: "web" }],
  accounts: {
    allowRegistration: true,
    users: [
      {
        username: "teacher01",
        password: "teacher-password",
        role: "admin",
        hero: "web",
      },
    ],
  },
  audio: {},
};
function setup(platformAdmin = false) {
  const sqlite = new DatabaseSync(":memory:");
  for (const file of [
    "0000_long_matthew_murdock.sql",
    "0001_white_maria_hill.sql",
    "0002_melodic_stephen_strange.sql",
  ])
    sqlite.exec(readFileSync("drizzle/" + file, "utf8"));
  const db = {
    prepare(sql) {
      const stmt = sqlite.prepare(sql);
      return {
        bind(...args) {
          return {
            async first() {
              return stmt.get(...args) || null;
            },
            async all() {
              return { results: stmt.all(...args) };
            },
            async run() {
              return stmt.run(...args);
            },
          };
        },
      };
    },
  };
  const api = createApi({
    db,
    config: fixture,
    challenges: baseline,
    platformAdmin,
  });
  function client() {
    let cookie = "";
    return async (path, body, extra = {}) => {
      const r = await api(
        new Request("https://quest.test" + path, {
          method: body ? "POST" : "GET",
          headers: {
            Origin: "https://quest.test",
            "Content-Type": "application/json",
            Cookie: cookie,
            ...extra,
          },
          body: body ? JSON.stringify(body) : undefined,
        }),
      );
      if (r.headers.has("set-cookie"))
        cookie = r.headers.get("set-cookie").split(";")[0];
      const text = await r.text();
      return {
        status: r.status,
        contentType: r.headers.get("content-type"),
        data: r.headers.get("content-type")?.includes("json")
          ? JSON.parse(text)
          : text,
      };
    };
  }
  return { sqlite, client, db };
}
const newChallenge = (id = "new-scroll") => ({
  id,
  map: "town",
  object: "Secret snow scroll",
  location: { x: 14, y: 20 },
  region: "Town square",
  text: "Find the secret flag.",
  flags: ["ADMIN_CREATED_SECRET"],
  caseSensitive: true,
  points: 80,
  hints: [{ id: "clue", label: "A clue", text: "SECRET ADMIN HINT", cost: 10 }],
  downloads: [{ name: "Puzzle", url: "/downloads/packing-list.txt" }],
});
async function teacher(call) {
  assert.equal(
    (
      await call("/api/auth", {
        username: "teacher01",
        password: "teacher-password",
        hero: "web",
        mode: "login",
      })
    ).status,
    200,
  );
}
test("only configured admins or trusted platform authorization can read/edit/export definitions", async () => {
  const { sqlite, client } = setup();
  try {
    const anonymous = client();
    assert.equal((await anonymous("/api/admin/challenges")).status, 401);
    assert.equal(
      (await anonymous("/api/admin/challenges?format=yaml")).status,
      401,
    );
    assert.equal(
      (
        await anonymous(
          "/api/admin/challenges",
          {},
          { "oai-authenticated-user-email": "owner@example.org" },
        )
      ).status,
      401,
    );
    const student = client();
    const auth = await student("/api/auth", {
      username: "student01",
      password: "student-password",
      hero: "web",
      mode: "register",
      role: "admin",
    });
    assert.equal(auth.data.user.role, "student");
    assert.equal((await student("/api/admin/challenges")).status, 403);
    assert.equal(
      (
        await student("/api/admin/challenges", {
          revision: 0,
          challenge: newChallenge(),
        })
      ).status,
      403,
    );
    const admin = client();
    await teacher(admin);
    assert.equal((await admin("/api/admin/challenges")).status, 200);
    assert.match(
      (await admin("/api/admin/challenges?format=yaml")).data,
      /flags:/,
    );
    assert.equal(
      (
        await admin(
          "/api/admin/challenges",
          {},
          { Origin: "https://evil.test" },
        )
      ).status,
      403,
    );
  } finally {
    sqlite.close();
  }
  const trusted = setup(true);
  try {
    assert.equal((await trusted.client()("/api/admin/challenges")).status, 200);
  } finally {
    trusted.sqlite.close();
  }
});
test("admin creation/editing changes student game immediately without leaking flags or locked hints", async () => {
  const { sqlite, client } = setup();
  try {
    const admin = client();
    await teacher(admin);
    let r = await admin("/api/admin/challenges", {
      revision: 0,
      challenge: newChallenge(),
    });
    assert.equal(r.status, 200);
    assert.equal(r.data.revision, 1);
    const student = client();
    await student("/api/auth", {
      username: "student01",
      password: "student-password",
      hero: "web",
      mode: "register",
    });
    r = await student("/api/game");
    assert.ok(r.data.challenges.some((c) => c.object === "Secret snow scroll"));
    assert.ok(!JSON.stringify(r.data).includes("ADMIN_CREATED_SECRET"));
    assert.ok(!JSON.stringify(r.data).includes("SECRET ADMIN HINT"));
    assert.equal(
      (
        await student("/api/game", {
          id: "new-scroll",
          answer: "admin_created_secret",
        })
      ).data.correct,
      false,
    );
    assert.equal(
      (
        await student("/api/game", {
          id: "new-scroll",
          answer: "ADMIN_CREATED_SECRET",
        })
      ).data.awardedPoints,
      80,
    );
    const edit = { ...newChallenge(), object: "Renamed scroll", points: 150 };
    assert.equal(
      (
        await admin("/api/admin/challenges", {
          revision: 1,
          editingId: "new-scroll",
          challenge: edit,
        })
      ).status,
      200,
    );
    assert.equal((await student("/api/game")).data.score, 80);
    const yaml = (await admin("/api/admin/challenges?format=yaml")).data;
    const parsed = parseChallenges(yaml);
    assert.equal(
      parsed.find((c) => c.id === "new-scroll").object,
      "Renamed scroll",
    );
    assert.ok(yaml.includes("ADMIN_CREATED_SECRET"));
  } finally {
    sqlite.close();
  }
});
test("invalid locations, duplicate positions/IDs, ID changes and stale concurrent saves are rejected", async () => {
  const { sqlite, client } = setup();
  try {
    const admin = client();
    await teacher(admin);
    assert.equal(
      (
        await admin("/api/admin/challenges", {
          revision: 0,
          challenge: { ...newChallenge(), location: { x: 27, y: 20 } },
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await admin("/api/admin/challenges", {
          revision: 0,
          challenge: { ...newChallenge(), location: { x: 20, y: 6 } },
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await admin("/api/admin/challenges", {
          revision: 0,
          challenge: { ...newChallenge(), location: { x: 11, y: 19 } },
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await admin("/api/admin/challenges", {
          revision: 0,
          challenge: { ...newChallenge(), id: "lantern" },
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await admin("/api/admin/challenges", {
          revision: 0,
          editingId: "lantern",
          challenge: newChallenge(),
        })
      ).status,
      400,
    );
    const results = await Promise.all([
      admin("/api/admin/challenges", {
        revision: 0,
        challenge: newChallenge(),
      }),
      admin("/api/admin/challenges", {
        revision: 0,
        challenge: {
          ...newChallenge("second-scroll"),
          location: { x: 15, y: 20 },
        },
      }),
    ]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
    assert.equal((await admin("/api/admin/challenges")).data.revision, 1);
  } finally {
    sqlite.close();
  }
});
test("configured role defaults to student and is not exposed through public game settings", () => {
  const game = parseGame(
    "characters:\n  - id: web\n    name: Web\naccounts:\n  users:\n    - username: teacher01\n      password: teacher-password\n      role: admin\n    - username: student01\n      password: student-password",
  );
  assert.equal(game.accounts.users[0].role, "admin");
  assert.equal(game.accounts.users[1].role, "student");
  assert.throws(() =>
    parseGame(
      "characters:\n  - id: web\n    name: Web\naccounts:\n  users:\n    - username: teacher01\n      password: teacher-password\n      role: owner",
    ),
  );
});
