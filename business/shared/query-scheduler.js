// One HTML document shares transport slots across its legacy SQL and named
// queries. Priorities affect queued work only; active reads are never preempted.
let runningQueries = 0;
const waitingQueries = [];
export function scheduledQuery(task, signal, priority = 0, concurrency = 4) {
  return new Promise((resolve, reject) => {
    const abort = () => {
      const index = waitingQueries.indexOf(start);
      if (index >= 0) waitingQueries.splice(index, 1);
      reject(signal.reason);
    };
    const start = () => {
      signal?.removeEventListener('abort', abort);
      runningQueries++;
      Promise.resolve()
        .then(() => {
          signal?.throwIfAborted();
          return task();
        })
        .then(resolve, reject)
        .finally(() => {
          runningQueries--;
          waitingQueries.shift()?.();
        });
    };
    if (signal?.aborted) return reject(signal.reason);
    if (runningQueries < concurrency) start();
    else {
      start.priority = priority;
      const index = waitingQueries.findIndex((job) => job.priority < priority);
      if (index < 0) waitingQueries.push(start);
      else waitingQueries.splice(index, 0, start);
      signal?.addEventListener('abort', abort, { once: true });
    }
  });
}
