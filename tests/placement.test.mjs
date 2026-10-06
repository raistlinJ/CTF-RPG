import test from "node:test";
import assert from "node:assert/strict";
import { planChallengePlacement } from "../lib/challenge-placement.mjs";
import { defaultTheme } from "../lib/theme-schema.mjs";
import { createWorld } from "../lib/world-data.mjs";
const theme = defaultTheme({
  characters: [
    { id: "web", name: "Web", subtitle: "", sprite: null, fallback: "web" },
  ],
  audio: { midi: null, loop: true, volume: 0.1 },
});
const question = (id, map, location) => ({ id, map, location, object: id });
test("placement reserves valid later questions and uses deterministic nearest tiles", () => {
  const w = createWorld(theme.world),
    m = theme.world.maps[0];
  const points = [];
  for (let y = 0; y < 28; y++)
    for (let x = 0; x < 40; x++)
      if (w.canPlaceChallenge(m.id, x, y)) points.push({ x, y });
  const c = points[100],
    invalid = question("invalid", m.id, { x: -1, y: -1 }),
    valid = question("valid", m.id, c);
  const result = planChallengePlacement(theme, [invalid, valid]);
  assert.deepEqual(result.challenges[1], valid);
  assert.equal(result.moved.length, 1);
  const expected = points
    .filter((p) => p.x !== c.x || p.y !== c.y)
    .sort((a, b) => a.x + a.y - b.x - b.y || a.y - b.y || a.x - b.x)[0];
  assert.deepEqual(result.challenges[0].location, expected);
  assert.deepEqual(planChallengePlacement(theme, [invalid, valid]), result);
});
test("unreachable cells are ignored and overflow spills into another map before exclusion", () => {
  const t = structuredClone(theme);
  t.world.startMap = "first";
  t.world.buildings = [];
  t.world.trees = [];
  const map = (id) => ({
    id,
    name: id,
    bounds: { left: 1, right: 3, top: 1, bottom: 1 },
    spawn: { x: 1, y: 1 },
    exit: null,
    background: null,
    floor: "#ffffff",
    wall: "#000000",
    obstacles: [{ x: 2, y: 1, w: 1, h: 1 }],
  });
  t.world.maps = [map("first"), map("second")];
  const result = planChallengePlacement(t, [
    question("a", "first", { x: 3, y: 1 }),
    question("b", "first", { x: 3, y: 1 }),
    question("c", "first", { x: 3, y: 1 }),
  ]);
  assert.equal(result.challenges.length, 2);
  assert.deepEqual(
    result.challenges.map((c) => c.map),
    ["first", "second"],
  );
  assert.ok(result.challenges.every((c) => c.location.x === 1));
  assert.deepEqual(
    result.excluded.map((c) => c.id),
    ["c"],
  );
});
