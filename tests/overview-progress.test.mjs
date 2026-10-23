import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
const out = await build({
  entryPoints: ['business/shared/configured-overview.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { readConfiguredOverview, completeCount } = await import(
  'data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64')
);
const config = JSON.parse(await readFile('business/inventory-fc/sql.config.json', 'utf8'));
const reply = (id, version = 'v1') => ({
  configVersion: version,
  rows: [
    Object.fromEntries(
      config.queries[id].resultColumns.map((k) => [k, k === 'day' ? '2026-10-18' : 1]),
    ),
  ],
});
test('fast overview cards render while another source is pending; shared snapshot resolves only once', async () => {
  const calls = [],
    progress = [];
  let finishSlow;
  const promise = readConfiguredOverview(config, '2026-10-19', '', {
    onProgress: (p) => progress.push(p),
    execute: async (_, o) => {
      calls.push(o.queryId);
      if (o.queryId === 'orders.summary') await new Promise((r) => (finishSlow = r));
      return reply(o.queryId);
    },
  });
  await new Promise(setImmediate);
  const early = progress.some((p) => p.replenishment?.summary && !p.orders);
  finishSlow();
  const result = await promise;
  assert.ok(early, 'a slow source must not hide ready cards');
  assert.equal(calls.filter((id) => id === 'source.branch-stock-date').length, 1);
  assert.equal(result.orders.summary.row_count, 1);
  assert.ok(progress[0] !== result, 'published partial snapshots must not be mutated later');
});
test('refresh creates a new snapshot scope and permission failures do not retry', async () => {
  const calls = [];
  const execute = async (_, o) => {
    calls.push(o.queryId);
    return o.queryId === 'source.branch-stock-date'
      ? { failure: { reasonCode: 'FIELD_NOT_PUBLISHED', message: 'denied' } }
      : reply(o.queryId);
  };
  for (let n = 0; n < 2; n++) {
    const parts = await readConfiguredOverview(config, '2026-10-19', '', { execute });
    assert.equal(parts.replenishment.error, 'denied');
    assert.equal(parts['branch-stock'].error, 'denied');
    assert.equal(parts.orders.summary.row_count, 1);
  }
  assert.equal(calls.filter((id) => id === 'source.branch-stock-date').length, 2);
  assert.ok(!calls.includes('health.summary'));
});
test('changed configuration rejects the load before publishing mixed cards', async () => {
  const progress = [];
  await assert.rejects(
    readConfiguredOverview(config, '2026-10-19', '', {
      onProgress: (p) => progress.push(p),
      execute: async (_, o) => reply(o.queryId, o.queryId === 'orders.summary' ? 'v2' : 'v1'),
    }),
    { code: 'QUERY_CONFIG_CHANGED' },
  );
  assert.ok(
    progress.every(
      (p) =>
        new Set(
          Object.values(p)
            .map((v) => v.configVersion)
            .filter(Boolean),
        ).size <= 1,
    ),
  );
});
test('aborted overview cannot publish late progress', async () => {
  const stop = new AbortController(),
    progress = [];
  const p = readConfiguredOverview(config, '2026-10-19', '', {
    signal: stop.signal,
    onProgress: (p) => progress.push(p),
    execute: async (_, o) => {
      await new Promise(setImmediate);
      return reply(o.queryId);
    },
  });
  stop.abort();
  await assert.rejects(p, { name: 'AbortError' });
  assert.equal(progress.length, 0);
});

for (const agent of ['qll', 'dealer'])
  test(`${agent}: a slow inventory source does not hold ready cards`, async () => {
    const c = JSON.parse(await readFile(`business/inventory-${agent}/sql.config.json`, 'utf8'));
    const slow = agent === 'qll' ? 'inventory.summary' : 'dealer.stock.summary';
    const ready = agent === 'qll' ? 'orders' : 'customer';
    let finish;
    const progress = [];
    const job = readConfiguredOverview(c, '2026-10-19', '', {
      onProgress: (p) => progress.push(p),
      execute: async (_, o) => {
        if (o.queryId === slow) await new Promise((r) => (finish = r));
        return {
          configVersion: 'v1',
          rows: [
            Object.fromEntries(
              c.queries[o.queryId].resultColumns.map((k) => [k, k === 'day' ? '2026-10-18' : 1]),
            ),
          ],
        };
      },
    });
    await new Promise(setImmediate);
    const early = progress.some((p) => p[ready]?.summary);
    finish();
    const result = await job;
    assert.ok(early);
    assert.equal(result[ready].summary.row_count, 1);
  });

test('complete SQL counts preserve zero and reject incomplete identities or malformed values', () => {
  assert.equal(completeCount({ count: '2770', missing: '0' }, 'count', ['missing']), 2770);
  assert.equal(completeCount({ count: 0, missing: 0 }, 'count', ['missing']), 0);
  for (const source of [
    { count: null, missing: 0 },
    { count: 2, missing: 1 },
    { count: 2 },
    { count: -1, missing: 0 },
    { count: 1.5, missing: 0 },
  ])
    assert.equal(completeCount(source, 'count', ['missing']), null);
});

test('full-chain company view skips customer facts and coalesces identical health summaries per load', async () => {
  const c = JSON.parse(await readFile('business/inventory-qll/sql.config.json', 'utf8'));
  const calls = [];
  const viewIds = c.overviewViewIds.filter(
    (id) => !['channel-overview', 'base-shipments'].includes(id),
  );
  await readConfiguredOverview(c, '2026-10-22', '', {
    viewIds,
    execute: async (_, options) => {
      calls.push(options.queryId);
      return {
        configVersion: 'v1',
        rows: [
          Object.fromEntries(
            c.queries[options.queryId].resultColumns.map((key) => [
              key,
              key === 'day' ? '2026-10-22' : 1,
            ]),
          ),
        ],
      };
    },
  });
  assert.ok(!calls.includes('dealer.stock.summary'));
  assert.ok(!calls.includes('base_shipments.summary'));
  assert.equal(calls.filter((id) => id === 'health.summary').length, 1);
});
