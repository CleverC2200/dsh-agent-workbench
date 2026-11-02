// Merge progress bursts into one paint. Final facts are applied by the caller
// after cancel(), so a queued partial can never replace a completed report.
export function createFrameProgress(publish, signal, frames = globalThis) {
  const schedule =
    frames.requestAnimationFrame?.bind(frames) ?? ((callback) => setTimeout(callback, 0));
  const unschedule = frames.cancelAnimationFrame?.bind(frames) ?? clearTimeout;
  let frame;
  let pending;
  let closed = false;
  const cancel = () => {
    closed = true;
    if (frame !== undefined) unschedule(frame);
    pending = undefined;
    signal?.removeEventListener('abort', cancel);
  };
  if (signal?.aborted) cancel();
  else signal?.addEventListener('abort', cancel, { once: true });
  return {
    push(value) {
      if (closed) return;
      pending = value;
      if (frame !== undefined) return;
      frame = schedule(() => {
        frame = undefined;
        if (closed) return;
        const value = pending;
        pending = undefined;
        publish(value);
      });
    },
    cancel,
  };
}
