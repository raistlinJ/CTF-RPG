const reply = (data, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
export async function teamFeatures(db, config) {
  const row = await db
    .prepare(
      "SELECT names,scores,messaging,revision FROM team_social_settings WHERE id='active'",
    )
    .bind()
    .first();
  const defaults = config.teams?.features || {
    names: true,
    scores: true,
    messaging: true,
  };
  return row
    ? {
        names: !!row.names,
        scores: !!row.scores,
        messaging: !!row.messaging,
        revision: row.revision,
      }
    : { ...defaults, revision: 0 };
}
export const teamLabel = (team, features) =>
  features.names ? team.name : `Team #${team.id.slice(0, 8)}`;
export async function teamInbox(db, features, team) {
  if (!features.messaging || !team) return 0;
  return (
    (
      await db
        .prepare(
          "SELECT MAX(created_at) AS latest FROM team_messages WHERE recipient_team=?",
        )
        .bind(team)
        .first()
    )?.latest || 0
  );
}
export async function handleTeamSocial(
  req,
  { db, config, user, platformAdmin },
) {
  const u = await user(req),
    admin = platformAdmin || u?.role === "admin",
    url = new URL(req.url);
  if (!u && !admin) return reply({ error: "Sign in to view teams." }, 401);
  const features = await teamFeatures(db, config);
  if (url.pathname === "/api/admin/team-social") {
    if (!admin) return reply({ error: "Administrator access required." }, 403);
    if (req.method === "GET") return reply(features);
    if (req.method !== "POST")
      return reply({ error: "Method not allowed." }, 405);
    const body = await req.json();
    if (
      !["names", "scores", "messaging"].every(
        (k) => typeof body[k] === "boolean",
      ) ||
      !Number.isInteger(body.revision)
    )
      return reply(
        { error: "Provide each team feature and its revision." },
        400,
      );
    if (body.revision !== features.revision)
      return reply(
        { error: "Team features changed. Reload before saving." },
        409,
      );
    const r = await db
      .prepare(
        "INSERT INTO team_social_settings(id,names,scores,messaging,revision) VALUES('active',?,?,?,1) ON CONFLICT(id) DO UPDATE SET names=excluded.names,scores=excluded.scores,messaging=excluded.messaging,revision=team_social_settings.revision+1 WHERE team_social_settings.revision=?",
      )
      .bind(+body.names, +body.scores, +body.messaging, body.revision)
      .run();
    if (!(r.meta?.changes ?? r.changes))
      return reply(
        { error: "Another administrator saved first. Reload before saving." },
        409,
      );
    return reply(await teamFeatures(db, config));
  }
  const membership = u
      ? await db
          .prepare("SELECT team FROM team_members WHERE user=?")
          .bind(u.id)
          .first()
      : null,
    own = membership?.team || null;
  if (!admin && !own)
    return reply(
      { error: "Join a team to view team details and messages." },
      403,
    );
  if (req.method === "POST") {
    if (!features.messaging)
      return reply(
        { error: "Team messaging is turned off by your instructor." },
        403,
      );
    const body = await req.json();
    if (
      typeof body.team !== "string" ||
      typeof body.text !== "string" ||
      !body.text.trim() ||
      body.text.trim().length > 1000 ||
      typeof body.id !== "string" ||
      !/^[a-f0-9-]{36}$/.test(body.id)
    )
      return reply(
        { error: "Choose a team and write a message of 1–1000 characters." },
        400,
      );
    const existing = await db
      .prepare(
        "SELECT sender_user,sender_team,recipient_team,text FROM team_messages WHERE id=?",
      )
      .bind(body.id)
      .first();
    if (existing) {
      if (
        existing.sender_user !== (u?.id || null) ||
        existing.sender_team !== (admin ? null : own) ||
        existing.recipient_team !== body.team ||
        existing.text !== body.text.trim()
      )
        return reply({ error: "Message reference is already in use." }, 409);
      return reply({ sent: true, id: body.id });
    }
    const now = Date.now(),
      defaults = config.teams?.features?.messaging !== false;
    // Membership, feature switch, recipient and per-sender throttle are checked in the write.
    const r = await db
      .prepare(
        `INSERT OR IGNORE INTO team_messages(id,sender_user,sender_team,recipient_team,sender,text,created_at)
 SELECT ?,?,?,t.id,?,?,? FROM teams t WHERE t.id=?
 AND COALESCE((SELECT messaging FROM team_social_settings WHERE id='active'),?)=1
 AND (?=1 OR EXISTS(SELECT 1 FROM team_members WHERE user=? AND team=?))
 AND (SELECT COUNT(*) FROM team_messages WHERE sender_user IS ? AND created_at>?)<5`,
      )
      .bind(
        body.id,
        u?.id || null,
        admin ? null : own,
        admin ? "Instructor" : u.username,
        body.text.trim(),
        now,
        body.team,
        +defaults,
        +admin,
        u?.id || null,
        own,
        u?.id || null,
        now - 60000,
      )
      .run();
    if (!(r.meta?.changes ?? r.changes)) {
      const saved = await db
        .prepare(
          "SELECT sender_user,sender_team,recipient_team,text FROM team_messages WHERE id=?",
        )
        .bind(body.id)
        .first();
      if (
        saved &&
        saved.sender_user === (u?.id || null) &&
        saved.sender_team === (admin ? null : own) &&
        saved.recipient_team === body.team &&
        saved.text === body.text.trim()
      )
        return reply({ sent: true, id: body.id });
      if (
        !(await db
          .prepare("SELECT id FROM teams WHERE id=?")
          .bind(body.team)
          .first())
      )
        return reply(
          { error: "This team was disbanded. Choose another team." },
          404,
        );
      const latest = await teamFeatures(db, config);
      if (!latest.messaging)
        return reply(
          { error: "Team messaging is turned off by your instructor." },
          403,
        );
      if (
        !admin &&
        !(await db
          .prepare("SELECT team FROM team_members WHERE user=? AND team=?")
          .bind(u.id, own)
          .first())
      )
        return reply({ error: "Your team changed. Reload the game." }, 403);
      return reply(
        {
          error:
            "Please wait before sending another message. Each explorer can send five messages per minute.",
        },
        429,
      );
    }
    return reply({ sent: true, id: body.id });
  }
  if (req.method !== "GET") return reply({ error: "Method not allowed." }, 405);
  const teams = (
    await db
      .prepare(
        "SELECT teams.id,teams.name,COUNT(team_members.user) AS members FROM teams LEFT JOIN team_members ON teams.id=team_members.team GROUP BY teams.id ORDER BY teams.name,teams.id",
      )
      .bind()
      .all()
  ).results;
  const scores = new Map();
  if (features.scores) {
    const rows = (
      await db
        .prepare(
          `SELECT m.team,s.username,s.role,s.managed,s.provisioned,COALESCE(SUM(solved.points),0) AS score FROM team_members m JOIN students s ON s.id=m.user LEFT JOIN solved ON solved.user=s.id WHERE s.disabled=0 GROUP BY s.id,m.team`,
        )
        .bind()
        .all()
    ).results;
    for (const r of rows) {
      const cfg = config.accounts.users.find((a) => a.username === r.username);
      if (
        (r.managed ? r.role : cfg?.role || "student") === "student" &&
        (config.accounts.allowRegistration || cfg || r.provisioned)
      )
        scores.set(r.team, (scores.get(r.team) || 0) + r.score);
    }
  }
  const summary = (t) => ({
    id: t.id,
    label: teamLabel(t, features),
    members: t.members,
    isYourTeam: t.id === own,
    ...(features.names ? { name: t.name } : {}),
    ...(features.scores ? { score: scores.get(t.id) || 0 } : {}),
  });
  const selectedId = url.searchParams.get("team");
  if (!selectedId)
    return reply({
      features,
      ownTeam: own,
      teams: teams.map(summary),
      latestMessageAt: await teamInbox(db, features, own),
    });
  const selected = teams.find((t) => t.id === selectedId);
  if (!selected) return reply({ error: "This team was disbanded." }, 404);
  let messages = [];
  if (features.messaging) {
    const predicate = admin
      ? "(recipient_team=? OR sender_team=?)"
      : selectedId === own
        ? "(recipient_team=? OR sender_team=?)"
        : "((sender_team=? AND recipient_team=?) OR (sender_team=? AND recipient_team=?))";
    const args = admin
      ? [selectedId, selectedId]
      : selectedId === own
        ? [own, own]
        : [own, selectedId, selectedId, own];
    const rows = (
      await db
        .prepare(
          `SELECT id,sender_team,recipient_team,sender,text,created_at FROM team_messages WHERE ${predicate} ORDER BY created_at DESC,id DESC LIMIT 100`,
        )
        .bind(...args)
        .all()
    ).results;
    messages = rows
      .reverse()
      .map((m) => ({
        id: m.id,
        sender: m.sender,
        fromTeam: m.sender_team
          ? summary(teams.find((t) => t.id === m.sender_team))
          : null,
        toTeam: summary(teams.find((t) => t.id === m.recipient_team)),
        text: m.text,
        createdAt: m.created_at,
        outgoing: admin ? m.sender_team === null : m.sender_team === own,
      }));
  }
  return reply({
    features,
    ownTeam: own,
    team: summary(selected),
    messages,
    latestMessageAt: await teamInbox(db, features, own),
  });
}
