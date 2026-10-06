import { createWorld } from "../lib/world-data.mjs";
const modes = ["off", "team", "all"];
const reply = (data, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
export async function presenceSettings(db, config) {
  const row = await db
    .prepare(
      "SELECT visibility,revision FROM presence_settings WHERE id='active'",
    )
    .bind()
    .first();
  return (
    row || { visibility: config.presence?.visibility || "team", revision: 0 }
  );
}
export async function handlePresence(
  req,
  { db, config, user, platformAdmin, theme, themeRevision },
) {
  const u = await user(req),
    admin = platformAdmin || u?.role === "admin",
    path = new URL(req.url).pathname;
  if (path === "/api/admin/presence") {
    if (!admin)
      return reply({ error: "Administrator access required." }, u ? 403 : 401);
    const current = await presenceSettings(db, config);
    if (req.method === "GET") return reply(current);
    if (req.method !== "POST")
      return reply({ error: "Method not allowed." }, 405);
    const body = await req.json();
    if (!modes.includes(body.visibility) || !Number.isInteger(body.revision))
      return reply({ error: "Choose a valid player visibility setting." }, 400);
    if (current.revision !== body.revision)
      return reply(
        { error: "Player visibility changed. Reload before saving." },
        409,
      );
    const result = await db
      .prepare(
        "INSERT INTO presence_settings(id,visibility,revision) VALUES('active',?,1) ON CONFLICT(id) DO UPDATE SET visibility=excluded.visibility,revision=presence_settings.revision+1 WHERE presence_settings.revision=?",
      )
      .bind(body.visibility, body.revision)
      .run();
    if (!(result.meta?.changes ?? result.changes))
      return reply(
        { error: "Another administrator saved first. Reload before saving." },
        409,
      );
    return reply(await presenceSettings(db, config));
  }
  if (!u) return reply({ error: "Sign in to see players." }, 401);
  if (req.method === "DELETE") {
    await db
      .prepare("DELETE FROM player_presence WHERE user=?")
      .bind(u.id)
      .run();
    return reply({ ok: true });
  }
  if (req.method !== "POST")
    return reply({ error: "Method not allowed." }, 405);
  const body = await req.json(),
    engine = createWorld(theme.world);
  if (body.themeRevision !== themeRevision)
    return reply({ error: "The map changed. Reload the game." }, 409);
  if (
    typeof body.map !== "string" ||
    !Number.isInteger(body.x) ||
    !Number.isInteger(body.y) ||
    !engine.reachable(body.map, body.x, body.y)
  )
    return reply({ error: "Invalid player position." }, 400);
  const member = await db
    .prepare("SELECT team FROM team_members WHERE user=?")
    .bind(u.id)
    .first();
  if (u.role !== "admin" && !member)
    return reply({ error: "Join a team before exploring." }, 403);
  const setting = await presenceSettings(db, config),
    now = Date.now(),
    fallback = config.presence?.visibility || "team";
  if (setting.visibility === "off")
    return reply({ visibility: "off", players: [], truncated: false });
  // Keep one recent position per account; stationary explorers refresh less often.
  await db
    .prepare(
      "INSERT INTO player_presence(user,map,x,y,theme_revision,updated_at) SELECT ?,?,?,?,?,? WHERE COALESCE((SELECT visibility FROM presence_settings WHERE id='active'),?)<>'off' ON CONFLICT(user) DO UPDATE SET map=excluded.map,x=excluded.x,y=excluded.y,theme_revision=excluded.theme_revision,updated_at=excluded.updated_at WHERE player_presence.map<>excluded.map OR player_presence.x<>excluded.x OR player_presence.y<>excluded.y OR player_presence.theme_revision<>excluded.theme_revision OR player_presence.updated_at<?",
    )
    .bind(
      u.id,
      body.map,
      body.x,
      body.y,
      themeRevision,
      now,
      fallback,
      now - 9000,
    )
    .run();
  const rows = (
    await db
      .prepare(
        `SELECT p.user,p.x,p.y,s.username,s.hero,s.managed,s.role,s.provisioned,m.team FROM player_presence p JOIN students s ON s.id=p.user LEFT JOIN team_members m ON m.user=s.id
 WHERE p.map=? AND p.theme_revision=? AND p.updated_at>? AND p.user<>? AND s.disabled=0
 AND EXISTS(SELECT 1 FROM sessions WHERE sessions.user=s.id AND expires>?)
 AND (COALESCE((SELECT visibility FROM presence_settings WHERE id='active'),?)='all' OR (COALESCE((SELECT visibility FROM presence_settings WHERE id='active'),?)='team' AND m.team=?))
 ORDER BY p.updated_at DESC,s.username LIMIT 101`,
      )
      .bind(
        body.map,
        themeRevision,
        now - 20000,
        u.id,
        now,
        fallback,
        fallback,
        member?.team || "",
      )
      .all()
  ).results;
  const players = rows
    .filter((r) => {
      const cfg = config.accounts.users.find((a) => a.username === r.username);
      return (
        engine.reachable(body.map, r.x, r.y) &&
        (config.accounts.allowRegistration || cfg || r.provisioned) &&
        (r.team || (r.managed ? r.role : cfg?.role) === "admin")
      );
    })
    .slice(0, 100)
    .map((r) => {
      const cfg = config.accounts.users.find((a) => a.username === r.username);
      return {
        username: r.username,
        hero: r.managed ? r.hero : cfg?.hero || r.hero,
        x: r.x,
        y: r.y,
        teammate: !!member && r.team === member.team,
      };
    });
  return reply({
    visibility: setting.visibility,
    players,
    truncated: rows.length > 100,
  });
}
