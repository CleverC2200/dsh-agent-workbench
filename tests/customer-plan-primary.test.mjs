import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  mapCustomerInventoryRows,
  summarizeCustomerInventory,
} from '../prototypes/inventory-customer/customer-inventory-model.js';
import { customerSupplementaryRows } from '../prototypes/inventory-customer/supplementary-metrics.js';
import {
  customerSourceDateLabel,
  customerSourceDetailLabel,
} from '../prototypes/inventory-customer/source-labels.js';
import { mergeCustomerPlanRows } from '../prototypes/inventory-customer/plan-source.js';

const raw = {
  snapshot_date: '2026-10-28',
  inventory_snapshot_date: '2026-10-28',
  organization_snapshot_date: '2026-10-26',
  cust_code: '10155031',
  cust_name: '广东博粤贸易有限公司',
  sku_rows: 75,
  stock_qty: 17,
  stock_coverage: 75,
  in_transit_qty: 478,
  transit_coverage: 28,
  sales_qty_30days: 41.97,
  sales_coverage: 75,
  stock_amt: 1190,
  value_coverage: 75,
  inventory_sku_rows: 75,
  large_date_qty: null,
  large_date_coverage: 0,
  large_date_stock_qty: 17,
};
test('all indicators use the same new snapshot without filling missing large-date values', () => {
  const inventory = mapCustomerInventoryRows([raw]),
    row = inventory.rows[0];
  assert.equal(inventory.snapshot, '2026-10-28');
  assert.equal(inventory.inventorySnapshot, '2026-10-28');
  assert.equal(row.skuCount, 75);
  assert.equal(row.quantity, 17);
  assert.equal(row.inTransit, null);
  assert.equal(row.inTransitKnownQty, 478);
  assert.equal(row.inTransitCoverage, 28);
  assert.equal(row.value, 0.119);
  assert.equal(row.largeDateQty, null);
  assert.equal(row.normalRatio, null);
  assert.equal(row.inventorySkuCount, 75);
  assert.equal(row.turnoverEstimated, true);
  const transit = customerSupplementaryRows(row).find((row) => row.key === 'inTransit');
  assert.equal(transit.value, null);
  assert.match(transit.note, /478.*非全量/);
  assert.match(customerSourceDateLabel(inventory), /2026-10-28.*2026-10-26/);
  assert.match(customerSourceDetailLabel(row), /2026-10-26/);
  assert.match(customerSourceDetailLabel(row), /计划表 75/);
});
test('large-date ratios use the supplementary same-day stock, not current plan stock', () => {
  const row = mapCustomerInventoryRows([
    {
      ...raw,
      sku_rows: 1,
      stock_qty: 100,
      stock_coverage: 1,
      transit_coverage: 1,
      in_transit_qty: 0,
      sales_qty_30days: 30,
      sales_coverage: 1,
      large_date_qty: 2,
      large_date_coverage: 1,
      inventory_sku_rows: 1,
      large_date_stock_qty: 10,
    },
  ]).rows[0];
  assert.equal(row.quantity, 100);
  assert.equal(row.largeDateRatio, 20);
  assert.equal(row.normalRatio, 80);
  assert.equal(row.turnover, 100);
  assert.equal(summarizeCustomerInventory([row]).largeDateRatio, 20);
  const oldNegativeValue = { ...row, value: -5 };
  assert.equal(
    summarizeCustomerInventory([oldNegativeValue]).turnover,
    100,
    'an old inventory valuation cannot invalidate the independent current plan turnover',
  );
});
test('new plan-only customers remain visible without invented original inventory', () => {
  const row = mapCustomerInventoryRows([
    {
      ...raw,
      cust_code: 'NEW',
      sku_rows: 1,
      stock_qty: null,
      stock_coverage: 0,
      in_transit_qty: null,
      transit_coverage: 0,
      value_coverage: 0,
      large_date_coverage: 0,
      inventory_sku_rows: null,
    },
  ]).rows[0];
  assert.equal(row.code, 'NEW');
  for (const field of ['quantity', 'inTransit', 'value', 'largeDateQty'])
    assert.equal(row[field], null);
  assert.throws(
    () =>
      mergeCustomerPlanRows(
        [raw],
        [{ cust_code: raw.cust_code, plan_snapshot_date: '2026-10-29' }],
      ),
    /SNAPSHOT_CHANGED/,
  );
});
test('queries start from the latest plan keys and never coalesce missing business values', async () => {
  const sql = await readFile(
    new URL('../prototypes/inventory-customer/data-source.js', import.meta.url),
    'utf8',
  );
  assert.match(sql, /LEFT JOIN inventory_customer i ON i.cust_code = inventory.cust_code/);
  assert.doesNotMatch(sql, /LEFT JOIN inventory_sku i ON/);
  assert.match(sql, /MAX\(p.stock_qty \* p.cif_price\)/);
  assert.match(sql, /MAX\(p.big_final_qty\)/);
  assert.match(sql, /large_date_qty, large_date_invalid_sku\s+FROM plan_sku/);
  assert.match(sql, /MAX\(create_date\).*agents_scm_cust_plan_order_analysis_d/);
  assert.match(sql, /MAX\(p.daily_sales\) \* 30/);
  assert.doesNotMatch(sql, /COALESCE\(|IFNULL\(/i);
});

test('partial large-date quantities display known totals and freshness as an explicit upper bound', () => {
  const row = mapCustomerInventoryRows([
    {
      ...raw,
      sku_rows: 367,
      inventory_sku_rows: 367,
      stock_qty: 88292,
      stock_coverage: 367,
      large_date_stock_qty: 88292,
      large_date_qty: 8636,
      large_date_coverage: 53,
    },
  ]).rows[0];
  assert.equal(row.largeDateQty, 8636);
  assert.equal(row.largeDatePartial, true);
  assert.equal(row.freshnessEstimated, true);
  assert.ok(Math.abs(row.normalRatio - 90.21881937) < 0.0001);
  assert.match(row.largeDateMessage, /53\/367/);
  assert.equal(summarizeCustomerInventory([row]).freshnessEstimated, true);
});

test('original inventory retains more SKUs than the plan without multiplying its aggregates', () => {
  const row = mapCustomerInventoryRows([
    {
      ...raw,
      sku_rows: 1,
      stock_qty: 900,
      stock_coverage: 1,
      inventory_sku_rows: 3,
      stock_amt: 2000,
      value_coverage: 3,
      large_date_qty: 20,
      large_date_coverage: 3,
      large_date_stock_qty: 100,
    },
  ]).rows[0];
  assert.equal(row.quantity, 900);
  assert.equal(row.value, 0.2);
  assert.equal(row.largeDateRatio, 20);
  assert.equal(row.normalRatio, 80);
  const incomplete = mapCustomerInventoryRows([
    { ...raw, value_coverage: 7, large_date_coverage: 7 },
  ]).rows[0];
  assert.equal(incomplete.value, null);
  assert.equal(incomplete.largeDateQty, null);
});
