import test from 'node:test';
import assert from 'node:assert/strict';
import { salesConfirmationCard } from '../prototypes/inventory-orderfulfillment/sales-confirmation-card.mjs';

const statuses = [
  'missing_or_expired',
  'PRICE_CONTEXT_QUERY_UNAVAILABLE',
  'PRICE_CONTEXT_NOT_VISIBLE_OR_MISSING',
  'PRICE_CONTEXT_CONFLICTING',
  'PRICE_CONTEXT_SCOPE_MISMATCH',
  'PRICE_CONTEXT_MISSING',
  'PRICE_CONTEXT_MISSING_OR_CONFLICTING',
  'PICKUP_POINT_INACTIVE',
  'PRICE_CONFLICT',
  'SAP_PRICE_CUSTOMER_BLOCKED',
  'SAP_PRICE_REJECTED',
  'SAP_PRICE_TIMEOUT',
  'SAP_PRICE_CONNECTION_FAILED',
  'SAP_PRICE_HTTP_ERROR',
  'SAP_PRICE_RESPONSE_INVALID',
  'SAP_PRICE_SCOPE_MISMATCH',
  'SAP_PRICE_INTERRUPTED',
  'PRICE_CONDITIONS_UNSUPPORTED',
  'PRICE_MISSING',
  'LINES_UNAVAILABLE',
  'UNKNOWN_PRICE_FAILURE',
];
const card = (input = {}) =>
  salesConfirmationCard({ orderNo: 'S1', rate: 95, priceStatus: 'READY', lines: [], ...input });
const text = (input) => card(input).body.elements[0].text.content;

for (const status of statuses)
  test('price issue includes only affected SKU and preserves reason: ' + status, () => {
    const output = text({
      priceStatus: status,
      notice: '实际异常原因：' + status,
      lines: [
        { sku: '10000362', priceStatus: status },
        { sku: 'NORMAL', priceStatus: 'READY', unitPrice: 128 },
        { sku: '10000362', priceStatus: status },
      ],
    });
    assert.match(output, /SKU：10000362/);
    assert.ok(output.includes('实际异常原因：' + status));
    assert.equal(output.split('SKU：10000362').length - 1, 1);
    assert.ok(!output.includes('NORMAL'));
  });
test('line failure overrides a stale READY order flag', () => {
  const output = text({ lines: [{ sku: 'TIMEOUT', priceStatus: 'SAP_PRICE_TIMEOUT' }] });
  assert.match(output, /查价超时/);
  assert.match(output, /SKU：TIMEOUT/);
});
test('order-only price failure labels related SKU as unconfirmed', () => {
  const output = text({
    priceStatus: 'SAP_PRICE_REJECTED',
    lines: [{ sku: 'A', priceStatus: 'READY', unitPrice: 128 }],
  });
  assert.match(output, /待核实SKU：A/);
  assert.ok(!output.includes('没价格'));
});
test('missing SKU and overflow are explicit, never invented', () => {
  const output = text({
    priceStatus: 'PRICE_MISSING',
    lines: [
      ...Array.from({ length: 7 }, (_, i) => ({ sku: 'SKU' + i, priceStatus: 'PRICE_MISSING' })),
      { priceStatus: 'PRICE_MISSING' },
    ],
  });
  assert.match(output, /SKU：SKU4/);
  assert.ok(!output.includes('SKU：SKU5'));
  assert.match(output, /其余涉及商品/);
  assert.match(output, /SKU未完整提供/);
});
test('OMS failure before recheck and concurrent credit issue retain SKU', () => {
  const output = text({
    omsEventType: 'PRICE_CHECK_FAILED',
    credit: { status: 'insufficient', shortfall: 200 },
    lines: [{ sku: 'A', priceStatus: 'READY', unitPrice: 128 }],
  });
  assert.match(output, /信用额度/);
  assert.match(output, /OMS提示商品价格校验未通过/);
  assert.match(output, /待核实SKU：A/);
});
test('healthy cards stay concise', () => {
  const output = text({ lines: [{ sku: 'NORMAL', priceStatus: 'READY', unitPrice: 128 }] });
  assert.ok(!output.includes('SKU：'));
});
