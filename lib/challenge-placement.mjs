import { entityReference } from "./challenge-dependencies.mjs";
import { createWorld } from "./world-data.mjs";

export function challengeLocationAvailable(world, challenges, map, x, y, id) {
  return world.canPlaceChallenge(map, x, y) && !challenges.some(c =>
    c.id !== id && c.map === map && c.location.x === x && c.location.y === y) &&
    !(world.world.entities || []).some(e => e.map === map && e.location.x === x && e.location.y === y);
}

// Keep coordinates when possible; otherwise choose the nearest free valid tile.
export function findChallengeLocation(world, challenges, map, preferred, id) {
  if (!world.mapInfo(map)) return null;
  let best = null, distance = Infinity;
  for (let y = 0; y < 28; y++) {
    for (let x = 0; x < 40; x++) {
      if (!challengeLocationAvailable(world, challenges, map, x, y, id)) continue;
      const d = Math.abs(x - preferred.x) + Math.abs(y - preferred.y);
      if (d < distance) { best = { x, y }; distance = d; }
    }
  }
  return best;
}

// Reserve valid positions first so relocation never displaces a valid question.
export function planChallengePlacement(theme, challenges) {
  const world = createWorld(theme.world),
    occupied = new Set((theme.world.entities || []).map(e => `${e.map}:${e.location.x},${e.location.y}`)),
    assigned = new Map();
  const key = (map, x, y) => `${map}:${x},${y}`;
  for (const c of challenges) {
    const k = key(c.map, c.location.x, c.location.y);
    if (
      world.canPlaceChallenge(c.map, c.location.x, c.location.y) &&
      !occupied.has(k)
    ) {
      occupied.add(k);
      assigned.set(c.id, c);
    }
  }
  const spaces = new Map(
    theme.world.maps.map((m) => {
      const tiles = [];
      for (let y = 0; y < 28; y++)
        for (let x = 0; x < 40; x++)
          if (world.canPlaceChallenge(m.id, x, y)) tiles.push({ x, y });
      return [m.id, tiles];
    }),
  );
  const moved = [],
    excluded = [];
  for (const c of challenges) {
    if (assigned.has(c.id)) continue;
    const maps = [...new Set([c.map, theme.world.startMap, ...spaces.keys()])];
    let destination;
    for (const map of maps) {
      const free = (spaces.get(map) || []).filter(
        (p) => !occupied.has(key(map, p.x, p.y)),
      );
      free.sort(
        (a, b) =>
          Math.abs(a.x - c.location.x) +
            Math.abs(a.y - c.location.y) -
            (Math.abs(b.x - c.location.x) + Math.abs(b.y - c.location.y)) ||
          a.y - b.y ||
          a.x - b.x,
      );
      if (free.length) {
        destination = { map, ...free[0] };
        break;
      }
    }
    const from = { map: c.map, ...c.location };
    if (!destination) {
      excluded.push({ id: c.id, object: c.object, from });
      continue;
    }
    occupied.add(key(destination.map, destination.x, destination.y));
    assigned.set(c.id, {
      ...c,
      map: destination.map,
      location: { x: destination.x, y: destination.y },
    });
    moved.push({ id: c.id, object: c.object, from, to: destination });
  }
  // A skipped prerequisite also removes its dependents from this import's preview.
  // The existing overflow confirmation covers every affected challenge.
  let pruning = true;
  while (pruning) {
    pruning = false;
    for (const c of challenges) {
      if (!assigned.has(c.id)) continue;
      const missing = (c.dependsOn || []).find((id) => !assigned.has(id) && !(theme.world.entities || []).some(e => entityReference(e.id) === id));
      if (!missing) continue;
      assigned.delete(c.id);
      excluded.push({ id: c.id, object: c.object, from: { map: c.map, ...c.location }, reason: `Prerequisite ${missing} could not be placed.` });
      pruning = true;
    }
  }
  return {
    challenges: challenges
      .filter((c) => assigned.has(c.id))
      .map((c) => assigned.get(c.id)),
    moved: moved.filter((c) => assigned.has(c.id)),
    excluded,
  };
}
