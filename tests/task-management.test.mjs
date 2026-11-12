import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deleteDetectionTask } from '../src/task-management.mjs';
function fixture() {
  const state = {
    tasks: [{ id: 'task', jobId: 12, enabled: true, definedBy: '设置人' }],
    events: [{ id: 'warning', monitorId: 'task' }],
    runs: [{ taskId: 'task' }],
  };
  const calls = [];
  return {
    state,
    calls,
    id: 'task',
    actor: { id: 'admin', name: '管理员' },
    canManage: async () => true,
    running: new Set(),
    stopJob: async (id) => calls.push(['stop', id]),
    save: async () => calls.push(['save']),
    now: () => '2026-11-11T01:00:00Z',
  };
}
test('删除停止调度并留存设置人、预警和执行记录，重复删除不重复停调度', async () => {
  const x = fixture();
  await deleteDetectionTask(x);
  await deleteDetectionTask(x);
  assert.equal(x.state.tasks[0].enabled, false);
  assert.equal(x.state.tasks[0].definedBy, '设置人');
  assert.equal(x.state.tasks[0].deletedAt, '2026-11-11T01:00:00Z');
  assert.equal(x.state.events.length, 1);
  assert.equal(x.state.runs.length, 1);
  assert.deepEqual(x.calls, [['stop', 12], ['save'], ['save']]);
});
test('当前版本不要求管理员角色，停止调度期间阻止新执行', async () => {
  const x = fixture();
  delete x.actor;
  delete x.canManage;
  x.stopJob = async () => assert.equal(x.running.has('task'), true);
  await deleteDetectionTask(x);
  assert.equal(x.state.tasks[0].enabled, false);
  assert.equal(x.running.has('task'), false);
});
test('执行中禁止删除，停调度失败保留任务', async () => {
  const x = fixture();
  x.running.add('task');
  await assert.rejects(deleteDetectionTask(x), /正在执行/);
  x.running.clear();
  x.stopJob = async () => {
    throw Error('调度服务不可用');
  };
  await assert.rejects(deleteDetectionTask(x), /调度服务不可用/);
  assert.equal(x.state.tasks[0].enabled, true);
  assert.equal(x.state.tasks[0].deletedAt, undefined);
  assert.deepEqual(x.calls, []);
});
