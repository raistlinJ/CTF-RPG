import { bulkUserAction } from "./user-actions.mjs";
import { configuredCredentials, equal, passwordHash } from "./passwords.mjs";
import { registrationSettings } from "./registration-settings.mjs";
import { teamScores } from "./team-social.mjs";

const reply = (body, status = 200) => Response.json(body, {
  status,
  headers: { "Cache-Control": "no-store" },
});
const usernamePattern = /^[a-z0-9_-]{3,24}$/;
const tokenPattern = /^ctfrpg_[a-f0-9]{64}$/;

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

function publicToken(row) {
  return { id: row.id, name: row.name, createdAt: row.created_at };
}

export async function handleIntegrationTokens(req, { db, user, platformAdmin }) {
  const admin = await user(req);
  if (!platformAdmin && admin?.role !== "admin")
    return reply({ error: "Administrator access required." }, admin ? 403 : 401);
  const path = new URL(req.url).pathname;
  if (path === "/api/admin/integration-tokens") {
    if (req.method === "GET") {
      const rows = (await db.prepare("SELECT id,name,created_at FROM integration_tokens ORDER BY created_at DESC,id").bind().all()).results;
      return reply({ tokens: rows.map(publicToken) });
    }
    if (req.method !== "POST") return reply({ error: "Method not allowed." }, 405);
    const body = await req.json();
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 80) return reply({ error: "Give the token a name of 1–80 characters." }, 400);
    const count = await db.prepare("SELECT COUNT(*) AS count FROM integration_tokens").bind().first();
    if (count.count >= 1000) return reply({ error: "Revoke an unused token before creating another." }, 409);
    const random = new Uint8Array(32);
    crypto.getRandomValues(random);
    const token = `ctfrpg_${Array.from(random, byte => byte.toString(16).padStart(2, "0")).join("")}`;
    const row = { id: crypto.randomUUID(), name, created_at: Date.now() };
    await db.prepare("INSERT INTO integration_tokens(id,name,token_hash,created_at) VALUES(?,?,?,?)")
      .bind(row.id, row.name, await sha256(token), row.created_at).run();
    return reply({ ...publicToken(row), token }, 201);
  }
  const id = path.slice("/api/admin/integration-tokens/".length);
  if (req.method !== "DELETE") return reply({ error: "Method not allowed." }, 405);
  if (!/^[a-f0-9-]{36}$/i.test(id)) return reply({ error: "Token not found." }, 404);
  const result = await db.prepare("DELETE FROM integration_tokens WHERE id=?").bind(id).run();
  return (result.meta?.changes ?? result.changes) ? reply({ revoked: true }) : reply({ error: "Token not found." }, 404);
}

async function integrationIdentity(req, db) {
  const match = /^(?:Bearer|Token) (\S+)$/i.exec(req.headers.get("authorization") || "");
  if (!match || !tokenPattern.test(match[1])) return null;
  const hash = await sha256(match[1]);
  const row = await db.prepare("SELECT id,name,created_at FROM integration_tokens WHERE token_hash=?").bind(hash).first();
  return row && publicToken(row);
}

function publicAccount(a) {
  return {
    id: a.id,
    username: a.username,
    role: a.role,
    hero: a.hero,
    disabled: a.disabled,
    source: a.source,
    team: a.team,
    score: a.score,
    completed: a.completed,
  };
}

function ranked(rows) {
  let previousScore, rank = 0;
  return rows.sort((a, b) => b.score - a.score || a.username.localeCompare(b.username))
    .map((row, index) => {
      if (row.score !== previousScore) rank = index + 1;
      previousScore = row.score;
      return { ...row, rank };
    });
}

export async function handleIntegrationApi(req, { db, config, accountList }) {
  const identity = await integrationIdentity(req, db);
  if (!identity) return reply({ error: "A valid integration token is required." }, 401);
  const path = new URL(req.url).pathname;
  if (path === "/api/integrations/v1/me")
    return req.method === "GET"
      ? reply({ token: identity, characters: config.characters.map(({ id, name }) => ({ id, name })) })
      : reply({ error: "Method not allowed." }, 405);
  if (path === "/api/integrations/v1/users")
    return req.method === "GET"
      ? reply({ users: (await accountList()).map(publicAccount) })
      : reply({ error: "Method not allowed." }, 405);
  if (path === "/api/integrations/v1/scoreboard") {
    if (req.method !== "GET") return reply({ error: "Method not allowed." }, 405);
    const open = (await registrationSettings(db, config)).allowRegistration;
    const disabledTeams = new Set((await db.prepare('SELECT id FROM teams WHERE disabled=1').bind().all()).results.map(t=>t.id));
    const users = ranked((await accountList())
      .filter(a => a.role === "student" && !a.disabled && !disabledTeams.has(a.team?.id) && (open || a.provisioned || config.accounts.users.some(c => c.username === a.username)))
      .map(a => ({ id: a.id, username: a.username, hero: a.hero, team: a.team, score: a.score, completed: a.completed })));
    const totals = await teamScores(db, config);
    const teams = ranked((await db.prepare("SELECT id,name FROM teams WHERE disabled=0 ORDER BY name").bind().all()).results
      .map(t => ({ id: t.id, username: t.name, score: totals.get(t.id) || 0 })));
    return reply({ users, teams });
  }
  const prefix = "/api/integrations/v1/users/";
  if (!path.startsWith(prefix)) return reply({ error: "Not found." }, 404);
  let name;
  try { name = decodeURIComponent(path.slice(prefix.length)).toLowerCase(); }
  catch { return reply({ error: "Invalid username." }, 400); }
  if (!usernamePattern.test(name)) return reply({ error: "Invalid username." }, 400);
  const existing = (await accountList()).find(a => a.username === name);
  if (req.method === "GET")
    return existing ? reply({ user: publicAccount(existing) }) : reply({ error: "User not found." }, 404);
  if (req.method === "DELETE") {
    if (!existing) return reply({ error: "User not found." }, 404);
    if (existing.role === "admin") return reply({ error: "Administrator accounts cannot be deleted through an integration token." }, 403);
    const result = await bulkUserAction({ action: "delete", users: [{ username: name, revision: existing.revision }] }, { db, config, viewer: null, accountList });
    if (!result.ok) return result;
    return reply({ deleted: true, username: name });
  }
  if (req.method !== "PUT") return reply({ error: "Method not allowed." }, 405);
  const body = await req.json();
  if (typeof body?.password !== "string" || body.password.length < 8 || body.password.length > 128)
    return reply({ error: "Provide a password of 8–128 characters." }, 400);
  if (body.hero !== undefined && (typeof body.hero !== "string" || !config.characters.some(c => c.id === body.hero)))
    return reply({ error: "Choose a valid hero." }, 400);
  if (existing?.role === "admin")
    return reply({ error: "Administrator accounts cannot be changed through an integration token." }, 403);
  const row = await db.prepare("SELECT * FROM students WHERE username=?").bind(name).first();
  const deleted = await db.prepare("SELECT username FROM deleted_accounts WHERE username=?").bind(name).first();
  const cfg = deleted ? undefined : config.accounts.users.find(a => a.username === name);
  const hero = body.hero || existing?.hero || config.characters[0].id;
  if (row) {
    const credentials = row.managed || !cfg ? { salt: row.salt, hash: row.hash } : await configuredCredentials(cfg, row);
    const samePassword = equal(await passwordHash(body.password, credentials.salt), credentials.hash);
    if (samePassword && row.managed && row.provisioned && row.hero === hero)
      return reply({ action: "unchanged", user: publicAccount(existing) });
    const salt = samePassword ? credentials.salt : crypto.randomUUID();
    const hash = samePassword ? credentials.hash : await passwordHash(body.password, salt);
    const update = db.prepare("UPDATE students SET hash=?,salt=?,hero=?,managed=1,provisioned=1,revision=revision+1 WHERE id=? AND revision=? AND role='student'")
      .bind(hash, salt, hero, row.id, row.revision);
    const result = samePassword ? await update.run() : (await db.batch([
      update,
      db.prepare("DELETE FROM sessions WHERE user=? AND EXISTS(SELECT 1 FROM students WHERE id=? AND revision=? AND hash=?)")
        .bind(row.id, row.id, row.revision + 1, hash),
    ]))[0];
    if (!(result.meta?.changes ?? result.changes)) return reply({ error: "The user changed. Retry after refreshing." }, 409);
    return reply({ action: "updated", user: publicAccount((await accountList()).find(a => a.username === name)) });
  }
  const salt = crypto.randomUUID(), id = crypto.randomUUID();
  const hash = await passwordHash(body.password, salt);
  try {
    await db.batch([
      db.prepare("INSERT INTO students(id,username,hash,salt,hero,role,disabled,managed,provisioned,revision) VALUES(?,?,?,?,?,'student',0,1,1,1)")
        .bind(id, name, hash, salt, hero),
      db.prepare("DELETE FROM deleted_accounts WHERE username=?").bind(name),
    ]);
  } catch (error) {
    if (/UNIQUE constraint/i.test(error.message)) return reply({ error: "The user changed. Retry after refreshing." }, 409);
    throw error;
  }
  return reply({ action: "created", user: publicAccount((await accountList()).find(a => a.username === name)) }, 201);
}
