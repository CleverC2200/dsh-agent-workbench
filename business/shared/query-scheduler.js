// One HTML document shares this queue across its cards and collections. Avoid
// multiplying collection concurrency by the number of independently loaded cards.
let runningQueries = 0;
const waitingQueries = [];
let queueTimer;
function drainQueries() {
  if (queueTimer) return;
  // Allow dependent reads to join the queue before choosing the next priority.
  queueTimer = setTimeout(() => {
    queueTimer = undefined;
    while (waitingQueries.length && runningQueries < waitingQueries[0].concurrency)
      waitingQueries.shift()();
  }, 0);
}
export function scheduledQuery(task, signal, priority = 0, concurrency = 4, batchStart = false) {
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
          drainQueries();
        });
    };
    if (signal?.aborted) return reject(signal.reason);
    if (!batchStart && runningQueries < concurrency && waitingQueries.length === 0) {
      start();
      return;
    }
    start.priority = priority;
    start.concurrency = concurrency;
    const index = waitingQueries.findIndex((job) => job.priority < priority);
    if (index < 0) waitingQueries.push(start);
    else waitingQueries.splice(index, 0, start);
    signal?.addEventListener('abort', abort, { once: true });
    drainQueries();
  });
}
