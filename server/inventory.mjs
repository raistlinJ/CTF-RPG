import { createWorld } from "../lib/world-data.mjs";
import { rewardsSchema, normalizeIncantation, lockSignature } from "../lib/inventory.mjs";

export const worldLinks = theme => [...createWorld(theme.world).portals, ...(theme.world.transports || [])];
export async function inventoryState(db, user, theme) {
  const [earned, unlocked] = await Promise.all([
    db.prepare("SELECT challenge,payload FROM earned_rewards WHERE user=?").bind(user).all(),
    db.prepare("SELECT transport,signature FROM unlocked_transports WHERE user=?").bind(user).all(),
  ]);
  const rewards = earned.results.map(r => rewardsSchema.parse(JSON.parse(r.payload)));
  const phrases = new Map();
  for (const reward of rewards) for (const phrase of reward.incantations) phrases.set(normalizeIncantation(phrase), phrase);
  const links = worldLinks(theme);
  return {
    rewardsByChallenge: Object.fromEntries(earned.results.map((r,i) => [r.challenge,rewards[i]])),
    inventory: { keys: [...new Set(rewards.flatMap(r => r.keys))], incantations: [...phrases.values()] },
    unlockedTransports: unlocked.results.filter(r => links.some(t => t.id === r.transport && t.lock && lockSignature(t) === r.signature)).map(r => r.transport),
  };
}
export function accessibleMaps(theme, unlocked, startMap = theme.world.startMap) {
  const reachable = new Set([startMap]), links = worldLinks(theme);
  for (const map of reachable) for (const link of links)
    if (link.map === map && (!link.lock || unlocked.includes(link.id))) reachable.add(link.to);
  return reachable;
}
export async function unlockTransport(db, user, theme, themeRevision, id, phrase) {
  const link = worldLinks(theme).find(t => t.id === id);
  if (!link?.lock) return { status: 400, error: "Choose a locked door or portal." };
  const state = await inventoryState(db, user, theme);
  const signature = lockSignature(link);
  if (!state.unlockedTransports.includes(id)) {
    if (link.lock.type === "key" && !state.inventory.keys.includes(link.lock.color))
      return { status: 403, error: `You need a ${link.lock.color} key. Solve challenges to earn keys.` };
    if (link.lock.type === "incantation" && (typeof phrase !== "string" || phrase.length > 80 || normalizeIncantation(phrase) !== normalizeIncantation(link.lock.phrase)))
      return { status: 403, error: "That incantation does not unlock this portal." };
  }
  const result = await db.prepare("INSERT INTO unlocked_transports(user,transport,signature) SELECT ?,?,? WHERE COALESCE((SELECT revision FROM theme_catalog WHERE id='active'),0)=? ON CONFLICT(user,transport) DO UPDATE SET signature=excluded.signature").bind(user,id,signature,themeRevision).run();
  if (!(result.meta?.changes ?? result.changes)) return { status: 409, error: "The map changed. Refresh before unlocking this transport." };
  return { status: 200, ...(await inventoryState(db, user, theme)) };
}
