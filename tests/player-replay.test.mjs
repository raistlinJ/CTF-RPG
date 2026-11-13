import test from "node:test";
import assert from "node:assert/strict";
import { findReplayRoute, MAX_REPLAY_MS, samplePlayerReplay, updatePlayerReplays } from "../lib/player-replay.mjs";
import { MOVE_INTERVAL } from "../lib/player-movement.mjs";

const open = () => true;
const player = (x, y, username = "alice") => ({ username, x, y });
function start(from, to, canVisit = open) {
  const initial = updatePlayerReplays(new Map(), [from], 0, canVisit);
  return updatePlayerReplays(initial, [to], 0, canVisit);
}

test("players first appear at their reported tile without replaying from another location", () => {
  const replays = updatePlayerReplays(new Map(), [player(8, 5)], 500, open);
  assert.deepEqual(samplePlayerReplay(replays.get("alice"), 500).point, { x: 8, y: 5 });
  assert.equal(replays.get("alice").length, 0);
});

test("updates replay tile-by-tile movement and finish at the exact reported location", () => {
  const replay = start(player(1, 1), player(4, 3)).get("alice");
  assert.equal(replay.duration, 5 * MOVE_INTERVAL);
  assert.deepEqual(samplePlayerReplay(replay, 0).point, { x: 1, y: 1 });
  assert.deepEqual(samplePlayerReplay(replay, MOVE_INTERVAL / 2).point, { x: 1.5, y: 1 });
  for (let index = 1; index < replay.route.length; index++) {
    const a = replay.route[index - 1], b = replay.route[index];
    assert.equal(Math.abs(a.x - b.x) + Math.abs(a.y - b.y), 1);
  }
  assert.deepEqual(samplePlayerReplay(replay, replay.duration).point, { x: 4, y: 3 });
  assert.deepEqual(samplePlayerReplay(replay, replay.duration + 5000).point, { x: 4, y: 3 });
});

test("synthetic routes detour around blocked ground and cannot leave the map", () => {
  const canVisit = (x, y) => x !== 2 || y > 2;
  const route = findReplayRoute({ x: 1, y: 1 }, { x: 3, y: 1 }, canVisit);
  assert.ok(route.some(point => point.y === 3));
  assert.ok(route.every(point => canVisit(point.x, point.y)));
  assert.ok(route.every(point => point.x >= 0 && point.x < 40 && point.y >= 0 && point.y < 28));
  assert.equal(findReplayRoute({ x: 0, y: 0 }, { x: 2, y: 0 }, x => x !== 1), null);
});

test("long routes arrive before the next presence poll", () => {
  const replay = start(player(0, 0), player(39, 27)).get("alice");
  assert.equal(replay.duration, MAX_REPLAY_MS);
  assert.ok(MAX_REPLAY_MS < 3000);
  assert.deepEqual(samplePlayerReplay(replay, MAX_REPLAY_MS).point, { x: 39, y: 27 });
});

test("a newer update retargets smoothly from the in-flight position without queuing old destinations", () => {
  const previous = start(player(1, 1), player(8, 1));
  const time = MOVE_INTERVAL / 2;
  const replays = updatePlayerReplays(previous, [player(2, 4)], time, open);
  const replay = replays.get("alice");
  assert.deepEqual(samplePlayerReplay(replay, time).point, { x: 1.5, y: 1 });
  assert.deepEqual(replay.route[1], { x: 2, y: 1 }, "finish the current tile edge before turning");
  assert.ok(!replay.route.some(point => point.x === 8), "the stale destination is discarded");
  assert.deepEqual(samplePlayerReplay(replay, time + replay.duration).point, { x: 2, y: 4 });
});

test("stationary snapshots and metadata updates do not restart an active replay", () => {
  const previous = start(player(1, 1), player(8, 1));
  const updated = updatePlayerReplays(previous, [{ ...player(8, 1), crowned: true }], 100, open);
  assert.equal(updated.get("alice"), previous.get("alice"));
});

test("departures remove old replays and returning players appear at their new tile", () => {
  const previous = start(player(1, 1), player(8, 1));
  const empty = updatePlayerReplays(previous, [], 100, open);
  assert.equal(empty.size, 0);
  const returned = updatePlayerReplays(empty, [player(20, 10)], 200, open).get("alice");
  assert.deepEqual(samplePlayerReplay(returned, 200).point, { x: 20, y: 10 });
  assert.equal(returned.length, 0);
});

test("reduced motion and disconnected destinations settle immediately", () => {
  const previous = start(player(1, 1), player(8, 1));
  for (const [canVisit, immediate] of [[open, true], [() => false, false]]) {
    const replay = updatePlayerReplays(previous, [player(20, 10)], 100, canVisit, immediate).get("alice");
    assert.equal(replay.length, 0);
    assert.deepEqual(samplePlayerReplay(replay, 100).point, { x: 20, y: 10 });
  }
});

test("players sharing a destination retain independent replays until they arrive", () => {
  const initial = updatePlayerReplays(new Map(), [player(1, 1), player(9, 1, "bob")], 0, open);
  const replays = updatePlayerReplays(initial, [player(5, 1), player(5, 1, "bob")], 0, open);
  assert.equal(replays.size, 2);
  assert.deepEqual(samplePlayerReplay(replays.get("alice"), MOVE_INTERVAL).point, { x: 2, y: 1 });
  assert.deepEqual(samplePlayerReplay(replays.get("bob"), MOVE_INTERVAL).point, { x: 8, y: 1 });
  for (const replay of replays.values()) assert.deepEqual(samplePlayerReplay(replay, MAX_REPLAY_MS).point, { x: 5, y: 1 });
});
