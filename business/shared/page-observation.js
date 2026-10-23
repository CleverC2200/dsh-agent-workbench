/** Keep only the mounted page's current data alive; never retain it across identity/session changes. */
export function keepPageObservation(read, send, { interval = 30000 } = {}) {
  let pending = false;
  const tick = async () => {
    const value = read();
    if (!value || pending) return;
    pending = true;
    try {
      await send(value);
    } catch {
      /* The page's publisher owns visible errors. */
    } finally {
      pending = false;
    }
  };
  const timer = setInterval(tick, interval);
  const dispose = () => clearInterval(timer);
  window.addEventListener('pagehide', dispose, { once: true });
  return dispose;
}
