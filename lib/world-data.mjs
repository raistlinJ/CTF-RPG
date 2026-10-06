export const buildings = [
  {
    id: "castle",
    name: "Santa’s Christmas Castle",
    x: 15,
    y: 1,
    w: 10,
    h: 6,
    door: { x: 20, y: 6 },
    color: "#963f50",
  },
  {
    id: "toy-workshop",
    name: "Toy Workshop",
    x: 8,
    y: 12,
    w: 5,
    h: 4,
    door: { x: 10, y: 15 },
    color: "#816245",
  },
  {
    id: "cocoa-cottage",
    name: "Cocoa Cottage",
    x: 25,
    y: 11,
    w: 5,
    h: 4,
    door: { x: 27, y: 14 },
    color: "#7a5256",
  },
  {
    id: "post-office",
    name: "North Pole Post Office",
    x: 2,
    y: 17,
    w: 4,
    h: 4,
    door: { x: 4, y: 20 },
    color: "#487a75",
  },
  {
    id: "elf-house",
    name: "Evergreen Elf House",
    x: 9,
    y: 1,
    w: 4,
    h: 4,
    door: { x: 11, y: 4 },
    color: "#527765",
  },
  {
    id: "bakery",
    name: "Gingerbread Bakery",
    x: 31,
    y: 10,
    w: 5,
    h: 4,
    door: { x: 33, y: 13 },
    color: "#a06749",
  },
];
export const MAP_IDS = ["town", ...buildings.map((b) => b.id)];
export const trees = [
  [3, 3],
  [5, 5],
  [6, 11],
  [3, 14],
  [5, 22],
  [8, 24],
  [12, 25],
  [34, 23],
  [36, 20],
  [34, 15],
  [37, 10],
  [33, 5],
  [31, 3],
  [26, 3],
  [13, 7],
  [11, 6],
  [15, 9],
  [4, 8],
  [35, 8],
  [23, 24],
  [20, 26],
  [16, 23],
  [2, 23],
  [36, 25],
  [8, 3],
  [28, 3],
  [24, 8],
];
export const roomObstacles = {
  castle: [
    { x: 17, y: 5, w: 7, h: 3 },
    { x: 8, y: 6, w: 3, h: 3 },
    { x: 29, y: 6, w: 3, h: 3 },
    { x: 8, y: 13, w: 6, h: 3 },
    { x: 26, y: 13, w: 6, h: 3 },
    { x: 7, y: 20, w: 3, h: 3 },
    { x: 30, y: 20, w: 3, h: 3 },
  ],
  "toy-workshop": [
    { x: 12, y: 9, w: 5, h: 3 },
    { x: 23, y: 9, w: 5, h: 3 },
    { x: 12, y: 17, w: 3, h: 3 },
  ],
  "cocoa-cottage": [
    { x: 12, y: 8, w: 4, h: 2 },
    { x: 23, y: 8, w: 5, h: 2 },
    { x: 17, y: 14, w: 6, h: 3 },
  ],
  "post-office": [
    { x: 12, y: 8, w: 16, h: 2 },
    { x: 12, y: 14, w: 4, h: 3 },
    { x: 24, y: 14, w: 4, h: 3 },
  ],
  "elf-house": [
    { x: 12, y: 8, w: 5, h: 4 },
    { x: 24, y: 9, w: 4, h: 3 },
    { x: 16, y: 16, w: 5, h: 3 },
  ],
  bakery: [
    { x: 12, y: 8, w: 5, h: 3 },
    { x: 23, y: 8, w: 5, h: 3 },
    { x: 16, y: 15, w: 8, h: 3 },
  ],
};
export const mapName = (map) =>
  map === "town"
    ? "The North Pole"
    : buildings.find((b) => b.id === map)?.name || "The North Pole";
export const exitTile = (map) => ({ x: 20, y: map === "castle" ? 25 : 24 });
export function blocked(map, x, y) {
  if (map === "town") {
    if (
      x < 1 ||
      y < 1 ||
      x > 38 ||
      y > 26 ||
      trees.some(([a, b]) => a === x && b === y) ||
      (x >= 19 && x <= 20 && y >= 12 && y <= 14) ||
      (x >= 23 && x <= 31 && y >= 17 && y <= 23)
    )
      return true;
    return buildings.some(
      (b) =>
        x >= b.x &&
        x < b.x + b.w &&
        y >= b.y &&
        y < b.y + b.h &&
        !(x === b.door.x && y === b.door.y),
    );
  }
  const castle = map === "castle",
    left = castle ? 6 : 10,
    right = castle ? 33 : 29,
    top = castle ? 4 : 6,
    bottom = castle ? 25 : 24;
  if (x < left || x > right || y < top || y > bottom) return true;
  return (roomObstacles[map] || []).some(
    (b) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h,
  );
}
export function step(place, dx, dy) {
  const { map, pos } = place,
    x = pos.x + dx,
    y = pos.y + dy;
  if (blocked(map, x, y)) return place;
  if (map === "town") {
    const building = buildings.find((b) => b.door.x === x && b.door.y === y);
    if (building)
      return {
        map: building.id,
        pos: { x: 20, y: building.id === "castle" ? 23 : 22 },
      };
  } else {
    const exit = exitTile(map);
    if (x === exit.x && y === exit.y) {
      const building = buildings.find((b) => b.id === map);
      return {
        map: "town",
        pos: { x: building.door.x, y: building.door.y + 1 },
      };
    }
  }
  return { map, pos: { x, y } };
}

const reachableCache = new Map();
export function canPlaceChallenge(map, x, y) {
  if (
    !MAP_IDS.includes(map) ||
    !Number.isInteger(x) ||
    !Number.isInteger(y) ||
    blocked(map, x, y)
  )
    return false;
  if (map === "town" && buildings.some((b) => b.door.x === x && b.door.y === y))
    return false;
  if (map !== "town") {
    const exit = exitTile(map);
    if (exit.x === x && exit.y === y) return false;
  }
  if (!reachableCache.has(map)) {
    const start =
      map === "town"
        ? { x: 18, y: 20 }
        : { x: 20, y: map === "castle" ? 23 : 22 };
    const queue = [start],
      seen = new Set([`${start.x},${start.y}`]);
    for (let i = 0; i < queue.length; i++)
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
    reachableCache.set(map, seen);
  }
  return reachableCache.get(map).has(`${x},${y}`);
}
