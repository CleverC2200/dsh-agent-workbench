import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
const output = await build({
  stdin: {
    contents:
      "export {readConfiguredOverview} from './business/shared/configured-overview.ts'; export {inventoryAverageAge} from './business/shared/inventory-age.ts';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { readConfiguredOverview, inventoryAverageAge } = await import(
  'data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].text).toString('base64')
);
const config = JSON.parse(await readFile('business/inventory-fc/sql.config.json', 'utf8'));
const response = (id) => ({
  configVersion: 'v1',
  rows: [
    Object.fromEntries(
      config.queries[id].resultColumns.map((k) => [
        k,
        {
          day: '2026-10-29',
          snapshot_date: '2026-10-29',
          location_type: '分仓',
          row_count: 1,
          total_qty: 100,
          weighted_age_sum: 5000,
          age_weight_qty: 100,
          weighted_age: 50,
          invalid: 0,
        }[k] ?? 1,
      ]),
    ),
  ],
});
test('selected branch overview retains weighted average age through its summary path', async () => {
  const calls = [];
  const result = await readConfiguredOverview(config, '2026-10-29', '', {
    viewIds: ['branch-stock'],
    warehouseCode: 'A020',
    execute: async (_, o) => {
      calls.push(o.queryId);
      return response(o.queryId);
    },
  });
  assert.equal(result['branch-stock'].summary.total_qty, 100);
  assert.equal(inventoryAverageAge(result['branch-stock'].summary), 50, JSON.stringify(calls));
});

test('all branches and a selected branch both use compact summaries and one shared snapshot read', async () => {
  for (const warehouseCode of ['', 'A020']) {
    const calls = [];
    const result = await readConfiguredOverview(config, '2026-10-29', '', {
      viewIds: ['branch-stock'],
      warehouseCode,
      execute: async (request, o) => {
        calls.push({ id: o.queryId, values: o.values });
        return response(o.queryId);
      },
    });
    assert.equal(result['branch-stock'].error, undefined);
    assert.equal(inventoryAverageAge(result['branch-stock'].summary), 50);
    assert.equal(calls.filter((c) => c.id === 'source.branch-stock-date').length, 1);
    assert.ok(!calls.some((c) => ['health.summary', 'overview.quick-stock'].includes(c.id)));
    for (const id of ['health.inventory', 'health.cards']) {
      const value = calls.find((c) => c.id === id).values.warehouse_code;
      assert.equal(value, warehouseCode || null);
    }
  }
});

test('slow or invalid age data cannot hide or replace ready single-warehouse inventory', async () => {
  let failAge;
  const progress = [];
  const pending = readConfiguredOverview(config, '2026-10-29', '', {
    viewIds: ['branch-stock'],
    warehouseCode: 'A020',
    onProgress: (p) => progress.push(p),
    execute: async (_, o) => {
      if (o.queryId === 'health.cards')
        return new Promise((_, reject) => {
          failAge = reject;
        });
      return response(o.queryId);
    },
  });
  await new Promise(setImmediate);
  const early = progress.find((p) => p['branch-stock']?.summary?.total_qty === 100);
  assert.ok(early);
  assert.equal(inventoryAverageAge(early['branch-stock'].summary), null);
  failAge(Error('INVALID_AGE_SOURCE'));
  const result = await pending;
  assert.equal(result['branch-stock'].summary.total_qty, 100);
  assert.equal(result['branch-stock'].error, 'INVALID_AGE_SOURCE');
});
