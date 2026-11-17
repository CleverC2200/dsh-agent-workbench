import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
const ui = resolve('business/inventory-apsplan/source');
const css = await readFile(resolve(ui, 'reference/provided-board.css'), 'utf8');
const bundle = await build({
  stdin: {
    contents: `import React from 'react';import{createRoot}from'react-dom/client';import Home from './business/inventory-apsplan/source/app/workbench-app';createRoot(document.getElementById('root')).render(<Home initialWorkspace={window.initialWorkspace||"plan"} embedMode liveData/>);`,
    resolveDir: process.cwd(),
    loader: 'tsx',
  },
  bundle: true,
  write: false,
  outfile: 'page.js',
  jsx: 'automatic',
  tsconfig: resolve(ui, 'tsconfig.json'),
  define: { APS_MOCK: 'false' },
  alias: {
    react: resolve(ui, 'node_modules/react'),
    'react-dom': resolve(ui, 'node_modules/react-dom'),
  },
  loader: { '.css': 'empty' },
  plugins: [
    {
      name: 'live-workspace-fixture',
      setup(api) {
        api.onResolve({ filter: /^dsh-agent-manage\/aps-compute\/[a-z-]+$/ }, ({ path }) => ({
          path: resolve('../dsh-agent-manage/src/aps-compute', path.split('/').at(-1) + '.ts'),
        }));
        api.onResolve({ filter: /\/data\/use-workspace$/ }, ({ path }) => ({
          path,
          namespace: 'workspace',
        }));
        api.onLoad({ filter: /.*/, namespace: 'workspace' }, () => ({
          contents: `export function useWorkspace(enabled,date,granularity,summary,detailMode,productScope,{paused=false}={}){window.periodReads.push({enabled,date,paused});return {data:window.reportData?{...window.reportData,end:date,granularity,readAt:date,limitations:[]}:{start:date,end:date,granularity:'day',sections:[],readAt:date,limitations:[]},previous:null,annual:null,busy:false,comparisonBusy:false,error:''};}`,
        }));
        api.onResolve({ filter: /\/agent-query$/ }, ({ path }) => ({
          path,
          namespace: 'calendar',
        }));
        api.onLoad({ filter: /.*/, namespace: 'calendar' }, () => ({
          contents: `export function createAgentQueries(){return{read:async(id,values)=>{window.calendarReads.push({id,values});await window.calendarWait;return {rows:[{day:'20261108'}]};}}}`,
        }));
      },
    },
  ],
});
test('default uses yesterday; manual day and restored selection stay exact', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  async function pageFor(hold = false, manual = false, workspace = 'plan', report = null) {
    const page = await browser.newPage({
      timezoneId: workspace === 'intelligent' ? 'America/Los_Angeles' : 'Asia/Shanghai',
    });
    page.setDefaultTimeout(2500);
    await page.route('http://aps.test/**', (r) =>
      r.fulfill({
        contentType: 'text/html',
        body:
          '<div id="root"></div><script id="agent-sql-config" type="application/json">' +
          JSON.stringify({
            schemaVersion: 1,
            agentId: 'inventory-apsplan',
            templates: {},
            queries: {},
          }) +
          '</script>',
      }),
    );
    await page.addInitScript(() => {
      const NativeDate = Date;
      window.Date = class extends NativeDate {
        constructor(...args) {
          super(...(args.length ? args : ['2026-11-17T00:00:00Z']));
        }
        static now() {
          return NativeDate.parse('2026-11-17T00:00:00Z');
        }
      };
    });
    await page.goto('http://aps.test/');
    await page.addStyleTag({ content: css });
    await page.evaluate(
      ({ hold, manual, workspace, report }) => {
        window.reportData = report;
        window.initialWorkspace = workspace;
        window.calendarReads = [];
        window.periodReads = [];
        window.calendarWait = hold
          ? new Promise((r) => (window.resolveCalendar = r))
          : Promise.resolve();
        window.addEventListener('message', (e) => {
          if (e.data?.protocol === 'dsh-workbench-view-v1' && e.data.type === 'ready')
            window.postMessage(
              {
                protocol: 'dsh-workbench-view-v1',
                page: 'inventory-apsplan',
                version: 1,
                type: 'restore',
                channel: 'test',
                generation: 1,
                state: {
                  version: 1,
                  activeWorkspace: workspace,
                  timeGranularity: report ? 'month' : 'day',
                  selectedYearKey: '2026',
                  selectedMonthKey: '11',
                  selectedDay: manual ? 9 : 10,
                  boardDateMode: manual ? 'manual' : 'latest',
                  intelligentDateMode: manual ? 'manual' : 'latest',
                  intelligentYearKey: '2026',
                  intelligentMonthKey: '11',
                  intelligentDay: manual ? 9 : 10,
                },
              },
              '*',
            );
        });
      },
      { hold, manual, workspace, report },
    );
    await page.addScriptTag({
      content: bundle.outputFiles.find((x) => x.path.endsWith('.js')).text,
    });
    return page;
  }
  const page = await pageFor();
  await expect(page.locator('.date-picker-button')).toHaveText('2026年11月16日');
  const reads = await page.evaluate(() => window.periodReads.filter((x) => x.enabled && !x.paused));
  assert.ok(reads.length > 0);
  assert.ok(
    reads.every((x) => x.date === '2026-11-16'),
    'Default must not query an empty date first',
  );
  await page.locator('.date-picker-button').click();
  await page
    .getByRole('menu', { name: '统计日期筛选' })
    .getByRole('button', { name: '9', exact: true })
    .click();
  await expect(page.locator('.date-picker-button')).toHaveText('2026年11月9日');
  await expect
    .poll(() =>
      page.evaluate(() => window.periodReads.filter((x) => x.enabled && !x.paused).at(-1)?.date),
    )
    .toBe('2026-11-09');
  const restored = await pageFor(false, true);
  await expect(restored.locator('.date-picker-button')).toHaveText('2026年11月9日');
  await expect
    .poll(() =>
      restored.evaluate(
        () => window.periodReads.filter((x) => x.enabled && !x.paused).at(-1)?.date,
      ),
    )
    .toBe('2026-11-09');
  assert.deepEqual(
    await page.evaluate(() => window.calendarReads),
    [],
    'The default cutoff must not depend on a source latest-date response',
  );
  const intelligent = await pageFor(false, false, 'intelligent', {
    start: '2026-11-01',
    end: '2026-11-16',
    granularity: 'month',
    sections: [
      {
        id: 'finance',
        status: 'ready',
        rows: [{ month: '202611', actual: 485500, currency: 'CNY', invalid: 0 }],
      },
      {
        id: 'sales-budget',
        status: 'ready',
        rows: [{ month: '202611', budget: 1000000, invalid: 0 }],
      },
      {
        id: 'production',
        status: 'ready',
        rows: [
          {
            source_basis: 'MES_QUANTITY',
            planned: 10000,
            actual: 9899,
            records: 1,
            invalid: 0,
            source_date: '2026-11-16',
          },
        ],
      },
      { id: 'orders', status: 'ready', rows: [{ demand: 100000, shortage: 2580, invalid: 0 }] },
      { id: 'stock', status: 'ready', rows: [{ inventory: 4277600, source_date: '2026-11-16' }] },
      {
        id: 'shippable',
        status: 'ready',
        rows: [{ available: 3652000, demand: 400000, invalid: 0, source_date: '2026-11-16' }],
      },
      { id: 'delivery-daily', status: 'ready', rows: [{ actual: 3765300, missing_qty: 0 }] },
    ],
  });
  const sales = intelligent
    .locator('.intelligent-period-kpi-card')
    .filter({ hasText: '销售预算达成率' });
  await expect(sales).toContainText('48.55');
  await expect(sales).toContainText('时间进度 53.33%');
  await expect(sales).toContainText('-4.78pp');
  await expect(sales).toContainText('进度偏慢');
  await expect(sales).not.toContainText('46.45');
  await expect(
    intelligent.locator('.intelligent-period-kpi-card').filter({ hasText: '订单满足率' }),
  ).toContainText('达标');
  await expect(intelligent.locator('.intelligent-briefing h2')).toContainText('销售预算进度偏慢');
  const briefing = intelligent.locator('.intelligent-briefing p');
  await expect(briefing).toContainText('统计截至2026-11-16');
  await expect(briefing).toContainText('订单满足率97.42%（已达标）');
  await expect(briefing).toContainText('可用库存365.2万箱 ÷ 计划日均需求40万箱/天');
  await expect(briefing).not.toContainText('2026-11-17');
  const colors = await sales.locator('.achievement-status').evaluate((el) => ({
    color: getComputedStyle(el).color,
    background: getComputedStyle(el).backgroundColor,
  }));
  const luminance = (text) => {
    const rgb = text
      .match(/[\d.]+/g)
      .slice(0, 3)
      .map(Number)
      .map((v) => v / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  const l = [luminance(colors.color), luminance(colors.background)].sort((a, b) => b - a);
  assert.ok(
    (l[0] + 0.05) / (l[1] + 0.05) >= 4.5,
    'Progress badge text must meet normal-text contrast',
  );
  await intelligent.emulateMedia({ forcedColors: 'active' });
  await expect(sales).toContainText('进度偏慢');
  await intelligent.emulateMedia({ forcedColors: 'none' });
  const manualIntelligent = await pageFor(false, true, 'intelligent');
  await expect
    .poll(() =>
      manualIntelligent.evaluate(
        () => window.periodReads.filter((x) => x.enabled && !x.paused).at(-1)?.date,
      ),
    )
    .toBe('2026-11-09');
  if (process.env.APS_BRIEFING_SCREENSHOT)
    await intelligent.screenshot({ path: process.env.APS_BRIEFING_SCREENSHOT, fullPage: true });
});
