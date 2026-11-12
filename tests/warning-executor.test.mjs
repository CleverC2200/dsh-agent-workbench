import test from 'node:test';
import assert from 'node:assert/strict';
import { createWarningExecutor } from '../services/warning-executor/server.mjs';

test('XXL-JOB registration, ownership, duplicate triggers and client receipts', async () => {
  const jobs = [],
    callbacks = [],
    registrations = [];
  const json = (body, headers = {}) => Response.json(body, { headers });
  const external = async (url, options = {}) => {
    const path = new URL(url).pathname;
    if (path === '/sys/user/getUserInfo')
      return json({
        success: true,
        result: { userInfo: { id: options.headers['X-Access-Token'], username: 'test' } },
      });
    if (path === '/ai/gateway/agent/session')
      return json({ result: { accessDecision: { allowed: true } } });
    if (path === '/login')
      return json({ code: 200 }, { 'set-cookie': 'XXL_JOB_LOGIN_IDENTITY=test; HttpOnly' });
    if (path === '/jobgroup/pageList')
      return json({ data: [{ id: 3, appname: 'gea-warning-executor' }] });
    if (path === '/api/registry') {
      registrations.push(JSON.parse(options.body));
      return json({ code: 200 });
    }
    if (path === '/api/callback') {
      callbacks.push(...JSON.parse(options.body));
      return json({ code: 200 });
    }
    if (path === '/jobinfo/pageList') return json({ recordsFiltered: jobs.length, data: jobs });
    if (path === '/jobinfo/add') {
      const job = Object.fromEntries(options.body);
      job.id = 11;
      jobs.push(job);
      return json({ code: 200, content: 11 });
    }
    if (['/jobinfo/start', '/jobinfo/stop', '/jobinfo/trigger'].includes(path))
      return json({ code: 200 });
    throw Error('unexpected external request ' + path);
  };
  const service = createWarningExecutor(
    {
      port: 0,
      host: '127.0.0.1',
      appName: 'gea-warning-executor',
      adminUrl: 'http://xxl',
      executorUrl: 'http://executor:18112',
      geaBase: 'http://gea',
      username: 'admin',
      password: 'private',
      accessToken: 'xxl-private',
    },
    external,
  );
  try {
    await service.start();
    const url = 'http://127.0.0.1:' + service.server.address().port;
    const request = async (path, body, headers = {}) => {
      const r = await fetch(url + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
      });
      return { status: r.status, body: await r.json() };
    };
    const client = (body, who = 'me') =>
      request('/client', body, { 'X-Access-Token': who, 'X-Tenant-Id': 't' });
    assert.equal(registrations[0].registryKey, 'gea-warning-executor');
    const data = {
      executorParam: JSON.stringify({ taskId: 'monitor-test' }),
      scheduleType: 'CRON',
      scheduleConf: '0 0 9 * * ?',
      jobDesc: '测试',
    };
    assert.equal((await client({ operation: 'xxl', path: '/jobinfo/add', data })).body.value, 11);
    assert.equal((await client({ operation: 'xxl', path: '/jobinfo/add', data })).body.value, 11);
    assert.equal(jobs.length, 1);
    assert.equal(
      (await client({ operation: 'xxl', path: '/jobinfo/start', data: { id: '11' } }, 'other'))
        .status,
      403,
    );
    assert.equal((await request('/run', {})).status, 403);
    const trigger = {
      jobId: 11,
      logId: 100,
      logDateTime: Date.now(),
      executorHandler: 'geaDetectionHandler',
      executorParams: jobs[0].executorParam,
      glueType: 'BEAN',
    };
    assert.equal(
      (await request('/run', trigger, { 'XXL-JOB-ACCESS-TOKEN': 'xxl-private' })).body.code,
      200,
    );
    assert.equal(
      (await request('/run', trigger, { 'XXL-JOB-ACCESS-TOKEN': 'xxl-private' })).body.code,
      200,
    );
    assert.equal(service.stats().jobs, 1);
    assert.equal((await client({ operation: 'poll', busy: false }, 'other')).body.value.job, null);
    assert.equal((await client({ operation: 'poll', busy: true })).body.value.job, null);
    assert.equal(
      (await client({ operation: 'poll', busy: false })).body.value.job.runKey,
      'xxl-100',
    );
    assert.equal((await client({ operation: 'poll', busy: false })).body.value.job, null);
    assert.equal(
      (await client({ operation: 'complete', logId: 100, code: 200, message: '检测完成' }, 'other'))
        .status,
      403,
    );
    assert.equal(
      (await client({ operation: 'complete', logId: 100, code: 200, message: '检测完成' })).body
        .value.accepted,
      true,
    );
    assert.equal(
      (await client({ operation: 'complete', logId: 100, code: 200, message: '检测完成' })).body
        .value.accepted,
      true,
    );
    assert.equal(callbacks.length, 1);
    assert.equal(callbacks[0].logDateTim, trigger.logDateTime);
    assert.equal(callbacks[0].handleCode, 200);
    assert.equal(
      (await client({ operation: 'complete', logId: 100, code: 500, message: '覆盖回执' })).status,
      409,
    );
  } finally {
    await service.close();
  }
});
