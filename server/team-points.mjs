import { z } from "zod";
export const pointAwardSchema = z.object({
  id: z.string().uuid(),
  team: z.string().min(1).max(128),
  points: z.number().int().min(1).max(10000),
  comment: z.string().trim().min(1).max(1000),
  awarded_by: z.string().min(1).max(128),
  created_at: z.number().int().min(0),
}).strict();
export async function teamPointAwards(db, team) {
  return (await db.prepare("SELECT id,team,points,comment,awarded_by,created_at FROM team_point_awards WHERE team=? ORDER BY created_at DESC,id").bind(team).all()).results;
}
export async function giftTeamPoints(db, body, author) {
  const parsed = pointAwardSchema.safeParse({
    id: body.awardId, team: body.id, points: body.points, comment: body.comment,
    awarded_by: author, created_at: Date.now(),
  });
  if (!parsed.success) return { status: 400, body: { error: "Choose a team, 1–10,000 whole points, and a comment of 1–1,000 characters." } };
  const a = parsed.data;
  // The request ID makes a retry safe, including after a lost response.
  await db.prepare("INSERT INTO team_point_awards(id,team,points,comment,awarded_by,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM teams WHERE id=?) ON CONFLICT(id) DO NOTHING")
    .bind(a.id,a.team,a.points,a.comment,a.awarded_by,a.created_at,a.team).run();
  const saved = await db.prepare("SELECT * FROM team_point_awards WHERE id=?").bind(a.id).first();
  if (!saved) return { status: 404, body: { error: "This team was disbanded. Refresh the team list." } };
  if (saved.team !== a.team || saved.points !== a.points || saved.comment !== a.comment || saved.awarded_by !== a.awarded_by)
    return { status: 409, body: { error: "This gift reference was already used. Start a new gift." } };
  return { status: 200, body: { award: saved } };
}
