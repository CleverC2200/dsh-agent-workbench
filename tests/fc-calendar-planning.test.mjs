import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { resolve } from 'node:path';

const ui = 'business/inventory-fc/source/inventory-light-plugins/src';
const output = await build({
  stdin: {
    contents: `
      export { readWarehouseFacts } from './${ui}/warehouse-input.ts';
      export { applyBusinessPlanning } from './business/inventory-fc/source/fc/src/lib/planning.ts';
      export { forecastCoverage } from './${ui}/fc-feedback.ts';
      export { createFcDatabase } from './${ui}/fc-transfer.ts';
      export { database, clearReadCache, EMPTY_PLANNING } from './${ui}/data.ts';
      export { setSqlFixture } from 'calendar-sql-fixture';
    `,
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  define: { DSH_COLUMNAR_SQL: 'false', DSH_GOVERNED_SQL: 'false' },
  plugins: [
    {
      name: 'page-database-with-fixture-transport',
      setup(api) {
        api.onResolve(
          {
            filter: /(^|\/)(database|business-database|gea-sql|planning-store)(\.ts)?$/,
          },
          () => ({ path: resolve(ui, 'data.ts') }),
        );
        api.onResolve({ filter: /channel\.js$|^calendar-sql-fixture$/ }, () => ({
          path: 'sql-fixture',
          namespace: 'fixture',
        }));
        api.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
          contents: `let query;
          export const setSqlFixture = value => { query = value; };
          export const call = (method, input) => {
            if (method !== 'sql') throw Error('Unexpected operation: ' + method);
            return query(input);
          };`,
        }));
      },
    },
  ],
});
const {
  readWarehouseFacts,
  applyBusinessPlanning,
  forecastCoverage,
  createFcDatabase,
  database,
  clearReadCache,
  EMPTY_PLANNING,
  setSqlFixture,
} = await import(
  'data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].text).toString('base64')
);
const stock = [
  {
    material_code: 'FC001',
    material_name: '常温奶',
    product_categ_name: '常温',
    live_qty: 120,
    available_qty: 100,
  },
  {
    material_code: 'FC002',
    material_name: '酸奶',
    product_categ_name: '低温',
    live_qty: 40,
    available_qty: 30,
  },
];

async function readPlan(months, now = '2026-09-29T01:00:00Z', planOverrides = {}) {
  clearReadCache();
  setSqlFixture(async ({ sql }) => {
    let rows;
    if (sql.includes('warehouse_catalog:plans'))
      rows = [{ branch_pickup_point: '06', branch_name: '长沙分仓' }];
    else if (sql.includes('warehouse_catalog:inventory'))
      rows = [{ pickup_code: '06', warehouseid: 'FC06', warehouse_name: '长沙分仓' }];
    else if (sql.includes('p.plan_snapshot_date::text AS plan_snapshot_date'))
      rows = months.flatMap(([target_month, shipment_plan_qty]) =>
        stock.map((row) => ({
          ...row,
          plan_snapshot_date: '2026-09-29',
          target_month,
          plan_version: 'MONTH_START',
          plan_status: 'READY',
          bi_target_status: 'READY',
          current_inventory_qty: row.live_qty,
          replenishment_cycle_days: 7,
          shipment_plan_qty,
          transfer_plan_qty: 0,
          expected_month_end_inventory_qty: 100,
          ...planOverrides,
        })),
      );
    else if (sql.includes('i.prod_date::text AS prod_date'))
      rows = stock.map((row) => ({ ...row, snapshot_date: '2026-09-29', prod_date: '2026-09-01' }));
    else if (sql.includes('AS material_group'))
      rows = stock.map((row) => ({
        sku: row.material_code,
        product_name: row.material_name,
        category: row.product_categ_name,
        material_group: '测试产品',
      }));
    else if (sql.includes('AS shipped_qty') && sql.includes('material_code AS sku'))
      rows = stock.map((row) => ({ sku: row.material_code, shipped_qty: 20 }));
    else if (sql.includes('agents_scm_branch_') || sql.includes('agents_scm_order_fulfillment'))
      rows = [];
    else throw Error('Unexpected fixture SQL: ' + sql);
    if (sql.includes('dsh_packet_source') && rows.length) {
      const encoded = sql.match(/'(\[[^']+\])'::text AS dsh_columns/)?.[1];
      const columns = encoded && JSON.parse(encoded);
      rows = [
        {
          dsh_packet: 0,
          dsh_count: rows.length,
          ...(columns ? { dsh_columns: encoded } : {}),
          dsh_rows: JSON.stringify(
            columns ? rows.map((row) => columns.map((c) => row[c] ?? null)) : rows,
          ),
        },
      ];
    }
    return { rows, total: rows.length };
  });
  const facts = await readWarehouseFacts(createFcDatabase(database), 'changsha', new Date(now));
  const snapshot = applyBusinessPlanning(
    facts.base,
    EMPTY_PLANNING,
    facts.shipped,
    facts.calculationDate,
  );
  return { snapshot, coverage: forecastCoverage(snapshot) };
}

test('a missing next calendar month stays unknown without reusing the current plan', async () => {
  const { snapshot, coverage } = await readPlan([['2026-09-01', 300]]);
  assert.equal(snapshot.metrics.inventoryQty, 130);
  assert.equal(coverage.value, null);
  assert.equal(snapshot.plans.length, 2);
  assert.equal(snapshot.replenishments.length, 2);
  for (const row of snapshot.replenishments) {
    assert.equal(row.currentOutboundQty, 300);
    assert.equal(row.nextOutboundQty, null);
    assert.equal(row.forecastDailyShipment, null);
  }
  assert.ok(snapshot.plans.every((row) => row.nextAvailable === false));
});

test('distinct current and next plans retain their own quantities and forecast', async () => {
  const { snapshot, coverage } = await readPlan([
    ['2026-09-01', 300],
    ['2026-10-01', 620],
  ]);
  assert.equal(coverage.value, 4);
  for (const row of snapshot.replenishments) {
    assert.equal(row.currentOutboundQty, 300);
    assert.equal(row.nextOutboundQty, 620);
    assert.equal(row.forecastDailyShipment, 20);
  }
});

test('a later plan cannot replace a missing next calendar month', async () => {
  const { snapshot, coverage } = await readPlan([
    ['2026-09-01', 300],
    ['2026-11-01', 600],
  ]);
  assert.equal(coverage.value, null);
  assert.equal(snapshot.plans.length, 2);
  assert.equal(snapshot.replenishments.length, 2);
  assert.ok(snapshot.plans.every((row) => row.nextAvailable === false));
  assert.ok(snapshot.replenishments.every((row) => row.nextOutboundQty === null));
});

test('historical months do not displace the current and next plans', async () => {
  const { snapshot, coverage } = await readPlan(
    [
      ['2026-09-01', 300],
      ['2026-10-01', 310],
      ['2026-11-01', 600],
    ],
    '2026-10-10T03:20:00Z',
  );
  assert.equal(coverage.value, 6.153846153846154);
  for (const row of snapshot.replenishments) {
    assert.equal(row.currentOutboundQty, 310);
    assert.equal(row.nextOutboundQty, 600);
  }
  assert.ok(snapshot.plans.every((row) => row.month === '2026-10' && row.nextAvailable));
});

test('stock stays visible when only historical and future plans exist', async () => {
  const { snapshot, coverage } = await readPlan(
    [
      ['2026-09-01', 300],
      ['2026-11-01', 600],
    ],
    '2026-10-10T03:20:00Z',
  );
  assert.equal(snapshot.metrics.inventoryQty, 130);
  assert.deepEqual(
    snapshot.inventory.map((row) => [row.sku, row.availableQty]),
    [
      ['FC001', 100],
      ['FC002', 30],
    ],
  );
  assert.deepEqual(snapshot.plans, []);
  assert.deepEqual(snapshot.replenishments, []);
  assert.equal(coverage.value, null);
  assert.equal(coverage.known, 0);
});

test('December and January plans remain separate across the natural year boundary', async () => {
  const { snapshot, coverage } = await readPlan(
    [
      ['2026-11-01', 600],
      ['2026-12-01', 310],
      ['2027-01-01', 620],
    ],
    '2026-12-29T01:00:00Z',
  );
  assert.equal(coverage.value, 4);
  assert.ok(snapshot.plans.every((row) => row.month === '2026-12' && row.nextAvailable));
  for (const row of snapshot.replenishments) {
    assert.equal(row.currentOutboundQty, 310);
    assert.equal(row.nextOutboundQty, 620);
  }
});

test('Shanghai midnight selects the new month without using yesterday as the calculation month', async () => {
  const { snapshot, coverage } = await readPlan([['2026-12-01', 310]], '2026-12-31T16:00:00Z');
  assert.equal(snapshot.planning.calculationDate, '2027-01-01');
  assert.equal(snapshot.metrics.inventoryQty, 130);
  assert.deepEqual(snapshot.plans, []);
  assert.equal(coverage.value, null);
});

test('a plan package without month identity still rejects rather than hiding invalid data', async () => {
  await assert.rejects(readPlan([['', 300]]), /最新计划缺少月份或 SKU/);
});

test('a plan package without SKU identity still rejects rather than creating an empty SKU', async () => {
  await assert.rejects(
    readPlan([['2026-09-01', 300]], undefined, { material_code: '' }),
    /最新计划缺少月份或 SKU/,
  );
});
