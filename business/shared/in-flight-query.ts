type Flight<T> = {
  controller: AbortController;
  promise: Promise<T>;
  subscribers: number;
};

export function inFlightQueries<T>() {
  const pending = new Map<string, Flight<T>>();
  return (key: string, run: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal) => {
    signal?.throwIfAborted();
    let flight = pending.get(key);
    if (!flight) {
      const controller = new AbortController();
      const promise = Promise.resolve().then(() => run(controller.signal));
      flight = { controller, promise, subscribers: 0 };
      pending.set(key, flight);
      const remove = () => {
        if (pending.get(key) === flight) pending.delete(key);
      };
      void promise.then(remove, remove);
    }
    const current = flight;
    current.subscribers++;
    return new Promise<T>((resolve, reject) => {
      let finished = false;
      const finish = (complete: () => void) => {
        if (finished) return;
        finished = true;
        signal?.removeEventListener('abort', abort);
        current.subscribers--;
        if (!current.subscribers) {
          if (pending.get(key) === current) pending.delete(key);
          current.controller.abort();
        }
        complete();
      };
      const abort = () =>
        finish(() => reject(signal?.reason ?? new DOMException('Aborted', 'AbortError')));
      signal?.addEventListener('abort', abort, { once: true });
      void current.promise.then(
        (value) => finish(() => resolve(value)),
        (error) => finish(() => reject(error)),
      );
    });
  };
}
