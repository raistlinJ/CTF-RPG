import { entityReference } from "../lib/challenge-dependencies.mjs";
export async function playerMilestones(db, user, solved = []) {
  const activations = (await db.prepare("SELECT entity FROM entity_activations WHERE user=? ORDER BY entity").bind(user).all()).results;
  return new Set([...solved, ...activations.map(e => entityReference(e.entity))]);
}
