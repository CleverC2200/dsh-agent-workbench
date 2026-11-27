import test from 'node:test';
import assert from 'node:assert/strict';
import { salesConfirmationCard } from '../prototypes/inventory-orderfulfillment/sales-confirmation-card.mjs';
import { salesConfirmationCard as packagedCard } from '../lib/business/inventory-orderfulfillment/sales-window/card.mjs';

test('confirmed submissions are marked and expose no processing or deferral buttons', () => {
  const input = {
    rate: 95,
    customer: '客户',
    quantity: 100,
    submission: { status: 'submitted' },
    lines: [],
  };
  const card = salesConfirmationCard(input, {
    entryUrl: 'https://fixture.invalid/entry?reference=one',
  });
  const text = JSON.stringify(card);
  assert.match(text, /已提交/);
  assert.match(text, /请勿重复提交/);
  const buttons = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.tag === 'button') buttons.push(node);
    for (const value of Object.values(node)) visit(value);
  };
  visit(card);
  assert.equal(buttons.length, 0);
  for (const status of ['processing', 'unknown', 'failed']) {
    const pending = JSON.stringify(
      salesConfirmationCard(
        { ...input, submission: { status } },
        { entryUrl: 'https://fixture.invalid/entry?reference=one' },
      ),
    );
    assert.doesNotMatch(pending, /本次提交已完成/);
  }
});

test('shortage SKUs remain visible alongside actual instructions at any satisfaction rate', () => {
  for (const rate of [70, 95, null]) {
    const draft = {
      rate,
      notice: '库存校验发现部分商品不足，请核对。',
      lines: [
        { sku: '10000362', rawShortage: 5, shortage: '5 箱' },
        { sku: '10003705', shortage: 2 },
        { sku: 'IN-STOCK', rawShortage: 0, shortage: 10 },
      ],
    };
    const before = structuredClone(draft);
    const text = JSON.stringify(salesConfirmationCard(draft));
    assert.ok(text.includes(draft.notice));
    assert.ok(text.includes('SKU：10000362 原订单缺货：5 箱'));
    assert.ok(text.includes('SKU：10003705 原订单缺货：2'));
    assert.equal(text.includes('IN-STOCK'), false);
    assert.deepEqual(draft, before);
  }
});

test('shortage card limits the summary to five affected SKUs', () => {
  const lines = Array.from({ length: 7 }, (_, i) => ({ sku: `MISSING-${i}`, rawShortage: 1 }));
  const text = JSON.stringify(salesConfirmationCard({ rate: 70, lines }));
  assert.ok(text.includes('SKU：MISSING-4'));
  assert.equal(text.includes('SKU：MISSING-5'), false);
  assert.ok(text.includes('其余缺货商品请在“订单处理”中核对。'));
});

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
