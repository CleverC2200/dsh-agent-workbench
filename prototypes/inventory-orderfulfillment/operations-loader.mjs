export function createOperationsLoader({ cache, read, changed, status }) {
  let generation = 0,
    view = 0,
    running = 0;
  const flights = new Map(),
    queue = [];
  const stale = () => Error('授权或会话已变化');
  function pump() {
    while (running < 2 && queue.length) {
      const job = queue.shift();
      running++;
      Promise.resolve()
        .then(() => {
          if (job.generation !== generation) throw stale();
          return read(job.name);
        })
        .then((result) => {
          if (job.generation !== generation) throw stale();
          cache.set(job.name, result);
          changed();
          job.resolve(result);
        })
        .catch(job.reject)
        .finally(() => {
          running--;
          if (flights.get(job.name) === job) flights.delete(job.name);
          pump();
        });
    }
  }
  function request(name) {
    if (cache.has(name)) return Promise.resolve(cache.get(name));
    if (flights.has(name)) return flights.get(name).promise;
    const job = { name, generation };
    job.promise = new Promise((resolve, reject) => Object.assign(job, { resolve, reject }));
    flights.set(name, job);
    queue.push(job);
    pump();
    return job.promise;
  }
  return {
    async load(names) {
      const current = generation,
        selected = ++view,
        failures = [];
      status('读取中…');
      const collect = async (name) => {
        try {
          await request(name);
        } catch (error) {
          failures.push(name + '：' + String(error.message).slice(0, 80));
        }
      };
      await collect('plan.base');
      if (current !== generation) return;
      await Promise.all([...new Set(names)].filter((name) => name !== 'plan.base').map(collect));
      if (current !== generation || selected !== view) return;
      status(failures.length ? '部分数据未读取：' + failures.join('；') : '已读取当前用户授权数据');
    },
    reset() {
      generation++;
      view++;
      flights.clear();
      for (const job of queue.splice(0)) job.reject(stale());
    },
  };
}
