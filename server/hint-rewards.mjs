import { emptyInventory, normalizeIncantation } from "../lib/inventory-data.mjs";

// This expression reads purchases inside the award/submission write, so a racing
// hint purchase either precedes the completion and is charged, or is rejected.
export const hintAdjustedRewardsSQL = `json_object(
  'keys', json((SELECT json_group_array(k.value) FROM json_each(?) k
    WHERE NOT EXISTS(SELECT 1 FROM purchased_hints p, json_each(p.reward_cost,'$.keys') used
      WHERE p.user=? AND p.challenge=? AND used.value=k.value))),
  'incantations', json((SELECT json_group_array(json_extract(i.value,'$.phrase')) FROM json_each(?) i
    WHERE NOT EXISTS(SELECT 1 FROM purchased_hints p, json_each(p.reward_cost,'$.incantations') used
      WHERE p.user=? AND p.challenge=? AND used.value=json_extract(i.value,'$.normalized')))))`;
export function hintAdjustedRewardsBindings(rewards = emptyInventory(), user, challenge) {
  return [JSON.stringify(rewards.keys), user, challenge,
    JSON.stringify(rewards.incantations.map(phrase => ({ phrase, normalized: normalizeIncantation(phrase) }))), user, challenge];
}
export const hintRewardAvailabilitySQL = `NOT EXISTS(
  SELECT 1 FROM purchased_hints p, json_each(p.reward_cost,'$.keys') used
  WHERE p.user=? AND p.challenge=? AND used.value IN (SELECT value FROM json_each(?,'$.keys')))
  AND NOT EXISTS(SELECT 1 FROM purchased_hints p, json_each(p.reward_cost,'$.incantations') used
    WHERE p.user=? AND p.challenge=? AND used.value IN (SELECT value FROM json_each(?,'$.incantations')))`;
export function normalizedHintRewardCost(cost = emptyInventory()) {
  return { keys: cost.keys, incantations: cost.incantations.map(normalizeIncantation) };
}
