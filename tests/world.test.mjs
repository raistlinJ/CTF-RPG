import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildings,
  blocked,
  step,
  exitTile,
  MAP_IDS,
} from "../lib/world-data.mjs";
import { parseChallenges } from "../lib/config-schema.mjs";
function flood(map, start) {
  const queue = [start],
    seen = new Set([`${start.x},${start.y}`]);
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i];
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const x = p.x + dx,
        y = p.y + dy,
        key = `${x},${y}`;
      if (!seen.has(key) && !blocked(map, x, y)) {
        seen.add(key);
        queue.push({ x, y });
      }
    }
  }
  return { queue, seen };
}
test("all town doors are reachable, enter their own interior, and return outside safely", () => {
  const { seen } = flood("town", { x: 18, y: 20 });
  for (const b of buildings) {
    assert.ok(seen.has(`${b.door.x},${b.door.y + 1}`), b.id);
    const entered = step(
      { map: "town", pos: { x: b.door.x, y: b.door.y + 1 } },
      0,
      -1,
    );
    assert.equal(entered.map, b.id);
    assert.ok(!blocked(b.id, entered.pos.x, entered.pos.y));
    const room = flood(b.id, entered.pos),
      exit = exitTile(b.id);
    assert.ok(room.seen.has(`${exit.x},${exit.y}`), b.id);
    const returned = step(
      { map: b.id, pos: { x: exit.x, y: exit.y - 1 } },
      0,
      1,
    );
    assert.deepEqual(returned, {
      map: "town",
      pos: { x: b.door.x, y: b.door.y + 1 },
    });
    assert.ok(!blocked("town", returned.pos.x, returned.pos.y));
  }
});
test("every YAML treasure is reachable in its own map and map IDs validate", () => {
  const challenges = parseChallenges(
    readFileSync("content/challenges.yaml", "utf8"),
  );
  for (const c of challenges) {
    const start =
      c.map === "town"
        ? { x: 18, y: 20 }
        : { x: 20, y: c.map === "castle" ? 23 : 22 };
    const room = flood(c.map, start);
    assert.ok(
      room.queue.some(
        (p) => Math.abs(p.x - c.location.x) + Math.abs(p.y - c.location.y) <= 2,
      ),
      c.id,
    );
  }
  assert.ok(challenges.some((c) => c.map === "castle"));
  assert.ok(challenges.some((c) => c.map === "toy-workshop"));
  assert.ok(challenges.some((c) => c.map === "bakery"));
  assert.throws(() =>
    parseChallenges(
      readFileSync("content/challenges.yaml", "utf8").replace(
        "map: castle",
        "map: nonexistent",
      ),
    ),
  );
  assert.equal(MAP_IDS.length, 7);
});
test("building walls, furniture, water and outer boundaries block movement", () => {
  assert.ok(blocked("town", 15, 1));
  assert.ok(blocked("town", 27, 20));
  assert.ok(blocked("castle", 18, 6));
  assert.ok(blocked("toy-workshop", 13, 10));
  const p = { map: "castle", pos: { x: 6, y: 10 } };
  assert.equal(step(p, -1, 0), p);
});
