import { entityOutputReference, entityReference } from "../lib/challenge-dependencies.mjs";
export async function playerMilestones(db, user, solved = []) {
  const activations = (await db.prepare("SELECT entity FROM entity_activations WHERE user=? ORDER BY entity").bind(user).all()).results;
  const outputs = (await db.prepare("SELECT entity,node FROM entity_dialogue_outputs WHERE user=? ORDER BY entity,node").bind(user).all()).results;
  return new Set([...solved, ...activations.map(e => entityReference(e.entity)), ...outputs.map(e => entityOutputReference(e.entity, e.node))]);
}
