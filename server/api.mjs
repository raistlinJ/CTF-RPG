import { normalize, publicConfig } from "../lib/config-schema.mjs";
const usernamePattern = /^[a-zA-Z0-9_-]{3,24}$/;
export async function passwordHash(password, salt) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: new TextEncoder().encode(salt),
      iterations: 100000,
      hash: "SHA-256",
    },
    key,
    256,
  );
  return Array.from(new Uint8Array(bits), (x) =>
    x.toString(16).padStart(2, "0"),
  ).join("");
}
function equal(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++)
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}
const json = (data, status = 200, headers = {}) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
export function createApi({ db, config, challenges, secureCookies = false }) {
  const tokenOf = (req) =>
    /quest_session=([^;]+)/.exec(req.headers.get("cookie") || "")?.[1];
  const sessionCookie = (token, maxAge = 604800) =>
    `quest_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secureCookies ? "; Secure" : ""}`;
  async function user(req) {
    const token = tokenOf(req);
    if (!token) return null;
    const u = await db
      .prepare(
        "SELECT students.id,username,hero FROM sessions JOIN students ON students.id=sessions.user WHERE token=? AND expires>?",
      )
      .bind(token, Date.now())
      .first();
    if (!u) return null;
    if (
      !config.accounts.allowRegistration &&
      !config.accounts.users.some((a) => a.username === u.username)
    )
      return null;
    const configured = config.accounts.users.find(
      (a) => a.username === u.username,
    );
    if (configured?.hero) u.hero = configured.hero;
    if (!config.characters.some((c) => c.id === u.hero)) return null;
    return u;
  }
  async function dispatch(req) {
    const path = new URL(req.url).pathname,
      method = req.method;
    if (
      !["GET", "HEAD"].includes(method) &&
      req.headers.get("origin") !== new URL(req.url).origin
    )
      return json({ error: "Invalid request origin." }, 403);
    if (path === "/api/config" && method === "GET")
      return json(publicConfig(config));
    if (path === "/api/auth" && method === "GET")
      return json({ user: await user(req) });
    if (path === "/api/auth" && method === "DELETE") {
      const token = tokenOf(req);
      if (token)
        await db
          .prepare("DELETE FROM sessions WHERE token=?")
          .bind(token)
          .run();
      return json({ ok: true }, 200, { "Set-Cookie": sessionCookie("", 0) });
    }
    if (path === "/api/auth" && method === "POST") {
      const { username, password, hero, mode } = await req.json();
      if (
        typeof username !== "string" ||
        !usernamePattern.test(username) ||
        typeof password !== "string" ||
        password.length < 8 ||
        password.length > 128 ||
        !["login", "register"].includes(mode)
      )
        return json(
          {
            error:
              "Use a 3–24 character username and a password of 8–128 characters.",
          },
          400,
        );
      const name = username.toLowerCase(),
        configured = config.accounts.users.find((u) => u.username === name);
      let account = await db
        .prepare("SELECT * FROM students WHERE username=?")
        .bind(name)
        .first();
      if (mode === "register") {
        if (!config.accounts.allowRegistration)
          return json(
            { error: "Sign in with the account your teacher provided." },
            403,
          );
        if (configured || account)
          return json(
            { error: "That username is already taken. Sign in instead." },
            409,
          );
        if (!config.characters.some((c) => c.id === hero))
          return json({ error: "Choose a hero." }, 400);
        const salt = crypto.randomUUID(),
          id = crypto.randomUUID();
        await db
          .prepare(
            "INSERT INTO students(id,username,hash,salt,hero) VALUES(?,?,?,?,?)",
          )
          .bind(id, name, await passwordHash(password, salt), salt, hero)
          .run();
        account = { id, username: name, hero };
      } else if (configured) {
        // YAML is authoritative for these credentials; hash verification avoids returning or persisting plaintext in SQLite.
        const salt = account?.salt || crypto.randomUUID();
        const expected = await passwordHash(configured.password, salt);
        if (!equal(expected, await passwordHash(password, salt)))
          return json({ error: "Username or password is incorrect." }, 401);
        const selected = configured.hero || account?.hero || hero;
        if (!config.characters.some((c) => c.id === selected))
          return json(
            { error: "Choose an available hero for your first sign-in." },
            400,
          );
        if (!account) {
          const id = crypto.randomUUID();
          await db
            .prepare(
              "INSERT INTO students(id,username,hash,salt,hero) VALUES(?,?,?,?,?)",
            )
            .bind(id, name, expected, salt, selected)
            .run();
          account = { id, username: name, hero: selected };
        } else {
          if (account.hash !== expected)
            await db
              .prepare("DELETE FROM sessions WHERE user=?")
              .bind(account.id)
              .run();
          await db
            .prepare("UPDATE students SET hash=?,salt=?,hero=? WHERE id=?")
            .bind(expected, salt, selected, account.id)
            .run();
          account.hero = selected;
        }
      } else {
        if (
          !config.accounts.allowRegistration ||
          !account ||
          !equal(await passwordHash(password, account.salt), account.hash)
        )
          return json({ error: "Username or password is incorrect." }, 401);
        if (!config.characters.some((c) => c.id === account.hero))
          return json(
            { error: "Your hero is unavailable. Please contact your teacher." },
            409,
          );
      }
      const token = crypto.randomUUID() + crypto.randomUUID();
      await db
        .prepare("DELETE FROM sessions WHERE expires<?")
        .bind(Date.now())
        .run();
      await db
        .prepare("INSERT INTO sessions(token,user,expires) VALUES(?,?,?)")
        .bind(token, account.id, Date.now() + 604800000)
        .run();
      return json(
        { user: { id: account.id, username: name, hero: account.hero } },
        200,
        { "Set-Cookie": sessionCookie(token) },
      );
    }
    if (path === "/api/game") {
      const u = await user(req);
      if (!u) return json({ error: "Sign in to play." }, 401);
      if (method === "GET") {
        const rows = await db
          .prepare("SELECT challenge,points FROM solved WHERE user=?")
          .bind(u.id)
          .all();
        return json({
          challenges: challenges.map(({ answers, ...c }) => c),
          solved: rows.results.map((r) => r.challenge),
          score: rows.results.reduce((s, r) => s + r.points, 0),
        });
      }
      if (method === "POST") {
        const { id, answer } = await req.json();
        const c = challenges.find((c) => c.id === id);
        if (!c || typeof answer !== "string" || answer.length > 500)
          return json({ error: "Invalid answer." }, 400);
        if (!c.answers.some((a) => normalize(a) === normalize(answer)))
          return json({ correct: false });
        await db
          .prepare(
            "INSERT OR IGNORE INTO solved(user,challenge,points) VALUES(?,?,?)",
          )
          .bind(u.id, c.id, c.points)
          .run();
        return json({ correct: true });
      }
    }
    return json({ error: "Not found." }, 404);
  }
  return async (req) => {
    try {
      return await dispatch(req);
    } catch (e) {
      if (e instanceof SyntaxError)
        return json({ error: "Invalid JSON." }, 400);
      console.error("Game API request failed:", e.name);
      return json(
        { error: "The expedition is temporarily unavailable. Please retry." },
        503,
      );
    }
  };
}
