import { progressionNodes } from "./challenge-dependencies.mjs";

// Count each prerequisite challenge once, including paths through NPCs. NPC
// dialogue itself is not a challenge and does not inflate the chain length.
export function solveCelebrationProgress(challenges, entities, solvedIds, scope, expeditionComplete = false, visibleIds = challenges.map(c => c.id)) {
  const nodes = progressionNodes(challenges, entities || []);
  const graph = new Map(nodes.map(node => [node.id, node.dependsOn || []]));
  const challengeIds = new Set(challenges.map(c => c.id));
  const solved = new Set(solvedIds), visible = new Set(visibleIds);
  const children = new Map(), memo = new Map();
  for (const node of nodes) for (const dependency of node.dependsOn || []) {
    if (!children.has(dependency)) children.set(dependency, []);
    children.get(dependency).push(node.id);
  }
  function ancestors(id, visiting = new Set()) {
    if (memo.has(id)) return memo.get(id);
    if (visiting.has(id)) return new Set();
    const next = new Set(visiting).add(id);
    const result = new Set(challengeIds.has(id) ? [id] : []);
    for (const dependency of graph.get(id) || []) for (const prerequisite of ancestors(dependency, next)) result.add(prerequisite);
    memo.set(id, result);
    return result;
  }
  function hasNextChallenge(id, visited = new Set()) {
    if (visited.has(id)) return false;
    visited.add(id);
    return (children.get(id) || []).some(child => challengeIds.has(child) || hasNextChallenge(child, visited));
  }
  return {
    scope,
    expeditionComplete,
    completed: challenges.filter(c => solved.has(c.id) && visible.has(c.id)).map(c => {
      const chain = ancestors(c.id);
      const chainLength = [...chain].every(id => solved.has(id)) ? chain.size : 1;
      return { id: c.id, object: c.object, map: c.map, x: c.location.x, y: c.location.y,
        boss: c.icon === "boss", chainLength, chainComplete: chainLength > 1 && !hasNextChallenge(c.id) };
    }),
  };
}

export function advanceSolveCelebrations(previous, progress) {
  const completed = progress.completed || [];
  if (!previous || previous.scope !== progress.scope) return {
    state: { scope: progress.scope, seen: completed.map(c => c.id), highWater: completed.length, expeditionCelebrated: !!progress.expeditionComplete },
    celebration: null,
  };
  const seen = new Set(previous.seen);
  const fresh = completed.filter(c => !seen.has(c.id));
  const milestone = Math.floor(completed.length / 5) > Math.floor(previous.highWater / 5) ? Math.floor(completed.length / 5) * 5 : 0;
  const expedition = !!progress.expeditionComplete && !previous.expeditionCelebrated;
  const state = { scope: progress.scope, seen: [...new Set([...previous.seen, ...completed.map(c => c.id)])],
    highWater: Math.max(previous.highWater, completed.length), expeditionCelebrated: previous.expeditionCelebrated || expedition };
  if (!fresh.length) return { state, celebration: null };
  const rank = c => (c.boss ? 3 : 1) + (c.chainComplete ? 2 : 0) + Math.min(c.chainLength, 10) / 10;
  const highlight = [...fresh].sort((a, b) => rank(b) - rank(a))[0];
  const chain = Math.max(...fresh.map(c => c.chainLength || 1));
  const completedChain = Math.max(0, ...fresh.filter(c => c.chainComplete).map(c => c.chainLength));
  const finishedChain = completedChain > 1;
  const boss = fresh.some(c => c.boss);
  const tier = expedition ? 5 : Math.max(boss || milestone ? 3 : 1, chain >= 8 ? 5 : chain >= 5 ? 4 : chain >= 3 ? 3 : chain >= 2 ? 2 : 1);
  const title = expedition ? "Expedition complete!" : boss ? "Boss defeated!" :
    finishedChain ? completedChain >= 5 ? "Epic chain complete!" : "Chain complete!" :
    milestone ? `${milestone} challenges completed!` : fresh.length > 1 ? `${fresh.length} challenges solved!` : "Challenge solved!";
  const details = [highlight.object];
  if (chain > 1) details.push(finishedChain ? `${completedChain}-challenge chain complete` : `Chain progress: ${chain} challenges`);
  if (milestone && (boss || finishedChain || expedition)) details.push(`${milestone} completions`);
  return { state, celebration: { id: `${progress.scope}:${fresh.map(c => c.id).sort().join(":")}`, title, detail: details.join(" · "),
    tier, duration: tier === 1 ? 3000 : tier === 2 ? 4000 : tier === 3 ? 5000 : tier === 4 ? 6000 : 7000,
    boss, chainLength: chain, milestone, expedition, map: highlight.map, x: highlight.x, y: highlight.y } };
}

export function celebrationLandmark(world, map, celebration) {
  if (map === world.startMap && world.buildings?.length) {
    const building = world.buildings.find(b => b.id === celebration.map) || [...world.buildings].sort((a, b) => b.w * b.h - a.w * a.h)[0];
    return { x: building.x + building.w / 2, y: building.y + building.h / 2, w: building.w, h: building.h };
  }
  const info = world.maps.find(m => m.id === map);
  return { x: info?.spawn.x ?? 20, y: info?.spawn.y ?? 14, w: 5, h: 5 };
}
