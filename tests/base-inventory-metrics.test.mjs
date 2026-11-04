import { sourceDetailConfig } from './fixtures/source-detail-config.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
const config = sourceDetailConfig(
  JSON.parse(await readFile('business/inventory-aqkc/sql.config.json', 'utf8')),
);
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
    else if (id.endsWith('_count') || id.endsWith('.count'))
      rows = [
        {
          total:
            missingHistory && old
              ? 0
              : id.includes('inventory') || id === 'page.dashboard-groups.count'
                ? 2
                : 1,
        },
      ];
    else if (id === 'inventory.groups' || id === 'page.dashboard-groups')
      rows = [
        {
          base: '郑州',
          category: '水饺',
          inventory: old ? 60 : 100,
          stock_avg_30d_sale: 10,
          inventory_valid: old ? 60 : 100,
          inventory_valid_count: 1,
          stock_avg_30d_sale_valid: 10,
          stock_avg_30d_sale_valid_count: 1,
          row_count: 1,
        },
        {
          base: '华东',
          category: '水饺',
          inventory: old ? 120 : 200,
          stock_avg_30d_sale: 20,
          inventory_valid: old ? 120 : 200,
          inventory_valid_count: 1,
          stock_avg_30d_sale_valid: 20,
          stock_avg_30d_sale_valid_count: 1,
          row_count: 1,
        },
      ];
    else if (id === 'orders.groups')
      rows = [
        {
          category: '水饺',
          fulfillment_rate: old ? 0.6 : 0.8,
          fulfilled_shipped_quantity: old ? 60 : 80,
          fulfillment_order_quantity: 100,
          row_count: 2,
        },
      ];
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
      .every((call) => call.values.group_level === 'base_category'),
  );
});

test('page stock-only facts survive legacy null groups and turnover uses a matched valid scope', async () => {
  const f = fixture();
  const result = await readBaseInventoryMetrics(
    config,
    { asOf: '2026-03-31', compare: false },
    {
      signal: new AbortController().signal,
      execute: async (request, call) => {
        if (call.queryId === 'inventory.groups_count')
          return { rows: [{ total: 1 }], configVersion: 'one-installed-config' };
        if (call.queryId === 'page.dashboard-groups.count')
          return { rows: [{ total: 2 }], configVersion: 'one-installed-config' };
        if (call.queryId === 'inventory.groups')
          return {
            rows: [
              { base: '郑州', category: '水饺', inventory: null, stock_avg_30d_sale: null },
            ].map((row) =>
              Object.fromEntries(
                config.queries[call.queryId].resultColumns.map((key) => [key, row[key] ?? null]),
              ),
            ),
            configVersion: 'one-installed-config',
          };
        if (call.queryId === 'page.dashboard-groups')
          return {
            rows: [
              {
                base: '郑州',
                category: '水饺',
                inventory_valid: 300,
                inventory_valid_count: 2,
                stock_avg_30d_sale_valid: 30,
                stock_avg_30d_sale_valid_count: 2,
              },
              {
                base: '华东',
                category: '水饺',
                inventory_valid: 0,
                inventory_valid_count: 0,
                stock_avg_30d_sale_valid: 100,
                stock_avg_30d_sale_valid_count: 1,
              },
            ].map((row) =>
              Object.fromEntries(
                config.queries[call.queryId].resultColumns.map((key) => [key, row[key] ?? null]),
              ),
            ),
            configVersion: 'one-installed-config',
          };
        return f.execute(request, call);
      },
    },
  );
  assert.equal(result.current.inventory.status, 'available');
  const row = result.current.inventory.rows[0];
  assert.equal(row.inventoryQty, 300);
  assert.equal(row.dailyShipment30Qty, 130);
  assert.equal(row.turnoverInventoryQty, 300);
  assert.equal(row.turnoverDailyShipment30Qty, 30);
  assert.equal(row.turnoverDays, 10);
  assert.equal(row.excludedTurnoverGroups, 1);
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

test('known inventory and movement remain comparable when the target calendar is unavailable', async () => {
  const f = fixture();
  const result = await readBaseInventoryMetrics(
    config,
    { asOf: '2026-03-31', compare: true },
    {
      signal: new AbortController().signal,
      execute: (request, call) => {
        if (call.queryId.startsWith('calendar.target_versions'))
          throw Object.assign(Error('No target calendar in this scope'), {
            code: 'ROW_SCOPE_DENIED',
          });
        return f.execute(request, call);
      },
    },
  );
  assert.equal(result.current.inventory.status, 'available');
  assert.equal(result.current.inventory.rows[0].turnoverDays, 10);
  assert.equal(result.yearOverYear.inventory.status, 'available');
  assert.equal(result.yearOverYear.inventory.rows[0].turnoverDays, 6);
  assert.equal(result.current.fulfillment.rows[0].fulfillmentRate, 0.8);
});

test('category fulfillment combines source numerators and denominators across pickup groups', async () => {
  const f = fixture();
  const result = await readBaseInventoryMetrics(
    config,
    { asOf: '2026-03-31', compare: false },
    {
      signal: new AbortController().signal,
      execute: async (request, call) => {
        if (call.queryId === 'orders.groups_count')
          return { rows: [{ total: 2 }], configVersion: 'one-installed-config' };
        if (call.queryId !== 'orders.groups') return f.execute(request, call);
        return {
          rows: [
            { base: '郑州', pickup_code: 'X', numerator: 100, denominator: 100 },
            { base: '华南', pickup_code: 'Y', numerator: 450, denominator: 900 },
          ].map((row) =>
            Object.fromEntries(
              config.queries[call.queryId].resultColumns.map((key) => [
                key,
                {
                  base: call.values.group_level === 'base_category' ? row.base : null,
                  category: '水饺',
                  pickup_type: call.values.group_level === 'base_category' ? null : '工厂',
                  pickup_code: call.values.group_level === 'base_category' ? null : row.pickup_code,
                  fulfillment_rate: row.numerator / row.denominator,
                  fulfilled_shipped_quantity: row.numerator,
                  fulfillment_order_quantity: row.denominator,
                }[key] ?? null,
              ]),
            ),
          ),
          configVersion: 'one-installed-config',
        };
      },
    },
  );
  assert.equal(result.current.fulfillment.status, 'available');
  assert.equal(result.current.fulfillment.rows.length, 1);
  assert.equal(result.current.fulfillment.rows[0].fulfilledShippedQuantity, 550);
  assert.equal(result.current.fulfillment.rows[0].shippedOrderQuantity, 1000);
  assert.equal(result.current.fulfillment.rows[0].fulfillmentRate, 0.55);
});
