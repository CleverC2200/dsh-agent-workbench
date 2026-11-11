import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalize, merge } from '../src/detection-backend.mjs';
import { drainNotifications, enqueueChanges } from '../src/feishu-warning-transport.mjs';

const task = { id: 't', scope: '品类', metric: '订单满足率', definedBy: '产销协同组' };
const config = { receiveId: 'fixture', receiveIdType: 'user_id', recipientName: 'fixture' };
const row = { scope: '品类', objectName: '调理肉制品', objectKey: '调理肉制品',
  status: '预警', value: 94, unit: '%', period: '2026-11-01 至 2026-11-08（月累计）',
  rule: { direction: 'higher', healthyOperator: 'gt', healthy: 95, severe: 90 } };

function execute(state, mode, day, fields = {}) {
  const run = { id: 'r'+day, taskId: task.id, at: '2026-11-'+day+'T07:00:00Z', created: 0, updated: 0, recovered: 0 };
  const before = new Map(state.events.map(event => [event.id, { eventStatus: event.eventStatus, level: event.level }]));
  merge(state, task, [{ ...row, cutoff: '2026-11-'+day, ...fields }], run);
  enqueueChanges(state, before, run, config, { ...task, notifyMode: mode });
  return run;
}

test('范围前缀变化不会为同一品类新建预警，跨月仍更新同一预警', () => {
  const state = { events: [] };
  execute(state, 'repeat', '09');
  const first = state.events[0];
  execute(state, 'repeat', '10', { objectKey: '品类-调理肉制品' });
  assert.equal(state.events.length, 1);
  assert.equal(first.history.length, 2);
  const oldKey = first.monitorKey;
  canonicalize(state);
  assert.equal(first.monitorKey, oldKey);
  execute(state, 'repeat', '11', { objectKey: '品类-调理肉制品', period: '2026-12-01 至 2026-12-11（月累计）', cutoff: '2026-12-11' });
  assert.equal(state.events.length, 1);
  assert.equal(first.history.length, 3);
  assert.equal(first.period, '2026-12-01 至 2026-12-11（月累计）');
});

test('通知一次覆盖一个预警生命周期，重复模式恢复后仍发送，关闭后停发', async () => {
  for (const mode of ['once','repeat']) {
    const state = { events: [] };
    execute(state, mode, '08');
    const event = state.events[0];
    execute(state, mode, '09', { status: '严重', value: 86 });
    execute(state, mode, '10', { status: '健康', value: 97 });
    execute(state, mode, '11', { status: '健康', value: 98 });
    assert.equal(event.eventStatus, '已恢复');
    assert.equal(event.notifications.length, mode === 'once' ? 1 : 4);
    assert.match(JSON.stringify(event.notifications[0].card), /预警设置人.*产销协同组/);
    if (mode === 'repeat') assert.equal(event.notifications.at(-1).kind, 'feedback');
    event.eventStatus = '已关闭';
    execute(state, mode, '12', { status: '健康', value: 97 });
    let sent = 0;
    await drainNotifications({ state, save: async()=>{}, locked: fn=>fn(), send: async()=>{sent++;} });
    assert.equal(sent, 0);
    execute(state, mode, '13');
    assert.equal(state.events.length, 2);
    assert.equal(state.events[0].notifications.length, 1);
  }
});
