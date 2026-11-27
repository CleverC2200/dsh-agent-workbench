import test from 'node:test';
import assert from 'node:assert/strict';
import { createOperationsLoader } from '../prototypes/inventory-orderfulfillment/operations-loader.mjs';
const tick = () => new Promise((resolve) => setImmediate(resolve));
test('loading shares in-flight datasets, bounds parallel work and reuses completed reads across tabs', async () => {
  const cache = new Map(),
    jobs = new Map(),
    starts = [],
    statuses = [];
  let active = 0,
    maximum = 0,
    changes = 0;
  const loader = createOperationsLoader({
    cache,
    changed: () => changes++,
    status: (value) => statuses.push(value),
    read(name) {
      starts.push(name);
      active++;
      maximum = Math.max(active, maximum);
      return new Promise((resolve) =>
        jobs.set(name, () => {
          active--;
          resolve({ rows: [name] });
        }),
      );
    },
  });
  const first = loader.load(['stock', 'facts']);
  const second = loader.load(['facts', 'age']);
  await tick();
  assert.deepEqual(starts, ['plan.base']);
  jobs.get('plan.base')();
  await tick();
  assert.equal(active, 2);
  jobs.get('stock')();
  await tick();
  jobs.get('facts')();
  await tick();
  jobs.get('age')();
  await Promise.all([first, second]);
  assert.equal(maximum, 2);
  assert.equal(starts.filter((name) => name === 'facts').length, 1);
  assert.equal(changes, 4);
  assert.equal(statuses.filter((value) => value === '已读取当前用户授权数据').length, 1);
  await loader.load(['facts', 'age']);
  assert.equal(starts.length, 4);
});
test('identity reset prevents late results and queued work from entering the new cache', async () => {
  const cache = new Map(),
    jobs = new Map(),
    statuses = [];
  let changes = 0;
  const loader = createOperationsLoader({
    cache,
    status: (value) => statuses.push(value),
    changed: () => changes++,
    read: (name) => new Promise((resolve) => jobs.set(name, resolve)),
  });
  const loading = loader.load(['old', 'queued', 'queued2']);
  await tick();
  jobs.get('plan.base')({ rows: [] });
  await tick();
  loader.reset();
  cache.clear();
  jobs.get('old')({ rows: ['private'] });
  jobs.get('queued')({ rows: ['private'] });
  await loading;
  assert.equal(cache.size, 0);
  assert.equal(changes, 1);
  assert.equal(jobs.has('queued2'), false);
  assert.equal(statuses.includes('已读取当前用户授权数据'), false);
});
