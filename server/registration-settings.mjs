// The YAML value seeds new installations; an admin save overrides it in the database.
export async function registrationSettings(db, config) {
  const row = await db.prepare("SELECT allow_registration,revision FROM registration_settings WHERE id='active'").bind().first();
  return {
    allowRegistration: row ? !!row.allow_registration : config.accounts.allowRegistration,
    revision: row?.revision ?? 0,
  };
}

export async function handleRegistrationSettings(req, { db, config, user, platformAdmin }) {
  const u = await user(req);
  const reply = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  if (!platformAdmin && u?.role !== "admin")
    return reply({ error: "Administrator access required." }, u ? 403 : 401);
  if (req.method === "GET") return reply(await registrationSettings(db, config));
  if (req.method !== "POST") return reply({ error: "Method not allowed." }, 405);
  const body = await req.json();
  if (typeof body?.allowRegistration !== "boolean" || !Number.isInteger(body.revision) || body.revision < 0)
    return reply({ error: "Choose a registration setting and revision." }, 400);
  const result = await db.prepare(
    "INSERT INTO registration_settings(id,allow_registration,revision) SELECT 'active',?,1 WHERE COALESCE((SELECT revision FROM registration_settings WHERE id='active'),0)=? ON CONFLICT(id) DO UPDATE SET allow_registration=excluded.allow_registration,revision=registration_settings.revision+1 WHERE registration_settings.revision=?",
  ).bind(+body.allowRegistration, body.revision, body.revision).run();
  if (!(result.meta?.changes ?? result.changes))
    return reply({ error: "Registration settings changed. Reload before saving." }, 409);
  return reply(await registrationSettings(db, config));
}
