import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from './public-build.mjs';
const out = await build({
  entryPoints: ['app/data/gea-workspace.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
const { createGeaWorkspace } = await import(
  'data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64')
);
const input = {
  date: '2026-08-31',
  granularity: 'month',
  version: '滚动',
  orderType: 'M',
  stage: 'primary',
};
test('completed inventory is published while slower sources are still pending', async () => {
  const pending = [];
  const snapshots = [];
  const run = createGeaWorkspace((_, q) => new Promise((resolve) => pending.push({ q, resolve })));
  const result = run({ ...input, onProgress: (d) => snapshots.push(d) });
  await new Promise((r) => setImmediate(r));
  pending[0].resolve({ rows: [{ inventory: 10000, records: 1 }], total: 1 });
  await new Promise((r) => setImmediate(r));
  const early = snapshots.some((d) =>
    d.sections.some((s) => s.id === 'stock' && s.status === 'ready'),
  );
  const drain = setInterval(
    () => pending.splice(1).forEach((p) => p.resolve({ rows: [], total: 0 })),
    1,
  );
  try {
    await result;
  } finally {
    clearInterval(drain);
  }
  assert.ok(early, 'successful stock must not wait for other requests');
});
test('changing filters stops queued SQL before it reaches the gateway', async () => {
  const controller = new AbortController();
  const pending = [];
  let count = 0;
  const run = createGeaWorkspace(() => {
    count++;
    if (controller.signal.aborted) return Promise.resolve({ rows: [], total: 0 });
    return new Promise((resolve) => pending.push(resolve));
  });
  const result = run({ ...input, stage: undefined, signal: controller.signal });
  await new Promise((r) => setImmediate(r));
  controller.abort();
  pending.forEach((resolve) => resolve({ rows: [], total: 0 }));
  await result.catch(() => {});
  assert.equal(count, 3, 'only the three already-dispatched reads are allowed');
});
test('identical reads share results within the adapter, explicit refresh fetches again', async () => {
  let count = 0;
  const run = createGeaWorkspace(async () => {
    count++;
    return { rows: [], total: 0 };
  });
  await run(input);
  const initial = count;
  assert.ok(initial >= 4);
  await run(input);
  assert.equal(count, initial);
  await run({ ...input, refresh: true });
  assert.equal(count, initial * 2);
});
test('unpublished resources are not queried again for comparison periods', async () => {
  let count = 0;
  const run = createGeaWorkspace(async () => {
    count++;
    throw Object.assign(new Error('数据表未发布为可访问资源'), {
      code: 'AI_GATEWAY_DATA_PERMISSION_DENIED',
    });
  });
  await run(input);
  await run({ ...input, date: '2026-07-31' });
  assert.equal(count, 4);
});
test('all-stage starts core cards first while leaving a lane for other sources', async () => {
  const registry = JSON.parse(
    await (
      await import('node:fs/promises')
    ).readFile(new URL('../../app/data/gea-queries.json', import.meta.url), 'utf8'),
  );
  const calls = [];
  const pending = [];
  const run = createGeaWorkspace((_, q) => {
    calls.push(q.sql);
    return new Promise((resolve) => pending.push(resolve));
  });
  const controller = new AbortController();
  const result = run({ ...input, stage: undefined, signal: controller.signal });
  await new Promise((r) => setImmediate(r));
  const starts = [...calls];
  controller.abort();
  pending.forEach((resolve) => resolve({ rows: [], total: 0 }));
  await result;
  assert.equal(starts.length, 3);
  assert.equal(starts[0], registry.queries.stock.sql);
  assert.equal(starts[1], registry.queries['orders-month'].sql);
});
test('previous-period data publishes before annual comparisons finish', async () => {
  const snapshots = [];
  const pending = [];
  const run = createGeaWorkspace((_, q) => {
    const values = Object.values(q.parameters);
    if (values.some((v) => String(v).startsWith('2025')))
      return new Promise((resolve) => pending.push(resolve));
    return Promise.resolve({ rows: [], total: 0 });
  });
  const result = run({
    ...input,
    stage: undefined,
    comparison: true,
    onComparison: (value) => snapshots.push(value),
  });
  await new Promise((r) => setImmediate(r));
  const early = snapshots.some((value) => value.previous && !value.annual);
  // Abort lets queued annual reads stop without adding further gates.
  pending.forEach((resolve) => resolve({ rows: [], total: 0 }));
  // This test only verifies the early publication; remaining mocked annual pages are immediately released.
  const drain = setInterval(
    () => pending.splice(0).forEach((resolve) => resolve({ rows: [], total: 0 })),
    1,
  );
  await result;
  clearInterval(drain);
  assert.ok(early, 'previous must not wait for annual queries');
});
test('parallel pages across multiple sources still share a global limit of three', async () => {
  let active = 0,
    peak = 0;
  const run = createGeaWorkspace(async (_, q) => {
    peak = Math.max(peak, ++active);
    await new Promise((r) => setTimeout(r, 1));
    active--;
    const total = 601;
    return {
      rows: Array.from({ length: Math.min(200, total - (q.pageNo - 1) * 200) }, () => ({
        inventory: 1,
        records: 1,
      })),
      total,
      pageNo: q.pageNo,
    };
  });
  await run({ ...input, stage: undefined });
  assert.equal(peak, 3);
});
