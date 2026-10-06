import defaultWorld from "./default-world.json" with { type: "json" };
export { defaultWorld };
export function createWorld(world = defaultWorld) {
  const buildings = world.buildings,
    MAP_IDS = world.maps.map((m) => m.id),
    mapInfo = (id) => world.maps.find((m) => m.id === id),
    mapName = (id) => mapInfo(id)?.name || world.maps[0].name,
    exitTile = (id) => mapInfo(id)?.exit;
  const transports = world.transports || [];
  function transportTiles(map) {
    const tiles = transports
      .filter((t) => t.map === map)
      .map((t) => ({ id: t.id, ...t.location, to: t.to, kind: "outbound" }));
    if (transports.some((t) => t.to === map))
      tiles.push({
        id: "return",
        ...mapInfo(map).spawn,
        to: null,
        kind: "return",
      });
    return tiles;
  }
  const isTransport = (map, x, y) =>
    transportTiles(map).some((t) => t.x === x && t.y === y);
  const transition = (map, x, y) =>
    isTransport(map, x, y) ||
    (map === world.startMap
      ? buildings.some((b) => b.door.x === x && b.door.y === y)
      : exitTile(map)?.x === x && exitTile(map)?.y === y);
  const ground = new Map(
    world.maps.map((m) => [
      m.id,
      m.ground ? new Set(m.ground.map(([x, y]) => `${x},${y}`)) : null,
    ]),
  );
  function blocked(map, x, y) {
    const m = mapInfo(map);
    if (!m) return true;
    const cells = ground.get(map);
    const b = m.bounds;
    if (x < b.left || x > b.right || y < b.top || y > b.bottom) return true;
    // Explicitly painted ground replaces the legacy collision geometry.
    if (cells) return !cells.has(`${x},${y}`);
    if (
      m.obstacles.some(
        (b) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h,
      )
    )
      return true;
    if (map === world.startMap)
      return buildings.some(
        (b) =>
          x >= b.x &&
          x < b.x + b.w &&
          y >= b.y &&
          y < b.y + b.h &&
          !(x === b.door.x && y === b.door.y),
      );
    return false;
  }
  function step(place, dx, dy) {
    const { map, pos } = place,
      x = pos.x + dx,
      y = pos.y + dy;
    if ((!dx && !dy) || blocked(map, x, y)) return place;
    const history = place.travel || [],
      last = history.at(-1),
      spawn = mapInfo(map).spawn;
    if (last?.to === map && x === spawn.x && y === spawn.y)
      return {
        map: last.from,
        pos: { ...mapInfo(last.from).spawn },
        travel: history.slice(0, -1),
      };
    const transport = transports.find(
      (t) => t.map === map && t.location.x === x && t.location.y === y,
    );
    if (transport)
      return {
        map: transport.to,
        pos: { ...mapInfo(transport.to).spawn },
        travel: [...history, { from: map, to: transport.to }].slice(-30),
      };
    if (map === world.startMap) {
      const b = buildings.find((b) => b.door.x === x && b.door.y === y);
      if (b) return { map: b.id, pos: { ...mapInfo(b.id).spawn } };
    } else {
      const exit = exitTile(map),
        b = buildings.find((b) => b.id === map);
      if (exit && x === exit.x && y === exit.y && b)
        return { map: world.startMap, pos: { x: b.door.x, y: b.door.y + 1 } };
    }
    return { ...place, map, pos: { x, y } };
  }
  const cache = new Map();
  function reachable(map, x, y) {
    if (
      !MAP_IDS.includes(map) ||
      !Number.isInteger(x) ||
      !Number.isInteger(y) ||
      blocked(map, x, y)
    )
      return false;
    if (!cache.has(map)) {
      const start = mapInfo(map).spawn,
        queue = [start],
        seen = new Set([`${start.x},${start.y}`]);
      for (let i = 0; i < queue.length; i++) {
        if (i > 0 && transition(map, queue[i].x, queue[i].y)) continue;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const a = queue[i].x + dx,
            b = queue[i].y + dy,
            key = `${a},${b}`;
          if (!seen.has(key) && !blocked(map, a, b)) {
            seen.add(key);
            queue.push({ x: a, y: b });
          }
        }
      }
      cache.set(map, seen);
    }
    return cache.get(map).has(`${x},${y}`);
  }
  const canPlaceChallenge = (map, x, y) =>
    reachable(map, x, y) && !transition(map, x, y);
  const canSpawn = (map, x, y) =>
    reachable(map, x, y) &&
    (canPlaceChallenge(map, x, y) ||
      (mapInfo(map).spawn.x === x && mapInfo(map).spawn.y === y));
  return {
    world,
    buildings,
    MAP_IDS,
    mapInfo,
    mapName,
    exitTile,
    blocked,
    step,
    canPlaceChallenge,
    canSpawn,
    reachable,
    transportTiles,
  };
}
let engine = createWorld();
export let activeWorld = defaultWorld,
  buildings = defaultWorld.buildings,
  trees = defaultWorld.trees,
  MAP_IDS = engine.MAP_IDS,
  roomObstacles = Object.fromEntries(
    defaultWorld.maps.map((m) => [m.id, m.obstacles]),
  );
export function configureWorld(world) {
  activeWorld = world;
  engine = createWorld(world);
  buildings = world.buildings;
  trees = world.trees;
  MAP_IDS = engine.MAP_IDS;
  roomObstacles = Object.fromEntries(
    world.maps.map((m) => [m.id, m.obstacles]),
  );
}
export const mapInfo = (id) => engine.mapInfo(id),
  mapName = (id) => engine.mapName(id),
  exitTile = (id) => engine.exitTile(id),
  transportTiles = (id) => engine.transportTiles(id),
  blocked = (map, x, y) => engine.blocked(map, x, y),
  step = (place, dx, dy) => engine.step(place, dx, dy),
  canPlaceChallenge = (map, x, y) => engine.canPlaceChallenge(map, x, y),
  canSpawn = (map, x, y) => engine.canSpawn(map, x, y);
