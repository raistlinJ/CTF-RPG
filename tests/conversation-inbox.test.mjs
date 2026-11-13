import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createApi } from "../server/api.mjs";
import { createSQLiteAdapter, initializeSchema } from "../server/sqlite.mjs";
import { parseGame } from "../lib/config-schema.mjs";
import { loadConversationReads, readConversation, saveConversationReads, validConversationReads } from "../lib/conversation-inbox.mjs";

async function fixture() {
  const sqlite = new DatabaseSync(":memory:"); initializeSchema(sqlite);
  const db = createSQLiteAdapter(sqlite);
  const config = parseGame("characters:\n - id: web\n   name: Explorer\naccounts:\n allowRegistration: true\n users:\n  - username: teacher\n    password: teacher-password\n    role: admin");
  const api = createApi({ db, config, challenges: [] });
  function client() {
    let cookie = "";
    return async (path, body) => {
      const response = await api(new Request("https://quest.test" + path, { method: body ? "POST" : "GET", headers: { Cookie: cookie, Origin: "https://quest.test", "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }));
      if (response.headers.has("set-cookie")) cookie = response.headers.get("set-cookie").split(";")[0];
      return { status: response.status, data: await response.json() };
    };
  }
  const clients = {};
  for (const username of ["alice", "annika", "bobby", "carol", "teacher"]) {
    clients[username] = client();
    assert.equal((await clients[username]("/api/auth", { mode: username === "teacher" ? "login" : "register", username, password: username === "teacher" ? "teacher-password" : "student-password", hero: "web" })).status, 200);
  }
  const alpha = (await clients.alice("/api/teams", { mode: "create", name: "Alpha", password: "team-password" })).data.team.id;
  const beta = (await clients.bobby("/api/teams", { mode: "create", name: "Beta", password: "team-password" })).data.team.id;
  await clients.annika("/api/teams", { mode: "join", id: alpha, password: "team-password" });
  await clients.carol("/api/teams", { mode: "create", name: "Gamma", password: "team-password" });
  const send = async (call, team, text) => { const response = await call("/api/team-social", { id: crypto.randomUUID(), team, text }); assert.equal(response.status, 200, JSON.stringify(response.data)); };
  const inbox = async (call, reads = { baseline: 0, through: {} }) => {
    const response = await call("/api/chat-conversations?read=" + encodeURIComponent(JSON.stringify(reads)));
    assert.equal(response.status, 200, JSON.stringify(response.data)); return response.data;
  };
  return { sqlite, clients, client, alpha, beta, send, inbox };
}

test("phone inbox groups conversations, previews the latest message, and reading one thread keeps others unread", async t => {
  const s = await fixture();
  try {
    const { alice, annika, bobby, carol, teacher } = s.clients;
    let now = Date.now(); t.mock.method(Date, "now", () => now);
    await s.send(bobby, s.alpha, "Hello Alpha"); now++;
    await s.send(bobby, s.alpha, "👋"); now++;
    await s.send(annika, s.alpha, "Internal note"); now++;
    await s.send(alice, "instructors", "Need a hint"); now++;
    await s.send(teacher, s.alpha, "Instructor reply"); now++;
    await s.send(alice, s.beta, "Thanks Beta");
    const inbox = await s.inbox(alice);
    assert.equal(inbox.unreadCount, 4);
    assert.deepEqual(new Set(inbox.conversations.map(thread => thread.id)), new Set([s.alpha, s.beta, "instructors"]));
    const beta = inbox.conversations.find(thread => thread.id === s.beta);
    assert.equal(beta.unreadCount, 2);
    assert.equal(beta.preview.text, "Thanks Beta"); assert.equal(beta.preview.mine, true);
    const read = await s.inbox(alice, { baseline: 0, through: { [s.beta]: beta.latestAt } });
    assert.equal(read.conversations.find(thread => thread.id === s.beta).unreadCount, 0);
    assert.equal(read.unreadCount, 2);
    assert.equal((await s.inbox(annika)).conversations.find(thread => thread.id === s.beta).unreadCount, 2);
    assert.deepEqual((await s.inbox(carol)).conversations, []);
    const admin = await s.inbox(teacher);
    assert.equal(admin.unreadCount, 1);
    assert.equal(admin.conversations.length, 1); assert.equal(admin.conversations[0].id, s.alpha);
    const thread = (await alice("/api/team-social?view=conversation&team=" + s.alpha)).data;
    assert.deepEqual(thread.messages.map(message => message.text), ["Internal note"]);
    const adminThread = (await teacher("/api/team-social?view=conversation&team=" + s.alpha)).data;
    assert.deepEqual(adminThread.messages.map(message => message.text), ["Need a hint", "Instructor reply"]);
  } finally { s.sqlite.close(); }
});

test("unread totals are not capped by the 100-message history window", async () => {
  const s = await fixture();
  try {
    const sender = s.sqlite.prepare("SELECT id FROM students WHERE username='bobby'").get().id;
    const insert = s.sqlite.prepare("INSERT INTO team_messages(id,sender_user,sender_team,recipient_team,sender,text,created_at) VALUES(?,?,?,?,?,?,?)");
    for (let n = 0; n < 125; n++) insert.run(crypto.randomUUID(), sender, s.beta, s.alpha, "bobby", "Message " + n, 1000 + n);
    const inbox = await s.inbox(s.clients.alice);
    assert.equal(inbox.unreadCount, 125);
    assert.equal(inbox.conversations[0].preview.text, "Message 124");
    assert.equal((await s.inbox(s.clients.alice, { baseline: 0, through: { [s.beta]: 1124 } })).unreadCount, 0);
  } finally { s.sqlite.close(); }
});

test("conversation previews and unread counts enforce names, personal mutes, feature switches, auth, and cleared history", async t => {
  const s = await fixture();
  try {
    const { alice, annika, bobby, teacher } = s.clients;
    let now = Date.now(); t.mock.method(Date, "now", () => now);
    await s.send(bobby, s.alpha, "private-body");
    await s.send(annika, s.alpha, "Internal");
    await s.send(teacher, s.alpha, "Instructor");
    await alice("/api/chat-mutes", { action: "set", username: "bobby", muted: true, revision: 0 });
    let inbox = await s.inbox(alice);
    assert.ok(!JSON.stringify(inbox).includes("private-body")); assert.equal(inbox.unreadCount, 2);
    await alice("/api/chat-mutes", { action: "set", username: "bobby", muted: false, revision: 1 });
    let settings = (await teacher("/api/admin/team-social")).data;
    settings = (await teacher("/api/admin/team-social", { ...settings, everyone: { ...settings.everyone, names: false } })).data;
    inbox = await s.inbox(alice);
    assert.match(inbox.conversations.find(thread => thread.id === s.beta).label, /^Team #/);
    await teacher("/api/admin/team-social", { ...settings, everyone: { ...settings.everyone, messaging: false } });
    assert.ok(!(await s.inbox(alice)).conversations.some(thread => thread.id === s.beta));
    await alice("/api/chat-history", { action: "clear-all" });
    assert.deepEqual((await s.inbox(alice)).conversations, []);
    now++;
    await s.send(teacher, s.alpha, "New instructor message");
    assert.equal((await s.inbox(alice)).unreadCount, 1);
    assert.equal((await s.client()("/api/chat-conversations")).status, 401);
    assert.equal((await alice("/api/chat-conversations", { action: "read" })).status, 405);
    for (const reads of [null, [], { baseline: -1, through: {} }, { baseline: 0, through: { x: "100" } }])
      assert.equal((await alice("/api/chat-conversations?read=" + encodeURIComponent(JSON.stringify(reads)))).status, 400);
  } finally { s.sqlite.close(); }
});

test("conversation reads persist per account and team, stay monotonic, and tolerate blocked storage", () => {
  const values = new Map(); const storage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
  let reads = loadConversationReads(storage, "alice", "alpha", 100);
  reads = readConversation(reads, "beta", 300); reads = readConversation(reads, "beta", 200);
  saveConversationReads(storage, "alice", "alpha", reads);
  assert.equal(loadConversationReads(storage, "alice", "alpha", 999).through.beta, 300);
  assert.equal(loadConversationReads(storage, "alice", "alpha", 999).baseline, 100);
  assert.deepEqual(loadConversationReads(storage, "bobby", "alpha").through, {});
  assert.deepEqual(loadConversationReads(storage, "alice", "different-team").through, {});
  assert.equal(validConversationReads({ baseline: 0, through: { beta: 300 } }), true);
  const blocked = { getItem() { throw Error(); }, setItem() { throw Error(); } };
  assert.deepEqual(loadConversationReads(blocked, "alice", "alpha"), { baseline: 0, through: {} });
  assert.doesNotThrow(() => saveConversationReads(blocked, "alice", "alpha", reads));
});
