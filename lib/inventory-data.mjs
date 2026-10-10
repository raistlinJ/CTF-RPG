export const KEY_COLORS = ["red", "orange", "yellow", "green", "blue", "purple", "silver", "gold"];
export const KEY_PALETTE = { red: "#f87171", orange: "#fb923c", yellow: "#fde047", green: "#4ade80", blue: "#60a5fa", purple: "#c084fc", silver: "#cbd5e1", gold: "#fbbf24" };
export const normalizeIncantation = phrase => phrase.trim().replace(/\s+/g, " ").toLowerCase();

export const emptyInventory = () => ({ keys: [], incantations: [] });
export function rewardsAfterHints(rewards = emptyInventory(), costs = []) {
  const keys = new Set(costs.flatMap(c => c.keys));
  const phrases = new Set(costs.flatMap(c => c.incantations).map(normalizeIncantation));
  return { keys: rewards.keys.filter(k => !keys.has(k)), incantations: rewards.incantations.filter(p => !phrases.has(normalizeIncantation(p))) };
}
export function hintCostLabel(points, rewardCost) {
  return [
    ...(points ? [`${points} point${points === 1 ? "" : "s"}`] : []),
    ...(rewardCost?.keys || []).map(color => `${color} key reward`),
    ...(rewardCost?.incantationCount ? [`${rewardCost.incantationCount} incantation reward${rewardCost.incantationCount === 1 ? "" : "s"}`] : []),
  ].join(" + ") || "Free";
}

// Player configuration identifies the lock without revealing the required phrase.
export function publicTheme(theme) {
  const redact = link => ({ ...link, ...(link.lock?.type === "incantation" ? { lock: { type: "incantation" } } : {}) });
  return { ...theme, world: { ...theme.world,
    transports: (theme.world.transports || []).map(redact),
    portalOverrides: (theme.world.portalOverrides || []).map(redact),
    entities: (theme.world.entities || []).map(({ id, name, characterId, map, location }) => ({ id, name, characterId, map, location })),
  } };
}
export const lockSignature = link => JSON.stringify({ map: link.map, to: link.to, lock: link.lock });
