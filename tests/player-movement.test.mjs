import test from "node:test";
import assert from "node:assert/strict";
import { createHeldMovement, MOVE_INTERVAL } from "../lib/player-movement.mjs";

function setup() {
  let now = 0, id = 0;
  const timers = new Map(), moves = [];
  const controls = createHeldMovement((dx, dy) => moves.push({ dx, dy, time: now }), {
    schedule(callback, delay) { timers.set(++id, { callback, at: now + delay }); return id; },
    cancel(timer) { timers.delete(timer); },
  });
  function advance(duration) {
    const end = now + duration;
    while (timers.size) {
      const [key, timer] = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
      if (timer.at > end) break;
      timers.delete(key);
      now = timer.at;
      timer.callback();
    }
    now = end;
  }
  return { controls, moves, advance, timers };
}

test("held movement starts immediately and repeats evenly without the OS repeat delay", () => {
  const { controls, moves, advance, timers } = setup();
  assert.equal(controls.press("ArrowRight"), true);
  advance(MOVE_INTERVAL - 1);
  controls.press("ArrowRight"); // OS repeats cannot accelerate or delay walking.
  assert.equal(moves.length, 1);
  advance(1 + MOVE_INTERVAL * 3);
  assert.deepEqual(moves, Array.from({ length: 5 }, (_, n) => ({ dx: 1, dy: 0, time: n * MOVE_INTERVAL })));
  controls.release("ArrowRight");
  advance(1000);
  assert.equal(moves.length, 5);
  assert.equal(timers.size, 0);
});

test("the newest direction wins and releasing it resumes the previous held key", () => {
  const { controls, moves, advance } = setup();
  controls.press("W");
  advance(MOVE_INTERVAL);
  controls.press("d");
  advance(MOVE_INTERVAL);
  controls.release("D");
  advance(MOVE_INTERVAL);
  assert.deepEqual(moves.map(({ dx, dy }) => [dx, dy]), [[0, -1], [0, -1], [1, 0], [1, 0], [0, -1]]);
  controls.release("w");
  advance(1000);
  assert.equal(moves.length, 5);
});

test("clearing held keys on blur, dialogs or unmount stops all future movement", () => {
  const { controls, moves, advance, timers } = setup();
  assert.equal(controls.press("e"), false);
  assert.equal(controls.press("constructor"), false);
  controls.press("a");
  controls.press("s");
  controls.clear();
  advance(1000);
  assert.equal(moves.length, 2);
  assert.equal(timers.size, 0);
  controls.press("s");
  assert.equal(moves.length, 3, "a fresh press works after clearing");
  controls.clear();
});

test("a move that clears its own controls does not schedule another step", () => {
  let count = 0;
  const timers = [];
  const controls = createHeldMovement(() => { count++; controls.clear(); }, {
    schedule(callback) { timers.push(callback); }, cancel() {},
  });
  controls.press("ArrowDown");
  assert.equal(count, 1);
  assert.equal(timers.length, 0);
});
