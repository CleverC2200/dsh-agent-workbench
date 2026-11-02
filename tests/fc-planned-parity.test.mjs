import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const built = await build({
  stdin: {
    contents: `export {currentOrderStatus} from './business/inventory-fc/source/fc/src/lib/current-orders.ts';export * from './business/inventory-fc/source/inventory-light-plugins/src/pages/fc-planned-page.ts';export * from './business/inventory-fc/source/inventory-light-plugins/src/pages/fc-list-presentation.ts';export * from './business/inventory-fc/source/inventory-light-plugins/src/pages/fc-workflow.ts';export {inventoryAging} from './business/inventory-fc/source/fc/src/lib/inventory-aging.ts';export {applyBusinessPlanning} from './business/inventory-fc/source/fc/src/lib/planning.ts';`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
const {
  currentOrderStatus,
  projectFcPlannedRows,
  applyFcPlan,
  applyBusinessPlanning,
  fcAgingDisplay,
  inventoryAging,
} = await import(
  'data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64')
);
const source = {
  warehouse_code: '001',
  sku: 'S1',
  material_name: '商品',
  inventory_qty: 50,
  available_qty: 25,
  open_transfer_reported_qty: 40,
  current_order_remaining: 80,
  current_order_shortage: 40,
  calculation_order_remaining: 0,
  current_order_demand: 100,
  month_ship_positive: 30,
  period_current_out: 310,
  period_next_out: 300,
  period_current_transfer: 20,
  period_next_transfer: 30,
  cycle_days: 7,
};
const plan = {
  warehouseCode: '001',
  warehouseName: '分仓',
  sku: 'S1',
  productName: '商品',
  month: '2026-10',
  outboundQty: 310,
  transferQty: 20,
};
const input = {
  asOf: '2026-10-26',
  cycleDays: 7,
  filters: { list_mode: 'all', sort_field: 'recommended_qty', sort_direction: 'desc' },
};
test('forecast and month plans retain original calendar rules while incoming orders remain supply', () => {
  for (const date of ['2026-10-01', '2026-10-26', '2026-10-31', '2024-02-28', '2026-12-31']) {
    const month = date.slice(0, 7);
    const next = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 1))
      .toISOString()
      .slice(0, 7);
    for (const qty of [0, 310, 310.1]) {
      const imports = [
        { ...plan, month, outboundQty: qty },
        { ...plan, month: next, outboundQty: 300, transferQty: 30 },
      ];
      const snapshot = {
        warehouseId: 'warehouse-001',
        warehouseName: '分仓',
        version: 'fixture',
        ruleTrace: {},
        inventory: [],
        operations: [],
        plans: [
          {
            sku: 'S1',
            month,
            currentOutboundQty: qty,
            currentTransferQty: 20,
            nextOutboundQty: 300,
            nextTransferQty: 30,
          },
        ],
        replenishments: [
          {
            sku: 'S1',
            currentAvailableQty: 25,
            inventoryQty: 50,
            currentMonthShippedQty: 30,
            openTransferQty: 40,
            transferredQty: 5,
          },
        ],
        orders: [
          {
            orderNo: 'CE1',
            lines: [{ sku: 'S1', preparingQty: 0, preparingAllocatedQty: 0, shortageQty: 0 }],
          },
        ],
        metrics: {},
        planning: {},
      };
      const original = applyBusinessPlanning(
        snapshot,
        { imports, rules: [], revision: 'test', available: true },
        new Map([['S1', 30]]),
        date,
      ).replenishments[0];
      const actual = applyFcPlan({ ...source, transferred_qty: 5 }, imports, date, 7);
      assert.equal(actual.current_order_shortage, 40);
      for (const [field, old] of [
        ['period_current_daily', 'plannedDailyShipment'],
        ['period_next_daily', 'nextDailyOutboundQty'],
        ['daily_plan', 'forecastDailyShipment'],
        ['target_inventory_qty', 'targetInventoryQty'],
        ['recommended_qty', 'recommendedQty'],
        ['order_adjusted_available_qty', 'orderAdjustedAvailableQty'],
        ['expected_month_end_qty', 'expectedMonthEndInventoryQty'],
        ['period_remaining_out', 'currentRemainingOutboundQty'],
        ['current_remaining_transfer_qty', 'currentRemainingTransferQty'],
        ['forecast_turnover_days', 'forecastTurnoverDays'],
        ['target_gap_qty', 'safetyStockGapQty'],
      ])
        assert.equal(actual[field], original[old], `${date}/${qty}/${field}`);
    }
  }
});
test('manual-plan quick filters and sorting run before slicing the requested ten rows', () => {
  const rows = Array.from({ length: 25 }, (_, i) => ({
    ...source,
    sku: `S${String(i + 1).padStart(2, '0')}`,
    current_order_remaining: 0,
    open_transfer_reported_qty: 0,
    recommended_qty: 0,
  }));
  const plans = rows.map((row, i) => ({ ...plan, sku: row.sku, outboundQty: (i + 1) * 31 }));
  const before = structuredClone(rows);
  const filtered = projectFcPlannedRows(
    rows,
    plans,
    { ...input, filters: { list_mode: 'recommended' } },
    'replenishment',
  );
  assert.equal(filtered.length, 23);
  assert.equal(filtered[0].sku, 'S25');
  assert.equal(filtered.slice(10, 20)[0].sku, 'S15');
  const sorted = projectFcPlannedRows(
    rows,
    plans,
    {
      ...input,
      filters: { list_mode: 'all', sort_field: 'target_inventory_qty', sort_direction: 'asc' },
    },
    'replenishment',
  );
  assert.equal(sorted[0].sku, 'S01');
  assert.equal(sorted.at(-1).target_inventory_qty, 250);
  assert.deepEqual(rows, before);
});
test('whole-month omission never leaks old source values; another warehouse retains its own numbers', () => {
  const rows = projectFcPlannedRows(
    [
      { ...source, sku: 'OMITTED' },
      { ...source, warehouse_code: '002', recommended_qty: 23 },
    ],
    [plan],
    input,
    'replenishment',
  );
  assert.equal(rows.find((row) => row.warehouse_code === '001').period_current_out, null);
  assert.equal(rows.find((row) => row.warehouse_code === '001').recommended_qty, null);
  assert.equal(rows.find((row) => row.warehouse_code === '002').recommended_qty, 23);
});
test('aging suggestions reproduce original rules for 90+, 60+, unknown age, no stock and normal stock', () => {
  for (const [buckets, unknown] of [
    [[0, 0, 0, 2], 0],
    [[0, 0, 3, 0], 0],
    [[1, 0, 0, 0], 4],
    [[0, 0, 0, 0], 0],
    [[5, 0, 0, 0], 0],
  ]) {
    const positive = buckets.reduce((a, b) => a + b, 0) + unknown;
    const original = inventoryAging({
      batches: [],
      batchSummary: {
        positiveQty: positive,
        weightedAge: 0,
        unknownAgeQty: unknown,
        ageBuckets: buckets,
      },
    });
    const row = {
      age0_30: buckets[0],
      age31_60: buckets[1],
      age61_90: buckets[2],
      age90_plus: buckets[3],
      age_weight_qty: positive - unknown,
      unknown_age_qty: unknown,
    };
    assert.equal(fcAgingDisplay(row, 'missing_age_13'), original.suggestion);
  }
  assert.equal(fcAgingDisplay({ age90_plus: null }, 'missing_age_13'), '-');
});

test('current-order labels use the original 20 percent bands and preserve unknowns', () => {
  assert.equal(currentOrderStatus(0, 100), '正常');
  assert.equal(currentOrderStatus(19.99, 100), '临期');
  assert.equal(currentOrderStatus(20, 100), '缺口');
  assert.equal(currentOrderStatus(100, 100), '缺口');
  assert.equal(currentOrderStatus(null, 100), '-');
});
