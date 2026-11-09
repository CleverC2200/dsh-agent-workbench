import test from 'node:test';
import { build } from 'esbuild';
import { resolve } from 'node:path';
import { chromium, expect } from '@playwright/test';

const ui = resolve('business/inventory-apsplan/source');
const bundle = await build({
  stdin: {
    contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
      import Home from './business/inventory-apsplan/source/app/workbench-app';
      createRoot(document.getElementById('root')).render(<Home initialWorkspace="plan" embedMode liveData/>);`,
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
          contents: 'export const useWorkspace=()=>window.fixture;',
        }));
      },
    },
  ],
});

test('live production drilldowns judge attainment and risk from the prototype thresholds', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  page.setDefaultTimeout(3000);
  page.setDefaultNavigationTimeout(3000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('http://aps.test/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }),
  );
  await page.goto('http://aps.test/');
  await page.evaluate(() => {
    const rows = [
      {
        base: '郑州',
        category: '饼类',
        item: '休闲',
        material: '健康品',
        demand: 10000,
        shortage: 192,
        invalid: 0,
      },
      {
        base: '郑州',
        category: '调理肉制品',
        item: '火锅料',
        material: '预警品',
        demand: 10000,
        shortage: 548,
        invalid: 0,
      },
      {
        base: '郑州',
        category: '馄饨',
        item: '馄饨',
        material: '严重品',
        demand: 10000,
        shortage: 1500,
        invalid: 0,
      },
      {
        base: '郑州',
        category: '面点',
        item: '面点',
        material: '无缺口',
        demand: 10000,
        shortage: 0,
        invalid: 0,
      },
    ];
    window.fixture = {
      data: {
        start: '2026-11-01',
        end: '2026-11-09',
        granularity: 'month',
        sections: [
          { id: 'orders', status: 'ready', rows },
          {
            id: 'stock',
            status: 'ready',
            rows: [
              {
                base: '郑州',
                category: '粽子',
                inventory: 100,
                available: 100,
                demand: 10,
                invalid: 0,
              },
            ],
          },
        ],
        readAt: '2026-11-09T08:00:00',
        limitations: [],
      },
      previous: null,
      annual: null,
      busy: false,
      comparisonBusy: false,
      error: '',
    };
  });
  await page.addScriptTag({ content: bundle.outputFiles.find((x) => x.path.endsWith('.js')).text });
  await page.getByRole('tab', { name: '生产视角', exact: true }).click();
  await page.getByRole('tab', { name: '订单满足率', exact: true }).last().click();
  const rows = page.locator('.category-drill-row.category-level');
  await expect(rows).toHaveCount(5);
  const row = rows.filter({ hasText: '饼类' });
  await expect(row).toContainText('98.08%');
  await expect(row.locator('.category-drill-status')).toHaveText('达标');
  await expect(row.locator('.category-drill-risk')).toHaveText('健康');
  const watch = rows.filter({ hasText: '调理肉制品' });
  await expect(watch.locator('.category-drill-status')).toHaveText('未达');
  await expect(watch.locator('.category-drill-risk')).toHaveText('预警');
  const severe = rows.filter({ hasText: '馄饨' });
  await expect(severe.locator('.category-drill-risk')).toHaveText('严重');
  const missing = rows.filter({ hasText: '粽子' });
  await expect(missing.locator('.category-drill-status')).toHaveText('无数据');
  await expect(missing.locator('.category-drill-risk')).toHaveText('无数据');
  await row.locator('.category-drill-toggle').click();
  const item = page.locator('.category-drill-row.item-level').filter({ hasText: '休闲' });
  await expect(item.locator('.category-drill-status')).toHaveText('达标');
  await item.locator('.category-drill-toggle').click();
  await expect(
    page
      .locator('.category-drill-row.material-level')
      .filter({ hasText: '健康品' })
      .locator('.category-drill-risk'),
  ).toHaveText('健康');
  await page.getByRole('tab', { name: '订单缺货量', exact: true }).last().click();
  await expect(row.locator('.category-drill-status')).toHaveText('未达');
  await expect(row.locator('.category-drill-risk')).toHaveText('预警');
  await expect(rows.filter({ hasText: '面点' }).locator('.category-drill-status')).toHaveText(
    '达标',
  );
  await expect(rows.filter({ hasText: '面点' }).locator('.category-drill-risk')).toHaveText('健康');
  await page.getByRole('tab', { name: '库存量', exact: true }).last().click();
  await expect(missing.locator('.category-drill-status')).toHaveText('无目标');
  await expect(missing.locator('.category-drill-risk')).toHaveText('无目标');
  await page.getByRole('tab', { name: '基地维度', exact: true }).click();
  await page.getByRole('tab', { name: '订单满足率', exact: true }).last().click();
  const base = page.locator('.category-drill-row.base-level').filter({ hasText: '郑州' });
  await expect(base.locator('.category-drill-status')).toHaveText('未达');
  await expect(base.locator('.category-drill-risk')).toHaveText('预警');
  expect(errors).toEqual([]);
});

test('live sales organization metrics use configured targets and preserve unavailable organizations', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.route('http://aps.test/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }),
  );
  await page.goto('http://aps.test/');
  await page.evaluate(() => {
    const scope = {
      month: '202611',
      region: '国外大区',
      province: '北美区',
      sales_group: '加拿大销售组',
      invalid: 0,
    };
    window.fixture = {
      data: {
        start: '2026-11-01',
        end: '2026-11-09',
        granularity: 'month',
        missingValuePolicy: 'zero',
        readAt: '2026-11-09',
        limitations: [],
        sections: [
          { id: 'finance', status: 'ready', rows: [{ ...scope, actual: 9700 }] },
          { id: 'sales-budget', status: 'ready', rows: [{ ...scope, budget: 10000 }] },
          {
            id: 'sales-accuracy',
            status: 'ready',
            rows: [
              {
                ...scope,
                initial_plan: 100,
                adjusted_plan: 100,
                initial_deviation: 30,
                adjusted_deviation: 30,
                actual: 100,
              },
            ],
          },
        ],
      },
      previous: null,
      annual: null,
      busy: false,
      comparisonBusy: false,
      error: '',
    };
  });
  await page.addScriptTag({ content: bundle.outputFiles.find((x) => x.path.endsWith('.js')).text });
  await page.getByRole('tab', { name: '销售视角', exact: true }).click();
  const region = page.locator('.sales-org-row.sales-org-region').filter({ hasText: '国外大区' });
  await expect(region.locator('.achievement-status')).toHaveText(['达标', '未达']);
  await expect(region.locator('.sales-org-risk')).toHaveText('预警');
  const missing = page.locator('.sales-org-row.sales-org-region').filter({ hasText: 'B端营销部' });
  await expect(missing.locator('.achievement-status')).toHaveText(['无数据', '无数据']);
  await expect(missing.locator('.sales-org-risk')).toHaveText('无数据');
  await page.getByRole('tab', { name: '销售预算达成率', exact: true }).last().click();
  await expect(region).toContainText('> 95%');
  await expect(region.locator('.achievement-status')).toHaveText('达标');
  await expect(region.locator('.sales-org-risk')).toHaveText('健康');
});
