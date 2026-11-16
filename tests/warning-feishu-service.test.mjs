import test from 'node:test';
import assert from 'node:assert/strict';
import { createWarningExecutor } from '../services/warning-executor/server.mjs';

test('shared application verifies a selected GEA employee without returning app credentials or using the authorizing user as recipient', async () => {
  const calls = [];
  const fetcher = async (url, options = {}) => {
    const u = new URL(url);
    calls.push({ path: u.pathname, body: options.body });
    if (u.pathname === '/sys/user/getUserInfo')
      return Response.json({
        success: true,
        result: { userInfo: { id: 'owner', username: 'other' } },
      });
    if (u.pathname === '/ai/gateway/agent/session')
      return Response.json({ result: { accessDecision: { allowed: true } } });
    if (u.pathname === '/sys/user/queryUserComponentData')
      return Response.json({
        success: true,
        result: {
          records: [{ username: '10008447', workNo: '10008447', realname: '刘壮壮', status: 1 }],
        },
      });
    if (u.pathname === '/oauth/v3/token')
      return Response.json({ code: 0, access_token: 'private-tenant-token', expires_in: 7200 });
    if (u.pathname === '/open-apis/directory/v1/employees/search')
      return Response.json({
        code: 0,
        data: {
          employees: [
            {
              base_info: {
                employee_id: 'ou_selected',
                name: { name: { default_value: '刘壮壮' } },
                active_status: 2,
                is_resigned: false,
              },
              work_info: { job_number: '10008447' },
            },
          ],
          page_response: { has_more: false },
        },
      });
    throw Error('Unexpected service request ' + u.pathname);
  };
  const executor = createWarningExecutor(
    {
      environment: 'production',
      geaBase: 'https://gea',
      feishu: { appId: 'cli_aaf07a77f7789bfb', appSecret: 'private-app-secret' },
    },
    fetcher,
  );
  await new Promise((r) => executor.server.listen(0, '127.0.0.1', r));
  try {
    const response = await fetch('http://127.0.0.1:' + executor.server.address().port + '/client', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Access-Token': 'owner-token',
        'X-GEA-Environment': 'production',
        'X-Tenant-Id': '0',
      },
      body: JSON.stringify({ operation: 'feishu-recipient', username: '10008447' }),
    });
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.value.mapped, true);
    assert.equal(body.value.recipientName, '刘壮壮');
    assert.equal(body.value.receiveId, '10008447');
    assert.equal(body.value.receiveIdType, 'gea');
    assert.doesNotMatch(JSON.stringify(body), /private-|ou_selected/);
    assert.equal(calls.filter((x) => x.path.includes('employees/search')).length, 1);
    assert.equal(calls.filter((x) => x.path.includes('/im/')).length, 0);
  } finally {
    await executor.close();
  }
});

const person = { username: '10008447', workNo: '10008447', realname: '刘壮壮' };
const employee = (patch = {}) => ({
  base_info: {
    employee_id: 'ou_selected',
    name: { name: { default_value: '刘壮壮' } },
    active_status: 2,
    is_resigned: false,
  },
  work_info: { job_number: '10008447' },
  ...patch,
});
function providerTransport({ rows = [employee()], hasMore = false, send } = {}) {
  const calls = [];
  return {
    calls,
    fetch: async (url, options = {}) => {
      const path = new URL(url).pathname;
      calls.push({ path, options });
      if (path.endsWith('/oauth/v3/token'))
        return Response.json({ code: 0, access_token: 'private-token', expires_in: 7200 });
      if (path.endsWith('/employees/search'))
        return Response.json({
          code: 0,
          data: { employees: rows, page_response: { has_more: hasMore, page_token: 'repeat' } },
        });
      if (path.endsWith('/im/v1/messages'))
        return send
          ? send(options)
          : Response.json({ code: 0, data: { message_id: 'om_receipt' } });
      throw Error('Unexpected path ' + path);
    },
  };
}
test('recipient resolution requires an exact employee number and active account, even for identical names', async () => {
  const { createFeishuWarningApp } = await import('../services/warning-executor/feishu-app.mjs');
  for (const rows of [
    [employee({ work_info: { job_number: 'someone-else' } })],
    [employee({ base_info: { employee_id: 'ou_selected', active_status: 3, is_resigned: false } })],
    [
      employee(),
      employee({ base_info: { employee_id: 'ou_other', active_status: 2, is_resigned: false } }),
    ],
  ]) {
    const fixture = providerTransport({ rows });
    const app = createFeishuWarningApp(
      { appId: 'cli_aaf07a77f7789bfb', appSecret: 'private' },
      fixture.fetch,
    );
    await assert.rejects(app.resolveEmployee(person));
    assert.equal(
      fixture.calls.some((x) => x.path.includes('user_info') || x.path.includes('/im/')),
      false,
    );
  }
});
test('incomplete repeated directory pages never produce a verified recipient', async () => {
  const { createFeishuWarningApp } = await import('../services/warning-executor/feishu-app.mjs');
  const fixture = providerTransport({ hasMore: true });
  const app = createFeishuWarningApp(
    { appId: 'cli_aaf07a77f7789bfb', appSecret: 'private' },
    fixture.fetch,
  );
  await assert.rejects(app.resolveEmployee(person), /分页不完整/);
});
test('delivery receipts survive a new provider instance and never send the same notice twice', async (t) => {
  const { createFeishuWarningApp } = await import('../services/warning-executor/feishu-app.mjs');
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const directory = await mkdtemp(join(tmpdir(), 'warning-feishu-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const fixture = providerTransport();
  const config = {
    appId: 'cli_aaf07a77f7789bfb',
    appSecret: 'private',
    receiptDirectory: directory,
  };
  const input = {
    ownerKey: 'owner',
    person,
    uuid: 'a'.repeat(32),
    card: { header: { title: { tag: 'plain_text', content: 'Test' } } },
  };
  const first = await createFeishuWarningApp(config, fixture.fetch).send(input);
  assert.deepEqual(await createFeishuWarningApp(config, fixture.fetch).send(input), first);
  const sent = fixture.calls.filter((x) => x.path.endsWith('/im/v1/messages'));
  assert.equal(sent.length, 1);
  assert.equal(JSON.parse(sent[0].options.body).receive_id, 'ou_selected');
});
test('a lost send response stays unknown and is not resent after restart', async (t) => {
  const { createFeishuWarningApp } = await import('../services/warning-executor/feishu-app.mjs');
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const directory = await mkdtemp(join(tmpdir(), 'warning-feishu-unknown-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const fixture = providerTransport({
    send: () => {
      throw Error('Lost response');
    },
  });
  const config = {
    appId: 'cli_aaf07a77f7789bfb',
    appSecret: 'private',
    receiptDirectory: directory,
  };
  const input = {
    ownerKey: 'owner',
    person,
    uuid: 'b'.repeat(32),
    card: { header: { title: { tag: 'plain_text', content: 'Test' } } },
  };
  for (let i = 0; i < 2; i++)
    await assert.rejects(
      createFeishuWarningApp(config, fixture.fetch).send(input),
      (e) => e.unknown === true,
    );
  assert.equal(fixture.calls.filter((x) => x.path.endsWith('/im/v1/messages')).length, 1);
});
