export const MOVE_INTERVAL = 120;

const directions = {
  arrowup: [0, -1], w: [0, -1],
  arrowdown: [0, 1], s: [0, 1],
  arrowleft: [-1, 0], a: [-1, 0],
  arrowright: [1, 0], d: [1, 0],
};

export function isMovementKey(key) {
  return Object.hasOwn(directions, key.toLowerCase());
}

/** Repeat held directions at a consistent pace, independent of OS key repeat. */
export function createHeldMovement(move, { schedule = setTimeout, cancel = clearTimeout } = {}) {
  const held = new Set();
  let timer;
  function clear() {
    held.clear();
    cancel(timer);
    timer = undefined;
  }
  function tick() {
    timer = undefined;
    const key = [...held].at(-1);
    if (!key) return;
    move(...directions[key]);
    if (held.size) timer = schedule(tick, MOVE_INTERVAL);
  }
  return {
    press(key) {
      key = key.toLowerCase();
      if (!isMovementKey(key)) return false;
      if (!held.has(key)) {
        held.add(key);
        cancel(timer);
        tick();
      }
      return true;
    },
    release(key) {
      held.delete(key.toLowerCase());
      if (!held.size) clear();
    },
    clear,
  };
}
