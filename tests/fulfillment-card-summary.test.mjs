import test from 'node:test';
import assert from 'node:assert/strict';
import { salesConfirmationCard } from '../prototypes/inventory-orderfulfillment/sales-confirmation-card.mjs';
import { salesConfirmationCard as packagedCard } from '../lib/business/inventory-orderfulfillment/sales-window/card.mjs';

test('order cards stay concise when the snapshot includes product trading rules', () => {
  const lines = Array.from({ length: 19 }, (_, index) => ({
    sku: `PRODUCT-${index}`,
    name: `商品明细-${index}`,
    quantity: 100,
    rawShortage: 0,
    unitPrice: 15.5,
    minimumOrderQuantity: 5,
    orderMultiple: 42,
  }));
  const options = {
    mentionOpenId: 'ou_sales',
    entryUrl: 'https://gea.example/window/task?reference=order',
  };
  for (const rate of [100, 70, null]) {
    const draft = {
      executionOrderNo: 'EXEC-1',
      dmsOrderNo: 'DMS-1',
      customer: '验收客户',
      rate,
      quantity: '1,900 箱',
      lines,
    };
    const before = structuredClone(draft);
    const card = salesConfirmationCard(draft, options);
    assert.deepEqual(packagedCard(draft, options), card);
    const text = JSON.stringify(card);
    for (const label of ['EXEC-1', 'DMS-1', '验收客户', '订单满足率', '1,900 箱', '订单处理'])
      assert.ok(text.includes(label), label);
    for (const label of ['PRODUCT-', '商品明细-', 'SKU：', '价格：', '起订量：', '订货倍数：'])
      assert.equal(text.includes(label), false, label);
    assert.deepEqual(draft, before);
    assert.equal(draft.lines[0].minimumOrderQuantity, 5);
    assert.equal(draft.lines[0].orderMultiple, 42);
  }
});
