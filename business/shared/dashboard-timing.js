export function startDashboardTiming(page, signal) {
  const clock = globalThis.performance;
  const start = clock?.now();
  const seen = new Set();
  const mark = (phase) => {
    if (!clock?.measure || seen.has(phase)) return;
    seen.add(phase);
    const name = `dashboard:${page}:${phase}`;
    clock.clearMeasures(name);
    clock.measure(name, { start, end: clock.now() });
  };
  let done = false;
  const finish = (phase = 'complete') => {
    if (done) return;
    done = true;
    signal?.removeEventListener('abort', abort);
    mark(phase);
  };
  const abort = () => finish('cancelled');
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  return {
    mark: (phase) => {
      if (!done) mark(phase);
    },
    finish,
  };
}
