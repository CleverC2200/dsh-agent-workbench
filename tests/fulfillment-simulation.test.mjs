import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applySimulationEvent,
  simulationCard,
  applyGroupedSimulationEvent,
  simulationMember,
} from '../scripts/lib/fulfillment-simulation.mjs';
import { simulationWebSnapshot } from '../scripts/lib/fulfillment-simulation-web.mjs';
const scope = {
  simulation: true,
  runId: 'run-test',
  chatId: 'test-chat',
  operatorId: 'only-user',
  messageId: 'only-message',
  orderNo: 'order1',
  customerCode: 'cust1',
  base: '郑州',
  sku: 'sku1',
  rate: 95,
  lines: [{ sku: 'sku1', name: '商品', quantity: 10, shortage: 0, unit: '箱' }],
};
const initial = () => ({ simulation: true, runId: scope.runId, status: '待模拟确认', records: [] });
const event = (action, extra = {}) => ({
  event_id: action,
  chat_id: scope.chatId,
  operator_id: scope.operatorId,
  message_id: scope.messageId,
  action_value: JSON.stringify({
    simulation: true,
    runId: scope.runId,
    orderNo: scope.orderNo,
    action,
    ...extra,
  }),
});
test('confirmation, defer and item processing produce only marked simulation records with deduplication', () => {
  let state = applySimulationEvent(initial(), event('confirm'), scope);
  assert.match(state.status, /模拟/);
  assert.match(state.records[0].summary, /未执行发货/);
  assert.equal(applySimulationEvent(state, event('confirm'), scope), state);
  assert.equal(
    applySimulationEvent(state, { ...event('confirm'), event_id: 'another-click' }, scope),
    state,
  );
  state = applySimulationEvent(state, event('defer', { days: 3 }), scope);
  state = applySimulationEvent(state, event('process', { sku: 'sku1', quantity: 0 }), scope);
  assert.equal(state.records.length, 3);
  assert.equal(state.records[1].days, 3);
  assert.match(state.records[2].summary, /未提交 OMS/);
});
test('wrong actor, chat, message, run, defer days or SKU never update test state', () => {
  for (const change of [{ operator_id: 'other' }, { chat_id: 'other' }, { message_id: 'other' }])
    assert.throws(
      () => applySimulationEvent(initial(), { ...event('confirm'), ...change }, scope),
      /SCOPE_DENIED/,
    );
  assert.throws(
    () => applySimulationEvent(initial(), event('defer', { days: 8 }), scope),
    /DAYS_INVALID/,
  );
  assert.throws(
    () => applySimulationEvent(initial(), event('process', { sku: 'other', quantity: 0 }), scope),
    /ITEM_INVALID/,
  );
  assert.throws(
    () => applySimulationEvent(initial(), event('confirm', { runId: 'other' }), scope),
    /ACTION_DENIED/,
  );
});
test('card mentions one target and all action values are marked simulation', () => {
  for (const view of ['home', 'details']) {
    const card = simulationCard(scope, initial(), view),
      raw = JSON.stringify(card);
    assert.equal((raw.match(/<at /g) ?? []).length, 1);
    assert.ok(raw.includes(scope.operatorId));
    assert.doesNotMatch(raw, /id=all|https?:\/\//);
    assert.ok(raw.includes('"simulation":true'));
  }
});
test('Feishu dropdown commits only valid days, stores cutoff and stops simulation reminders', () => {
  const selected = { ...event('defer'), action_tag: 'select_static', option: '7' };
  const state = applySimulationEvent(initial(), selected, scope);
  assert.equal(state.records[0].days, 7);
  assert.equal(Date.parse(state.deferredUntil) - Date.parse(state.records[0].at), 7 * 86400000);
  assert.equal(state.reminderStopped, true);
  assert.equal(
    applySimulationEvent(state, { ...selected, event_id: 'second-click' }, scope),
    state,
  );
  for (const option of ['', '0', '8', '1x', '1.0'])
    assert.throws(
      () => applySimulationEvent(initial(), { ...selected, option }, scope),
      /DAYS_INVALID/,
    );
});
test('unknown or below-threshold rate cannot confirm, and Feishu owns confirmation and dropdown', () => {
  for (const rate of [undefined, 89.9, NaN])
    assert.throws(
      () => applySimulationEvent(initial(), event('confirm'), { ...scope, rate }),
      /CONFIRM_THRESHOLD/,
    );
  const card = simulationCard(scope, initial());
  const components = card.body.elements;
  const confirm = components.find(
    (row) => row.tag === 'column_set' && row.element_id !== 'sales_title',
  ).columns[0].elements[0];
  assert.match(confirm.confirm.title.content, /确认开单/);
  const select = components.find((row) => row.tag === 'select_static');
  assert.deepEqual(
    select.options.map((row) => row.value),
    ['1', '2', '3', '4', '5', '6', '7'],
  );
  assert.ok(select.confirm);
  const details = JSON.stringify(simulationCard(scope, initial(), 'details'));
  assert.match(details, /商品/);
  assert.match(details, /10 箱/);
  assert.doesNotMatch(details, /select_static|确认发货/);
});
test('order number and both actions open only that order in the local simulation window', () => {
  const card = simulationCard({ ...scope, webToken: 'test-only-token' }, initial());
  const row = card.body.elements.find((row) => row.tag === 'column_set');
  const detail = row.columns[0].elements[0].content.match(/\]\(([^)]+)\)/)[1];
  const buttons = row.columns[1].elements;
  const links = [detail, ...buttons.map((button) => button.behaviors[0].default_url)];
  for (const [index, link] of links.entries()) {
    const app = new URL(link);
    assert.equal(app.origin, 'https://applink.feishu.cn');
    const local = new URL(app.searchParams.get('url'));
    assert.equal(local.origin, 'http://127.0.0.1:3197');
    assert.equal(local.searchParams.get('view'), ['details', 'confirm', 'defer'][index]);
    assert.equal(local.searchParams.get('orderNo'), scope.orderNo);
    assert.equal(local.hash, '#test-only-token');
  }
  assert.deepEqual(
    buttons.map((row) => row.text.content),
    ['确认发货', '暂缓发货'],
  );
  assert.doesNotMatch(JSON.stringify(card), /查看明细/);
});

test('one salesperson card separates multiple orders and keeps their actions and results independent', () => {
  const second = {
    orderNo: 'order2',
    customerCode: 'cust2',
    customer: '客户2',
    base: '郑州',
    rate: 95,
    quantity: 2,
    unit: '箱',
  };
  const group = { ...scope, webToken: 'test-token', orders: [second] };
  let state = initial();
  state = applyGroupedSimulationEvent(state, event('confirm'), group);
  assert.equal(state.status, '模拟已确认');
  assert.equal(simulationMember(group, state, 'order2').state.status, '待模拟确认');
  state = applyGroupedSimulationEvent(state, event('defer', { orderNo: 'order2', days: 2 }), group);
  assert.equal(state.status, '模拟已确认');
  assert.equal(state.records.length, 1);
  assert.equal(state.orderStates.order2.status, '模拟已暂缓');
  assert.equal(state.orderStates.order2.records.length, 1);
  assert.throws(() => simulationMember(group, state, 'not-in-card'), /ORDER_DENIED/);
  const card = simulationCard(group, state);
  assert.equal(card.header.template, 'blue');
  assert.equal(card.body.elements.filter((row) => row.tag === 'hr').length, 1);
  const prompts = card.body.elements.filter((row) => row.text?.text_color === 'red');
  assert.equal(prompts.length, 2);
  assert.equal(prompts[0].text.content, '订单满足率达到90%，请确认是否开单？');
  assert.equal((JSON.stringify(card).match(/<at /g) || []).length, 1);
  assert.match(JSON.stringify(card), /已处理/);
  assert.match(JSON.stringify(card), /已暂缓/);
  assert.doesNotMatch(JSON.stringify(card), /查看明细|<\/?font\b/);
});
