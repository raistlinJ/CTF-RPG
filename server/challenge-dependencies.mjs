import { z } from "zod";
import { validateChallengeDependencies } from "../lib/challenge-dependencies.mjs";
const reply = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const schema = z.object({
  revision: z.number().int().min(0),
  themeRevision: z.number().int().min(0),
  dependencies: z.array(z.object({ id: z.string(), dependsOn: z.array(z.string()).max(99) }).strict()).max(100),
}).strict();
const preview = (text = "") => {
  const plain = text.replace(/\s+/g, " ").trim();
  return plain.length > 400 ? plain.slice(0,400).replace(/\s+\S*$/, "") + "…" : plain;
};
const nodes = (challenges) => challenges.map((c) => ({
  id: c.id, object: c.object, map: c.map, region: c.region,
  visibility: c.visibility || "visible", points: c.points, dependsOn: c.dependsOn || [],
  grading: c.grading || "automatic", summary: preview(c.text),
}));
export async function handleChallengeDependencies(req, { db, user, platformAdmin, catalog, themeRevision }) {
  const u = await user(req);
  if (!platformAdmin && u?.role !== "admin")
    return reply({ error: "Administrator access required." }, u ? 403 : 401);
  const current = await catalog();
  if (req.method === "GET") return reply({ challenges: nodes(current.challenges), revision: current.revision, themeRevision });
  if (req.method !== "POST") return reply({ error: "Method not allowed." }, 405);
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return reply({ error: "Provide the saved revision and prerequisites for every challenge." }, 400);
  const body = parsed.data;
  if (body.revision !== current.revision || body.themeRevision !== themeRevision)
    return reply({ error: "Challenges changed. Reload the saved graph before saving again." }, 409);
  const dependencies = new Map(body.dependencies.map((c) => [c.id, c.dependsOn]));
  if (dependencies.size !== body.dependencies.length || dependencies.size !== current.challenges.length || current.challenges.some((c) => !dependencies.has(c.id)))
    return reply({ error: "Include each current challenge exactly once." }, 400);
  const updated = current.challenges.map((c) => ({ ...c, dependsOn: dependencies.get(c.id) }));
  try { validateChallengeDependencies(updated); }
  catch (e) { return reply({ error: e.message }, 400); }
  const payload = JSON.stringify(updated);
  if (new TextEncoder().encode(payload).byteLength > 1500000)
    return reply({ error: "The challenge set exceeds the 1.5 MB limit." }, 400);
  const result = current.revision === 0
    ? await db.prepare("INSERT OR IGNORE INTO challenge_catalog(id,payload,revision) SELECT 'active',?,1 WHERE COALESCE((SELECT revision FROM theme_catalog WHERE id='active'),0)=?").bind(payload,themeRevision).run()
    : await db.prepare("UPDATE challenge_catalog SET payload=?,revision=revision+1 WHERE id='active' AND revision=? AND COALESCE((SELECT revision FROM theme_catalog WHERE id='active'),0)=?").bind(payload,body.revision,themeRevision).run();
  if (!(result.meta?.changes ?? result.changes))
    return reply({ error: "Another administrator saved first. Reload the saved graph before saving again." }, 409);
  return reply({ challenges: nodes(updated), revision: body.revision + 1, themeRevision });
}
