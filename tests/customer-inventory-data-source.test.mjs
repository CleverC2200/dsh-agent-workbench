import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  mapCustomerInventoryRows,
  parseDeliveryCities,
  summarizeCustomerInventory,
} from '../prototypes/inventory-customer/customer-inventory-model.js';

const source = await readFile(
  new URL('../prototypes/inventory-customer/data-source.js', import.meta.url),
  'utf8',
);

test('negative customer inventory preserves book balances without negative turnover or partial freshness', () => {
  const input = {
    snapshot_date: '2026-10-17',
    cust_code: 'C1',
    cust_name: '负库存客户',
    stock_qty: -100,
    stock_amt: -20000,
    sales_qty_30days: 30,
    normal_stock_qty: -100,
    sku_rows: 1,
    stock_coverage: 1,
    value_coverage: 1,
    sales_coverage: 1,
    normal_coverage: 1,
  };
  const negative = mapCustomerInventoryRows([input]).rows[0];
  assert.equal(negative.quantity, -100);
  assert.equal(negative.value, -2);
  assert.equal(negative.turnover, null);
  const summary = summarizeCustomerInventory([
    negative,
    { ...negative, quantity: 50, value: 1, normalRatio: 100 },
  ]);
  assert.equal(summary.quantity, -50);
  assert.equal(summary.anomalous, true);
  assert.equal(summary.turnover, null);
  assert.equal(summary.normalRatio, null);
  assert.equal(summary.targetValue, null);
  assert.equal(summary.largeDateQty, null);
});

test('customer summary preserves missing coverage and weights valid normal stock', () => {
  const row = {
    quantity: 100,
    value: 1,
    sales30: 50,
    normalRatio: 80,
    targetQty: null,
    targetValue: null,
  };
  const summary = summarizeCustomerInventory([row, { ...row, quantity: 300, normalRatio: 100 }]);
  assert.equal(summary.normalRatio, 95);
  assert.equal(summary.turnover, 120);
  const partial = summarizeCustomerInventory([row, { ...row, quantity: null }]);
  assert.equal(partial.quantity, 100);
  assert.equal(partial.missingQuantityCount, 1);
  assert.equal(summarizeCustomerInventory([]).totalValue, null);
});

test('headquarters retains totals when an individual customer is negative or missing', () => {
  const row = { quantity: 200, value: 4, sales30: 100, normalRatio: 100 };
  const result = summarizeCustomerInventory([
    row,
    { ...row, quantity: -20, value: -1, normalRatio: null },
    { ...row, quantity: null, value: null, sales30: null, normalRatio: null },
  ]);
  assert.equal(result.quantity, 180);
  assert.equal(result.totalValue, 3);
  assert.equal(result.anomalous, false);
  assert.equal(result.abnormalCustomerCount, 1);
  assert.equal(result.normalRatio, 100);
  assert.equal(result.turnover, 27);
});
const application = await readFile(
  new URL('../prototypes/inventory-customer/application.js', import.meta.url),
  'utf8',
);

test('customer inventory maps complete source facts and explicit derived metrics', () => {
  const result = mapCustomerInventoryRows([
    {
      snapshot_date: '2026-10-17',
      cust_code: 'C1',
      cust_name: '客户一',
      region_name: '华中',
      province_name: '河南',
      stock_qty: '300',
      stock_amt: '60000',
      sales_qty_30days: '150',
      normal_stock_qty: '270',
      no_sales_sku: '2',
      sku_rows: '3',
      stock_coverage: '3',
      value_coverage: '3',
      sales_coverage: '3',
      normal_coverage: '3',
      dealer_receive_addr: JSON.stringify([
        { cust_name: '客户一（郑州市金水区）卸货地' },
        { cust_name: '客户一（洛阳市涧西区）卸货地' },
        { cust_name: '客户一（郑州市二七区）卸货地' },
      ]),
    },
  ]);
  assert.equal(result.snapshot, '2026-10-17');
  assert.deepEqual(
    {
      quantity: result.rows[0].quantity,
      value: result.rows[0].value,
      targetValue: result.rows[0].targetValue,
      targetQty: result.rows[0].targetQty,
      normalRatio: result.rows[0].normalRatio,
      turnover: result.rows[0].turnover,
    },
    { quantity: 300, value: 6, targetValue: null, targetQty: null, normalRatio: 90, turnover: 60 },
  );
  assert.equal(result.rows[0].largeDateQty, null);
  assert.equal(result.rows[0].structureScore, null);
  assert.deepEqual(result.rows[0].cities, ['洛阳市', '郑州市']);
});

test('delivery-city parsing preserves multi-city membership and rejects malformed values', () => {
  assert.deepEqual(parseDeliveryCities('not-json'), []);
  assert.deepEqual(
    parseDeliveryCities(JSON.stringify([{ cust_name: '客户（南充市西充县）卸货地' }])),
    ['南充市'],
  );
});

test('customer inventory keeps incomplete coverage unknown instead of filling zero', () => {
  const result = mapCustomerInventoryRows([
    {
      snapshot_date: '2026-10-17',
      cust_code: 'C1',
      cust_name: '客户一',
      stock_qty: '10',
      stock_amt: '20',
      sales_qty_30days: '0',
      normal_stock_qty: '8',
      no_sales_sku: '1',
      sku_rows: '2',
      stock_coverage: '1',
      value_coverage: '2',
      sales_coverage: '1',
      normal_coverage: '2',
    },
  ]);
  assert.equal(result.rows[0].quantity, null);
  assert.equal(result.rows[0].sales30, null);
  assert.equal(result.rows[0].turnover, null);
  assert.equal(result.rows[0].targetValue, null);
});

test('customer inventory SQL is fixed to the granted latest snapshot table', () => {
  assert.match(source, /FROM agents_scm_cust_jxc_ai_daliy_d/);
  assert.match(source, /agents_dim_dealer_data_d/);
  assert.match(source, /SELECT MAX\(stat_date\)/);
  assert.doesNotMatch(source, /\+\s*request|INSERT|UPDATE|DELETE/i);
});

test('customer inventory role views use live hierarchy and expose unavailable sales scope', () => {
  assert.ok(application.includes('\\u6A21\\u62DF\\u67E5\\u770B\\u89D2\\u8272'));
  assert.match(application, /r==="sales"\)return\[\]/);
  assert.ok(
    application.includes(
      '\\u9500\\u552E\\u4EE3\\u8868\\u5BA2\\u6237\\u5F52\\u5C5E\\u5F85\\u63A5\\u5165',
    ),
  );
  assert.doesNotMatch(application, /MJ=\{hq:/);
  assert.doesNotMatch(application, /N\.manager!=="\\u5F20\\u65E0\\u5FCC"/);
});
