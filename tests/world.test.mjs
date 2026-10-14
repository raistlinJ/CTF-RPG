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

test("explicit walkable ground controls movement and challenge reachability", async () => {
  const { defaultWorld, createWorld } = await import("../lib/world-data.mjs");
  const world = structuredClone(defaultWorld);
  const map = world.maps.find((m) => m.id === world.startMap),
    p = map.spawn;
  map.ground = [
    [p.x, p.y],
    [p.x + 1, p.y],
    [p.x + 3, p.y],
  ];
  const engine = createWorld(world);
  assert.equal(engine.blocked(map.id, p.x, p.y + 1), true);
  assert.equal(engine.canPlaceChallenge(map.id, p.x + 3, p.y), false);
  assert.deepEqual(engine.step({ map: map.id, pos: p }, 0, 1), {
    map: map.id,
    pos: p,
  });
});

test("every NPC allocated tile blocks movement and spawns while preserving underlying painted ground", async () => {
  const { defaultWorld, createWorld } = await import("../lib/world-data.mjs");
  for (const size of [1, 2, 3]) {
    const world = structuredClone(defaultWorld), map = world.maps.find(m => m.id === world.startMap);
    map.ground = Array.from({length:100}, (_,i) => [10+i%10, 18+Math.floor(i/10)]);
    map.spawn = {x:10,y:18};
    world.entities = [{id:"guide",map:map.id,location:{x:12,y:20},size}];
    const engine = createWorld(world);
    for (let y=20;y<20+size;y++) for (let x=12;x<12+size;x++) {
      assert.equal(engine.terrainBlocked(map.id,x,y),false);
      assert.equal(engine.blocked(map.id,x,y),true);
      assert.equal(engine.reachable(map.id,x,y),false);
      assert.equal(engine.canSpawn(map.id,x,y),false);
      const from={map:map.id,pos:{x:x-1,y}};
      assert.equal(engine.step(from,1,0),from);
    }
    assert.equal(engine.blocked(map.id,11,20),false);
    assert.equal(engine.reachable(map.id,12+size,20),true,"players can go around the footprint");
    assert.equal(engine.blocked("castle",12,20),false,"blocking belongs to its map");
    const restored=createWorld({...world,entities:[]});
    assert.equal(restored.blocked(map.id,12,20),false,"removing an entity restores painted ground");
    assert.equal(restored.reachable(map.id,12,20),true);
  }
});

test("an NPC blocks passage through a painted corridor and placement cannot cover a map spawn", async () => {
  const { defaultWorld, createWorld } = await import("../lib/world-data.mjs");
  const { entityLocationAvailable } = await import("../lib/non-player-entities.mjs");
  const world=structuredClone(defaultWorld),map=world.maps.find(m=>m.id===world.startMap);
  map.spawn={x:10,y:20};map.ground=[[10,20],[11,20],[12,20],[13,20]];
  world.entities=[{id:"gatekeeper",map:map.id,location:{x:11,y:20},size:1}];
  const engine=createWorld(world);
  assert.equal(engine.reachable(map.id,13,20),false);
  assert.equal(entityLocationAvailable(engine,[],world.entities,map.id,10,20,"gatekeeper"),false);
  assert.equal(entityLocationAvailable(engine,[],[],map.id,9,19,undefined,{size:2}),false,"a non-anchor spawn overlap is forbidden");
});
