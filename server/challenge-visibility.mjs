// CTF-RPG — Copyright (c) 2026 Jaime C Acosta
export async function challengeSettings(db) {
  return (await db.prepare("SELECT visibility,revision FROM challenge_settings WHERE id='active'").bind().first()) || { visibility: "all", revision: 0 };
}
export function visibleChallenges(challenges, settings, admin) {
  return admin ? challenges : settings.visibility === "admins" ? [] : challenges.filter(c => c.visibility !== "hidden");
}
export async function handleChallengeSettings(req, {db, user, platformAdmin}) {
  const u = await user(req);
  if (!platformAdmin && u?.role !== "admin") return Response.json({error:"Administrator access required."}, {status:u ? 403 : 401});
  const reply = (body, status=200) => Response.json(body,{status,headers:{"Cache-Control":"no-store"}});
  if (req.method === "GET") return reply(await challengeSettings(db));
  if (req.method !== "POST") return reply({error:"Method not allowed."},405);
  const b = await req.json();
  if (!["admins","all"].includes(b.visibility) || !Number.isInteger(b.revision) || b.revision < 0) return reply({error:"Choose valid challenge visibility and revision."},400);
  const r = await db.prepare("INSERT INTO challenge_settings(id,visibility,revision) SELECT 'active',?,1 WHERE COALESCE((SELECT revision FROM challenge_settings WHERE id='active'),0)=? ON CONFLICT(id) DO UPDATE SET visibility=excluded.visibility,revision=challenge_settings.revision+1 WHERE challenge_settings.revision=?").bind(b.visibility,b.revision,b.revision).run();
  if (!(r.meta?.changes ?? r.changes)) return reply({error:"Challenge visibility changed. Reload before saving."},409);
  return reply(await challengeSettings(db));
}
