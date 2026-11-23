import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
const ui = resolve('business/inventory-apsplan/source');
const bundle = await build({
  stdin: {
    contents: `import React from 'react';import{createRoot}from'react-dom/client';import {WarningViews} from './business/inventory-apsplan/source/app/warning-views';import {openAlertManagement} from './business/inventory-apsplan/source/app/monitor-management.js';import './business/inventory-apsplan/source/app/monitor-management.css';import Home from './business/inventory-apsplan/source/app/workbench-app';window.openManagement=(startNew=false)=>openAlertManagement(window.fixture.events,()=>{},startNew);createRoot(document.getElementById('root')).render(window.testHome?<Home initialWorkspace="intelligent" embedMode liveData/>:<WarningViews items={window.fixture.events} openCount={1} onDetail={()=>{}}/>);`,
    resolveDir: process.cwd(),
    loader: 'tsx',
  },
  bundle: true,
  write: false,
  outfile: 'page.js',
  jsx: 'automatic',
  define: { APS_MOCK: 'false' },
  tsconfig: resolve(ui, 'tsconfig.json'),
  alias: {
    react: resolve(ui, 'node_modules/react'),
    'react-dom': resolve(ui, 'node_modules/react-dom'),
  },
  plugins: [
    {
      name: 'isolated-detection-api',
      setup(api) {
        api.onResolve({ filter: /^dsh-agent-manage\/aps-compute\/[a-z-]+$/ }, ({ path }) => ({
          path: resolve('../dsh-agent-manage/src/aps-compute', path.split('/').at(-1) + '.ts'),
        }));
        api.onResolve({ filter: /\/data\/use-workspace$/ }, ({ path }) => ({
          path,
          namespace: 'workspace-fixture',
        }));
        api.onLoad({ filter: /.*/, namespace: 'workspace-fixture' }, () => ({
          contents: `export function useWorkspace(){return {data:{start:'2026-11-01',end:'2026-11-11',granularity:'month',sections:[],readAt:'2026-11-11',limitations:[]},previous:null,annual:null,busy:false,comparisonBusy:false,error:''};}`,
        }));
        api.onResolve({ filter: /\/agent-query$/ }, ({ path }) => ({
          path,
          namespace: 'calendar-fixture',
        }));
        api.onLoad({ filter: /.*/, namespace: 'calendar-fixture' }, () => ({
          contents: `export function createAgentQueries(){return{read:async()=>({rows:[{day:'20261111'}]})}};`,
        }));

        api.onResolve({ filter: /\/shared\/channel\.js$/ }, ({ path }) => ({
          path,
          namespace: 'detection-fixture',
        }));
        api.onLoad({ filter: /.*/, namespace: 'detection-fixture' }, () => ({
          contents: `export const call=async(method,input)=>{window.calls.push({method,input});if(window.pendingDetection)return new Promise(resolve=>window.pendingReads.push(resolve));if(window.backendUnavailable)throw Error('预警后台尚未配置');if(input?.op==='retry-notification'&&window.retryNotification)return window.retryNotification(input);return window.fixture};export const ask=async()=>{};export const draft=async()=>{};export const publish=async()=>{};export const action=()=>()=>{};export const reportElements=()=>()=>{};export const ready=Promise.resolve();`,
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
  await page.evaluate(() => {
    window.backendUnavailable = true;
    window.alert = () => {};
    return window.openManagement();
  });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('alert')).toContainText('预警后台尚未配置');
  await expect(dialog.getByRole('button', { name: '重新连接', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('执行记录可以在表格顶部横向滚动，分页保持在可视区域', async (t) => {
  const browser = await chromium.launch({
    headless: true,
    ignoreDefaultArgs: ['--hide-scrollbars'],
  });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 560 } });
  await page.route('http://alert.test/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }),
  );
  await page.goto('http://alert.test/');
  await page.evaluate(() => {
    window.calls = [];
    window.fixture = {
      events: [],
      tasks: [],
      runs: Array.from({ length: 11 }, (_, index) => ({
        id: 'run-' + index,
        at: '2026-11-23T01:00:00Z',
        name: '测试记录 ' + (index + 1),
        status: '成功',
        actualModel: { model: '测试模型', provider: '测试服务' },
      })),
    };
  });
  await page.addStyleTag({ content: bundle.outputFiles.find((f) => f.path.endsWith('.css')).text });
  await page.addScriptTag({ content: bundle.outputFiles.find((f) => f.path.endsWith('.js')).text });
  await page.evaluate(() => window.openManagement());
  const dialog = page.getByRole('dialog', { name: '预警管理' });
  await dialog.getByRole('tab', { name: '执行记录' }).click();
  const table = dialog.locator('.am-run-table');
  const next = dialog.getByRole('button', { name: '下一页' });

  for (const width of [1280, 700]) {
    await page.setViewportSize({ width, height: 560 });
    const layout = await table.evaluate((scrollport) => {
      const bounds = scrollport.getBoundingClientRect();
      const panel = scrollport.closest('.am-panel').getBoundingClientRect();
      const lastRow = scrollport.querySelector('tbody tr:last-child').getBoundingClientRect();
      const styles = getComputedStyle(scrollport);
      return {
        bottom: bounds.bottom,
        visibleBottom: Math.min(panel.bottom, innerHeight),
        lastRowBottom: lastRow.bottom,
        scrollbarHeight:
          scrollport.offsetHeight -
          scrollport.clientHeight -
          parseFloat(styles.borderTopWidth) -
          parseFloat(styles.borderBottomWidth),
        scrollTop: scrollport.scrollTop,
      };
    });
    assert.ok(layout.bottom <= layout.visibleBottom);
    assert.ok(layout.lastRowBottom > layout.bottom);
    assert.ok(layout.scrollbarHeight > 0, JSON.stringify(layout));
    assert.equal(layout.scrollTop, 0);
    await expect(next).toBeInViewport();
  }

  const thumb = await table.evaluate((el) => {
    const bounds = el.getBoundingClientRect();
    const styles = getComputedStyle(el);
    const bottom = parseFloat(styles.borderBottomWidth);
    const top = parseFloat(styles.borderTopWidth);
    return {
      x: bounds.left + 32,
      y: bounds.bottom - bottom - (el.offsetHeight - el.clientHeight - top - bottom) / 2,
    };
  });
  await page.mouse.move(thumb.x, thumb.y);
  await page.mouse.down();
  await page.mouse.move(thumb.x + 90, thumb.y, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => table.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  const previousLeft = await table.evaluate(async (el) => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    el.scrollTo({ left: 160, top: 120, behavior: 'instant' });
    return el.scrollLeft;
  });
  await next.click();
  await expect(table.getByText('测试记录 11', { exact: true })).toBeVisible();
  assert.deepEqual(await table.evaluate((el) => [el.scrollLeft, el.scrollTop]), [previousLeft, 0]);
  await expect(dialog.getByRole('button', { name: '上一页' })).toBeInViewport();
  await table.focus();
  await table.press('ArrowRight');
  await expect.poll(() => table.evaluate((el) => el.scrollLeft)).toBeGreaterThan(previousLeft);
});

test('后台不可用时正式智能工作台保留原入口且不显示模拟建议', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.route('http://alert.test/**', (r) =>
    r.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }),
  );
  await page.goto('http://alert.test/');
  await page.evaluate(() => {
    window.testHome = true;
    window.calls = [];
    window.backendUnavailable = true;
    window.fixture = { events: [] };
  });
  await page.addStyleTag({ content: bundle.outputFiles.find((f) => f.path.endsWith('.css')).text });
  await page.addScriptTag({ content: bundle.outputFiles.find((f) => f.path.endsWith('.js')).text });
  await expect(page.getByRole('button', { name: '预警管理', exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: '动作完成不等于问题解决', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: '进入管理后台', exact: false })).toBeVisible();
  await expect(page.getByText('模拟示例', { exact: false })).toHaveCount(0);
  assert.equal(
    await page.evaluate(() => window.calls.filter((c) => c.method === 'detection').length),
    1,
  );
});

test('执行记录按任务 ID 切换并定位到正确的检测任务行', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 650 } });
  await page.route('http://alert.test/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }),
  );
  await page.goto('http://alert.test/');
  await page.evaluate(() => {
    window.calls = [];
    const at = '2026-11-23T01:00:00Z';
    window.fixture = {
      events: [],
      tasks: Array.from({ length: 24 }, (_, i) => ({
        id: 'task-' + i,
        metric: '当前库存（基地库存）',
        scope: '基地',
        description: '任务配置 ' + i,
        enabled: true,
      })),
      runs: [
        { id: 'r-current', taskId: 'task-23', name: '执行时的任务标题', at, status: '成功' },
        { id: 'r-deleted', taskId: 'deleted', name: '已删除的历史任务', at, status: '成功' },
        { id: 'r-unlinked', name: '未关联的历史任务', at, status: '成功' },
      ],
    };
  });
  await page.addStyleTag({ content: bundle.outputFiles.find((f) => f.path.endsWith('.css')).text });
  await page.addScriptTag({ content: bundle.outputFiles.find((f) => f.path.endsWith('.js')).text });
  await page.evaluate(() => window.openManagement());
  const dialog = page.getByRole('dialog', { name: '预警管理' });
  const tasks = dialog.getByRole('tab', { name: '检测任务' });
  const runs = dialog.getByRole('tab', { name: '执行记录' });
  const link = dialog.getByRole('button', { name: '执行时的任务标题' });
  const row = dialog.getByRole('row').filter({ hasText: '任务配置 23' });
  const indicator = row.getByRole('cell').first();

  await runs.click();
  for (const name of ['已删除的历史任务', '未关联的历史任务']) {
    await expect(dialog.getByRole('cell', { name, exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name, exact: true })).toHaveCount(0);
  }
  await link.click();
  await expect(tasks).toHaveAttribute('aria-selected', 'true');
  await expect(indicator).toBeInViewport();
  await expect(indicator).toBeFocused();
  await expect(row).toHaveClass('am-located-task');
  await expect(dialog.locator('.am-located-task')).toHaveCount(1);

  await page.setViewportSize({ width: 640, height: 570 });
  await runs.click();
  await link.focus();
  await link.press('Enter');
  await expect(dialog.getByRole('tabpanel', { name: '检测任务' })).toBeVisible();
  await expect(indicator).toBeInViewport();
  await expect(indicator).toBeFocused();
  const calls = await page.evaluate(() => window.calls.map(({ input }) => input?.op));
  assert.ok(calls.every((op) => op === 'list'));
});

test('执行记录区分检测与发送，详情仅允许补发明确失败的通知', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 700, height: 560 } });
  await page.clock.install();
  await page.route('http://alert.test/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }),
  );
  await page.goto('http://alert.test/');
  await page.evaluate(() => {
    const delivery = (runId, recipientName, status = '已发送', kind = 'new') => ({
      runId,
      recipientName,
      status,
      kind,
    });
    window.calls = [];
    const failedBatch = 'f'.repeat(32);
    window.retryNotification = ({ runId, batchId }) => {
      const job = window.fixture.events[0].notifications.find(
        (entry) => entry.runId === runId && entry.batchId === batchId,
      );
      job.status = '待发送';
      return { status: job.status };
    };
    window.fixture = {
      tasks: [{ id: 'task', metric: '订单满足率' }],
      runs: [
        {
          id: 'sent',
          taskId: 'task',
          name: '本次检测',
          at: '2026-11-23T01:00:00Z',
          status: '成功',
          result: '新增2，更新0，恢复0，数据未更新0',
        },
        { id: 'old', name: '健康检测', at: '2026-11-22T01:00:00Z', status: '成功', created: 0 },
      ],
      events: [
        {
          notifications: [
            delivery('sent', '王一'),
            delivery('sent', '许<测试>'),
            delivery('sent', '陈三', '待发送'),
            {
              ...delivery('sent', '发送失败人', '发送失败'),
              batchId: failedBatch,
              error: '账号不可用',
            },
            { ...delivery('sent', '待核实人', '待核实'), batchId: 'e'.repeat(32) },
            delivery('sent', '联调接收人', '已发送', 'test'),
            delivery('sent', null),
          ],
        },
        { notifications: [delivery('sent', '王一'), delivery('other', '另一轮接收人')] },
      ],
    };
  });
  await page.addStyleTag({ content: bundle.outputFiles.find((f) => f.path.endsWith('.css')).text });
  await page.addScriptTag({ content: bundle.outputFiles.find((f) => f.path.endsWith('.js')).text });
  await page.evaluate(() => window.openManagement());
  const dialog = page.getByRole('dialog', { name: '预警管理' });
  await dialog.getByRole('tab', { name: '执行记录' }).click();
  const table = dialog.getByRole('table');
  const headers = table.getByRole('columnheader');
  assert.deepEqual((await headers.allTextContents()).slice(5, 8), [
    '检测状态',
    '发送对象',
    'AI上下文',
  ]);
  const sent = table.getByRole('row', { name: /本次检测/ });
  const healthy = table.getByRole('row', { name: /健康检测/ });
  const recipients = sent.locator('.am-run-recipients');
  await recipients.scrollIntoViewIfNeeded();
  await expect(recipients).toBeInViewport();
  await expect(recipients).toContainText('王一、许<测试>');
  await expect(recipients).toContainText('发送失败 · 待核实 · 待发送');
  await expect(recipients).not.toContainText('联调接收人');
  await expect(healthy.getByRole('cell', { name: '成功', exact: true })).toHaveCount(1);
  await expect(healthy.getByRole('cell', { name: '-', exact: true })).toHaveCount(1);
  await page.evaluate(() => {
    window.fixture.events[0].notifications[2].status = '已发送';
  });
  await page.clock.fastForward(6000);
  await expect(recipients).toContainText('王一、许<测试>、陈三');
  await sent.getByRole('button', { name: '查看', exact: true }).click();
  const result = page.getByRole('dialog', { name: '执行结果' });
  await expect(result.getByText('账号不可用', { exact: false })).toBeVisible();
  await expect(result.getByRole('button', { name: /补发/ })).toHaveCount(1);
  const retry = result.getByRole('button', { name: '补发给发送失败人' });
  await retry.focus();
  await retry.press('Enter');
  await expect(result.getByRole('status')).toHaveText('已加入补发队列');
  await expect(result.getByRole('button', { name: /补发/ })).toHaveCount(0);
  assert.deepEqual(
    await page.evaluate(() =>
      window.calls
        .filter(({ input }) => input?.op === 'retry-notification')
        .map(({ input }) => input),
    ),
    [{ op: 'retry-notification', runId: 'sent', batchId: 'f'.repeat(32) }],
  );
  await page.evaluate(() => {
    const job = window.fixture.events[0].notifications.find(
      (entry) => entry.batchId === 'f'.repeat(32),
    );
    Object.assign(job, { status: '已发送', messageId: 'om_retried', error: undefined });
  });
  await page.clock.fastForward(6000);
  await expect(result.getByText('回执 om_retried', { exact: false })).toBeVisible();
  await expect(result.getByText('待核实人 · 待核实')).toBeVisible();
  await expect(recipients).toContainText('发送失败人');
});

test('两个正式入口在后台未配置时立即显示可重试窗口，不依赖浏览器提示框', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.route('http://alert.test/**', (r) =>
    r.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }),
  );
  await page.goto('http://alert.test/');
  await page.evaluate(() => {
    window.testHome = true;
    window.calls = [];
    window.backendUnavailable = true;
    window.fixture = { events: [], tasks: [], runs: [] };
    window.alert = () => {};
  });
  await page.addStyleTag({ content: bundle.outputFiles.find((f) => f.path.endsWith('.css')).text });
  await page.addScriptTag({ content: bundle.outputFiles.find((f) => f.path.endsWith('.js')).text });
  for (const name of ['预警管理', '＋ 新增检测']) {
    await page.getByRole('button', { name, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '预警管理', exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('alert')).toContainText('预警后台尚未配置');
    await expect(dialog.getByRole('button', { name: '重新连接', exact: true })).toBeVisible();
    await expect(dialog.locator('[data-new]')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  }
});

test('后台等待时可关闭，重复点击不叠窗，重新连接后进入原新增流程', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.route('http://alert.test/**', (r) =>
    r.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }),
  );
  await page.goto('http://alert.test/');
  await page.evaluate(() => {
    window.calls = [];
    window.pendingReads = [];
    window.pendingDetection = true;
    window.fixture = { events: [], tasks: [], runs: [] };
    window.alert = () => {};
  });
  await page.addStyleTag({ content: bundle.outputFiles.find((f) => f.path.endsWith('.css')).text });
  await page.addScriptTag({ content: bundle.outputFiles.find((f) => f.path.endsWith('.js')).text });
  await page.evaluate(() => {
    void window.openManagement();
    void window.openManagement();
  });
  const dialog = page.getByRole('dialog', { name: '预警管理', exact: true });
  await expect(dialog).toHaveCount(1);
  await expect(dialog.getByRole('status')).toContainText('正在连接预警后台');
  assert.equal(await page.evaluate(() => window.pendingReads.length), 1);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await page.evaluate(() => {
    window.pendingDetection = false;
    window.pendingReads[0](window.fixture);
  });
  await expect(dialog).toHaveCount(0);
  await page.evaluate(() => {
    window.backendUnavailable = true;
    return window.openManagement(true);
  });
  await expect(dialog.getByRole('alert')).toBeVisible();
  await page.evaluate(() => {
    window.backendUnavailable = false;
  });
  await dialog.getByRole('button', { name: '重新连接', exact: true }).click();
  await expect(dialog.locator('.am-form')).toBeVisible();
  await expect(dialog.getByRole('button', { name: '选择指标', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});
