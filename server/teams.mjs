import { teamFeatures, teamLabel, teamPolicy } from "./team-social.mjs";
import { passwordHash, equal } from "./passwords.mjs";
const reply = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
export async function teamState(db, config, u, admin = false) {
  const setting = await db
    .prepare("SELECT max_members FROM team_settings WHERE id='active'")
    .bind()
    .first();
  const teams = (
    await db
      .prepare(
        "SELECT teams.id,teams.name,COUNT(team_members.user) AS members FROM teams LEFT JOIN team_members ON teams.id=team_members.team GROUP BY teams.id ORDER BY teams.name",
      )
      .bind()
      .all()
  ).results;
  const membership = u
    ? await db
        .prepare("SELECT team FROM team_members WHERE user=?")
        .bind(u.id)
        .first()
    : null;
  if (!admin) {
    const features = await teamFeatures(db, config);
    teams.forEach((t) => {
      t.name = teamLabel(t, teamPolicy(features, t.id === membership?.team));
    });
  }
  return {
    maxMembers: setting?.max_members ?? config.teams?.maxMembers ?? 4,
    teams,
    team: teams.find((t) => t.id === membership?.team) || null,
  };
}
export async function handleTeams(req, { db, config, user, platformAdmin }) {
  const path = new URL(req.url).pathname,
    u = await user(req),
    admin = platformAdmin || u?.role === "admin";
  if (path.startsWith("/api/admin/") && !admin)
    return reply({ error: "Administrator access required." }, 403);
  if (!u && !admin) return reply({ error: "Sign in to choose a team." }, 401);
  if (req.method === "GET") {
    const state = await teamState(db, config, u, admin);
    if (admin && path.startsWith("/api/admin/"))
      state.members = (
        await db
          .prepare(
            "SELECT team_members.team,students.username,students.disabled FROM team_members JOIN students ON students.id=team_members.user ORDER BY students.username",
          )
          .bind()
          .all()
      ).results;
    return reply(state);
  }
  const body = await req.json();
  if (path === "/api/admin/teams") {
    if (req.method === "POST") {
      if (
        !Number.isInteger(body.maxMembers) ||
        body.maxMembers < 1 ||
        body.maxMembers > 100
      )
        return reply({ error: "Choose a team limit from 1 to 100." }, 400);
      await db
        .prepare(
          "INSERT INTO team_settings(id,max_members) VALUES('active',?) ON CONFLICT(id) DO UPDATE SET max_members=excluded.max_members",
        )
        .bind(body.maxMembers)
        .run();
    } else if (req.method === "DELETE") {
      if (typeof body.id !== "string")
        return reply({ error: "Choose a team." }, 400);
      await db.batch([
        db.prepare("DELETE FROM team_members WHERE team=?").bind(body.id),
        db.prepare("DELETE FROM teams WHERE id=?").bind(body.id),
      ]);
    } else return reply({ error: "Method not allowed." }, 405);
    return reply(await teamState(db, config, u, admin));
  }
  if (req.method !== "POST")
    return reply({ error: "Method not allowed." }, 405);
  if (!u || u.role === "admin")
    return reply({ error: "Teams are for student accounts." }, 403);
  if ((await teamState(db, config, u, admin)).team)
    return reply(
      { error: "You already belong to a team. Only an admin can disband it." },
      409,
    );
  if (
    typeof body.password !== "string" ||
    body.password.length < 8 ||
    body.password.length > 128
  )
    return reply({ error: "Use a team password of 8–128 characters." }, 400);
  if (body.mode === "create") {
    if (
      typeof body.name !== "string" ||
      !body.name.trim() ||
      body.name.trim().length > 48 ||
      /[\x00-\x1f]/.test(body.name)
    )
      return reply({ error: "Use a team name of 1–48 characters." }, 400);
    const name = body.name.trim(),
      key = name.toLowerCase(),
      id = crypto.randomUUID(),
      salt = crypto.randomUUID(),
      hash = await passwordHash(body.password, salt);
    if (
      await db
        .prepare("SELECT id FROM teams WHERE name_key=?")
        .bind(key)
        .first()
    )
      return reply({ error: "That team name is already taken." }, 409);
    try {
      await db.batch([
        db
          .prepare(
            "INSERT INTO teams(id,name,name_key,hash,salt) SELECT ?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM team_members WHERE user=?)",
          )
          .bind(id, name, key, hash, salt, u.id),
        db
          .prepare(
            "INSERT INTO team_members(user,team) SELECT ?,id FROM teams WHERE id=?",
          )
          .bind(u.id, id),
      ]);
    } catch {
      return reply(
        { error: "Team creation changed while saving. Refresh and try again." },
        409,
      );
    }
  } else if (body.mode === "join") {
    if (typeof body.id !== "string")
      return reply({ error: "Choose a team." }, 400);
    const t = await db
      .prepare("SELECT * FROM teams WHERE id=?")
      .bind(body.id)
      .first();
    if (!t || !equal(await passwordHash(body.password, t.salt), t.hash))
      return reply({ error: "Team or password is incorrect." }, 401);
    const r = await db
      .prepare(
        "INSERT INTO team_members(user,team) SELECT ?,id FROM teams WHERE id=? AND NOT EXISTS(SELECT 1 FROM team_members WHERE user=?) AND (SELECT COUNT(*) FROM team_members WHERE team=teams.id)<COALESCE((SELECT max_members FROM team_settings WHERE id='active'),?) ON CONFLICT(user) DO NOTHING",
      )
      .bind(u.id, t.id, u.id, config.teams?.maxMembers ?? 4)
      .run();
    if (!(r.meta?.changes ?? r.changes))
      return reply(
        {
          error: "This team is full, disbanded, or you already joined a team.",
        },
        409,
      );
  } else return reply({ error: "Choose create or join." }, 400);
  return reply(await teamState(db, config, u, admin));
}
