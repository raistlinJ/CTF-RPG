import { MOVE_INTERVAL } from "./player-movement.mjs";

// Leave a little breathing room before the next three-second presence update.
export const MAX_REPLAY_MS = 2400;
const sameTile = (a, b) => a.x === b.x && a.y === b.y;

/** A synthetic walking route, never a history of the player's actual inputs. */
export function findReplayRoute(from, to, canVisit) {
  const key = ({ x, y }) => `${x},${y}`;
  const queue = [from], parents = new Map([[key(from), null]]);
  for (let index = 0; index < queue.length; index++) {
    const point = queue[index];
    if (sameTile(point, to)) {
      const route = [];
      for (let node = point; node; node = parents.get(key(node))) route.push(node);
      return route.reverse();
    }
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const next = { x: point.x + dx, y: point.y + dy };
      // The exploration canvas is always 40 by 28 tiles.
      if (next.x < 0 || next.x >= 40 || next.y < 0 || next.y >= 28 ||
          parents.has(key(next)) || !canVisit(next.x, next.y)) continue;
      parents.set(key(next), point);
      queue.push(next);
    }
  }
  // Disconnected positions can come from warps or missed map changes.
  return null;
}

export function samplePlayerReplay(replay, now) {
  const distance = replay.length * Math.min(1, Math.max(0, (now - replay.startedAt) / replay.duration));
  let remaining = distance;
  for (let index = 1; index < replay.route.length; index++) {
    const from = replay.route[index - 1], to = replay.route[index];
    const length = Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
    if (remaining < length) {
      const progress = remaining / length;
      return { point: { x: from.x + (to.x - from.x) * progress, y: from.y + (to.y - from.y) * progress }, next: to };
    }
    remaining -= length;
  }
  return { point: replay.target, next: replay.target };
}

/** Replace targets in place, retaining only each player's current replay. */
export function updatePlayerReplays(previous, players, now, canVisit, immediate = false) {
  return new Map(players.map(player => {
    const target = { x: player.x, y: player.y }, old = previous.get(player.username);
    if (old && sameTile(old.target, target) && !immediate) return [player.username, old];
    let route = [target];
    if (old && !immediate) {
      const { point, next } = samplePlayerReplay(old, now);
      const path = findReplayRoute(next, target, canVisit);
      if (path) route = sameTile(point, next) ? path : [point, ...path];
    }
    const length = route.slice(1).reduce((total, point, index) =>
      total + Math.abs(point.x - route[index].x) + Math.abs(point.y - route[index].y), 0);
    return [player.username, { target, route, length, startedAt: now, duration: Math.max(1, Math.min(MAX_REPLAY_MS, length * MOVE_INTERVAL)) }];
  }));
}
