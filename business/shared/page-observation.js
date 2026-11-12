export function keepPageObservation(read, send, { interval = 30000 } = {}) {
  let pending = false;
  const tick = async () => {
    const value = read();
    if (!value || pending) return;
    pending = true;
    try {
      await send(value);
    } catch {
    } finally {
      pending = false;
    }
  };
  const timer = setInterval(tick, interval);
  const dispose = () => clearInterval(timer);
  window.addEventListener('pagehide', dispose, { once: true });
  return dispose;
}
