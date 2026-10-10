import { z } from "zod";
import { entityReference } from "../lib/challenge-dependencies.mjs";
import { entitiesSchema } from "../lib/non-player-entities.mjs";
import { parseTheme } from "../lib/theme-schema.mjs";
import { themeContentValid } from "./packs.mjs";
const reply = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const schema = z.object({
  revision: z.number().int().min(0),
  themeRevision: z.number().int().min(0),
  dependencies: z.array(z.object({ id: z.string(), dependsOn: z.array(z.string()).max(199) }).strict()).max(200),
  entities: entitiesSchema.optional(),
}).strict();
const preview = (text = "") => {
  const plain = text.replace(/\s+/g, " ").trim();
  return plain.length > 400 ? plain.slice(0,400).replace(/\s+\S*$/, "") + "…" : plain;
};
const nodes = (challenges) => challenges.map((c) => ({
  id: c.id, object: c.object, map: c.map, region: c.region, location: c.location,
  visibility: c.visibility || "visible", points: c.points, dependsOn: c.dependsOn || [],
  grading: c.grading || "automatic", summary: preview(c.text),
}));
const graphResponse = (challenges, theme, revision, themeRevision) => ({
  challenges: nodes(challenges), entities: theme.world.entities || [],
  world: theme.world, characters: theme.characters, revision, themeRevision,
});
export async function handleChallengeDependencies(req, { db, user, platformAdmin, catalog, theme, themeRevision }) {
  const u = await user(req);
  if (!platformAdmin && u?.role !== "admin")
    return reply({ error: "Administrator access required." }, u ? 403 : 401);
  const current = await catalog();
  if (req.method === "GET") return reply(graphResponse(current.challenges, theme, current.revision, themeRevision));
  if (req.method !== "POST") return reply({ error: "Method not allowed." }, 405);
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return reply({ error: parsed.error.issues.map(i => i.message).join("; ") }, 400);
  const body = parsed.data;
  if (body.revision !== current.revision || body.themeRevision !== themeRevision)
    return reply({ error: "Challenges or characters changed. Reload the saved graph before saving again." }, 409);
  const entities = body.entities ?? theme.world.entities ?? [];
  const expected = [...current.challenges.map(c => c.id), ...(body.entities ? entities.map(e => entityReference(e.id)) : [])];
  const dependencies = new Map(body.dependencies.map((c) => [c.id, c.dependsOn]));
  if (dependencies.size !== body.dependencies.length || dependencies.size !== expected.length || expected.some(id => !dependencies.has(id)))
    return reply({ error: "Include each current challenge and added entity exactly once." }, 400);
  const updated = current.challenges.map((c) => ({ ...c, dependsOn: dependencies.get(c.id) }));
  let updatedTheme;
  try {
    updatedTheme = parseTheme({ ...theme, world: { ...theme.world, entities: entities.map(e => ({ ...e, dependsOn: dependencies.get(entityReference(e.id)) ?? e.dependsOn ?? [] })) } });
    themeContentValid(updatedTheme, updated);
    if (updatedTheme.world.entities.some(e => updated.some(c => c.map === e.map && c.location.x === e.location.x && c.location.y === e.location.y)))
      throw Error("Choose a character location away from existing challenges.");
  } catch (e) { return reply({ error: e.issues?.map(i => i.message).join("; ") || e.message }, 400); }
  const payload = JSON.stringify(updated), themePayload = JSON.stringify(updatedTheme);
  if (new TextEncoder().encode(payload).byteLength > 1500000 || new TextEncoder().encode(themePayload).byteLength > 1500000)
    return reply({ error: "The challenge set or theme exceeds the 1.5 MB limit." }, 400);
  // The guard fails the transaction before either catalog changes if an administrator saved first.
  const guardId = crypto.randomUUID();
  const changesTheme = JSON.stringify(theme.world.entities || []) !== JSON.stringify(updatedTheme.world.entities);
  try {
    await db.batch([
      db.prepare("INSERT INTO admin_user_action_guard(id,valid) VALUES(?,COALESCE((SELECT revision FROM challenge_catalog WHERE id='active'),0)=? AND COALESCE((SELECT revision FROM theme_catalog WHERE id='active'),0)=?)").bind(guardId, body.revision, themeRevision),
      db.prepare("INSERT INTO challenge_catalog(id,payload,revision) VALUES('active',?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,revision=excluded.revision").bind(payload, body.revision + 1),
      ...(changesTheme ? [db.prepare("INSERT INTO theme_catalog(id,payload,revision) VALUES('active',?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,revision=excluded.revision").bind(themePayload, themeRevision + 1)] : []),
      db.prepare("DELETE FROM admin_user_action_guard WHERE id=?").bind(guardId),
    ]);
  } catch (e) {
    if (!/CHECK constraint|admin_user_action_guard/i.test(e.message)) throw e;
    return reply({ error: "Another administrator saved first. Reload the saved graph before saving again." }, 409);
  }
  return reply(graphResponse(updated, updatedTheme, body.revision + 1, themeRevision + (changesTheme ? 1 : 0)));
}
