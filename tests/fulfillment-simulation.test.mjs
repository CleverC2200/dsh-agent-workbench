import test from 'node:test';
import assert from 'node:assert/strict';
import { applySimulationEvent, simulationCard } from '../scripts/lib/fulfillment-simulation.mjs';
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
  const confirm = components.find((row) => row.tag === 'column_set').columns[0].elements[0];
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
test('popup test links stay on the local acceptance service and expose no business identity credentials', () => {
  const card = simulationCard({ ...scope, webToken: 'test-only-token' }, initial());
  const buttons = card.body.elements
    .find((row) => row.tag === 'column_set')
    .columns.map((row) => row.elements[0]);
  for (const [index, button] of buttons.entries()) {
    const behavior = button.behaviors[0];
    assert.equal(behavior.type, 'open_url');
    const applink = new URL(behavior.default_url);
    assert.equal(applink.origin, 'https://applink.feishu.cn');
    assert.equal(applink.searchParams.get('mode'), 'window');
    const local = new URL(applink.searchParams.get('url'));
    assert.equal(local.origin, 'http://127.0.0.1:3197');
    assert.equal(local.searchParams.get('view'), ['details', 'defer', 'confirm'][index]);
    assert.equal(local.hash, '#test-only-token');
  }
  const snapshot = simulationWebSnapshot(
    { ...scope, webToken: 'secret', operatorId: 'secret-operator' },
    initial(),
  );
  assert.equal(snapshot.scope.operatorId, undefined);
  assert.equal(snapshot.scope.webToken, undefined);
});
test('reference card uses red instruction, grouped order information and details/defer/confirm footer', () => {
  const card = simulationCard({ ...scope, webToken: 'test-only-token' }, initial());
  assert.equal(card.header, undefined);
  assert.equal(card.body.elements[0].text.tag, 'plain_text');
  assert.equal(card.body.elements[0].text.text_color, 'red');
  assert.match(card.body.elements[0].text.content, /说明：\n\n订单满足率达到90%/);
  assert.doesNotMatch(JSON.stringify(card), /<\/?font\b/);
  assert.match(card.body.elements[1].content, /订单号：.*\n客户：.*\n订单满足率：/);
  const buttons = card.body.elements
    .find((row) => row.tag === 'column_set')
    .columns.map((row) => row.elements[0]);
  assert.deepEqual(
    buttons.map((row) => row.text.content),
    ['查看明细', '暂缓发货', '确认发货'],
  );
  assert.deepEqual(
    buttons.map((row) => row.type),
    ['danger_text', 'default', 'danger'],
  );
  assert.match(card.body.elements.at(-1).content, /仅模拟验收/);
});
