import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createApi } from "../server/api.mjs";
import { createSQLiteAdapter, initializeSchema } from "../server/sqlite.mjs";
import { parseGame } from "../lib/config-schema.mjs";
import { createSnapshot, validateSnapshot } from "../server/backup.mjs";
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { PLAYER_EMOTES, EMOTE_DURATION_MS, teamEmojiNotice, teamEmojiTargets, teamEmojiConnections, emojiDeliveryColors, EMOJI_DELIVERY_COLORS } from "../lib/player-emotes.mjs";

test("emoji delivery lines point from the sender to visible recipients without exposing unseen players", () => {
  const alice = { username: "alice", team: "alpha", x: 18, y: 20 };
  const annika = { username: "annika", team: "alpha", x: 18, y: 21 };
  const bobby = { username: "bobby", team: "beta", x: 20, y: 20 };
  const bruno = { username: "bruno", team: "beta", x: 20, y: 20 };
  const carol = { username: "carol", team: "gamma", x: 25, y: 20 };
  const event = { sender: "alice", toTeam: { id: "beta" }, outgoing: true };
  assert.deepEqual(teamEmojiConnections(event, [annika, bobby, bruno, carol], alice), [
    { from: alice, to: bobby }, { from: alice, to: bruno },
  ]);
  const incoming = { ...event, outgoing: false };
  assert.deepEqual(teamEmojiConnections(incoming, [alice, annika, bruno], bobby), [{ from: alice, to: bobby }]);
  assert.deepEqual(teamEmojiConnections(incoming, [annika, bruno], bobby), []);
  assert.deepEqual(teamEmojiConnections(incoming, [alice, bobby], carol), []);
  assert.deepEqual(teamEmojiConnections(event, [bobby], annika), []);
  assert.deepEqual(teamEmojiConnections(event, [bobby], undefined), []);
  const direct = { ...event, toUser: "bruno" };
  assert.deepEqual(teamEmojiConnections(direct, [bobby, bruno], alice), [{ from: alice, to: bruno }]);
  assert.deepEqual(teamEmojiConnections({ ...direct, outgoing: false }, [alice], bobby), []);
  assert.deepEqual(teamEmojiConnections({ ...direct, outgoing: false }, [alice], bruno), [{ from: alice, to: bruno }]);
  assert.equal(teamEmojiNotice({ ...direct, emoji: "👋" }), "You sent bruno a 👋");
  assert.equal(teamEmojiNotice({ ...direct, outgoing: false, emoji: "👋" }), "alice sent you a 👋");
});

test("simultaneous emoji paths receive distinct colors even when their hashes collide", () => {
  const keys = Array.from({ length: EMOJI_DELIVERY_COLORS.length }, (_, i) => `delivery-${i * EMOJI_DELIVERY_COLORS.length}:bobby`);
  const colors = emojiDeliveryColors(keys);
  assert.equal(new Set(colors).size, keys.length);
  assert.deepEqual(emojiDeliveryColors(keys), colors);
  assert.equal(new Set(emojiDeliveryColors([...keys, "overflow", "another delivery"])).size, keys.length + 2);
});

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
  return { sqlite, db, config, clients, alpha, beta, send, feed };
}

test("a wave reply after its delivery line expires triggers one private high-five for both senders", async t => {
  const s = await fixture();
  try {
    const { alice, annika, bobby, bruno, carol } = s.clients;
    let now = Date.now(); t.mock.method(Date,"now",()=>now);
    const first = { id:crypto.randomUUID(), team:s.beta, text:"👋", recipient:"bobby" };
    assert.equal((await alice("/api/team-social",first)).status,200);
    now += 8000;
    assert.deepEqual(await s.feed(bobby),[],"ordinary emoji lines still expire after five seconds");
    const reply = { id:crypto.randomUUID(), team:s.alpha, text:"👋", recipient:"alice" };
    assert.equal((await bobby("/api/team-social",reply)).status,200);
    const activity = async call => (await call("/api/presence",{ map:"town",x:18,y:20,themeRevision:0 })).data;
    const combo = (await activity(alice)).emojiCombos[0];
    assert.equal(combo.kind,"high-five"); assert.equal(combo.partner,"bobby");
    assert.equal((await activity(bobby)).emojiCombos[0].id,combo.id);
    for (const call of [annika,bruno,carol]) assert.deepEqual((await activity(call)).emojiCombos,[]);
    assert.equal((await bobby("/api/team-social",reply)).status,200);
    assert.equal((await activity(alice)).emojiCombos.length,1);
    assert.equal((await activity(alice)).emojiCombos[0].id,combo.id,"polls and safe retries retain the combo reference");
    now += 5000;
    assert.deepEqual((await activity(alice)).emojiCombos,[]);
    assert.deepEqual((await activity(bobby)).emojiCombos,[]);
  } finally { s.sqlite.close(); }
});

test("team wow combos exclude spectators and respect personal mutes, clear history and feature controls", async t => {
  const s = await fixture();
  try {
    const { alice, annika, bobby, bruno, teacher } = s.clients;
    let now=Date.now(); t.mock.method(Date,"now",()=>now);
    assert.equal((await s.send(alice,s.beta,"😮")).status,200);
    now += 1000;
    assert.equal((await s.send(bobby,s.alpha,"😮")).status,200);
    const combos = async call => (await call("/api/presence",{map:"town",x:18,y:20,themeRevision:0})).data.emojiCombos;
    assert.equal((await combos(alice))[0].kind,"fireworks");
    assert.equal((await combos(bobby))[0].partner,"alice");
    assert.deepEqual(await combos(annika),[]); assert.deepEqual(await combos(bruno),[]);
    await alice("/api/chat-mutes",{action:"mute-all",revision:0});
    assert.deepEqual(await combos(alice),[]); assert.equal((await combos(bobby)).length,1);
    await bobby("/api/chat-history",{action:"clear-all"});
    assert.deepEqual(await combos(bobby),[]);
    const features=(await teacher("/api/admin/team-social")).data;
    await teacher("/api/admin/team-social",{...features,everyone:{...features.everyone,messaging:false}});
    assert.deepEqual(await combos(alice),[]);
  } finally { s.sqlite.close(); }
});

test("students can complete an admin combo by replying through the existing instructor conversation", async t => {
  const s=await fixture();
  try {
    const { teacher,alice,annika }=s.clients;
    let now=Date.now(); t.mock.method(Date,"now",()=>now);
    assert.equal((await teacher("/api/team-social",{id:crypto.randomUUID(),team:s.alpha,recipient:"alice",text:"👋"})).status,200);
    now+=1000;
    assert.equal((await s.send(alice,"instructors","👋")).status,200);
    const combos=async call=>(await call("/api/presence",{map:"town",x:18,y:20,themeRevision:0})).data.emojiCombos;
    assert.equal((await combos(teacher))[0].partner,"alice");
    assert.equal((await combos(alice))[0].kind,"high-five");
    assert.deepEqual(await combos(annika),[]);
  } finally { s.sqlite.close(); }
});

test("user-only emojis reach one recipient, isolate history and unread counts, and preserve safe retries", async () => {
  const s = await fixture();
  try {
    const { alice, annika, bobby, bruno, carol, teacher } = s.clients;
    const id = crypto.randomUUID();
    const body = { id, team: s.beta, text: "👋", recipient: "bobby" };
    assert.equal((await alice("/api/team-social", body)).status, 200);
    assert.equal((await alice("/api/team-social", body)).status, 200);
    assert.equal((await alice("/api/team-social", { ...body, recipient: "bruno" })).status, 409);
    const teamRetry = { id, team:s.beta, text:"👋" };
    assert.equal((await alice("/api/team-social", teamRetry)).status, 409);
    assert.equal((await s.feed(alice))[0].toUser, "bobby");
    assert.equal((await s.feed(bobby))[0].toUser, "bobby");
    for (const call of [annika, bruno, carol, teacher]) assert.deepEqual(await s.feed(call), []);
    for (const [call, selected, expected] of [[alice,s.beta,1],[annika,s.beta,0],[bobby,s.alpha,1],[bruno,s.alpha,0],[carol,s.beta,0],[teacher,s.beta,0]]) {
      for (const view of ["", "&view=conversation"]) {
        const history = await call(`/api/team-social?team=${selected}${view}`);
        assert.equal(history.status, 200);
        assert.equal(history.data.messages.length, expected);
        if (expected) assert.equal(history.data.messages[0].toUser, "bobby");
      }
      const inbox = await call("/api/chat-conversations");
      assert.equal(inbox.data.unreadCount, call === bobby ? 1 : 0);
    }
    const stats = call => call("/api/presence", { map: "town", x:18, y:20, themeRevision:0 });
    assert.equal((await stats(bobby)).data.receivedCount, 1);
    assert.equal((await stats(bruno)).data.receivedCount, 0);
    assert.equal((await alice("/api/team-social", { ...body, id:crypto.randomUUID(), recipient:"carol" })).status, 409);
    assert.equal((await alice("/api/team-social", { ...body, id:crypto.randomUUID(), text:"private text" })).status, 400);
    assert.equal((await alice("/api/team-social", { ...body, id:crypto.randomUUID() }, "https://evil.test")).status, 403);
    await bobby("/api/chat-mutes", { action:"mute-all", revision:0 });
    assert.deepEqual(await s.feed(bobby), []);
    assert.equal((await bobby("/api/chat-conversations")).data.unreadCount, 0);
    assert.equal((await s.send(alice,s.beta,"👍")).status,200);
    assert.equal((await s.feed(bruno)).length,1, "team sends still reach the other teammate");
  } finally { s.sqlite.close(); }
});

test("admin user-only emojis remain private in instructor conversations and survive full restoration", async () => {
  const s = await fixture();
  let folder;
  try {
    const { teacher, alice, annika } = s.clients;
    const id = crypto.randomUUID();
    assert.equal((await teacher("/api/team-social", { id, team:s.alpha, text:"👍", recipient:"alice" })).status,200);
    assert.equal((await s.feed(alice))[0].toUser,"alice");
    assert.deepEqual(await s.feed(annika),[]);
    assert.equal((await alice("/api/team-social?team=instructors")).data.messages[0].toUser,"alice");
    assert.deepEqual((await annika("/api/team-social?team=instructors")).data.messages,[]);
    assert.equal((await annika("/api/chat-conversations")).data.unreadCount,0);
    assert.equal((await teacher("/api/admin/chats")).data.messages[0].to_name,"@alice (User only)");
    const snapshot = await createSnapshot({ db:s.db, config:s.config, challenges:[] });
    const recipient = s.sqlite.prepare("SELECT id FROM students WHERE username='alice'").get().id;
    assert.equal(snapshot.teamMessages[0].recipient_user,recipient);
    assert.throws(() => validateSnapshot({ ...snapshot, teamMessages:[{ ...snapshot.teamMessages[0], recipient_user:"missing" }] }));
    const legacy = structuredClone(snapshot); delete legacy.teamMessages[0].recipient_user;
    assert.equal(validateSnapshot(legacy).teamMessages[0].recipient_user,null);
    folder = mkdtempSync(resolve(tmpdir(),"emoji-recipient-"));
    cpSync("server",resolve(folder,"server"),{recursive:true});
    cpSync("lib",resolve(folder,"lib"),{recursive:true});
    symlinkSync(resolve("node_modules"),resolve(folder,"node_modules"),"dir");
    const file=resolve(folder,"backup.json"), path=resolve(folder,"restored.sqlite");
    writeFileSync(file,JSON.stringify(snapshot));
    const result=spawnSync(process.execPath,[resolve(folder,"server/restore.mjs"),file],{env:{...process.env,DATABASE_PATH:path},encoding:"utf8"});
    assert.equal(result.status,0,result.stderr);
    const restored=new DatabaseSync(path);
    try {
      assert.equal(restored.prepare("SELECT recipient_user FROM team_messages WHERE id=?").get(id).recipient_user,recipient);
      restored.prepare("DELETE FROM team_members WHERE user=?").run(recipient);
      restored.prepare("DELETE FROM students WHERE id=?").run(recipient);
      assert.equal(restored.prepare("SELECT COUNT(*) n FROM team_messages").get().n,0,"deleting a recipient cannot turn their private emoji into a team send");
    } finally { restored.close(); }
  } finally { s.sqlite.close(); if(folder)rmSync(folder,{recursive:true,force:true}); }
});

test("hosted emoji migration adds recipient metadata without changing old team sends", () => {
  const sql = new DatabaseSync(":memory:");
  try {
    sql.exec("PRAGMA foreign_keys=ON;CREATE TABLE students(id TEXT PRIMARY KEY);CREATE TABLE team_messages(id TEXT PRIMARY KEY,created_at INTEGER);INSERT INTO team_messages VALUES('old',0);");
    sql.exec(readFileSync("drizzle/0033_emoji_recipients.sql","utf8"));
    assert.equal(sql.prepare("SELECT recipient_user FROM team_messages WHERE id='old'").get().recipient_user,null);
    assert.ok(sql.prepare("PRAGMA foreign_key_list(team_messages)").all().some(row=>row.from==="recipient_user"&&row.on_delete==="CASCADE"));
  } finally { sql.close(); }
});

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

test("own-team and student-to-instructor emoji messages remain ordinary chats; unsupported emojis never create directed effects", async () => {
  const s = await fixture();
  try {
    const { alice, annika, bobby } = s.clients;
    for (const [team, emoji] of [[s.alpha, "👋"], ["instructors", "👍"], [s.beta, "🎉"]])
      assert.equal((await s.send(alice, team, emoji)).status, 200);
    assert.deepEqual(await s.feed(alice), []);
    assert.deepEqual(await s.feed(annika), []);
    assert.deepEqual(await s.feed(bobby), []);
    assert.equal((await alice("/api/team-social?team=" + s.beta)).data.messages[0].text, "🎉");
    assert.equal((await alice("/api/team-social", { id: crypto.randomUUID(), team: s.beta, text: "👋" }, "https://elsewhere.test")).status, 403);
    s.sqlite.prepare("UPDATE students SET muted=1 WHERE username='alice'").run();
    assert.equal((await s.send(alice, s.beta, "👋")).status, 403);
  } finally { s.sqlite.close(); }
});

test("admins can send text, team emojis and user emojis without the student send limit", async t => {
  const s = await fixture();
  try {
    t.mock.method(Date, "now", () => 1794502800000);
    const { teacher, alice } = s.clients;
    for (let i = 0; i < 12; i++) {
      const body = { id: crypto.randomUUID(), team: s.beta, text: i % 3 === 0 ? `Message ${i}` : "👋", ...(i % 3 === 2 ? { recipient: "bobby" } : {}) };
      assert.equal((await teacher("/api/team-social", body)).status, 200);
      assert.equal((await teacher("/api/team-social", body)).status, 200, "retries remain deduplicated");
    }
    assert.equal(s.sqlite.prepare("SELECT COUNT(*) n FROM team_messages WHERE sender_team IS NULL").get().n, 12);
    for (let i = 0; i < 5; i++) {
      const body = { id: crypto.randomUUID(), team: i === 0 ? "instructors" : s.beta, text: "👍", ...(i % 2 ? { recipient: "bobby" } : {}) };
      assert.equal((await alice("/api/team-social", body)).status, 200);
    }
    assert.equal((await alice("/api/team-social", { id: crypto.randomUUID(), team: s.beta, text: "👋", admin: true })).status, 429);
    assert.equal((await s.send(alice, "instructors", "Extra message")).status, 429);
    const features = (await teacher("/api/admin/team-social")).data;
    await teacher("/api/admin/team-social", { ...features, messaging: false });
    assert.equal((await s.send(teacher, s.beta, "👋")).status, 403, "admin messaging permissions still apply");
  } finally { s.sqlite.close(); }
});

test("administrators can send team emojis without team membership; effects follow instructor messaging permissions", async t => {
  const s = await fixture();
  try {
    const { teacher, alice, annika, bobby, carol } = s.clients;
    const now = Date.now();
    t.mock.method(Date, "now", () => now);
    const id = crypto.randomUUID();
    assert.equal((await s.send(teacher, s.alpha, "😮", id)).status, 200);
    assert.equal((await s.send(teacher, s.alpha, "😮", id)).status, 200);
    const outgoing = await s.feed(teacher);
    assert.equal(outgoing.length, 1);
    assert.equal(outgoing[0].outgoing, true);
    assert.equal(outgoing[0].toTeam.id, s.alpha);
    const incoming = await s.feed(alice);
    assert.equal(incoming.length, 1);
    assert.equal(incoming[0].sender, "teacher");
    assert.equal(incoming[0].fromTeam, null);
    assert.equal(teamEmojiNotice(incoming[0]), "Instructors sent you a 😮");
    assert.equal(teamEmojiTargets(incoming[0], { username: "teacher", team: null }), true);
    assert.equal(teamEmojiTargets(outgoing[0], { username: "annika", team: s.alpha }), true);
    assert.equal((await s.feed(annika)).length, 1);
    assert.deepEqual(await s.feed(bobby), []);
    assert.deepEqual(await s.feed(carol), []);
    await alice("/api/chat-mutes", { action: "mute-all", revision: 0 });
    assert.equal((await s.feed(alice)).length, 1, "instructors remain exempt from personal mutes");
    let features = (await teacher("/api/admin/team-social")).data;
    features = (await teacher("/api/admin/team-social", { ...features, everyone: { ...features.everyone, messaging: false } })).data;
    assert.equal((await s.feed(alice)).length, 1);
    assert.equal((await s.feed(teacher)).length, 1);
    await teacher("/api/admin/team-social", { ...features, messaging: false, everyone: { ...features.everyone, messaging: true } });
    assert.deepEqual(await s.feed(alice), []);
    assert.deepEqual(await s.feed(teacher), []);
    assert.equal((await s.send(teacher, s.alpha, "👋")).status, 403);
  } finally { s.sqlite.close(); }
});
