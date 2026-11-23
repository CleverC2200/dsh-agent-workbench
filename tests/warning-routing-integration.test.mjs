import test from 'node:test';
import assert from 'node:assert/strict';
import { installDetection } from '../src/detection-backend.mjs';
import { warningOwner } from '../src/warning-ownership.mjs';
import { drainNotifications, enqueueNotification } from '../src/feishu-warning-transport.mjs';
const status = {
  authenticated: true,
  environment: 'test',
  user: { id: 'fixture-user', username: 'fixture', name: '测试设置人', tenantId: '0' },
};
const owners = [
  { type: '品类', scope: '汤圆', name: '测试负责人', employeeNo: '10000001' },
  { type: '品类', scope: '饺子', name: '测试负责人', employeeNo: '10000001' },
];
async function setup(
  t,
  { directoryError = false, answerGate, answer, enabled = true, runs = [], beforeSave } = {},
) {
  let state = {
    tasks: [
      {
        id: 'task',
        owner: warningOwner(status),
        metric: '订单满足率',
        scope: '品类',
        description: '低于95预警',
        enabled,
        jobId: 42,
        schedule: { frequency: 'daily', time: '09:00' },
        notifyStrategy: 'automatic',
        notifyMode: 'repeat',
        notifyRecipients: ['self'],
      },
    ],
    runs: structuredClone(runs),
    events: [],
  };
  const calls = [],
    cleanups = [];
  const finished = Promise.withResolvers();
  let revision = 0;
  const rows = ['汤圆', '饺子'].map((objectName) => ({
    scope: '品类',
    objectKey: objectName,
    objectName,
    status: '预警',
    value: 94.9871,
    unit: '%',
    period: '2026-11',
    cutoff: '2026-11-16',
    evidence: 'fixture query result',
    rule: {
      sourceType: 'task',
      taskQuote: '低于95预警',
      healthy: 95,
      healthyOperator: 'gte',
      direction: 'higher',
    },
  }));
  const service = await installDetection({
    get: () => ({
      list: async () => [{ id: 'gea-html-inventory-apsplan', name: '产销协同Agent' }],
    }),
    effect(fn) {
      const cleanup = fn();
      if (cleanup) cleanups.push(cleanup);
    },
    sessionController: {
      create: async () => ({ sessionId: 'fixture-session' }),
      prompt: async ({ content }) => calls.push({ path: 'detection-prompt', body: content[0] }),
      async *follow() {
        await answerGate;
        yield {
          type: 'event',
          event: {
            type: 'assistant/message',
            data: {
              message: {
                content: [
                  {
                    type: 'text',
                    text: answer ?? JSON.stringify({ complete: true, results: rows }),
                  },
                ],
              },
            },
          },
        };
        yield {
          type: 'event',
          event: { type: 'turn/end', data: { reason: { kind: 'completed' } } },
        };
      },
    },
    connection: {
      fetch: { register: () => () => {} },
      createSharedFetchHandler: () => ({
        fetch: async (request) => {
          const path = new URL(request.url).pathname,
            body = await request.json();
          calls.push({ path, body });
          if (path.endsWith('/status')) return Response.json({ ok: true, value: status });
          if (path.endsWith('/warning/storage')) {
            if (body.operation === 'load')
              return Response.json({
                ok: true,
                value: { ...structuredClone(state), revision: String(revision) },
              });
            if (body.operation === 'save') {
              if (beforeSave?.(state, body.state)) revision++;
              if (body.expectedRevision !== String(revision))
                return Response.json(
                  {
                    ok: false,
                    error: { code: 'WARNING_WRITE_CONFLICT', message: '预警已被其他会话修改' },
                  },
                  { status: 409 },
                );
              state = structuredClone(body.state);
              revision++;
              if (state.runs[0]?.status === '成功') finished.resolve();
              return Response.json({
                ok: true,
                value: { saved: true, revision: String(revision) },
              });
            }
            if (body.operation === 'directory-load')
              return directoryError
                ? Response.json({ ok: false, error: { message: '配置读取失败' } }, { status: 503 })
                : Response.json({
                    ok: true,
                    value: { directoryId: 'fixture-dir', revision: 3, owners },
                  });
            if (body.operation === 'directory-save')
              return Response.json({
                ok: true,
                value: { directoryId: 'fixture-dir', revision: 4, owners: body.owners },
              });
          }
          if (path.endsWith('/warning/scheduler') && body.operation === 'feishu-recipient')
            return Response.json({
              ok: true,
              value: {
                mapped: true,
                transport: 'shared-feishu-app',
                receiveId: body.username,
                receiveIdType: 'gea',
                recipientName: '测试负责人',
              },
            });
          if (path.endsWith('/warning/scheduler') && body.operation === 'xxl') {
            if (body.path === '/jobinfo/update') return Response.json({ ok: true, value: null });
            if (body.path === '/jobinfo/start')
              return Response.json({ ok: false, error: { message: '调度任务已启动' } });
          }
          throw Error('Unexpected request ' + path + ' ' + body.operation);
        },
      }),
    },
  });
  t.after(() => cleanups.reverse().forEach((cleanup) => cleanup()));
  await service.api({ op: 'list' });
  return { service, calls, state: () => state, finished: finished.promise };
}
test('manual retry reuses one original failed recipient batch and leaves other receipts untouched', async (t) => {
  const f = await setup(t);
  const run = await f.service.runTask('task', 'retry-batch');
  for (const event of f.state().events) {
    for (const receiveId of ['already-sent', 'unknown']) {
      enqueueNotification(event, 'new', run.id, {
        transport: 'shared-feishu-app',
        receiveId,
        receiveIdType: 'gea',
        recipientName: receiveId,
      });
    }
  }
  const drain = (send) =>
    drainNotifications({
      state: f.state(),
      save: async () => {},
      locked: (operation) => operation(),
      send,
    });
  await drain(async ({ receiveId }) => {
    if (receiveId === 'already-sent') return { messageId: 'om_original' };
    throw Object.assign(Error('测试发送状态'), { unknown: receiveId === 'unknown' });
  });
  const [failed, sent, ambiguous] = f.state().events[0].notifications;
  const retry = (batchId) => f.service.api({ op: 'retry-notification', runId: run.id, batchId });
  for (const job of [sent, ambiguous]) await assert.rejects(retry(job.batchId), /仅可补发明确失败/);
  const repeated = await Promise.allSettled([retry(failed.batchId), retry(failed.batchId)]);
  assert.deepEqual(
    repeated.map((result) => result.status),
    ['fulfilled', 'rejected'],
  );
  assert.deepEqual(
    f.state().events[0].notifications.map((job) => job.status),
    ['待发送', '已发送', '待核实'],
  );
  const sentBatches = [];
  await drain(async (job) => {
    sentBatches.push({ recipient: job.recipientName, uuid: job.uuid });
    return { messageId: 'om_retry' };
  });
  assert.deepEqual(sentBatches, [{ recipient: '测试负责人', uuid: failed.batchId }]);
  assert.deepEqual(
    f.state().events[0].notifications.map((job) => job.messageId),
    ['om_retry', 'om_original', undefined],
  );
});

test('a failed run gets a terminal receipt even when another session saves concurrently', async (t) => {
  let conflict = false;
  const f = await setup(t, {
    answer: '没有可解析的最终结果',
    beforeSave(current, incoming) {
      if (conflict || incoming.runs[0]?.status !== '失败') return false;
      conflict = true;
      current.tasks[0].description = '其他客户端保存的设置';
      return true;
    },
  });
  await assert.rejects(f.service.runTask('task', 'failed-with-conflict'), /最终回复未返回有效JSON/);
  assert.equal(conflict, true);
  assert.equal(f.state().runs[0].status, '失败');
  assert.equal(f.state().runs[0].result, '问数最终回复未返回有效JSON');
  assert.ok(f.state().runs[0].completedAt);
  assert.equal(f.state().tasks[0].description, '其他客户端保存的设置');
  assert.equal(f.state().events.length, 0);
});

test('a saved terminal receipt is authoritative if the client loses the save acknowledgement', async (t) => {
  let responseLost = false;
  const f = await setup(t, {
    beforeSave(current, incoming) {
      if (responseLost || incoming.runs[0]?.status !== '成功') return false;
      responseLost = true;
      Object.assign(current, structuredClone(incoming));
      return true;
    },
  });
  const receipt = await f.service.runTask('task', 'acknowledgement-lost');
  assert.equal(responseLost, true);
  assert.equal(receipt.status, '成功');
  assert.equal(f.state().runs[0].status, '成功');
  assert.ok(f.state().events.every((event) => event.notifications?.length === 1));
  assert.ok(!f.calls.some((call) => call.body.state?.runs[0]?.status === '失败'));
});

test('an overdue run with no final receipt is shown as pending verification without rewriting history', async (t) => {
  const started = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();
  const f = await setup(t, {
    runs: [
      { id: 'overdue', taskId: 'task', status: '执行中', at: started(15) },
      { id: 'active', taskId: 'task', status: '执行中', at: started(1) },
      { id: 'complete', taskId: 'task', status: '成功', at: started(20) },
    ],
  });
  const { runs } = await f.service.api({ op: 'list' });
  assert.deepEqual(
    runs.map((run) => run.status),
    ['待核实', '执行中', '成功'],
  );
  assert.match(runs[0].result, /超过9分钟.*最终回执/);
  assert.equal(f.state().runs[0].status, '执行中');
  assert.ok(!f.calls.some((call) => call.body.operation === 'save'));
});

test('editing an enabled scheduled task saves its new schedule without restarting the job', async (t) => {
  const f = await setup(t);
  const task = f.state().tasks[0];
  const schedule = { frequency: 'weekly', time: '10:12', days: ['1', '3'] };
  const saved = await f.service.api({
    op: 'save',
    task: { ...task, description: '低于96预警', schedule, frequency: '每周 周一、周三 10:12' },
  });
  assert.equal(saved.enabled, true);
  assert.deepEqual(f.state().tasks[0].schedule, schedule);
  assert.equal(f.state().tasks[0].description, '低于96预警');
  const scheduled = f.calls.filter((call) => call.body.operation === 'xxl');
  assert.deepEqual(
    scheduled.map((call) => call.body.path),
    ['/jobinfo/update'],
  );
  assert.equal(scheduled[0].body.data.id, '42');
  assert.equal(scheduled[0].body.data.scheduleConf, '0 12 10 ? * MON,WED');
  assert.equal(f.state().runs.length, 0);
});

test('editing a stopped task saves the new interval and keeps manual execution disabled', async (t) => {
  const f = await setup(t, { enabled: false });
  const task = f.state().tasks[0];
  const schedule = { frequency: 'interval', interval: '3' };
  const saved = await f.service.api({
    op: 'save',
    task: { ...task, schedule, frequency: '每隔 3 小时' },
  });
  assert.equal(saved.enabled, false);
  assert.deepEqual(f.state().tasks[0].schedule, schedule);
  const scheduled = f.calls.filter((call) => call.body.operation === 'xxl');
  assert.deepEqual(
    scheduled.map((call) => call.body.path),
    ['/jobinfo/update'],
  );
  assert.equal(scheduled[0].body.data.scheduleType, 'FIX_RATE');
  assert.equal(scheduled[0].body.data.scheduleConf, '10800');
  await assert.rejects(f.service.api({ op: 'run', id: 'task' }), /已停用/);
  assert.equal(f.state().runs.length, 0);
});

test('run now starts a scheduled task locally once and keeps its schedule intact', async (t) => {
  const answer = Promise.withResolvers();
  t.after(() => answer.resolve());
  const f = await setup(t, { answerGate: answer.promise });
  const originalSchedule = f.state().tasks[0].schedule;
  const receipt = await f.service.api({ op: 'run', id: 'task' });
  assert.equal(receipt.accepted, true);
  assert.equal(receipt.run.status, '执行中');
  assert.equal(f.state().runs[0].id, receipt.run.id);
  await assert.rejects(f.service.api({ op: 'run', id: 'task' }), /上一次检测仍在执行/);
  answer.resolve();
  await f.finished;
  assert.equal(f.state().runs.length, 1);
  assert.equal(f.state().runs[0].status, '成功');
  assert.deepEqual(f.state().tasks[0].schedule, originalSchedule);
  assert.equal(f.state().tasks[0].enabled, true);
  assert.equal(f.calls.filter((call) => call.path === 'detection-prompt').length, 1);
  assert.ok(!f.calls.some((call) => call.body.operation === 'xxl'));
});

test('actual detection orchestration matches configured owners, queues one digest and reuses duplicate run receipts', async (t) => {
  const f = await setup(t);
  const result = await f.service.runTask('task', 'fixture-run');
  assert.equal(result.status, '成功');
  assert.equal(result.notificationRouting.directoryRevision, 3);
  assert.ok(
    result.notificationRouting.matches.every((row) => row.recipients[0].account === '10000001'),
  );
  assert.equal(f.calls.filter((call) => call.body.operation === 'feishu-recipient').length, 1);
  assert.ok(f.calls.every((call) => call.body.username !== 'self'));
  const prompt = f.calls.find((call) => call.path === 'detection-prompt').body.text;
  assert.match(prompt, /四舍五入保留 1 位小数/);
  assert.match(prompt, /结构化 value、规则阈值和风险判断使用原始精度/);
  const persisted = f.state();
  assert.ok(persisted.events.every((event) => event.value === 94.9871 && event.level === '预警'));
  const sent = [];
  await drainNotifications({
    state: persisted,
    save: async () => {},
    locked: (fn) => fn(),
    send: async ({ card }) => {
      sent.push(card);
      return { messageId: 'om_fixture' };
    },
  });
  assert.equal(sent.length, 1);
  assert.match(sent[0].elements[0].text.content, /当前值\*\* 95\.0%.*预警 \/ 活跃/);
  assert.ok(persisted.events.every((event) => event.notifications[0].status === '已发送'));
  assert.equal((await f.service.runTask('task', 'fixture-run')).id, result.id);
  assert.equal(f.state().runs.length, 1);
});
test('unavailable directory leaves detection successful and records an explicit notification issue without fallback recipients', async (t) => {
  const f = await setup(t, { directoryError: true });
  const result = await f.service.runTask('task', 'directory-unavailable');
  assert.equal(result.status, '成功');
  assert.match(result.notificationIssue, /配置未能读取/);
  assert.equal(f.state().events.length, 2);
  assert.ok(f.state().events.every((event) => !event.notifications?.length));
  assert.equal(f.calls.filter((call) => call.body.operation === 'feishu-recipient').length, 0);
});
test('saving owners verifies the employee and name through the shared service before any whitelist write', async (t) => {
  const f = await setup(t);
  await f.service.api({ op: 'owner-directory' });
  await assert.rejects(
    f.service.api({
      op: 'owner-directory-save',
      revision: 3,
      owners: [{ ...owners[0], name: '同名错误人员' }],
    }),
    /不匹配/,
  );
  assert.equal(f.calls.filter((call) => call.body.operation === 'directory-save').length, 0);
  await f.service.api({ op: 'owner-directory-save', revision: 3, owners });
  const saves = f.calls.filter((call) => call.body.operation === 'directory-save');
  assert.equal(saves.length, 1);
  assert.equal(saves[0].body.directoryId, 'fixture-dir');
});
