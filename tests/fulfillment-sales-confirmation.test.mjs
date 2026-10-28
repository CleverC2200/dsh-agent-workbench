import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  confirmationDraft,
  mountSalesConfirmation,
  salesConfirmationCard,
} from '../prototypes/inventory-orderfulfillment/sales-confirmation.mjs';

const order = {
  orderNo: 'order-A',
  customer: '客户A',
  customerCode: 'A',
  base: '郑州',
  seller: '—',
  rate: 95,
  quantity: '100 箱',
  period: '2026-10-27 — 2026-10-28（不含）',
  readAt: '预览时间',
  lines: [
    {
      sku: 'SKU-A',
      name: '商品A',
      quantity: '100 箱',
      shortage: '5 箱',
      rate: '95%',
      rawQuantity: 100,
    },
  ],
};
function fixture(simulation) {
  const dom = new JSDOM(
    '<button id="open">销售确认</button><div id="salesConfirmOverlay" hidden><section class="confirmation-dialog" role="dialog" aria-modal="true"><header><h2 id="salesConfirmTitle"></h2><p id="salesConfirmOrder"></p><button data-close-sales-confirm>关闭</button></header><form id="salesConfirmForm"></form></section></div>',
  );
  const d = dom.window.document,
    ui = mountSalesConfirmation(d, simulation);
  const click = (label) => {
    const b = [...d.querySelectorAll('#salesConfirmOverlay button')].find(
      (b) => b.textContent === label,
    );
    assert.ok(b, label);
    b.click();
  };
  return { dom, d, ui, click };
}
test('client click automatically sends only the explicitly matched simulation order and reports the receipt', async () => {
  let received;
  const { ui, d } = fixture({
    matches: (input) => input.orderNo === order.orderNo,
    notify: async (input) => {
      received = input;
      return { state: { simulation: true } };
    },
  });
  ui.open(order, d.getElementById('open'));
  await new Promise((done) => setImmediate(done));
  assert.equal(received.orderNo, order.orderNo);
  assert.equal(received.consumerCode, 'order01');
  assert.match(d.querySelector('[role="status"]').textContent, /已发送.*仅艾特田庚/);
  assert.match(d.querySelector('#salesConfirmForm').textContent, /模拟卡片已发送/);
});
test('preview rules preserve unknown, exact threshold and current order scope', () => {
  assert.equal(confirmationDraft(order).consumerCode, 'order01');
  assert.equal(confirmationDraft({ ...order, rate: 90 }).scenario, 'ready');
  assert.equal(confirmationDraft({ ...order, rate: 89.9 }).scenario, 'shortage');
  for (const rate of [null, undefined, '', '无权限', NaN, -1, 101])
    assert.equal(confirmationDraft({ ...order, rate }).scenario, 'unknown');
});
test('Feishu template binds callbacks to order01 and never embeds an unverified recipient', () => {
  const card = salesConfirmationCard({ ...order, customer: '<at id=all>所有人</at>' });
  assert.doesNotMatch(JSON.stringify(card), /<at|open_id|chat_id|delegationToken/);
  const buttons = card.elements[1].actions;
  assert.ok(buttons.at(-1).confirm);
  assert.equal(buttons.at(-1).value.action, 'confirm_shipment');
  assert.ok(
    buttons.every((b) => b.value.consumerCode === 'order01' && b.value.orderNo === order.orderNo),
  );
  assert.equal(
    salesConfirmationCard({ ...order, rate: 40 }).elements[1].actions.at(-1).value.action,
    'edit_order',
  );
});
test('client only initiates a group notification and never exposes sales execution controls', () => {
  const { dom, d, ui, click } = fixture();
  const card = ui.open(order, d.getElementById('open'));
  assert.equal(d.getElementById('salesConfirmTitle').textContent, '发起飞书销售确认');
  assert.match(d.body.textContent, /客户A/);
  assert.match(d.querySelector('[role="status"]').textContent, /未发送通知/);
  const buttons = [...d.querySelectorAll('#salesConfirmOverlay button')];
  assert.equal(buttons.find((b) => b.textContent === '发送到飞书群（待接入）').disabled, true);
  assert.ok(
    buttons.every(
      (b) => !['确认发货', '暂缓发货', '订单处理', '确认', '预览提交'].includes(b.textContent),
    ),
  );
  assert.equal(d.querySelector('select,input,tbody'), null);
  assert.ok(card.elements[1].actions.some((b) => b.value.action === 'confirm_shipment'));
  click('取消');
  assert.equal(d.getElementById('salesConfirmOverlay').hidden, true);
  assert.equal(d.activeElement.id, 'open');
  assert.equal(d.querySelector('form').children.length, 0);
  dom.window.close();
});
test('shortage handling stays in the Feishu card; closing or switching orders clears client content', () => {
  const { dom, d, ui } = fixture();
  const source = { ...order, rate: 70 };
  const card = ui.open(source);
  assert.equal(card.elements[1].actions.at(-1).value.action, 'edit_order');
  assert.equal(d.querySelector('input'), null);
  assert.equal(source.lines[0].rawQuantity, 100);
  ui.close();
  ui.open({ ...order, orderNo: 'order-B', customer: '<img src=x onerror=alert(1)>' });
  assert.equal(d.querySelector('img'), null);
  assert.doesNotMatch(d.querySelector('form').textContent, /order-A/);
  d.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape' }));
  assert.equal(d.getElementById('salesConfirmOverlay').hidden, true);
  assert.equal(d.getElementById('salesConfirmOrder').textContent, '');
  dom.window.close();
});
