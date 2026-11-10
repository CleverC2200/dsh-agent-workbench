import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { resolve } from 'node:path';
import { chromium, expect } from '@playwright/test';
const ui = resolve('business/inventory-apsplan/source');
const bundle = await build({
  stdin: {
    contents: `import React from 'react';import{createRoot}from'react-dom/client';import Home from './business/inventory-apsplan/source/app/workbench-app';createRoot(document.getElementById('root')).render(<Home initialWorkspace="plan" embedMode liveData/>);`,
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
          contents: `export function useWorkspace(enabled,date,granularity,summary,detailMode,productScope,{paused=false}={}){window.periodReads.push({enabled,date,paused});return {data:{start:date,end:date,granularity:'day',sections:[],readAt:date,limitations:[]},previous:null,annual:null,busy:false,comparisonBusy:false,error:''};}`,
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
test('default uses latest day; manual day stays exact and wins a late calendar response', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  async function pageFor(hold = false, manual = false) {
    const page = await browser.newPage();
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
    await page.goto('http://aps.test/');
    await page.evaluate(
      ({ hold, manual }) => {
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
                  activeWorkspace: 'plan',
                  timeGranularity: 'day',
                  selectedYearKey: '2026',
                  selectedMonthKey: '11',
                  selectedDay: manual ? 9 : 10,
                  boardDateMode: manual ? 'manual' : 'latest',
                },
              },
              '*',
            );
        });
      },
      { hold, manual },
    );
    await page.addScriptTag({
      content: bundle.outputFiles.find((x) => x.path.endsWith('.js')).text,
    });
    return page;
  }
  const page = await pageFor();
  await expect(page.locator('.date-picker-button')).toHaveText('2026年11月8日');
  const reads = await page.evaluate(() => window.periodReads.filter((x) => x.enabled && !x.paused));
  assert.ok(reads.length > 0);
  assert.ok(
    reads.every((x) => x.date === '2026-11-08'),
    'Default must not query an empty date first',
  );
  await page.locator('.date-picker-button').click();
  await page
    .getByRole('menu', { name: '统计日期筛选' })
    .getByRole('button', { name: '9', exact: true })
    .click();
  await expect(page.locator('.date-picker-button')).toHaveText('2026年11月9日');
  await expect
    .poll(() => page.evaluate(() => window.periodReads.filter((x) => x.enabled && !x.paused).at(-1)?.date))
    .toBe('2026-11-09');
  const restored = await pageFor(false, true);
  await expect(restored.locator('.date-picker-button')).toHaveText('2026年11月9日');
  await expect
    .poll(() => restored.evaluate(() => window.periodReads.filter((x) => x.enabled && !x.paused).at(-1)?.date))
    .toBe('2026-11-09');
  const racing = await pageFor(true);
  await racing.locator('.date-picker-button').click();
  await racing
    .getByRole('menu', { name: '统计日期筛选' })
    .getByRole('button', { name: '9', exact: true })
    .click();
  await racing.evaluate(() => window.resolveCalendar());
  await expect(racing.locator('.date-picker-button')).toHaveText('2026年11月9日');
  await expect
    .poll(() => racing.evaluate(() => window.periodReads.filter((x) => x.enabled && !x.paused).at(-1)?.date))
    .toBe('2026-11-09');
});
