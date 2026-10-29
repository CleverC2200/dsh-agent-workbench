import test from 'node:test';
import assert from 'node:assert/strict';
import { CUSTOMER_MANAGER_SQL, mergeCustomerManagers } from '../prototypes/inventory-customer/manager-source.js';
import { mapCustomerInventoryRows } from '../prototypes/inventory-customer/customer-inventory-model.js';

test('customer manager joins by code, preserving missing and conflicting identities', () => {
  const rows = ['A', 'B', 'C', 'D'].map(code => ({ cust_code: code, cust_name: code, snapshot_date: '2026-10-29' }));
  const result = mapCustomerInventoryRows(mergeCustomerManagers(rows, [
    { cust_code: 'A', customer_manager: '张三', manager_snapshot: '2026-10-29 15:00:00' },
    { cust_code: 'B', customer_manager: ' ' },
    { cust_code: 'C', customer_manager: '李四' },
    { cust_code: 'C', customer_manager: '王五' },
    { cust_code: 'outside', customer_manager: '范围外' },
  ])).rows;
  assert.deepEqual(result.map(row => row.manager), ['张三', '—', '—', '—']);
  assert.equal(result[0].managerSnapshot, '2026-10-29 15:00:00');
  assert.equal(result.length, rows.length);
  assert.match(CUSTOMER_MANAGER_SQL, /COUNT\(DISTINCT NULLIF\(TRIM\(e.sales_person\)/);
  assert.match(CUSTOMER_MANAGER_SQL, /p.cust_code = e.cust_code/);
});
