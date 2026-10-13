import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { parseGame, parseChallenges } from "../lib/config-schema.mjs";
import { createApi } from "../server/api.mjs";
import { createSQLiteAdapter, initializeSchema } from "../server/sqlite.mjs";
import { createSnapshot } from "../server/backup.mjs";

function setup() {
  const sqlite = new DatabaseSync(":memory:");
  initializeSchema(sqlite);
  const db = createSQLiteAdapter(sqlite);
  const config = parseGame(`characters:\n  - id: web\n    name: Web\naccounts:\n  allowRegistration: false\n  users:\n    - username: teacher\n      password: teacher-password\n      role: admin\n      hero: web`);
  const challenges = parseChallenges(readFileSync("content/challenges.yaml", "utf8"));
  const api = createApi({ db, config, challenges });
  function client() {
    let cookie = "";
    return async (path, { method = "GET", body, authorization, origin = method === "GET" ? undefined : "https://quest.test" } = {}) => {
      const response = await api(new Request(`https://quest.test${path}`, {
        method,
        headers: {
          ...(origin ? { Origin: origin } : {}),
          ...(cookie ? { Cookie: cookie } : {}),
          ...(authorization ? { Authorization: authorization } : {}),
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      }));
      if (response.headers.has("set-cookie")) cookie = response.headers.get("set-cookie").split(";")[0];
      return { status: response.status, data: await response.json() };
    };
  }
  return { sqlite, db, config, challenges, client };
}

test("integration tokens provision students and read scores without an admin browser session", async () => {
  const { sqlite, db, config, challenges, client } = setup();
  try {
    const guest = client(), admin = client(), player = client();
    assert.equal((await guest("/api/admin/integration-tokens", { method: "POST", body: { name: "SCE-web" } })).status, 401);
    assert.equal((await guest("/api/integrations/v1/me")).status, 401);
    assert.equal((await admin("/api/auth", { method: "POST", body: { mode: "login", username: "teacher", password: "teacher-password", hero: "web" } })).status, 200);
    const issued = await admin("/api/admin/integration-tokens", { method: "POST", body: { name: "SCE-web" } });
    assert.equal(issued.status, 201);
    const token = issued.data.token;
    assert.match(token, /^ctfrpg_[a-f0-9]{64}$/);
    assert.ok(!JSON.stringify((await admin("/api/admin/integration-tokens")).data).includes(token));
    assert.ok(!JSON.stringify(sqlite.prepare("SELECT * FROM integration_tokens").all()).includes(token));
    const auth = `Bearer ${token}`;
    assert.equal((await guest("/api/integrations/v1/me", { authorization: `Token ${token}` })).data.token.name, "SCE-web");
    assert.equal((await guest("/api/admin/integration-tokens", { authorization: auth })).status, 401);
    assert.equal((await guest("/api/integrations/v1/users/student01", { method: "PUT", body: { password: "student-password" }, origin: null })).status, 401);
    assert.equal((await guest("/api/integrations/v1/users/teacher", { method: "DELETE", authorization: auth, origin: null })).status, 403);
    assert.equal((await guest("/api/integrations/v1/users/teacher", { method: "PUT", authorization: auth, body: { password: "another-password" }, origin: null })).status, 403);
    const created = await guest("/api/integrations/v1/users/student01", { method: "PUT", authorization: auth, body: { password: "student-password" }, origin: null });
    assert.equal(created.status, 201);
    assert.equal(created.data.action, "created");
    assert.equal(created.data.user.role, "student");
    assert.equal((await guest("/api/integrations/v1/users/student01", { authorization: auth })).data.user.id, created.data.user.id);
    assert.equal((await guest("/api/integrations/v1/users", { authorization: auth })).data.users.length, 2);
    const unchanged = await guest("/api/integrations/v1/users/student01", { method: "PUT", authorization: auth, body: { password: "student-password" }, origin: null });
    assert.equal(unchanged.data.action, "unchanged");
    assert.equal((await player("/api/auth", { method: "POST", body: { mode: "login", username: "student01", password: "student-password" } })).status, 200);
    assert.equal((await player("/api/game", { method: "POST", body: { id: "lantern", answer: "24" } })).status, 200);
    const scores = await guest("/api/integrations/v1/scoreboard", { authorization: auth });
    assert.equal(scores.status, 200);
    assert.equal(scores.data.users.find(u => u.username === "student01").score, 100);
    const updated = await guest("/api/integrations/v1/users/student01", { method: "PUT", authorization: auth, body: { password: "replacement-password" }, origin: null });
    assert.equal(updated.data.action, "updated");
    assert.equal(updated.data.user.id, created.data.user.id);
    assert.equal((await player("/api/game")).status, 401);
    assert.equal((await player("/api/auth", { method: "POST", body: { mode: "login", username: "student01", password: "replacement-password" } })).status, 200);
    assert.equal((await player("/api/game")).data.score, 100);
    const snapshot = await createSnapshot({ db, config, challenges });
    assert.equal(snapshot.integrationTokens.length, 1);
    assert.ok(!JSON.stringify(snapshot).includes(token));
    assert.equal((await guest("/api/integrations/v1/users/student01", { method: "DELETE", authorization: auth, origin: null })).status, 200);
    assert.equal((await guest("/api/integrations/v1/users/student01", { authorization: auth })).status, 404);
    const recreated = await guest("/api/integrations/v1/users/student01", { method: "PUT", authorization: auth, body: { password: "fresh-password" }, origin: null });
    assert.equal(recreated.status, 201);
    assert.notEqual(recreated.data.user.id, created.data.user.id);
    assert.equal(recreated.data.user.score, 0);
    assert.equal((await admin(`/api/admin/integration-tokens/${issued.data.id}`, { method: "DELETE" })).status, 200);
    assert.equal((await guest("/api/integrations/v1/me", { authorization: auth })).status, 401);
  } finally { sqlite.close(); }
});
