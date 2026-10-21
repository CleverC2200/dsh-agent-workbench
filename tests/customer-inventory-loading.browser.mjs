import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { build } from 'esbuild';
import { resolve } from 'node:path';

const html = await readFile(
  new URL('../lib/business/inventory-customer/index.html', import.meta.url),
  'utf8',
);
async function fixture(
  t,
  { error, rows = [], connect = true, scripts = true, deferSql = false } = {},
) {
  const server = createServer((request, response) => {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (request.url === '/customer') {
      response.end(scripts ? html : html.replace(/<script>[\s\S]*?<\/script>/g, ''));
      return;
    }
    response.end(
      '<!doctype html><iframe title="Customer fixture" src="/customer" style="width:100%;height:950px"></iframe>',
    );
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL,
  });
  t.after(() => browser.close());
  const page = await browser.newPage({
    viewport: { width: 1500, height: 1000 },
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('.metric-card')).toHaveCount(6);
  if (connect) {
    await page.evaluate(
      ({ error, rows, deferSql }) => {
        const target = document.querySelector('iframe');
        const pair = new MessageChannel();
        window.receivedContexts = [];
        window.pendingSql = [];
        pair.port1.onmessage = ({ data }) => {
          if (data.type !== 'request') return;
          if (data.method === 'context') window.receivedContexts.push(data.parameters);
          const respond = () =>
            pair.port1.postMessage({
              type: 'response',
              id: data.id,
              ...(error && data.method === 'sql'
                ? { error }
                : {
                    result:
                      data.method === 'sql'
                        ? {
                            rows,
                            total: rows.length,
                            returnedColumns: rows.length ? Object.keys(rows[0]) : [],
                            rejectedColumns: [],
                          }
                        : { ok: true },
                  }),
            });
          if (deferSql && data.method === 'sql') window.pendingSql.push(respond);
          else respond();
        };
        target.contentWindow.postMessage(
          {
            protocol: 'gea-html-v2',
            type: 'connect',
            context: {
              session: 'customer-offline-fixture',
              plugin: 'inventory-customer',
            },
          },
          '*',
          [pair.port2],
        );
      },
      { error, rows, deferSql },
    );
  }
  return { page, frame, errors };
}

test('no connection keeps six cards and table visible without claiming inventory facts', async (t) => {
  const { frame, errors } = await fixture(t, { connect: false });
  await expect(frame.locator('#customer-load-status')).toContainText('正在连接客户库存');
  await expect(frame.locator('#customer-load-status')).toBeHidden();
  await expect(frame.locator('.metric-card')).toHaveCount(6);
  await expect(frame.locator('.dealer-table-card')).toBeVisible();
  assert.deepEqual(errors, []);
});

test('Host Agent denial is displayed in the inventory pane without a query or blank layout', async (t) => {
  const { page, frame, errors } = await fixture(t, { connect: false });
  await page.evaluate(() =>
    document.querySelector('iframe').contentWindow.postMessage(
      {
        protocol: 'customer-inventory-status',
        failed: true,
        error: 'AGENT_ACCESS_DENIED: 当前用户无权访问该Agent',
      },
      '*',
    ),
  );
  await expect(frame.locator('#customer-load-status')).toContainText('当前用户无权访问客户库存');
  await expect(frame.locator('.metric-card')).toHaveCount(6);
  await page.screenshot({
    path: '.runtime/customer-inventory-access-denied.png',
    fullPage: true,
  });
  assert.deepEqual(errors, []);
});

test('missing resources and expired sessions have distinct inventory-pane messages', async (t) => {
  const { page, frame, errors } = await fixture(t, { connect: false });
  for (const [error, text] of [
    ['PAGE_AGENT_MISSING', '客户库存资源未就绪'],
    ['SESSION_EXPIRED', '客户库存会话已失效'],
  ]) {
    await page.evaluate(
      (error) =>
        document
          .querySelector('iframe')
          .contentWindow.postMessage(
            { protocol: 'customer-inventory-status', failed: true, error },
            '*',
          ),
      error,
    );
    await expect(frame.locator('#customer-load-status')).toContainText(text);
    await expect(frame.locator('.metric-card')).toHaveCount(6);
  }
  assert.deepEqual(errors, []);
});

test('a connection that never arrives gets a finite diagnostic without removing the shell', async (t) => {
  const { frame, errors } = await fixture(t, { connect: false });
  await expect(frame.locator('#customer-load-status')).toContainText('连接尚未就绪', {
    timeout: 18000,
  });
  await expect(frame.locator('.metric-card')).toHaveCount(6);
  assert.deepEqual(errors, []);
});

test('SQL failure preserves the interface and does not publish a fake empty success', async (t) => {
  const { page, frame, errors } = await fixture(t, {
    error: 'DATA_PERMISSION_DENIED',
  });
  await expect(frame.locator('#customer-load-status')).toContainText(
    '当前用户暂无客户库存数据权限',
  );
  await expect(frame.locator('.dealer-table-card')).toBeVisible();
  assert.deepEqual(await page.evaluate(() => window.receivedContexts), []);
  assert.deepEqual(errors, []);
});

test('successful empty inventory is explicit rather than a loading or permission failure', async (t) => {
  const { frame, errors } = await fixture(t);
  await expect(frame.locator('#customer-load-status')).toContainText(
    '当前授权范围暂无客户库存数据',
  );
  await expect(frame.locator('.metric-card')).toHaveCount(6);
  assert.deepEqual(errors, []);
});

test('inventory has no whole-document refresh button and retains its permission-denied shell', async (t) => {
  const { frame, errors } = await fixture(t, {
    error: 'DATA_PERMISSION_DENIED',
  });
  await expect(frame.locator('#customer-load-status')).toContainText(
    '当前用户暂无客户库存数据权限',
  );
  await expect(frame.getByRole('button', { name: '刷新', exact: true })).toHaveCount(0);
  await expect(frame.locator('.metric-card')).toHaveCount(6);
  await expect(frame.locator('#customer-load-status')).toContainText(
    '当前用户暂无客户库存数据权限',
  );
  assert.deepEqual(errors, []);
});

test('successful reads fill the same shell; identity changes remove previous inventory', async (t) => {
  const rows = [
    {
      snapshot_date: '2026-10-20',
      cust_code: 'offline-1',
      cust_name: '离线测试客户',
      region_name: '测试大区',
      province_name: '测试省区',
      stock_qty: 100,
      stock_amt: 10000,
      sales_qty_30days: 30,
      normal_stock_qty: 90,
      large_date_qty: 10,
      in_transit_qty: 0,
      sku_rows: 1,
      stock_coverage: 1,
      value_coverage: 1,
      sales_coverage: 1,
      normal_coverage: 1,
      large_date_coverage: 1,
      transit_coverage: 1,
    },
  ];
  const { page, frame, errors } = await fixture(t, { rows });
  await expect(frame.locator('#customer-load-status')).toBeHidden();
  await expect(frame.locator('.dealer-table-card')).toContainText('离线测试客户');
  assert.deepEqual(
    await frame.locator('#root').evaluate((root) =>
      ['html', 'body', '#app', '#root', '.app-shell', '.app-main', '.workspace']
        .map((selector) => root.ownerDocument.querySelector(selector))
        .filter(Boolean)
        .filter((node) => ['auto', 'scroll'].includes(getComputedStyle(node).overflowY))
        .map((node) => node.className || node.id || node.tagName),
    ),
    [],
  );
  await frame
    .locator('#root')
    .evaluate(() => window.dispatchEvent(new Event('gea-identity-changed')));
  await expect(frame.locator('#customer-load-status')).toContainText('已清除旧数据');
  await expect(frame.locator('.dealer-table-card')).not.toContainText('离线测试客户');
  await expect(frame.locator('.metric-card')).toHaveCount(6);
  assert.deepEqual(errors, []);
  assert.ok((await page.evaluate(() => window.receivedContexts)).length > 0);
});

test('region, province and city choices rebuild after rows arrive, including a role selected while loading', async (t) => {
  const rows = [
    {
      snapshot_date: '2026-10-20',
      cust_code: 'offline-city',
      cust_name: '区域测试客户',
      region_name: '测试大区',
      province_name: '测试省区',
      stock_qty: 100,
      stock_amt: 10000,
      sales_qty_30days: 30,
      sku_rows: 1,
      stock_coverage: 1,
      value_coverage: 1,
      sales_coverage: 1,
      dealer_receive_addr: JSON.stringify([{ cust_name: '客户（郑州市）卸货地' }]),
    },
  ];
  const { page, frame, errors } = await fixture(t, { rows, deferSql: true });
  const selectRole = async (name) => {
    await frame.locator('.inventory-context .arco-select').first().click();
    await frame.getByRole('option', { name, exact: true }).click();
  };
  await selectRole('大区角色');
  await expect.poll(() => page.evaluate(() => window.pendingSql.length)).toBeGreaterThan(0);
  await page.evaluate(() => window.pendingSql.splice(0).forEach((respond) => respond()));
  await expect(frame.locator('.dealer-table-card')).toContainText('区域测试客户');
  for (const role of ['省区角色', '城市经理角色', '总部角色', '大区角色']) {
    await selectRole(role);
    await expect(frame.locator('.dealer-table-card')).toContainText('区域测试客户');
    await expect(frame.locator('.metric-card').nth(1)).toContainText('100');
  }
  assert.deepEqual(errors, []);
});

test('script failure retains a static six-card and table fallback', async (t) => {
  // This separate fixture deliberately disables scripts before the React shell starts.
  const server = createServer((_request, response) =>
    response.end(html.replace(/<script>[\s\S]*?<\/script>/g, '')),
  );
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL,
  });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await expect(page.locator('.customer-static-metrics article')).toHaveCount(6);
  await expect(page.locator('.customer-static-shell table')).toBeVisible();
});

test('React component failures retain the static shell and expose a render diagnostic', async (t) => {
  const compiled = await build({
    stdin: {
      contents:
        "import {mountCustomerPrototype} from './prototypes/inventory-customer/application.js'; window.addEventListener('customer-render-failed',()=>{document.getElementById('customer-load-status').textContent='客户库存界面加载失败';}); mountCustomerPrototype(()=>{throw Error('offline-render-failure');},{snapshot:null,rows:[]});",
      resolveDir: resolve('.'),
    },
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
  });
  const failedHtml = html.replace(
    /<script>[\s\S]*?<\/script>/g,
    () =>
      '<script>' + compiled.outputFiles[0].text.replace(/<\/script/gi, '<\\/script') + '</script>',
  );
  const server = createServer((_request, response) => response.end(failedHtml));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL,
  });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await expect(page.locator('#customer-load-status')).toContainText('客户库存界面加载失败');
  await expect(page.locator('.customer-static-metrics article')).toHaveCount(6);
  await expect(page.locator('.customer-static-shell table')).toBeVisible();
});
