import test from 'node:test';
import assert from 'node:assert/strict';
import { enqueueChanges, drainNotifications } from '../src/feishu-warning-transport.mjs';
const recipient = {
  transport: 'shared-feishu-app',
  receiveId: '10000001',
  receiveIdType: 'gea',
  recipientName: '测试负责人',
};
function fixture(count = 40, taskId = 'task', runId = 'run', overrides = []) {
  const state = {
    events: Array.from({ length: count }, (_, i) => ({
      id: taskId + '-' + i,
      objectKey: String(i),
      scope: '对象' + i,
      monitorId: taskId,
      eventStatus: '活跃',
      metricName: '指标',
      level: i % 2 ? '预警' : '严重',
      metric: '指标 94%',
      value: 94,
      unit: '%',
      scopeType: '品类',
      period: '2026-11',
      history: [{ runId, status: '预警' }],
      ...overrides[i],
    })),
  };
  enqueueChanges(state, new Map(), { id: runId, taskId }, recipient, {
    notifyMode: 'repeat',
    definedBy: '测试设置人',
  });
  let serial = Promise.resolve();
  const locked = (fn) => {
    const next = serial.then(fn);
    serial = next.catch(() => {});
    return next;
  };
  return { state, locked, save: async () => {} };
}
test('digest shows shared fields above the list and keeps each value and risk with its object', async () => {
  const options = fixture(3, 'task', 'run', [
    { scope: '遂平基地', value: 13.7841, unit: '天' },
    { scope: '郑州基地', value: 12.8994, unit: '天' },
    { scope: '西南基地', value: 19.2029, unit: '天' },
  ]);
  let content;
  options.send = async ({ card }) => {
    content = card.elements[0].text.content;
    return { messageId: 'om_digest' };
  };
  await drainNotifications(options);
  const [summary, ...objects] = content.split('\n\n');
  assert.match(summary, /\*\*指标\*\* 指标\n\*\*预警设置人\*\* 测试设置人/);
  assert.match(summary, /\*\*检测范围\*\* 品类\n\*\*统计期间\*\* 2026-11/);
  assert.equal(objects.length, 3);
  assert.match(objects[0], /遂平基地\n\*\*当前值\*\* 13\.8天；\*\*风险 \/ 状态\*\* 严重 \/ 活跃/);
  assert.match(objects[1], /郑州基地\n\*\*当前值\*\* 12\.9天；\*\*风险 \/ 状态\*\* 预警 \/ 活跃/);
  assert.match(objects[2], /西南基地\n\*\*当前值\*\* 19\.2天/);
  assert.doesNotMatch(objects.join('\n'), /预警设置人|检测范围|统计期间| · 指标/);
});
test('values and periods that differ remain with their own object, even if a subset matches', async () => {
  const options = fixture(3, 'task', 'run', [
    {},
    {},
    { period: '2026-12', scopeType: '基地', metricName: '可发货天数', value: 4, unit: '天' },
  ]);
  let content;
  options.send = async ({ card }) => {
    content = card.elements[0].text.content;
    return { messageId: 'om_digest' };
  };
  await drainNotifications(options);
  const [summary, ...objects] = content.split('\n\n');
  assert.doesNotMatch(summary, /统计期间|检测范围|\*\*指标\*\*/);
  assert.match(objects[0], /指标 94\.0%.*品类.*2026-11/);
  assert.match(objects[1], /指标 94\.0%.*品类.*2026-11/);
  assert.match(objects[2], /可发货天数 4\.0天.*基地.*2026-12/);
});
test('forty warning objects for one recipient produce exactly one bounded digest and share the receipt', async () => {
  const options = fixture();
  const sent = [];
  options.send = async (job) => {
    sent.push(job);
    return { messageId: 'om_digest' };
  };
  await Promise.all([drainNotifications(options), drainNotifications(options)]);
  await drainNotifications(options);
  assert.equal(sent.length, 1);
  assert.match(sent[0].card.header.title.content, /40 项/);
  assert.match(JSON.stringify(sent[0].card), /严重 20 项.*预警 20 项/);
  assert.match(JSON.stringify(sent[0].card), /其余 10 项/);
  assert.ok(Buffer.byteLength(JSON.stringify({ content: JSON.stringify(sent[0].card) })) < 24000);
  assert.ok(
    options.state.events.every((event) => event.notifications[0].messageId === 'om_digest'),
  );
  assert.equal(
    new Set(options.state.events.map((event) => event.notifications[0].batchId)).size,
    1,
  );
});
test('different recipients, tasks, runs and credentials never share a notification', async () => {
  const options = fixture(2);
  const extra = fixture(2, 'other-task');
  options.state.events.push(...extra.state.events);
  enqueueChanges(
    options.state,
    new Map(),
    { id: 'second-run', taskId: 'task' },
    [recipient, { ...recipient, receiveId: '10000002' }],
    {},
  );
  const sent = [];
  options.send = async (job) => {
    sent.push(job);
    return { messageId: 'om_' + sent.length };
  };
  await drainNotifications(options);
  assert.equal(sent.length, 4);
  assert.equal(new Set(sent.map((job) => job.uuid)).size, 4);
  assert.deepEqual(sent.map((job) => job.taskId).sort(), ['other-task', 'task', 'task', 'task']);
});
test('unknown whole-batch result is recorded per warning and never retried automatically', async () => {
  const options = fixture(25);
  let sent = 0;
  options.send = async () => {
    sent++;
    throw Object.assign(Error('timeout'), { unknown: true });
  };
  await drainNotifications(options);
  await drainNotifications(options);
  assert.equal(sent, 1);
  assert.ok(options.state.events.every((event) => event.notifications[0].status === '待核实'));
});
test('claim persistence failure stops sending, and closed or merged events are excluded', async () => {
  const options = fixture(3);
  let sent = 0;
  options.state.events[0].eventStatus = '已关闭';
  options.state.events[1].eventStatus = '已合并';
  options.send = async () => {
    sent++;
    return { messageId: 'om_one' };
  };
  await drainNotifications(options);
  assert.equal(sent, 1);
  assert.equal(options.state.events[0].notifications[0].status, '已取消');
  assert.equal(options.state.events[1].notifications[0].status, '已取消');
  const failed = fixture(2);
  failed.save = async () => {
    throw Error('write denied');
  };
  failed.send = options.send;
  await assert.rejects(drainNotifications(failed), /write denied/);
  assert.equal(sent, 1);
});
test('automatic routing skips missing observations and deduplicates recipient identities', () => {
  const { state } = fixture(2);
  state.events.forEach((event) => (event.notifications = []));
  state.events[0].history = [];
  const routes = new Map([
    ['0', [recipient]],
    ['1', [recipient]],
  ]);
  enqueueChanges(state, new Map(), { id: 'run', taskId: 'task' }, routes, {});
  enqueueChanges(state, new Map(), { id: 'run', taskId: 'task' }, routes, {});
  assert.equal(state.events[0].notifications.length, 0);
  assert.equal(state.events[1].notifications.length, 1);
});
