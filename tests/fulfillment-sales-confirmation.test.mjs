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
function fixture(simulation, formal) {
  const dom = new JSDOM(
    '<button id="open">销售确认</button><div id="salesConfirmOverlay" hidden><section class="confirmation-dialog" role="dialog" aria-modal="true"><header><h2 id="salesConfirmTitle"></h2><p id="salesConfirmOrder"></p><button data-close-sales-confirm>关闭</button></header><form id="salesConfirmForm"></form></section></div>',
  );
  const d = dom.window.document,
    ui = mountSalesConfirmation(d, simulation, formal);
  const click = (label) => {
    const b = [...d.querySelectorAll('#salesConfirmOverlay button')].find(
      (b) => b.textContent === label,
    );
    assert.ok(b, label);
    b.click();
  };
  const expandTestOptions = () => {
    const options = d.querySelector('details');
    assert.ok(options, 'test options must exist only in test mode');
    options.open = true;
    options.dispatchEvent(new dom.window.Event('toggle'));
  };
  return { dom, d, ui, click, expandTestOptions };
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
test('Feishu template requires Host links and never embeds an unverified recipient', () => {
  const card = salesConfirmationCard({ ...order, customer: '<at id=all>所有人</at>' });
  assert.doesNotMatch(JSON.stringify(card), /<at|open_id|chat_id|delegationToken/);
  const buttons = card.body.elements[1].columns[1].elements;
  assert.equal(card.schema, '2.0');
  assert.equal(card.header.title.content, '订单待确认');
  assert.deepEqual(
    buttons.map((b) => b.text.content),
    ['订单处理', '暂缓发货'],
  );
  assert.ok(buttons.every((b) => b.disabled && !b.behaviors && !b.value));
  assert.equal(
    salesConfirmationCard({ ...order, rate: 40 }).body.elements[1].columns[1].elements[0].text
      .content,
    '订单处理',
  );
});
test('client only initiates a group notification and never exposes sales execution controls', () => {
  const { dom, d, ui, click } = fixture();
  const card = ui.open(order, d.getElementById('open'));
  assert.equal(d.getElementById('salesConfirmTitle').textContent, '发起飞书销售确认');
  assert.match(d.body.textContent, /客户A/);
  assert.match(d.querySelector('[role="status"]').textContent, /未发送通知/);
  const buttons = [...d.querySelectorAll('#salesConfirmOverlay button')];
  assert.equal(buttons.find((b) => b.textContent === '发送到飞书群').disabled, true);
  assert.ok(
    buttons.every(
      (b) => !['确认发货', '暂缓发货', '订单处理', '确认', '预览提交'].includes(b.textContent),
    ),
  );
  assert.equal(d.querySelector('select,input,tbody'), null);
  assert.ok(card.body.elements[1].columns[1].elements.some((b) => b.text.content === '订单处理'));
  click('返回');
  assert.equal(d.getElementById('salesConfirmOverlay').hidden, true);
  assert.equal(d.activeElement.id, 'open');
  assert.equal(d.querySelector('form').children.length, 0);
  dom.window.close();
});
test('shortage handling stays in the Feishu card; closing or switching orders clears client content', () => {
  const { dom, d, ui } = fixture();
  const source = { ...order, rate: 70 };
  const card = ui.open(source);
  assert.equal(card.body.elements[1].columns[1].elements[0].text.content, '订单处理');
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

test('test dialog defaults to direct send without loading personnel and ignores late configuration after close', async () => {
  let sent = 0,
    received;
  const { dom, d, ui } = fixture(undefined, {
    configuration: async () => ({ available: true, mode: 'test' }),
    participants: async () => {
      throw Error('collapsed test options must not query people');
    },
    notify: async (input, delivery) => {
      assert.deepEqual(delivery, {});
      sent++;
      received = input;
      return { status: 'pending', delivery: 'sent' };
    },
  });
  ui.open({ ...order, start: '2026-10-27', endExclusive: '2026-10-28' }, d.getElementById('open'));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(sent, 0, 'opening the dialog must not send automatically');
  assert.equal(d.querySelector('details').open, false);
  assert.equal(d.querySelector('select,input'), null);
  [...d.querySelectorAll('button')].find((button) => button.textContent === '发送到飞书群').click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(sent, 1);
  assert.equal(received.orderNo, order.orderNo);
  assert.equal(received.start, '2026-10-27');
  assert.match(d.querySelector('[role="status"]').textContent, /已发送/);
  assert.equal(
    [...d.querySelectorAll('button')].find((button) => button.textContent === '确认任务已登记')
      .disabled,
    true,
  );
  dom.window.close();
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const closed = fixture(undefined, {
    configuration: () => pending,
    notify: async () => {
      throw Error('must not send');
    },
  });
  closed.ui.open(order);
  closed.ui.close();
  release({ available: true, mode: 'test' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(closed.d.getElementById('salesConfirmOverlay').hidden, true);
  closed.dom.window.close();
});

test('test personnel selection preserves multiple mentions and never promotes a view-only receiver', async () => {
  let received;
  const people = [
    { userId: 'a', displayName: '测试甲', canProcess: true },
    { userId: 'b', displayName: '测试乙', canProcess: false },
  ];
  const { dom, d, ui, click, expandTestOptions } = fixture(undefined, {
    configuration: async () => ({ available: true, mode: 'test' }),
    participants: async (query) => ({
      mode: 'test',
      currentUserId: 'a',
      participants: query ? [people[1]] : [people[0]],
    }),
    notify: async (_, delivery) => {
      received = delivery;
      return { status: 'pending', delivery: 'sent' };
    },
  });
  ui.open(order);
  await new Promise((resolve) => setImmediate(resolve));
  expandTestOptions();
  await new Promise((resolve) => setImmediate(resolve));
  const query = d.querySelector('input[aria-label="查找收件人"]');
  query.value = '测试乙';
  click('查找');
  await new Promise((resolve) => setImmediate(resolve));
  const recipients = d.querySelector('select[aria-label="被艾特人员"]');
  for (const option of recipients.options) option.selected = true;
  recipients.dispatchEvent(new dom.window.Event('change'));
  const handler = d.querySelector('select[aria-label="确认与暂缓处理人"]');
  assert.deepEqual(
    [...handler.options].map((x) => x.value),
    ['a'],
  );
  click('发送到飞书群');
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(received, { recipientUserIds: ['a', 'b'], handlerUserId: 'a' });
  dom.window.close();
});

test('sales mode directly uses server assignment without a personnel directory or manual settings', async () => {
  let delivery;
  const { dom, d, ui, click } = fixture(undefined, {
    configuration: async () => ({ available: true, mode: 'sales' }),
    participants: async () => {
      throw Error('sales mode must not query manual recipients');
    },
    notify: async (_, input) => {
      delivery = input;
      return { status: 'pending', delivery: 'queued' };
    },
  });
  ui.open(order);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(d.querySelector('select,input,details'), null);
  assert.doesNotMatch(d.body.textContent, /正在读取发卡模式|被艾特人员|请选择收件人/);
  click('发送到飞书群');
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(delivery, {});
  dom.window.close();
});
test('closing pending test personnel lookup cannot restore controls or send', async () => {
  let release;
  let sent = false;
  const pending = new Promise((resolve) => (release = resolve));
  const closed = fixture(undefined, {
    configuration: async () => ({ available: true, mode: 'test' }),
    participants: () => pending,
    notify: async () => {
      sent = true;
    },
  });
  closed.ui.open(order);
  await new Promise((resolve) => setImmediate(resolve));
  closed.expandTestOptions();
  closed.ui.close();
  release({
    mode: 'test',
    currentUserId: 'old',
    participants: [{ userId: 'old', displayName: '旧人员', canProcess: true }],
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(sent, false);
  assert.equal(closed.d.getElementById('salesConfirmOverlay').hidden, true);
  closed.dom.window.close();
});

test('unavailable, failed or invalid configuration leaves no empty personnel controls or loading label', async () => {
  for (const configuration of [
    async () => ({ available: false }),
    async () => ({ available: true, mode: 'unexpected' }),
    async () => {
      throw Error('连接失败');
    },
  ]) {
    let sent = 0;
    const { dom, d, ui, click } = fixture(undefined, {
      configuration,
      participants: async () => {
        throw Error('must not query people');
      },
      notify: async () => {
        sent++;
      },
    });
    ui.open(order);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(d.querySelector('select,input,details'), null);
    assert.doesNotMatch(d.body.textContent, /正在读取发卡模式|正在核对发卡权限/);
    const send = [...d.querySelectorAll('button')].find((x) => x.textContent === '发送到飞书群');
    assert.equal(send.disabled, true);
    click('发送到飞书群');
    assert.equal(sent, 0);
    dom.window.close();
  }
});

test('collapsing manual test options returns to default send without retaining hidden overrides', async () => {
  let delivery;
  const { dom, d, ui, click, expandTestOptions } = fixture(undefined, {
    configuration: async () => ({ available: true, mode: 'test' }),
    participants: async () => ({
      mode: 'test',
      currentUserId: 'other',
      participants: [{ userId: 'other', displayName: '其他测试人员', canProcess: true }],
    }),
    notify: async (_, value) => {
      delivery = value;
      return { status: 'pending', delivery: 'sent' };
    },
  });
  ui.open(order);
  await new Promise((resolve) => setImmediate(resolve));
  expandTestOptions();
  await new Promise((resolve) => setImmediate(resolve));
  const options = d.querySelector('details');
  options.open = false;
  options.dispatchEvent(new dom.window.Event('toggle'));
  click('发送到飞书群');
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(delivery, {});
  dom.window.close();
});
