// CTF-RPG — Copyright (c) 2026 Jaime C Acosta
const reply = (data, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
export async function scoreboardSettings(db) {
  return (
    (await db
      .prepare(
        "SELECT visibility,mode,revision FROM scoreboard_settings WHERE id='active'",
      )
      .bind()
      .first()) || { visibility: "all", mode: "individual", revision: 0 }
  );
}
export async function handleSocialControls(req, { db, user, platformAdmin }) {
  const u = await user(req);
  if (!platformAdmin && u?.role !== "admin")
    return reply({ error: "Administrator access required." }, u ? 403 : 401);
  const url = new URL(req.url);
  if (url.pathname === "/api/admin/mute") {
    if (req.method === "GET")
      return reply({
        users: (
          await db
            .prepare(
              "SELECT username,muted,revision FROM students ORDER BY username",
            )
            .bind()
            .all()
        ).results.map((r) => ({ ...r, muted: !!r.muted })),
      });
    if (req.method !== "POST")
      return reply({ error: "Method not allowed." }, 405);
    const b = await req.json();
    if (
      typeof b.username !== "string" ||
      typeof b.muted !== "boolean" ||
      !Number.isInteger(b.revision)
    )
      return reply(
        { error: "Provide a user, mute status, and revision." },
        400,
      );
    const result = await db
      .prepare(
        "UPDATE students SET muted=?,revision=revision+1 WHERE username=? AND revision=?",
      )
      .bind(+b.muted, b.username, b.revision)
      .run();
    if (!(result.meta?.changes ?? result.changes))
      return reply(
        { error: "The account changed. Refresh before muting." },
        409,
      );
    return reply({
      username: b.username,
      muted: b.muted,
      revision: b.revision + 1,
    });
  }
  const current = await scoreboardSettings(db);
  if (req.method === "GET") return reply(current);
  if (req.method !== "POST")
    return reply({ error: "Method not allowed." }, 405);
  const b = await req.json();
  if (
    !["admins", "all"].includes(b.visibility) ||
    !["team", "individual"].includes(b.mode) ||
    !Number.isInteger(b.revision)
  )
    return reply(
      { error: "Choose valid scoreboard visibility and scoring." },
      400,
    );
  if (current.revision !== b.revision)
    return reply(
      { error: "Scoreboard settings changed. Reload before saving." },
      409,
    );
  const r = await db
    .prepare(
      "INSERT INTO scoreboard_settings(id,visibility,mode,revision) VALUES('active',?,?,1) ON CONFLICT(id) DO UPDATE SET visibility=excluded.visibility,mode=excluded.mode,revision=scoreboard_settings.revision+1 WHERE scoreboard_settings.revision=?",
    )
    .bind(b.visibility, b.mode, b.revision)
    .run();
  if (!(r.meta?.changes ?? r.changes))
    return reply({ error: "Another administrator saved first." }, 409);
  return reply(await scoreboardSettings(db));
}
