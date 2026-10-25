import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeCustomerPlanRows,
  CUSTOMER_PLAN_SQL,
} from '../prototypes/inventory-customer/plan-source.js';
import { mapCustomerInventoryRows } from '../prototypes/inventory-customer/customer-inventory-model.js';

test('customer plan joins by customer and preserves incomplete targets as unknown', () => {
  const row = {
    cust_code: 'A',
    cust_name: '客户A',
    snapshot_date: '2026-10-20',
    sku_rows: 2,
    stock_coverage: 2,
    stock_qty: 20,
  };
  const plan = {
    cust_code: 'A',
    plan_sku_rows: 2,
    target_coverage: 1,
    target_qty: 10,
    standard_coverage: 2,
    minimum_standard_days: 30,
    maximum_standard_days: 60,
  };
  const mapped = mapCustomerInventoryRows(mergeCustomerPlanRows([row], [plan])).rows[0];
  assert.equal(mapped.quantity, 20);
  assert.equal(mapped.targetQty, null);
  assert.equal(mapped.targetTurnover, null);
  plan.target_coverage = 2;
  plan.maximum_standard_days = 30;
  const complete = mapCustomerInventoryRows(mergeCustomerPlanRows([row], [plan])).rows[0];
  assert.equal(complete.targetQty, 10);
  assert.equal(complete.targetTurnover, 30);
  assert.equal(complete.targetValue, null);
  const withTransit = {
    ...plan,
    plan_snapshot_date: '2026-10-20',
    plan_transit_coverage: 2,
    plan_in_transit_qty: 4,
  };
  const sameDate = mapCustomerInventoryRows(mergeCustomerPlanRows([row], [withTransit])).rows[0];
  assert.equal(sameDate.inTransit, 4);
  withTransit.plan_snapshot_date = '2026-10-19';
  assert.equal(
    mapCustomerInventoryRows(mergeCustomerPlanRows([row], [withTransit])).rows[0].inTransit,
    null,
  );
  assert.equal(mergeCustomerPlanRows([row], [])[0].stock_qty, 20);
  assert.match(CUSTOMER_PLAN_SQL, /create_date <= \(SELECT inventory_date FROM snapshot\)/);
  assert.match(CUSTOMER_PLAN_SQL, /COUNT\(\*\) = 1/);
});
