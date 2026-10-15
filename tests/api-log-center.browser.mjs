import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { readFile, mkdir } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';

// Use the GEA checkout from the same candidate group.
const hostSource = resolve('../dsh-gea-plugin/src/host/api-log.ts');
const host = await build({
  entryPoints: [hostSource],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { GeaApiLogCenter } = await import(
  'data:text/javascript;base64,' + Buffer.from(host.outputFiles[0].contents).toString('base64')
);
const ui = await build({
  stdin: {
    contents: `import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {ApiLogCenter} from './src/workbench/api-log-center.tsx';
    const request=async(endpoint,payload,signal)=>{
      const response=await fetch('/api/gea-proof/'+endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal});
      const result=await response.json();
      if(!result.ok)throw Error(result.error);
      return result.value;
    };
    createRoot(document.getElementById('root')).render(<ApiLogCenter environment="test" request={request} onClose={()=>document.body.dataset.closed='true'}/>);`,
    resolveDir: process.cwd(),
    loader: 'tsx',
  },
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'iife',
});
const css = await readFile(new URL('../src/workbench/api-log.css', import.meta.url), 'utf8');

async function openCenter(t) {
  const upstream = [];
  let center;
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname.startsWith('/upstream/') || url.pathname.startsWith('/sales-plan/')) {
      let body = '';
      for await (const chunk of req) body += chunk;
      upstream.push({
        path: url.pathname,
        body,
        requestId: req.headers['x-request-id'],
        idempotencyKey: req.headers['idempotency-key'],
      });
      if (url.pathname.endsWith('/transport-failure')) res.statusCode = 503;
      if (url.pathname.endsWith('/stream')) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.end('data: fixture-stream-content\n\n');
        return;
      }
      if (url.pathname.endsWith('/no-body')) {
        res.statusCode = 204;
        res.end();
        return;
      }
      if (url.pathname.endsWith('/network-failure')) {
        req.socket.destroy();
        return;
      }
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          success: false,
          businessDecision: 'DENY',
          access_token: 'fixture-response-secret',
          ...(url.pathname.endsWith('/oversized') ? { data: 'x'.repeat(4 * 1024 * 1024 + 1) } : {}),
        }),
      );
      return;
    }
    if (url.pathname.startsWith('/api/gea-proof/')) {
      const endpoint = url.pathname.slice('/api/gea-proof/'.length);
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const payload = JSON.parse(raw || '{}');
      res.setHeader('Content-Type', 'application/json');
      try {
        const value =
          endpoint === 'api-log/snapshot'
            ? center.snapshot()
            : endpoint === 'api-log/clear'
              ? center.clear()
              : endpoint === 'api-log/replay'
                ? await center.replay(payload.id, payload.confirmed)
                : (() => {
                    throw Error('Unexpected operation: ' + endpoint);
                  })();
        res.end(JSON.stringify({ ok: true, value }));
      } catch (error) {
        res.end(JSON.stringify({ ok: false, error: error.message }));
      }
      return;
    }
    res.setHeader('Content-Type', 'text/html');
    res.end(
      '<style>html,body,#root{height:100%;margin:0}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}</style><div id="root"></div>',
    );
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  const origin = 'http://127.0.0.1:' + server.address().port;
  center = new GeaApiLogCenter(() => 'test');
  async function capture(path, requestId = 'req-read-1') {
    const response = await center.fetch(origin + '/upstream/' + path, {
      headers: { 'X-Access-Token': 'fixture-request-secret', 'X-Request-Id': requestId },
    });
    await response.text();
  }
  await capture('company/gea/sys/user/getUserInfo');
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, []));
  await page.goto(origin);
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: ui.outputFiles[0].text });
  await expect(page.getByRole('button').filter({ hasText: '读取当前用户' }).first()).toBeVisible();
  return { page, center, upstream, capture, origin };
}

test('original log page opens Interface, Permission and Agent tabs without issuing business calls', async (t) => {
  const { page, upstream } = await openCenter(t);
  await expect(page.getByRole('tab', { name: '接口', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  assert.equal(await page.getByRole('tab').count(), 3);
  await expect(page.getByRole('heading', { name: '接口日志中心', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: '权限', exact: true }).click();
  await expect(page.getByRole('tabpanel')).toContainText('权限测试暂未接入');
  await page.getByRole('tab', { name: 'Agent', exact: true }).click();
  await expect(page.getByRole('tabpanel')).toContainText('Agent 测试暂未接入');
  await page.keyboard.press('Home');
  await expect(page.getByRole('tab', { name: '接口', exact: true })).toBeFocused();
  await expect(page.getByRole('tab', { name: '接口', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  assert.equal(upstream.length, 1);
});

test('request ID search retains buffer counts and HTTP 200 business denial stays outside transport failures', async (t) => {
  const { page, center, upstream, capture } = await openCenter(t);
  await page.getByRole('button', { name: '实时', exact: true }).click();
  await capture('unregistered/transport-failure', 'req-failed-1');
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  await expect(page.locator('.gea-api-call-row')).toHaveCount(2);
  const catalog = page.getByRole('navigation', { name: '接口目录' });
  const profile = catalog.getByRole('button').filter({ hasText: '读取当前用户' });
  await expect(profile.locator('strong')).toHaveText('1');
  await expect(
    catalog.getByRole('button').filter({ hasText: '全部调用' }).locator('strong'),
  ).toHaveText('2');
  assert.equal(
    await catalog.locator('.gea-api-catalog-scroll button').count(),
    center.snapshot().catalog.length,
  );
  await page.getByRole('textbox', { name: '搜索调用记录' }).fill('req-read-1');
  await expect(page.locator('.gea-api-call-row')).toHaveCount(1);
  await expect(page.locator('.gea-api-call-row')).toContainText('req-read-1');
  await expect(page.locator('.gea-api-call-row')).toContainText('HTTP 200');
  await expect(profile.locator('strong')).toHaveText('1');
  await expect(page.getByRole('complementary', { name: '调用详情' })).toContainText(
    'businessDecision',
  );
  await page.getByRole('button', { name: '传输失败', exact: true }).click();
  await expect(page.locator('.gea-api-call-row')).toHaveCount(0);
  await page.getByRole('button', { name: '清空搜索', exact: true }).click();
  await expect(page.locator('.gea-api-call-row')).toHaveCount(1);
  await expect(page.locator('.gea-api-call-row')).toContainText('req-failed-1');
  await expect(page.locator('.gea-api-call-row')).toContainText('HTTP 503');
  assert.equal(upstream.length, 2);
});

test('captured details and copies stay redacted, replay stays explicit, and clear preserves the catalog', async (t) => {
  const { page, center, upstream, capture } = await openCenter(t);
  await page.getByRole('button', { name: '实时', exact: true }).click();
  await capture('unregistered/read?scope=parts&access_token=fixture-query-secret', 'req-other-1');
  assert.equal(
    await page.locator('.gea-api-call-row').count(),
    1,
    'paused page retains its current snapshot',
  );
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  await expect(page.locator('.gea-api-call-row')).toHaveCount(2);
  await page.locator('.gea-api-call-row').filter({ hasText: 'req-other-1' }).click();
  const detail = page.getByRole('complementary', { name: '调用详情' });
  await expect(detail.getByRole('button', { name: '重发请求', exact: true })).toBeDisabled();
  await expect(detail).toContainText('Query');
  await detail.getByText('请求头与 Query · 已脱敏', { exact: true }).click();
  await expect(detail).toContainText('parts');
  await detail.getByRole('button', { name: '复制请求头', exact: true }).click();
  const requestCopy = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(requestCopy, /已脱敏/);
  assert.equal(requestCopy.includes('fixture-request-secret'), false);
  await detail.getByRole('button', { name: '复制响应报文', exact: true }).click();
  const responseCopy = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(responseCopy, /DENY/);
  assert.equal(responseCopy.includes('fixture-response-secret'), false);
  assert.equal(JSON.stringify(center.snapshot()).includes('fixture-query-secret'), false);
  assert.equal((await page.locator('main').innerText()).includes('fixture-'), false);
  await page.locator('.gea-api-call-row').filter({ hasText: 'req-read-1' }).click();
  const replay = detail.getByRole('button', { name: '重发请求', exact: true });
  const actionBox = await replay.boundingBox();
  const headingBox = await detail
    .getByRole('heading', { name: '读取当前用户', exact: true })
    .boundingBox();
  assert.ok(
    actionBox.x > headingBox.x && Math.abs(actionBox.y - headingBox.y) < 40,
    'replay is in the detail heading on the right',
  );
  assert.equal(upstream.length, 2);
  await replay.click();
  await expect(page.locator('.gea-api-call-row')).toHaveCount(3);
  await expect(page.locator('.gea-api-replayed')).toHaveCount(1);
  assert.equal(upstream.length, 3);
  assert.equal(center.snapshot().records[0].replayedFrom, center.snapshot().records[2].id);
  await page.getByRole('button', { name: '清空', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('只清空');
  assert.equal(center.snapshot().records.length, 3);
  await page.getByRole('button', { name: '确认清空', exact: true }).click();
  await expect(page.locator('.gea-api-call-row')).toHaveCount(0);
  assert.equal(center.snapshot().records.length, 0);
  assert.ok(center.snapshot().catalog.length > 20);
  assert.equal(upstream.length, 3);
});

test('desktop and narrow log layouts retain transport duration and keyboard selection reaches the details', async (t) => {
  const { page } = await openCenter(t);
  await page.getByRole('button', { name: '实时', exact: true }).click();
  const evidence = process.env.GEA_API_LOG_EVIDENCE_DIR;
  if (evidence) await mkdir(evidence, { recursive: true });
  for (const width of [1440, 1280, 900, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const row = page.locator('.gea-api-call-row').first();
    await expect(row.locator('.gea-api-call-duration')).toBeVisible();
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
      false,
      'page must not overflow at ' + width,
    );
    if (width > 1000) {
      const catalog = await page.getByRole('navigation', { name: '接口目录' }).boundingBox();
      const list = await page.getByRole('region', { name: '调用记录' }).boundingBox();
      const detail = await page.getByRole('complementary', { name: '调用详情' }).boundingBox();
      assert.ok(catalog.x + catalog.width <= list.x + 1 && list.x + list.width <= detail.x + 1);
    } else {
      await row.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('complementary', { name: '调用详情' })).toBeFocused();
      await expect(page.getByRole('complementary', { name: '调用详情' })).toBeInViewport();
    }
    if (evidence)
      await page.screenshot({ path: evidence + '/api-log-' + width + '.png', fullPage: true });
  }
  const row = page.locator('.gea-api-call-row').first();
  await row.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('complementary', { name: '调用详情' })).toBeFocused();
  await expect(page.getByRole('complementary', { name: '调用详情' })).toBeInViewport();
  if (evidence) await page.screenshot({ path: evidence + '/api-log-390-detail.png' });
});

test('request and response headers are available on demand while captured bodies remain visible', async (t) => {
  const { page } = await openCenter(t);
  const detail = page.getByRole('complementary', { name: '调用详情' });
  await expect(detail.getByRole('button', { name: '复制请求头', exact: true })).not.toBeVisible();
  await expect(detail.getByRole('button', { name: '复制响应头', exact: true })).not.toBeVisible();
  await expect(detail.getByRole('button', { name: '复制响应报文', exact: true })).toBeVisible();
  await detail.getByText('请求头与 Query · 已脱敏', { exact: true }).click();
  await expect(detail.getByRole('button', { name: '复制请求头', exact: true })).toBeVisible();
  assert.equal(
    await detail.getByRole('heading', { name: 'Query', exact: true }).count(),
    0,
    'empty Query does not add a code block',
  );
  await detail.getByText('响应头 · 已脱敏', { exact: true }).click();
  await expect(detail.getByRole('button', { name: '复制响应头', exact: true })).toBeVisible();
});

test('idempotent replay requires the specific write confirmation and retains original intent', async (t) => {
  const { page, center, upstream, origin } = await openCenter(t);
  await page.getByRole('button', { name: '实时', exact: true }).click();
  const body = JSON.stringify({ action: 'REJECT', expectedStatus: 1 });
  const response = await center.fetch(
    origin + '/sales-plan/plans/versions/fixture-version/actions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-Id': 'req-write-1',
        'Idempotency-Key': 'intent-1',
      },
      body,
    },
  );
  await response.text();
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  await page.locator('.gea-api-call-row').filter({ hasText: 'req-write-1' }).click();
  const detail = page.getByRole('complementary', { name: '调用详情' });
  await detail.getByRole('button', { name: '重发请求', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('确认重发这次写请求');
  assert.equal(upstream.length, 2);
  await page.getByRole('button', { name: '确认按原幂等键重发', exact: true }).click();
  await expect(page.locator('.gea-api-call-row')).toHaveCount(3);
  assert.deepEqual(upstream[2], upstream[1]);
  assert.equal(upstream[2].body, body);
  center.invalidateReplays();
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  await expect(detail.getByRole('button', { name: '重发请求', exact: true })).toBeDisabled();
  await expect(detail.getByRole('button', { name: '重发请求', exact: true })).toHaveAttribute(
    'title',
    /已失效/,
  );
});

test('streamed, oversized, missing and failed response evidence keeps its capture limitations', async (t) => {
  const { page, capture } = await openCenter(t);
  await page.getByRole('button', { name: '实时', exact: true }).click();
  await capture('stream', 'req-stream');
  await capture('oversized', 'req-oversized');
  await capture('no-body', 'req-empty');
  await assert.rejects(capture('network-failure', 'req-network'));
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  const detail = page.getByRole('complementary', { name: '调用详情' });
  for (const [id, expected] of [
    ['req-stream', '流式响应正文未保存'],
    ['req-oversized', '正文超过 4 MiB，未保存'],
    ['req-empty', '无'],
    ['req-network', 'fetch failed'],
  ]) {
    await page.locator('.gea-api-call-row').filter({ hasText: id }).click();
    await expect(
      detail.locator('.gea-api-code-section').filter({ hasText: '响应报文' }).locator('pre'),
    ).toContainText(expected);
  }
  await page.getByRole('button', { name: '传输失败', exact: true }).click();
  await expect(page.locator('.gea-api-call-row')).toHaveCount(1);
  await expect(page.locator('.gea-api-call-row')).toContainText('req-network');
});

test('API catalog batch freezes samples and confirms concrete writes on the same page', async (t) => {
  const { page } = await openCenter(t);
  await page.getByRole('button', { name: '实时', exact: true }).click();
  await page.getByRole('button', { name: '批量', exact: true }).click();
  await page.getByRole('checkbox', { name: '选择读取当前用户', exact: true }).check();
  await page.getByRole('checkbox', { name: '选择读取权限代码', exact: true }).check();
  await page.getByRole('button', { name: '开始批量重发', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '确认批量重发' })).toContainText('没有已捕获样本');
});
