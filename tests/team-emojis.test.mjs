import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createApi } from "../server/api.mjs";
import { createSQLiteAdapter, initializeSchema } from "../server/sqlite.mjs";
import { parseGame } from "../lib/config-schema.mjs";
import { PLAYER_EMOTES, EMOTE_DURATION_MS, teamEmojiNotice, teamEmojiTargets } from "../lib/player-emotes.mjs";

async function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  initializeSchema(sqlite);
  const db = createSQLiteAdapter(sqlite);
  const config = parseGame("characters:\n - id: web\n   name: Explorer\naccounts:\n allowRegistration: true\n users:\n  - username: teacher\n    password: teacher-password\n    role: admin");
  const api = createApi({ db, config, challenges: [] });
  function client() {
    let cookie = "";
    return async (path, body, origin = "https://quest.test") => {
      const response = await api(new Request("https://quest.test" + path, {
        method: body ? "POST" : "GET",
        headers: { Cookie: cookie, Origin: origin, "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      }));
      if (response.headers.has("set-cookie")) cookie = response.headers.get("set-cookie").split(";")[0];
      return { status: response.status, data: await response.json() };
    };
  }
  const clients = {};
  for (const username of ["alice", "annika", "bobby", "bruno", "carol", "teacher"]) {
    clients[username] = client();
    const admin = username === "teacher";
    assert.equal((await clients[username]("/api/auth", { mode: admin ? "login" : "register", username, password: admin ? "teacher-password" : "student-password", hero: "web" })).status, 200);
  }
  const alpha = (await clients.alice("/api/teams", { mode: "create", name: "Alpha", password: "team-password" })).data.team.id;
  const beta = (await clients.bobby("/api/teams", { mode: "create", name: "Beta", password: "team-password" })).data.team.id;
  await clients.annika("/api/teams", { mode: "join", id: alpha, password: "team-password" });
  await clients.bruno("/api/teams", { mode: "join", id: beta, password: "team-password" });
  await clients.carol("/api/teams", { mode: "create", name: "Gamma", password: "team-password" });
  const position = { map: "town", x: 18, y: 20, themeRevision: 0 };
  const feed = async call => {
    const response = await call("/api/presence", position);
    assert.equal(response.status, 200, JSON.stringify(response.data));
    return response.data.teamEmojis;
  };
  const send = (call, team, emoji, id = crypto.randomUUID()) => call("/api/team-social", { id, team, text: emoji });
  return { sqlite, clients, alpha, beta, send, feed };
}

test("team emojis notify every recipient, target the correct glows, retain history, and expire without replaying retries", async t => {
  const s = await fixture();
  try {
    const { alice, annika, bobby, bruno, carol } = s.clients;
    let now = Date.now();
    t.mock.method(Date, "now", () => now);
    const ids = [];
    for (const { emoji } of PLAYER_EMOTES) {
      const id = crypto.randomUUID(); ids.push(id);
      assert.equal((await s.send(alice, s.beta, emoji, id)).status, 200);
    }
    assert.equal((await s.send(alice, s.beta, "👋", ids[0])).status, 200);
    assert.equal((await s.send(alice, s.beta, "👋")).status, 429);
    const outgoing = await s.feed(alice), incoming = await s.feed(bobby);
    assert.equal(outgoing.length, 5);
    assert.equal(incoming.length, 5);
    assert.ok(outgoing.every(event => event.outgoing && event.toTeam.id === s.beta));
    assert.ok(incoming.every(event => !event.outgoing && event.sender === "alice" && event.remainingMs === EMOTE_DURATION_MS));
    assert.equal((await s.feed(bruno)).length, 5);
    assert.deepEqual(await s.feed(annika), []);
    assert.deepEqual(await s.feed(carol), []);
    const sentWave = outgoing.find(event => event.id === ids[0]), receivedWave = incoming.find(event => event.id === ids[0]);
    assert.equal(teamEmojiNotice(receivedWave), "Team Alpha sent you a 👋");
    assert.equal(teamEmojiNotice(sentWave), "You sent Team Beta a 👋");
    assert.equal(teamEmojiTargets(receivedWave, { username: "alice", team: s.alpha }), true);
    assert.equal(teamEmojiTargets(receivedWave, { username: "annika", team: s.alpha }), false);
    assert.equal(teamEmojiTargets(sentWave, { username: "bobby", team: s.beta }), true);
    assert.equal(teamEmojiTargets(sentWave, { username: "bruno", team: s.beta }), true);
    assert.equal(teamEmojiTargets(sentWave, { username: "alice", team: s.alpha }), false);
    now += EMOTE_DURATION_MS - 1;
    assert.ok((await s.feed(bobby)).every(event => event.remainingMs === 1));
    now += 1;
    assert.deepEqual(await s.feed(bobby), []);
    assert.deepEqual(await s.feed(alice), []);
    assert.equal((await s.send(alice, s.beta, "👋", ids[0])).status, 200);
    assert.deepEqual(await s.feed(bobby), []);
    const history = (await bobby("/api/team-social?team=" + s.alpha)).data.messages;
    assert.equal(history.length, 5);
    assert.deepEqual(new Set(history.map(message => message.text)), new Set(PLAYER_EMOTES.map(option => option.emoji)));
  } finally { s.sqlite.close(); }
});

test("team emoji effects respect personal mutes, hidden names, messaging switches, history clears, and disabled teams", async t => {
  const s = await fixture();
  try {
    const { alice, annika, bobby, teacher } = s.clients;
    const now = Date.now();
    t.mock.method(Date, "now", () => now);
    assert.equal((await s.send(bobby, s.alpha, "👋")).status, 200);
    assert.equal((await alice("/api/chat-mutes", { action: "set", username: "bobby", muted: true, revision: 0 })).status, 200);
    assert.deepEqual(await s.feed(alice), []);
    assert.equal((await s.feed(annika)).length, 1);
    assert.equal((await s.feed(bobby)).length, 1);
    await alice("/api/chat-mutes", { action: "set", username: "bobby", muted: false, revision: 1 });
    const flags = (await teacher("/api/admin/team-social")).data;
    let saved = (await teacher("/api/admin/team-social", { ...flags, everyone: { ...flags.everyone, names: false } })).data;
    const anonymous = (await s.feed(alice))[0];
    assert.match(anonymous.fromTeam.label, /^Team #/);
    assert.ok(!teamEmojiNotice(anonymous).includes("Beta"));
    saved = (await teacher("/api/admin/team-social", { ...saved, everyone: { ...saved.everyone, messaging: false } })).data;
    assert.deepEqual(await s.feed(alice), []);
    assert.deepEqual(await s.feed(bobby), []);
    assert.equal((await s.send(bobby, s.alpha, "👍")).status, 403);
    await teacher("/api/admin/team-social", { ...saved, everyone: { ...saved.everyone, messaging: true } });
    assert.equal((await s.feed(alice)).length, 1);
    assert.equal((await alice("/api/chat-history", { action: "clear-all" })).status, 200);
    assert.deepEqual(await s.feed(alice), []);
    assert.equal((await s.feed(annika)).length, 1);
    s.sqlite.prepare("UPDATE teams SET disabled=1 WHERE id=?").run(s.beta);
    assert.deepEqual(await s.feed(annika), []);
  } finally { s.sqlite.close(); }
});

test("own-team and instructor emoji messages remain ordinary chats; unsupported emojis never create directed effects", async () => {
  const s = await fixture();
  try {
    const { alice, annika, bobby, teacher } = s.clients;
    for (const [team, emoji] of [[s.alpha, "👋"], ["instructors", "👍"], [s.beta, "🎉"]])
      assert.equal((await s.send(alice, team, emoji)).status, 200);
    assert.equal((await s.send(teacher, s.alpha, "😮")).status, 200);
    assert.deepEqual(await s.feed(alice), []);
    assert.deepEqual(await s.feed(annika), []);
    assert.deepEqual(await s.feed(bobby), []);
    assert.equal((await alice("/api/team-social?team=" + s.beta)).data.messages[0].text, "🎉");
    assert.equal((await alice("/api/team-social", { id: crypto.randomUUID(), team: s.beta, text: "👋" }, "https://elsewhere.test")).status, 403);
    s.sqlite.prepare("UPDATE students SET muted=1 WHERE username='alice'").run();
    assert.equal((await s.send(alice, s.beta, "👋")).status, 403);
  } finally { s.sqlite.close(); }
});
