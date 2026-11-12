import { test } from 'node:test';
import assert from 'node:assert/strict';
import { merge, canonicalize } from '../src/detection-backend.mjs';
import { enqueueChanges } from '../src/feishu-warning-transport.mjs';
const rule = { direction: 'higher', healthyOperator: 'gt', healthy: 95, severe: 90 };
function step(state, task, date, status = '预警') {
  const run = {
    id: date,
    taskId: task.id,
    at: date + 'T01:00:00Z',
    created: 0,
    updated: 0,
    recovered: 0,
  };
  merge(
    state,
    task,
    [
      {
        scope: task.scope,
        objectKey: 'object-1',
        objectName: '测试对象',
        value: status === '健康' ? 98 : 94,
        unit: '%',
        status,
        rule,
        period: date.slice(0, 7) + '月累计',
        cutoff: date,
      },
    ],
    run,
  );
  return run;
}
for (const metric of ['订单满足率', '生产计划达成率', '任意指标'])
  test(metric + '跨月跨年延续，恢复待关闭仍属同一生命周期', () => {
    const task = { id: metric, metric, scope: '基地' },
      state = { events: [] };
    step(state, task, '2026-11-30');
    const first = state.events[0];
    step(state, task, '2026-12-01');
    assert.equal(state.events.length, 1);
    step(state, task, '2027-01-01', '健康');
    assert.equal(first.eventStatus, '已恢复');
    assert.equal(first.pendingClose, true);
    assert.equal(first.period, '2027-01月累计');
    step(state, task, '2027-01-02');
    assert.equal(state.events.length, 1);
    assert.equal(first.eventStatus, '活跃');
    assert.equal(first.history.length, 4);
    assert.equal(first.history[0].period, '2026-11月累计');
    assert.equal(first.first, '2026-11-30T01:00:00Z');
    first.eventStatus = '已关闭';
    first.pendingClose = false;
    step(state, task, '2027-01-03');
    assert.equal(state.events.length, 2);
    assert.notEqual(state.events[0].id, first.id);
    canonicalize(state);
    assert.equal(first.eventStatus, '已关闭');
  });
test('通知一次在跨月后不重发，重复通知仍逐次反馈', () => {
  for (const mode of ['once', 'repeat']) {
    const task = { id: 't', metric: '任意指标', scope: '基地', notifyMode: mode },
      state = { events: [] },
      config = { receiveId: 'test', receiveIdType: 'user_id', recipientName: '测试' };
    const one = step(state, task, '2026-11-30');
    enqueueChanges(state, new Map(), one, config, task);
    const two = step(state, task, '2026-12-01');
    enqueueChanges(state, new Map(), two, config, task);
    assert.equal(state.events.length, 1);
    assert.equal(state.events[0].notifications.length, mode === 'once' ? 1 : 2);
  }
});
