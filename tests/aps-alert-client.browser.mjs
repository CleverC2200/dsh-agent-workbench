import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
const ui = resolve('business/inventory-apsplan/source');
const bundle = await build({
  stdin: {
    contents: `import React from 'react';import{createRoot}from'react-dom/client';import {WarningViews} from './business/inventory-apsplan/source/app/warning-views';import {openAlertManagement} from './business/inventory-apsplan/source/app/monitor-management.js';import './business/inventory-apsplan/source/app/monitor-management.css';window.openManagement=()=>openAlertManagement(window.fixture.events,()=>{});createRoot(document.getElementById('root')).render(<WarningViews items={window.fixture.events} openCount={1} onDetail={()=>{}}/>);`,
    resolveDir: process.cwd(),
    loader: 'tsx',
  },
  bundle: true,
  write: false,
  outfile: 'page.js',
  jsx: 'automatic',
  alias: {
    react: resolve(ui, 'node_modules/react'),
    'react-dom': resolve(ui, 'node_modules/react-dom'),
  },
  plugins: [
    {
      name: 'isolated-detection-api',
      setup(api) {
        api.onResolve({ filter: /\/shared\/channel\.js$/ }, ({ path }) => ({
          path,
          namespace: 'detection-fixture',
        }));
        api.onLoad({ filter: /.*/, namespace: 'detection-fixture' }, () => ({
          contents: `export const call=async(method,input)=>{window.calls.push({method,input});if(window.backendUnavailable)throw Error('预警后台尚未配置');return window.fixture};export const ask=async()=>{};`,
        }));
      },
    },
  ],
});
test('预警筛选、检测任务操作列及执行记录在桌面和窄屏可操作', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.route('http://alert.test/**', (r) =>
    r.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }),
  );
  await page.goto('http://alert.test/');
  await page.evaluate(() => {
    window.calls = [];
    window.fixture = {
      tasks: [
        {
          id: 'task-1',
          metric: '订单满足率',
          scope: '品类',
          frequency: '每天09:00',
          description: '低于95%时预警',
          definedBy: '测试设置人',
          enabled: true,
        },
      ],
      runs: [
        {
          id: 'run-1',
          at: '2026-11-12T01:00:00Z',
          name: '订单满足率检测',
          status: '成功',
          created: 1,
          result: '新增1，更新0，恢复0，数据未更新0',
        },
      ],
      events: [
        {
          id: 'event-1',
          scope: '汤圆',
          metric: '订单满足率 94%',
          metricName: '订单满足率',
          value: 94,
          unit: '%',
          level: '预警',
          eventStatus: '活跃',
          first: '2026-11-12T01:00:00Z',
          period: '2026-11',
          cutoff: '2026-11-11',
          range: '健康>95%',
        },
        {
          id: 'event-2',
          scope: '饺子',
          metric: '订单满足率 98%',
          eventStatus: '已关闭',
          closedAt: '2026-11-11T01:00:00Z',
        },
      ],
    };
  });
  await page.addStyleTag({ content: bundle.outputFiles.find((f) => f.path.endsWith('.css')).text });
  await page.addScriptTag({ content: bundle.outputFiles.find((f) => f.path.endsWith('.js')).text });
  await expect(page.getByText('汤圆', { exact: true })).toBeVisible();
  await page.locator('.warning-status-filter summary').click();
  await page.getByRole('button', { name: '已关闭（含历史恢复）', exact: true }).click();
  await expect(page.getByText('饺子', { exact: true })).toBeVisible();
  await expect(page.getByText('汤圆', { exact: true })).toHaveCount(0);
  await page.locator('.warning-status-filter summary').click();
  await page.getByRole('button', { name: '全部状态', exact: true }).click();
  await expect(page.getByText('汤圆', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '列表', exact: true }).click();
  await expect(page.getByRole('columnheader', { name: '预警状态', exact: true })).toBeVisible();

  await page.evaluate(() => window.openManagement());
  const dialog = page.getByRole('dialog', { name: '预警管理' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('cell', { name: '测试设置人', exact: true })).toBeVisible();
  const alignment = await dialog.locator('table').evaluate((table) => {
    const head = table.querySelector('thead th:last-child').getBoundingClientRect(),
      cell = table.querySelector('tbody td:last-child').getBoundingClientRect();
    return {
      head: head.x,
      cell: cell.x,
      display: getComputedStyle(table.querySelector('tbody td:last-child')).display,
    };
  });
  assert.equal(alignment.display, 'table-cell');
  assert.ok(Math.abs(alignment.head - alignment.cell) < 2);
  await dialog.getByRole('tab', { name: '执行记录' }).click();
  await expect(dialog.getByText('新建预警卡片 1 条', { exact: true })).toBeVisible();
  await dialog.getByRole('tab', { name: '检测任务' }).click();
  await page.setViewportSize({ width: 700, height: 900 });
  await expect(dialog.getByRole('button', { name: '修改', exact: true })).toBeAttached();
  await mkdir('.runtime/alert-client-evidence', { recursive: true });
  await page.screenshot({
    path: '.runtime/alert-client-evidence/management-narrow.png',
    fullPage: true,
  });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  let dialogs = 0;
  page.on('dialog', async (d) => {
    dialogs++;
    assert.match(d.message(), /后台尚未配置/);
    await d.accept();
  });
  await page.evaluate(() => {
    window.backendUnavailable = true;
    return window.openManagement();
  });
  assert.equal(dialogs, 1);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
