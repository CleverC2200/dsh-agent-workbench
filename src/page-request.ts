let activeReads = 0;
const queuedReads: Array<() => void> = [];

function scheduleRead<T>(execute: () => Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      const index = queuedReads.indexOf(start);
      if (index >= 0) queuedReads.splice(index, 1);
      reject(signal.reason);
    };
    const start = () => {
      signal.removeEventListener('abort', abort);
      activeReads++;
      Promise.resolve()
        .then(() => {
          signal.throwIfAborted();
          return execute();
        })
        .then(resolve, reject)
        .finally(() => {
          activeReads--;
          while (activeReads < 3 && queuedReads.length) queuedReads.shift()!();
        });
    };
    if (signal.aborted) return reject(signal.reason);
    if (activeReads < 3) start();
    else {
      queuedReads.push(start);
      signal.addEventListener('abort', abort, { once: true });
    }
  });
}

export function createPageRequest(fetcher?: typeof fetch) {
  return (operation: string, input: object, signal: AbortSignal): Promise<any> => {
    const execute = async () => {
      const response = await (fetcher ?? fetch)('/api/agent-workbench/page', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation, ...input }),
        signal,
      });
      const value = await response.json();
      if (operation !== 'open') signal.throwIfAborted();
      if (!response.ok) throw Error(value.error ?? 'PAGE_REQUEST_FAILED');
      return value;
    };
    return operation === 'sql' ? scheduleRead(execute, signal) : execute();
  };
}
