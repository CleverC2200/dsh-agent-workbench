import test from 'node:test';
import assert from 'node:assert/strict';
import { mapCustomerInventoryRows } from '../prototypes/inventory-customer/customer-inventory-model.js';
import { customerSupplementarySummary } from '../prototypes/inventory-customer/supplementary-metrics.js';
test('plan values require complete SKU coverage and preserve zero', () => {
  const base = {
    cust_code: 'A',
    cust_name: '客户A',
    snapshot_date: '2026-10-21',
    sku_rows: 2,
    stock_coverage: 2,
    stock_qty: 20,
    plan_sku_rows: 2,
    monthly_plan_qty: 50,
    monthly_plan_qty_coverage: 1,
    shipped_qty: 0,
    shipped_qty_coverage: 2,
  };
  const row = mapCustomerInventoryRows([base]).rows[0];
  assert.equal(row.monthlyPlanQty, null);
  assert.equal(row.shippedQty, 0);
  assert.equal(row.targetValue, null);
  assert.equal(row.inventoryGap, null);
  const summary = customerSupplementarySummary([row, { monthlyPlanQty: 10, shippedQty: null }]);
  assert.equal(summary[0].value, 10);
  assert.equal(summary[0].coveredCustomers, 1);
  assert.equal(summary[1].value, 0);
});
