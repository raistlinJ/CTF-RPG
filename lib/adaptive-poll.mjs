// A single request at a time, including refreshes and visibility changes.
export function startPolling(task, {
  interval = 5000, timeout = 12000, maxDelay = 30000, onError = () => {}, onHidden = () => {},
  document = globalThis.document, random = Math.random,
  setTimeout = globalThis.setTimeout, clearTimeout = globalThis.clearTimeout,
} = {}) {
  let stopped = false, running = false, requested = false, failures = 0, timer, controller;
  const hidden = () => !!document?.hidden;
  function schedule(delay) {
    clearTimeout(timer);
    if (!stopped && !hidden()) timer = setTimeout(run, delay);
  }
  async function run() {
    if (stopped || hidden() || running) return;
    running = true; requested = false;
    const active = new AbortController(); controller = active;
    const deadline = setTimeout(() => active.abort(), timeout);
    try {
      await task(active.signal);
      failures = 0;
    } catch (error) {
      if (!stopped && !hidden()) { failures++; onError(error); }
    } finally {
      clearTimeout(deadline); running = false;
      if (controller === active) controller = undefined;
      const delay = Math.min(maxDelay, interval * 2 ** Math.min(failures, 5));
      schedule(requested ? 0 : Math.min(maxDelay,delay + Math.floor(random() * delay * 0.1)));
    }
  }
  function refresh() {
    if (stopped) return;
    if (running) { requested = true; return; }
    schedule(0);
  }
  function visibilityChanged() {
    clearTimeout(timer);
    if (hidden()) { controller?.abort(); onHidden(); }
    else refresh();
  }
  document?.addEventListener('visibilitychange', visibilityChanged);
  schedule(Math.floor(random() * Math.min(interval, 500)));
  return {
    refresh,
    stop() {
      stopped = true; clearTimeout(timer); controller?.abort();
      document?.removeEventListener('visibilitychange', visibilityChanged);
    },
  };
}
