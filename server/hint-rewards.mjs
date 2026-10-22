import { emptyInventory, normalizeIncantation } from "../lib/inventory-data.mjs";
import { completionUsersSQL } from "./team-progress.mjs";

// Preserve historical prices, but charge a hint only once across teammates.
export const sharedHintCostSQL = `COALESCE((SELECT SUM(cost) FROM (
  SELECT MAX(cost) AS cost FROM purchased_hints
  WHERE user IN (${completionUsersSQL()}) AND challenge=? GROUP BY hint
)),0)`;

export async function playerHints(db, user) {
  const rows = (await db.prepare(`SELECT challenge,hint,MAX(cost) AS cost,
    json_group_array(reward_cost) AS reward_costs FROM purchased_hints
    WHERE user IN (${completionUsersSQL()}) GROUP BY challenge,hint ORDER BY challenge,hint`).bind(user).all()).results;
  return rows.map(({ reward_costs, ...hint }) => {
    const costs = JSON.parse(reward_costs).map(cost => JSON.parse(cost));
    return { ...hint, reward_cost: JSON.stringify({
      keys: [...new Set(costs.flatMap(cost => cost.keys))].sort(),
      incantations: [...new Set(costs.flatMap(cost => cost.incantations))].sort(),
    }) };
  });
}

// This expression reads purchases inside the award/submission write, so a racing
// hint purchase either precedes the completion and is charged, or is rejected.
export const hintAdjustedRewardsSQL = `json_object(
  'keys', json((SELECT json_group_array(k.value) FROM json_each(?) k
    WHERE NOT EXISTS(SELECT 1 FROM purchased_hints p, json_each(p.reward_cost,'$.keys') used
      WHERE p.user IN (${completionUsersSQL()}) AND p.challenge=? AND used.value=k.value))),
  'incantations', json((SELECT json_group_array(json_extract(i.value,'$.phrase')) FROM json_each(?) i
    WHERE NOT EXISTS(SELECT 1 FROM purchased_hints p, json_each(p.reward_cost,'$.incantations') used
      WHERE p.user IN (${completionUsersSQL()}) AND p.challenge=? AND used.value=json_extract(i.value,'$.normalized')))))`;
export function hintAdjustedRewardsBindings(rewards = emptyInventory(), user, challenge) {
  return [JSON.stringify(rewards.keys), user, challenge,
    JSON.stringify(rewards.incantations.map(phrase => ({ phrase, normalized: normalizeIncantation(phrase) }))), user, challenge];
}
export const hintRewardAvailabilitySQL = `NOT EXISTS(
  SELECT 1 FROM purchased_hints p, json_each(p.reward_cost,'$.keys') used
  WHERE p.user IN (${completionUsersSQL()}) AND p.challenge=? AND used.value IN (SELECT value FROM json_each(?,'$.keys')))
  AND NOT EXISTS(SELECT 1 FROM purchased_hints p, json_each(p.reward_cost,'$.incantations') used
    WHERE p.user IN (${completionUsersSQL()}) AND p.challenge=? AND used.value IN (SELECT value FROM json_each(?,'$.incantations')))`;
export function normalizedHintRewardCost(cost = emptyInventory()) {
  return { keys: cost.keys, incantations: cost.incantations.map(normalizeIncantation) };
}
