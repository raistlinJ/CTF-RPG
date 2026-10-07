import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { parseChallenges, normalize } from "../lib/config-schema.mjs";
import { createApi } from "../server/api.mjs";
const raw = `challenges:
  - id: flag-case
    object: Secret scroll
    location: {x: 11, y: 19}
    region: Lantern Lane
    text: "Download the scroll and find its flag."
    points: 100
    flags: ["FLAG{Snow}"]
    caseSensitive: true
    hints:
      - id: first
        label: A small nudge
        text: "SECRET_HINT_ONE"
        cost: 10
      - id: second
        text: "SECRET_HINT_TWO"
        cost: 20
      - id: free
        text: "FREE_SECRET_HINT"
        cost: 0
    downloads:
      - name: Packing list
        url: /downloads/packing-list.txt
        filename: packing-list.txt
      - name: External resource
        url: https://example.org/scroll.pdf
  - id: flag-insensitive
    object: Bell
    location: {x: 8, y: 8}
    region: Grove
    text: "Submit the word winter."
    points: 50
    flags: ["WINTER"]
    hints: []
`;
function database() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON");
  for (const file of readdirSync("drizzle")
    .filter((name) => /^\d+.*\.sql$/.test(name))
    .sort())
    sqlite.exec(readFileSync(`drizzle/${file}`, "utf8"));
  return {
    sqlite,
    db: {
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
    },
  };
}
async function setup(challenges = parseChallenges(raw)) {
  const { sqlite, db } = database(),
    config = {
      characters: [{ id: "web" }],
      accounts: { allowRegistration: true, users: [] },
      audio: {},
    };
  const api = createApi({ db, config, challenges, secureCookies: true });
  const client = () => {
    let cookie = "";
    return async (path, body) => {
      const url = "https://quest.test" + path;
      const response = await api(
        new Request(url, {
          method: body ? "POST" : "GET",
          headers: {
            Origin: "https://quest.test",
            "Content-Type": "application/json",
            Cookie: cookie,
          },
          body: body ? JSON.stringify(body) : undefined,
        }),
      );
      if (response.headers.has("set-cookie"))
        cookie = response.headers.get("set-cookie").split(";")[0];
      return { status: response.status, data: await response.json() };
    };
  };
  const call = client();
  await call("/api/auth", {
    username: "student01",
    password: "test-password",
    mode: "register",
    hero: "web",
  });
  return { sqlite, call, client };
}
test("challenge YAML supports rich fields, compatibility and rejects invalid costs/URLs", () => {
  const [c] = parseChallenges(raw);
  assert.equal(c.text, "Download the scroll and find its flag.");
  assert.equal(c.caseSensitive, true);
  assert.equal(c.hints[1].label, "Hint 2");
  assert.equal(c.downloads[0].filename, "packing-list.txt");
  assert.equal(normalize(" FLAG{Snow} ", true), "FLAG{Snow}");
  assert.equal(normalize(" WINTER "), "winter");
  assert.notEqual(normalize("two  words"), normalize("two words"));
  const legacy = parseChallenges(
    "challenges:\n  - id: old\n    object: Old\n    location: {x: 1, y: 1}\n    region: Old\n    prompt: Legacy prompt\n    answers: [legacy]\n    points: 20\n    hint: Legacy hint",
  );
  assert.equal(legacy[0].text, "Legacy prompt");
  assert.deepEqual(legacy[0].flags, ["legacy"]);
  assert.equal(legacy[0].hints[0].cost, 0);
  for (const invalid of [
    raw.replace("cost: 10", "cost: -1"),
    raw.replace("cost: 20", "cost: 120"),
    raw.replace("id: second", "id: first"),
    raw.replace("https://example.org/scroll.pdf", "javascript:alert(1)"),
    raw.replace("/downloads/packing-list.txt", "/../content/game.yaml"),
    raw.replace("caseSensitive: true", 'caseSensitive: "true"'),
    raw.replace('flags: ["FLAG{Snow}"]', 'flags: [" "]'),
  ])
    assert.throws(() => parseChallenges(invalid));
});
test("paid/free hints are private until unlocked, charged once, and isolated per student", async () => {
  const { sqlite, call, client } = await setup();
  try {
    let r = await call("/api/game");
    const serialized = JSON.stringify(r.data);
    assert.ok(!serialized.includes("FLAG{Snow}"));
    assert.ok(!serialized.includes("SECRET_HINT"));
    assert.ok(!serialized.includes("FREE_SECRET_HINT"));
    assert.ok(!("flags" in r.data.challenges[0]));
    assert.equal(r.data.challenges[0].downloads.length, 2);
    assert.equal(r.data.score, 0);
    assert.equal(
      (await call("/api/game", { id: "flag-case", answer: "flag{snow}" })).data
        .correct,
      false,
    );
    let unlocked = await Promise.all(
      Array.from({ length: 8 }, () =>
        call("/api/game", { id: "flag-case", action: "hint", hintId: "first" }),
      ),
    );
    assert.ok(unlocked.every((r) => r.status === 200));
    r = await call("/api/game");
    let c = r.data.challenges[0];
    assert.equal(c.hintCost, 10);
    assert.equal(c.remainingPoints, 90);
    assert.equal(c.hints[0].text, "SECRET_HINT_ONE");
    assert.ok(!("text" in c.hints[1]));
    assert.equal(r.data.score, 0);
    r = await call("/api/game", {
      id: "flag-case",
      action: "hint",
      hintId: "free",
    });
    assert.equal(r.data.challenges[0].hints[2].text, "FREE_SECRET_HINT");
    assert.equal(r.data.challenges[0].hintCost, 10);
    const another = client();
    await another("/api/auth", {
      username: "student02",
      password: "test-password",
      mode: "register",
      hero: "web",
    });
    assert.ok(
      !JSON.stringify((await another("/api/game")).data).includes(
        "SECRET_HINT_ONE",
      ),
    );
    assert.equal(
      (
        await call("/api/game", {
          id: "flag-case",
          action: "hint",
          hintId: "missing",
        })
      ).status,
      400,
    );
    r = await call("/api/game", { id: "flag-case", answer: " FLAG{Snow} " });
    assert.equal(r.data.correct, true);
    assert.equal(r.data.awardedPoints, 90);
    assert.equal(r.data.score, 90);
    r = await call("/api/game", { id: "flag-case", answer: "FLAG{Snow}" });
    assert.equal(r.data.score, 90);
    assert.equal(
      (
        await call("/api/game", {
          id: "flag-case",
          action: "hint",
          hintId: "second",
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await call("/api/game", {
          id: "flag-case",
          action: "hint",
          hintId: "first",
        })
      ).status,
      200,
    );
    r = await call("/api/game", { id: "flag-insensitive", answer: " winter " });
    assert.equal(r.data.correct, true);
    assert.equal(r.data.score, 140);
  } finally {
    sqlite.close();
  }
});
test("a concurrent solve and hint purchase agree on the net reward", async () => {
  const { sqlite, call } = await setup();
  try {
    const [hint, answer] = await Promise.all([
      call("/api/game", { id: "flag-case", action: "hint", hintId: "second" }),
      call("/api/game", { id: "flag-case", answer: "FLAG{Snow}" }),
    ]);
    assert.equal(answer.status, 200);
    const state = (await call("/api/game")).data,
      c = state.challenges[0];
    assert.equal(c.awardedPoints, 100 - c.hintCost);
    assert.equal(state.score, c.awardedPoints);
    assert.ok([200, 409].includes(hint.status));
  } finally {
    sqlite.close();
  }
});
test("historical hint costs and awarded scores survive YAML reward edits", async () => {
  const challenges = parseChallenges(raw);
  const { sqlite, call } = await setup(challenges);
  try {
    await call("/api/game", {
      id: "flag-case",
      action: "hint",
      hintId: "first",
    });
    challenges[0].hints[0].cost = 30;
    assert.equal(
      (await call("/api/game")).data.challenges[0].hints[0].cost,
      10,
    );
    challenges[0].hints.forEach((h) => (h.cost = 0));
    challenges[0].points = 5;
    assert.equal(
      (await call("/api/game")).data.challenges[0].remainingPoints,
      0,
    );
    let r = await call("/api/game", { id: "flag-case", answer: "FLAG{Snow}" });
    assert.equal(r.data.awardedPoints, 0);
    challenges[0].points = 100;
    assert.equal(
      (await call("/api/game", { id: "flag-case", answer: "FLAG{Snow}" })).data
        .score,
      0,
    );
  } finally {
    sqlite.close();
  }
});
