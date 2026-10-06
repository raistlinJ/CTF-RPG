import test from "node:test";
import assert from "node:assert/strict";
import { paintStroke } from "../lib/paint-stroke.mjs";
import { createWorld } from "../lib/world-data.mjs";
import circuit from "../themes/agentic-circuit/theme.json" with { type: "json" };
test("fast and diagonal painting produces an uninterrupted four-way connected stroke", () => {
  for (const [from, to] of [
    [
      { x: 1, y: 2 },
      { x: 20, y: 17 },
    ],
    [
      { x: 20, y: 17 },
      { x: 1, y: 2 },
    ],
    [
      { x: 1, y: 2 },
      { x: 1, y: 22 },
    ],
    [
      { x: 3, y: 5 },
      { x: 3, y: 5 },
    ],
  ]) {
    const stroke = paintStroke(from, to);
    assert.deepEqual(stroke[0], from);
    assert.deepEqual(stroke.at(-1), to);
    for (let i = 1; i < stroke.length; i++)
      assert.equal(
        Math.abs(stroke[i].x - stroke[i - 1].x) +
          Math.abs(stroke[i].y - stroke[i - 1].y),
        1,
      );
  }
  assert.deepEqual(paintStroke(null, { x: 2, y: 3 }), [{ x: 2, y: 3 }]);
});
test("Circuit Campus painting can open former building collision tiles and block floor tiles", () => {
  const world = structuredClone(circuit.world),
    map = world.maps[0],
    before = createWorld(world);
  assert.equal(before.blocked(map.id, 15, 5), true);
  const ground = [];
  for (let y = 1; y <= 26; y++)
    for (let x = 1; x <= 38; x++) ground.push([x, y]);
  map.ground = ground.filter(([x, y]) => !(x === 12 && y === 20));
  const after = createWorld(world);
  assert.equal(after.canPlaceChallenge(map.id, 15, 5), true);
  assert.equal(after.blocked(map.id, 12, 20), true);
  assert.equal(after.blocked(map.id, 0, 0), true);
  assert.equal(after.canPlaceChallenge(map.id, 20, 6), false); // Entrance remains reserved.
});
