import test from "node:test";
import assert from "node:assert/strict";
import { createWorld } from "../lib/world-data.mjs";
import { parseTheme } from "../lib/theme-schema.mjs";
import circuit from "../themes/agentic-circuit/theme.json" with { type: "json" };
function theme() {
  const t = structuredClone(circuit);
  t.world.transports = [
    {
      id: "campus-core",
      map: "town",
      location: { x: 18, y: 21 },
      to: "castle",
    },
  ];
  return t;
}
test("transport touch arrives at destination spawn and re-entering its return tile restores the source spawn", () => {
  const t = parseTheme(theme()),
    w = createWorld(t.world);
  const arrived = w.step({ map: "town", pos: { x: 18, y: 20 } }, 0, 1);
  assert.equal(arrived.map, "castle");
  assert.deepEqual(arrived.pos, t.world.maps[1].spawn);
  assert.equal(w.step(arrived, 0, 0), arrived);
  const away = w.step(arrived, 0, 1);
  assert.equal(away.map, "castle");
  const back = w.step(away, 0, -1);
  assert.equal(back.map, "town");
  assert.deepEqual(back.pos, t.world.maps[0].spawn);
  assert.deepEqual(back.travel, []);
  assert.equal(w.canPlaceChallenge("town", 18, 21), false);
  assert.equal(w.canPlaceChallenge("castle", 20, 23), false);
  assert.equal(w.reachable("castle", 20, 23), true);
});
test("shared destinations and nested transport trips return to the right source", () => {
  const t = theme();
  t.world.transports.push(
    {
      id: "tools-core",
      map: "toy-workshop",
      location: { x: 18, y: 22 },
      to: "castle",
    },
    {
      id: "core-memory",
      map: "castle",
      location: { x: 19, y: 23 },
      to: "cocoa-cottage",
    },
  );
  const w = createWorld(parseTheme(t).world);
  let p = w.step({ map: "toy-workshop", pos: { x: 18, y: 21 } }, 0, 1);
  p = w.step(w.step(p, 0, 1), 0, -1);
  assert.equal(p.map, "toy-workshop");
  p = w.step({ map: "town", pos: { x: 18, y: 20 } }, 0, 1);
  p = w.step(p, -1, 0);
  assert.equal(p.map, "cocoa-cottage");
  p = w.step(w.step(p, 0, 1), 0, -1);
  assert.equal(p.map, "castle");
  p = w.step(w.step(p, 0, 1), 0, -1);
  assert.equal(p.map, "town");
});
test("invalid destinations, duplicate tiles, blocked ground and existing door/spawn locations reject theme imports", () => {
  for (const patch of [
    { to: "town" },
    { to: "missing" },
    { location: { x: 0, y: 0 } },
    { location: { x: 18, y: 20 } },
    { location: { x: 20, y: 6 } },
  ]) {
    const t = theme();
    Object.assign(t.world.transports[0], patch);
    assert.throws(() => parseTheme(t));
  }
  const t = theme();
  t.world.transports.push({ ...t.world.transports[0], id: "duplicate-tile" });
  assert.throws(() => parseTheme(t));
});
test("reachability does not walk through a transport to reach floor beyond it", () => {
  const m = (id) => ({
    id,
    name: id,
    bounds: { left: 1, right: 4, top: 1, bottom: 1 },
    spawn: { x: 1, y: 1 },
    exit: null,
    obstacles: [],
  });
  const w = createWorld({
    startMap: "a",
    maps: [m("a"), m("b")],
    buildings: [],
    trees: [],
    transports: [{ id: "link", map: "a", location: { x: 2, y: 1 }, to: "b" }],
  });
  assert.equal(w.reachable("a", 2, 1), true);
  assert.equal(w.canPlaceChallenge("a", 3, 1), false);
});
test("predefined theme entrances and exits support exported overrides and reset to defaults", () => {
  const t = structuredClone(circuit);
  const original = createWorld(t.world).portals.find(
    (p) => p.id === "entrance-castle",
  );
  t.world.portalOverrides = [
    { id: original.id, location: { x: 18, y: 21 }, to: "castle" },
  ];
  let parsed = parseTheme(t),
    w = createWorld(parsed.world);
  assert.equal(
    w.step({ map: "town", pos: { x: 18, y: 20 } }, 0, 1).map,
    "castle",
  );
  assert.equal(
    w.step(
      {
        map: "town",
        pos: { x: original.location.x, y: original.location.y + 1 },
      },
      0,
      -1,
    ).map,
    "town",
  );
  assert.equal(w.canPlaceChallenge("town", 18, 21), false);
  const room = w.mapInfo("castle");
  const back = w.step(
    { map: "castle", pos: { x: room.exit.x, y: room.exit.y - 1 } },
    0,
    1,
  );
  assert.equal(back.map, "town");
  assert.deepEqual(back.pos, { x: 18, y: 22 });
  assert.deepEqual(
    parseTheme(JSON.parse(JSON.stringify(parsed))).world.portalOverrides,
    t.world.portalOverrides,
  );
  t.world.portalOverrides.push({
    id: "exit-castle",
    location: { x: 19, y: 23 },
    to: "toy-workshop",
  });
  w = createWorld(parseTheme(t).world);
  const exit = w.step({ map: "castle", pos: { x: 20, y: 23 } }, -1, 0);
  assert.equal(exit.map, "toy-workshop");
  assert.deepEqual(exit.pos, w.mapInfo("toy-workshop").spawn);
  t.world.portalOverrides = [];
  w = createWorld(parseTheme(t).world);
  assert.equal(
    w.step(
      {
        map: "town",
        pos: { x: original.location.x, y: original.location.y + 1 },
      },
      0,
      -1,
    ).map,
    "castle",
  );
});
test("predefined transport overrides reject unknown IDs, blocked tiles, duplicate sources and invalid destinations", () => {
  for (const override of [
    { id: "missing", location: { x: 18, y: 21 }, to: "castle" },
    { id: "entrance-castle", location: { x: 0, y: 0 }, to: "castle" },
    { id: "entrance-castle", location: { x: 18, y: 20 }, to: "castle" },
    { id: "entrance-castle", location: { x: 18, y: 21 }, to: "town" },
    { id: "entrance-castle", location: { x: 18, y: 21 }, to: "missing" },
    {
      id: "entrance-castle",
      location: { ...circuit.world.buildings[1].door },
      to: "castle",
    },
  ]) {
    const t = structuredClone(circuit);
    t.world.portalOverrides = [override];
    assert.throws(() => parseTheme(t));
  }
});
