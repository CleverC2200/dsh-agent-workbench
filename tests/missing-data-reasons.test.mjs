import test from 'node:test';
import assert from 'node:assert/strict';
import {
  shortageDiagnostics,
  fulfillmentMissingReason,
  quantityMissingReasons,
} from '../prototypes/inventory-orderfulfillment/missing-reasons.mjs';
import { customerMissingReason } from '../prototypes/inventory-customer/missing-reasons.js';
import { JSDOM } from 'jsdom';
import { renderSummaryDetails } from '../prototypes/inventory-orderfulfillment/summary-details.mjs';
const fact = (execution, sku, customer = 'A') => ({
  executeorderno: execution,
  material_code: sku,
  cust_code: customer,
  detailstatus: 10,
  is_stat: '1',
  prapare_order_status: '备单中',
});
const trace = (execution, sku, value, extra = {}) => ({
  execution_order: execution,
  sku,
  customer_code: 'A',
  source_rows: 1,
  final_short_qty: value,
  ...extra,
});
test('shortage gaps distinguish missing values, join mismatch, duplicate keys and real zero', () => {
  const rows = [
    fact('E1', 'M1'),
    fact('E2', 'M1'),
    fact('E3', 'M2'),
    fact('E4', 'M3'),
    fact('E5', 'M4'),
    fact('E6', null),
  ];
  const source = {
    rows: [
      trace('E1', 'M1', 0),
      trace('E2', 'M1', null),
      trace('E4', 'M3', 10, { source_rows: 2 }),
      trace('E5', 'M4', -1),
      trace('OTHER', 'M2', 8),
      trace('E3', 'M2', 8, { customer_code: 'OTHER' }),
    ],
  };
  const result = shortageDiagnostics(rows, source);
  assert.equal(result.covered, 1);
  assert.equal(result.missingValue, 1);
  assert.equal(result.unmatched, 1);
  assert.equal(result.duplicate, 1);
  assert.equal(result.invalid, 1);
  assert.equal(result.missingKey, 1);
  assert.match(result.reason, /源数据未提供/);
  assert.match(result.reason, /系统未匹配/);
  assert.match(result.reason, /系统未能计算/);
  assert.match(shortageDiagnostics(rows, null).reason, /读取/);
  assert.equal(
    shortageDiagnostics([fact('E1', 'M1')], { rows: [trace('E1', 'M1', 0)] }).covered,
    1,
  );
});
test('denial, absent query, absent record and null field are not conflated', () => {
  assert.match(fulfillmentMissingReason('carrier', null, null), /读取/);
  assert.match(fulfillmentMissingReason('carrier', null, { rows: [] }), /未匹配/);
  assert.match(
    fulfillmentMissingReason('carrier', { carrier: null }, { rows: [] }),
    /源数据未提供/,
  );
  assert.match(fulfillmentMissingReason('carrier', {}, { rejectedColumns: ['carrier'] }), /拒绝/);
  assert.match(fulfillmentMissingReason('carrier', {}, { rows: [] }), /接口未返回/);
  assert.match(
    quantityMissingReasons([{ order_qty: 10, pack_unitqty: 5 }]).original_qty,
    /系统未能/,
  );
  assert.match(quantityMissingReasons([{ order_qty: null }]).original_qty, /源数据未提供/);
});
test('customer gaps use source coverage and keep duplicate or zero denominator separate', () => {
  assert.match(
    customerMissingReason({ stockCoverage: 1, skuCount: 2 }, 'quantity'),
    /stock_qty.*1\/2/,
  );
  assert.match(
    customerMissingReason({ duplicateSkuCount: 1, stockCoverage: 1, skuCount: 2 }, 'quantity'),
    /系统未能计算.*重复/,
  );
  assert.match(
    customerMissingReason({ largeDateQty: 0, largeDateQuantity: 0 }, 'normalRatio'),
    /分母/,
  );
  assert.match(
    customerMissingReason({ largeDateFieldCoverage: 0, inventorySkuCount: 2 }, 'largeDateQty'),
    /big_final_qty/,
  );
});
test('final shortage card displays a plain dash with a matched-source explanation', () => {
  const dom = new JSDOM(
    '<section class="summary fulfillment-summary item-summary"><article class="metric"><strong></strong></article><article class="metric"><strong></strong></article></section>',
  );
  const document = dom.window.document;
  renderSummaryDetails(
    document,
    null,
    [fact('E1', 'M1')],
    { start: '2026-10-29', end_exclusive: '2026-10-30' },
    { rows: [trace('E1', 'M1', null)] },
  );
  const target = document.querySelectorAll('.item-summary .metric strong')[1];
  assert.equal(target.textContent, '—');
  assert.match(target.title, /final_short_qty.*源数据未提供/);
  dom.window.close();
});
