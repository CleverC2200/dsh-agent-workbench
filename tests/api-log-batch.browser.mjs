import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { createServer } from 'node:https';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { chromium, expect } from '@playwright/test';
const source = resolve('../dsh-gea-plugin/src/host/business.ts');
const host = await build({
  entryPoints: [source],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  packages: 'external',
});
const mod = { exports: {} };
new Function('require', 'module', 'exports', host.outputFiles[0].text)(
  createRequire(source),
  mod,
  mod.exports,
);
const ui = await build({
  stdin: {
    contents: `import React from 'react';import{createRoot}from'react-dom/client';import{ApiLogCenter}from'./src/workbench/api-log-center.tsx';const root=createRoot(document.getElementById('root'));const request=async(endpoint,payload,signal)=>{const r=await fetch('/api/gea-proof/'+endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal});const v=await r.json();if(!v.ok)throw Error(v.error);return v.value;};root.render(<ApiLogCenter environment="test" request={request} onClose={()=>root.unmount()}/>);`,
    resolveDir: process.cwd(),
    loader: 'tsx',
  },
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'iife',
});
const css = await readFile(new URL('../src/workbench/api-log.css', import.meta.url), 'utf8');
const nativeUi = await build({
  stdin: {
    contents: `import React from 'react';import{createRoot}from'react-dom/client';import{mountBusinessViews}from'./src/business-views.tsx';
 const root=createRoot(document.getElementById('root'));let LogPage;
 let identity={state:'confirmed',scope:'fixture-principal',status:{authenticated:true,environment:'test',user:{name:'Fixture'}}};const identityListeners=new Set();window.setFixtureIdentity=value=>{identity=value;for(const listener of identityListeners)listener();};
 const ctx={effect:fn=>fn(),inject:(_requirements,fn)=>fn(ctx),locale:{register:()=>()=>{},bind:()=>key=>key,getSnapshot:()=>({active:'zh'})},businessAccount:{subscribe:fn=>{identityListeners.add(fn);return()=>identityListeners.delete(fn);},getSnapshot:()=>identity},agentWorkbench:{register:()=>()=>{},registerFrame:()=>()=>{},open:async()=>root.unmount()},slots:{inject:(slot,fn)=>fn(),register:(slot,component)=>{if(slot.key==='gea-api-log')LogPage=component;return()=>{};}}};
 mountBusinessViews(ctx);root.render(<LogPage/>);`,
    resolveDir: process.cwd(),
    loader: 'tsx',
  },
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'iife',
  loader: { '.css': 'text' },
});

async function open(t, options = {}) {
  const certdir = await mkdtemp(tmpdir() + '/gea-batch-ui-');
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      certdir + '/key',
      '-out',
      certdir + '/cert',
      '-days',
      '1',
      '-subj',
      '/CN=localhost',
    ],
    { stdio: 'ignore' },
  );
  t.after(() => rm(certdir, { recursive: true, force: true }));
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  let business;
  const requests = [];
  let delayed = false,
    failed = false;
  const server = createServer(
    {
      key: await readFile(certdir + '/key'),
      cert: await readFile(certdir + '/cert'),
    },
    async (req, res) => {
      const url = new URL(req.url, 'https://fixture');
      if (url.pathname.startsWith('/api/gea-proof/')) {
        let raw = '';
        for await (const c of req) raw += c;
        const payload = JSON.parse(raw || '{}');
        const endpoint = url.pathname.slice('/api/gea-proof/'.length);
        const controller = new AbortController();
        res.on('close', () => {
          if (!res.writableEnded) controller.abort();
        });
        try {
          business.assertOperation(endpoint);
          let value;
          if (endpoint === 'status') value = business.status();
          else if (endpoint === 'api-log/snapshot') value = business.apiLogSnapshot(payload);
          else if (endpoint === 'api-log/clear') value = business.apiLogClear(payload);
          else if (endpoint === 'api-log/replay')
            value = await business.apiLogReplay(payload, controller.signal);
          else if (endpoint === 'api-log/batch/start')
            value = business.apiLogBatchStart(payload, controller.signal);
          else if (endpoint === 'api-log/batch/read') value = business.apiLogBatchRead(payload);
          else if (endpoint === 'api-log/batch/stop') value = business.apiLogBatchStop(payload);
          else throw Error('UNEXPECTED_OPERATION');
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true, value }));
        } catch (e) {
          res.end(JSON.stringify({ ok: false, error: e.message }));
        }
        return;
      }
      if (url.pathname === '/') {
        res.setHeader('Content-Type', 'text/html');
        res.end('<style>html,body,#root{height:100%;margin:0}</style><div id="root"></div>');
        return;
      }
      if (!url.pathname.startsWith('/sys/') && !url.pathname.startsWith('/sales-plan/')) {
        res.statusCode = 204;
        res.end();
        return;
      }
      let body = '';
      for await (const c of req) body += c;
      requests.push({ url: req.url, body, headers: req.headers });
      if (failed) {
        req.socket.destroy();
        return;
      }
      if (delayed) return;
      res.setHeader('Content-Type', 'application/json');
      res.end('{"success":true,"result":{}}');
    },
  );
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const origin = 'https://127.0.0.1:' + server.address().port;
  business = new mod.exports.Business({
    geaBaseUrl: origin,
    environment: 'test',
    analysisAgentCode: 'fixture',
    requestTimeoutMs: 1000,
  });
  business.restoreDesktopLogin({
    schema: 1,
    environment: 'test',
    base: origin,
    auth: {
      token: 'fixture-secret',
      tenantId: '0',
      id: 'u1',
      name: 'Fixture',
      username: 'fixture',
    },
  });
  t.after(() => business.dispose());
  const capture = async (path = '/sys/user/getUserInfo', init) => {
    const response = await business.fetchExternal(origin + path, init);
    await response.text();
    return business.apiLogSnapshot({}).records[0];
  };
  await capture();
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  await page.goto(origin);
  if (!options.native) await page.addStyleTag({ content: css });
  await page.addScriptTag({
    content: (options.native ? nativeUi : ui).outputFiles[0].text,
  });
  await expect(page.locator('.gea-api-call-row')).toHaveCount(1);
  await page.getByRole('button', { name: '实时', exact: true }).click();
  return {
    page,
    business,
    requests,
    capture,
    delay: () => (delayed = true),
    fail: () => (failed = true),
  };
}
test('same-page batch confirmation freezes samples, retains skip reasons and original write intent', async (t) => {
  const f = await open(t);
  const write = await f.capture('/sales-plan/plans/versions/v1/actions', {
    method: 'POST',
    headers: { 'X-Request-Id': 'write-1', 'Idempotency-Key': 'key-1' },
    body: '{"action":"SAVE"}',
  });
  await f.page.getByRole('button', { name: '刷新', exact: true }).click();
  await f.page.getByRole('button', { name: '批量', exact: true }).click();
  for (const name of ['读取当前用户', '读取权限代码', '版本动作'])
    await f.page.getByRole('checkbox', { name: '选择' + name, exact: true }).check();
  await f.page.getByRole('button', { name: '开始批量重发', exact: true }).click();
  const dialog = f.page.getByRole('dialog', { name: '确认批量重发' });
  await expect(dialog).toContainText('没有已捕获样本');
  await expect(dialog).toContainText(write.id);
  await dialog.getByRole('checkbox').check();
  const original = f.business
    .apiLogSnapshot({})
    .records.find((r) => r.catalogId === 'identity.profile');
  await f.capture('/sys/user/getUserInfo?new-sample=1');
  await dialog.getByRole('button', { name: '确认批量重发', exact: true }).click();
  await expect(f.page.getByRole('status')).toContainText('批量已结束');
  await expect(f.page.getByRole('status')).toContainText('跳过 1');
  assert.equal(f.requests.length, 5);
  const replayed = f.business.apiLogSnapshot({}).records.filter((r) => r.source === 'api-batch');
  assert.equal(replayed.find((r) => r.catalogId === 'identity.profile').replayedFrom, original.id);
  assert.deepEqual(f.requests.at(-1).body, '{"action":"SAVE"}');
  assert.equal(f.requests.at(-1).headers['idempotency-key'], 'key-1');
  await f.page.getByRole('tab', { name: 'Agent', exact: true }).click();
  await f.page.getByRole('tab', { name: '接口', exact: true }).click();
  assert.equal(f.requests.length, 5);
  for (const width of [1280, 390]) {
    await f.page.setViewportSize({ width, height: 900 });
    assert.equal(
      await f.page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    if (process.env.GEA_API_LOG_EVIDENCE_DIR) {
      await mkdir(process.env.GEA_API_LOG_EVIDENCE_DIR, { recursive: true });
      await f.page.screenshot({
        path: process.env.GEA_API_LOG_EVIDENCE_DIR + '/api-batch-' + width + '.png',
        fullPage: true,
      });
    }
  }
  await f.page.getByRole('button', { name: '清空', exact: true }).click();
  await f.page.getByRole('button', { name: '确认清空', exact: true }).click();
  await expect(f.page.getByRole('status')).toContainText('原记录不在当前缓冲区');
});
test('explicit stop and leaving the page cancel in-flight batches without dispatching later items', async (t) => {
  const f = await open(t);
  await f.capture('/sys/permission/getPermCode');
  await f.page.getByRole('button', { name: '刷新', exact: true }).click();
  await f.page.getByRole('button', { name: '批量', exact: true }).click();
  for (const name of ['读取当前用户', '读取权限代码'])
    await f.page.getByRole('checkbox', { name: '选择' + name, exact: true }).check();
  f.delay();
  await f.page.getByRole('button', { name: '开始批量重发', exact: true }).click();
  await f.page.getByRole('button', { name: '确认批量重发', exact: true }).click();
  await expect(f.page.getByRole('status')).toContainText('正在重发');
  await f.page.getByRole('button', { name: '停止批量重发', exact: true }).click();
  await expect(f.page.getByRole('status')).toContainText('批量已停止');
  assert.equal(f.requests.length, 3);
  await expect(f.page.getByRole('status')).toContainText('未执行 1');
  await f.page.getByRole('button', { name: '开始批量重发', exact: true }).click();
  await f.page.getByRole('button', { name: '确认批量重发', exact: true }).click();
  await expect(f.page.getByRole('status')).toContainText('正在重发');
  await f.page.getByRole('button', { name: '返回工作台', exact: true }).click();
  await expect.poll(() => f.business.apiLogBatchRead({}).at(-1).status).toBe('stopped');
  assert.equal(f.requests.length, 4);
});
test('single replay failure selects its captured log', async (t) => {
  const f = await open(t);
  f.fail();
  await f.page.getByRole('button', { name: '重发请求', exact: true }).click();
  await expect(f.page.getByRole('alert')).toContainText('请求');
  await expect(f.page.getByRole('complementary', { name: '调用详情', exact: true })).toContainText(
    '传输失败',
  );
  assert.equal(f.business.apiLogSnapshot({}).records[0].source, 'replay');
});

test('leaving the page aborts a single replay and preserves the captured cancelled log', async (t) => {
  const f = await open(t);
  f.delay();
  await f.page.getByRole('button', { name: '重发请求', exact: true }).click();
  await expect.poll(() => f.requests.length).toBe(2);
  await f.page.getByRole('button', { name: '返回工作台', exact: true }).click();
  await expect.poll(() => f.business.apiLogSnapshot({}).records[0].outcome).toBe('error');
  assert.equal(f.business.apiLogSnapshot({}).records[0].source, 'replay');
  assert.equal(f.requests.length, 2);
});

test('Native log registration injects the shared final layout and batch styles without HTML stylesheet assistance', async (t) => {
  const f = await open(t, { native: true });
  await f.page.getByRole('button', { name: '批量', exact: true }).click();
  await f.page.getByRole('checkbox', { name: '选择读取当前用户', exact: true }).check();
  await expect(f.page.getByRole('button', { name: '开始批量重发', exact: true })).toBeVisible();
  assert.equal(
    await f.page
      .getByRole('tabpanel', { name: '接口', exact: true })
      .locator('.gea-api-layout')
      .evaluate((element) => getComputedStyle(element).display),
    'grid',
  );
  assert.equal(
    await f.page
      .getByRole('tabpanel', { name: '接口', exact: true })
      .locator('.gea-api-batch-actions')
      .evaluate((element) => getComputedStyle(element).display),
    'flex',
  );
  await expect(f.page.getByRole('tab', { name: '接口', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  assert.equal(f.requests.length, 1);
});

test('selected batch from another window updates when Host stops it', async (t) => {
  const f = await open(t);
  await f.page.getByRole('button', { name: '批量', exact: true }).click();
  const record = f.business
    .apiLogSnapshot({})
    .records.find((record) => record.catalogId === 'identity.profile');
  assert.ok(record);
  f.delay();
  const foreign = f.business.apiLogBatchStart(
    {
      items: [{ catalogId: record.catalogId, recordId: record.id }],
      confirmedWriteIds: [],
    },
    new AbortController().signal,
  );
  const select = f.page.getByRole('combobox', {
    name: '选择重发批次',
    exact: true,
  });
  await expect(select.locator(`option[value="${foreign.runId}"]`)).toHaveCount(1);
  await select.selectOption(foreign.runId);
  await expect(f.page.getByRole('button', { name: '停止批量重发', exact: true })).toBeVisible();
  f.business.apiLogBatchStop({ runId: foreign.runId });
  await expect(f.page.getByRole('status')).toContainText('批量已停止');
  await expect(select).toBeEnabled();
  await expect(f.page.getByRole('button', { name: '停止批量重发', exact: true })).toHaveCount(0);
});

test('Native identity scope changes cancel the old batch even when the user stays the same', async (t) => {
  const f = await open(t, { native: true });
  await f.page.getByRole('button', { name: '批量', exact: true }).click();
  await f.page.getByRole('checkbox', { name: '选择读取当前用户', exact: true }).check();
  f.delay();
  await f.page.getByRole('button', { name: '开始批量重发', exact: true }).click();
  await f.page.getByRole('button', { name: '确认批量重发', exact: true }).click();
  await expect(f.page.getByRole('button', { name: '停止批量重发', exact: true })).toBeVisible();
  await f.page.evaluate(() =>
    window.setFixtureIdentity({
      state: 'error',
      scope: 'fixture-principal',
      error: '读取状态暂时失败',
      status: { authenticated: true, environment: 'test', user: { name: 'Fixture' } },
    }),
  );
  await expect(f.page.getByRole('alert')).toContainText('读取状态暂时失败');
  await expect(f.page.getByRole('button', { name: '停止批量重发', exact: true })).toBeVisible();
  f.business.restoreDesktopLogin({
    schema: 1,
    environment: 'test',
    base: f.business.base,
    auth: {
      token: 'fixture-secret',
      tenantId: '0',
      id: 'u1',
      name: 'Fixture',
      username: 'fixture',
    },
  });
  await f.page.evaluate(
    (scope) =>
      window.setFixtureIdentity({
        state: 'confirmed',
        scope,
        status: { authenticated: true, environment: 'test', user: { name: 'Fixture' } },
      }),
    f.business.pageSessionScope(),
  );
  await expect(f.page.getByRole('button', { name: '停止批量重发', exact: true })).toHaveCount(0);
  await f.page.getByRole('button', { name: '批量', exact: true }).click();
  await expect(f.page.getByRole('combobox', { name: '选择重发批次', exact: true })).toHaveCount(0);
  assert.deepEqual(f.business.apiLogBatchRead({}), []);
  await expect.poll(() => f.business.apiLogSnapshot({}).records).toEqual([]);
  assert.equal(f.requests.length, 2);
});
