import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
const config = JSON.parse(await readFile('business/inventory-aqkc/sql.config.json', 'utf8'));
const out = await build({
  entryPoints: ['business/shared/base-inventory-metrics.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { readBaseInventoryMetrics } = await import(
  'data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64')
);
const fixture = (missingHistory = false) => {
  const calls = [];
  const execute = async (_request, { queryId: id, values }) => {
    calls.push({ id, values });
    const old = String(
      values.as_of ?? values.stock_date ?? values.month ?? values.start,
    ).startsWith('2025');
    let rows;
    if (id === 'calendar.target_versions')
      rows = [
        '2026-03-01',
        '2026-04-01',
        '2025-03-01',
        '2025-04-01',
        '2026-02-01',
        '2026-10-01',
        '2026-11-01',
        '2025-10-01',
        '2025-11-01',
        '2026-09-01',
      ].map((month) => ({ month, inventory_version: '月初' }));
    else if (id === 'calendar.target_versions.count') rows = [{ total: 10 }];
    else if (id === 'source.stock-date')
      rows = missingHistory && old ? [] : [{ day: values.as_of }];
    else if (id.endsWith('_count'))
      rows = [{ total: missingHistory && old ? 0 : id.startsWith('inventory') ? 2 : 1 }];
    else if (id === 'inventory.groups')
      rows = [
        {
          base: '郑州',
          category: '水饺',
          inventory: old ? 60 : 100,
          stock_avg_30d_sale: 10,
          row_count: 1,
        },
        {
          base: '华东',
          category: '水饺',
          inventory: old ? 120 : 200,
          stock_avg_30d_sale: 20,
          row_count: 1,
        },
      ];
    else if (id === 'orders.groups')
      rows = [{ category: '水饺', fulfillment_rate: old ? 0.6 : 0.8, row_count: 2 }];
    else throw Error('Unexpected query: ' + id);
    return {
      rows: rows.map((row) =>
        Object.fromEntries(config.queries[id].resultColumns.map((key) => [key, row[key] ?? null])),
      ),
      returnedColumns: config.queries[id].resultColumns,
      rejectedColumns: [],
      configVersion: 'one-installed-config',
    };
  };
  return { calls, execute };
};
test('base and orchestration reader uses actual three-period facts, weighted turnover and matching cutoffs', async () => {
  const f = fixture();
  const result = await readBaseInventoryMetrics(
    config,
    { asOf: '2026-03-31', compare: true },
    { signal: new AbortController().signal, execute: f.execute },
  );
  assert.equal(
    result.current.inventory.status,
    'available',
    JSON.stringify(result.current.inventory),
  );
  assert.equal(result.current.inventory.rows[0].inventoryQty, 300);
  assert.equal(result.current.inventory.rows[0].turnoverDays, 10);
  assert.equal(result.yearOverYear.inventory.rows[0].turnoverDays, 6);
  assert.equal(result.current.fulfillment.rows[0].fulfillmentRate, 0.8);
  assert.equal(result.yearOverYear.fulfillment.rows[0].fulfillmentRate, 0.6);
  assert.equal(result.monthOverMonth.asOf, '2026-02-28');
  assert.equal(result.monthOverMonth.periodEndExclusive, '2026-03-01');
  assert.ok(
    f.calls
      .filter((call) => call.id.endsWith('.groups'))
      .every((call) => call.values.group_level === 'category'),
  );
});
test('missing history stays unavailable per metric and is not filled from current facts', async () => {
  const f = fixture(true);
  const result = await readBaseInventoryMetrics(
    config,
    { asOf: '2026-10-30', compare: true },
    { signal: new AbortController().signal, execute: f.execute },
  );
  assert.equal(result.current.inventory.status, 'available');
  assert.equal(result.yearOverYear.inventory.status, 'unavailable');
  assert.equal(result.yearOverYear.inventory.reason, 'NO_SNAPSHOT_IN_PERIOD');
  assert.deepEqual(result.yearOverYear.inventory.rows, []);
  assert.equal(result.yearOverYear.fulfillment.status, 'empty');
  assert.deepEqual(result.yearOverYear.fulfillment.rows, []);
});
