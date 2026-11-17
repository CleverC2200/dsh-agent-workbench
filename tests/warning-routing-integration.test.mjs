import test from 'node:test';
import assert from 'node:assert/strict';
import { installDetection } from '../src/detection-backend.mjs';
import { warningOwner } from '../src/warning-ownership.mjs';
import { drainNotifications } from '../src/feishu-warning-transport.mjs';
const status = {
  authenticated: true,
  environment: 'test',
  user: { id: 'fixture-user', username: 'fixture', name: '测试设置人', tenantId: '0' },
};
const owners = [
  { type: '品类', scope: '汤圆', name: '测试负责人', employeeNo: '10000001' },
  { type: '品类', scope: '饺子', name: '测试负责人', employeeNo: '10000001' },
];
async function setup(t, { directoryError = false } = {}) {
  let state = {
    tasks: [
      {
        id: 'task',
        owner: warningOwner(status),
        metric: '订单满足率',
        scope: '品类',
        description: '低于95预警',
        enabled: true,
        notifyStrategy: 'automatic',
        notifyMode: 'repeat',
        notifyRecipients: ['self'],
      },
    ],
    runs: [],
    events: [],
  };
  const calls = [],
    cleanups = [];
  const rows = ['汤圆', '饺子'].map((objectName) => ({
    scope: '品类',
    objectKey: objectName,
    objectName,
    status: '预警',
    value: 94,
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
      prompt: async () => {},
      async *follow() {
        yield {
          type: 'event',
          event: {
            type: 'assistant/message',
            data: {
              message: {
                content: [
                  { type: 'text', text: JSON.stringify({ complete: true, results: rows }) },
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
                value: { ...structuredClone(state), revision: 'fixture-revision' },
              });
            if (body.operation === 'save') {
              state = structuredClone(body.state);
              return Response.json({
                ok: true,
                value: { saved: true, revision: 'fixture-revision' },
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
          throw Error('Unexpected request ' + path + ' ' + body.operation);
        },
      }),
    },
  });
  t.after(() => cleanups.reverse().forEach((cleanup) => cleanup()));
  await service.api({ op: 'list' });
  return { service, calls, state: () => state };
}
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
  const persisted = f.state();
  let sent = 0;
  await drainNotifications({
    state: persisted,
    save: async () => {},
    locked: (fn) => fn(),
    send: async () => {
      sent++;
      return { messageId: 'om_fixture' };
    },
  });
  assert.equal(sent, 1);
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
