import { directSourceFixture } from './fixtures/configured-page.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
const config = JSON.parse(await readFile('business/inventory-fc/sql.config.json', 'utf8'));
const bundle = await build({
  plugins: [
    {
      name: 'direct-source-interaction-fixture',
      setup(builder) {
        builder.onLoad({ filter: /inventory-fc[\\/]sql\.config\.json$/ }, () => ({
          contents: JSON.stringify(directSourceFixture(config)),
          loader: 'json',
        }));
      },
    },
  ],
  stdin: {
    contents: `import './business/inventory-fc/source/inventory-light-plugins/src/dsh-ui/base.css';import React from 'react';import{createRoot}from'react-dom/client';import{configuredQueryFreshAfter}from'./business/shared/query-cache';window.queryFreshAfter=configuredQueryFreshAfter;import Page from './business/inventory-fc/source/inventory-light-plugins/src/pages/configured-workbench.tsx';createRoot(document.getElementById('app')).render(React.createElement(Page));`,
    resolveDir: process.cwd(),
    loader: 'tsx',
  },
  bundle: true,
  write: false,
  outfile: 'selector.js',
  format: 'iife',
  platform: 'browser',
  alias: { react: resolve('node_modules/react'), 'react-dom': resolve('node_modules/react-dom') },
  define: { PLUGIN_ID: '"fc"', 'process.env.NODE_ENV': '"test"' },
  loader: { '.css': 'css', '.module.css': 'local-css' },
});
const js = bundle.outputFiles.find((f) => f.path.endsWith('.js')).text;
const css = bundle.outputFiles.find((f) => f.path.endsWith('.css'))?.text ?? '';

test('multi selection separates aggregate metrics and per warehouse actions', async (t) => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.DSH_TEST_BROWSER_CHANNEL
      ? { channel: process.env.DSH_TEST_BROWSER_CHANNEL }
      : {}),
  });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [],
    calls = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('http://127.0.0.1:19496/**', async (route) => {
    if (route.request().method() !== 'POST')
      return route.fulfill({
        contentType: 'text/html',
        body:
          '<style>' +
          css +
          '</style><main id="app"></main><script id="agent-sql-direct" type="application/json">{"path":"/api/agents/inventory-fc/query","token":"fixture-only"}</script><script>' +
          js +
          '</script>',
      });
    const { queryId: id, parameters: values } = route.request().postDataJSON();
    calls.push({ id, values });
    const q = config.queries[id];
    assert.ok(q, id);
    let rows = [];
    const quantity =
      values.warehouse_code === 'A110' ? 100 : values.warehouse_code === 'A170' ? 300 : 900;
    if (id === 'branch-warehouse.directory.count') rows = [{ total: 23 }];
    else if (id === 'branch-warehouse.directory')
      rows = [
        { warehouse_code: 'A110', warehouse_name: '沈阳分仓', base: '郑州' },
        { warehouse_code: 'A170', warehouse_name: '成都分仓', base: '西南' },
        { warehouse_code: 'N417', warehouse_name: '郑州配送中心', base: '郑州' },
        ...Array.from({ length: 20 }, (_, i) => ({
          warehouse_code: 'TEST' + i,
          warehouse_name: '测试分仓' + i,
          base: '测试',
        })),
      ];
    else if (id === 'source.branch-stock-date')
      rows = [
        {
          ...Object.fromEntries(q.resultColumns.map((k) => [k, 0])),
          day: '2026-11-04',
          row_count: 1,
          total_qty: quantity,
        },
      ];
    else if (id.startsWith('source.')) rows = [{ day: '2026-11-04' }];
    else if (id.endsWith('.count')) rows = [{ total: 0 }];
    else if (id.includes('atomic'))
      rows = [
        {
          ...Object.fromEntries(q.resultColumns.map((k) => [k, null])),
          page_scope_total: 0,
          page_row_present: null,
        },
      ];
    else if (!['summary.snapshot', 'summary.bootstrap'].includes(id))
      rows = [
        Object.fromEntries(
          q.resultColumns.map((k) => [
            k,
            {
              row_count: 1,
              total_qty: quantity,
              age_weight_qty: quantity,
              weighted_age: values.warehouse_code === 'A110' ? 10 : 30,
              weighted_age_sum: quantity * (values.warehouse_code === 'A110' ? 10 : 30),
              snapshot_date: '2026-11-04',
              fulfillment_order_quantity: quantity,
              fulfillment_shipped_quantity: quantity / 2,
              fulfillment_rate: 0.5,
            }[k] ?? 0,
          ]),
        ),
      ];
    return route.fulfill({
      json: {
        rows,
        configVersion: 'fixture',
        returnedColumns: q.resultColumns,
        rejectedColumns: [],
      },
    });
  });
  await page.goto('http://127.0.0.1:19496/');
  await expect(page.getByRole('button', { name: '运营管理', exact: true })).toBeVisible();
  await expect(page.locator('[data-overview-cards="fc"]')).toBeVisible();
  const search = page.getByRole('searchbox', { name: '运营观察搜索', exact: true });
  const searchBox = search.locator('..');
  await expect(searchBox).toHaveCSS('width', '176px');
  await expect(searchBox).toHaveCSS('height', '36px');
  await expect(searchBox).toHaveCSS('border-radius', '10px');
  await search.fill('测试搜索');
  await expect(search).toHaveCSS('font-weight', '700');
  await expect(search).toHaveCSS('box-shadow', 'none');
  await expect(searchBox).toHaveCSS('border-color', 'rgb(229, 156, 168)');
  await page.getByRole('button', { name: '清空运营观察搜索', exact: true }).click();
  await expect(search).toHaveValue('');
  await expect(search).toBeFocused();
  await expect(page.getByRole('button', { name: '清空运营观察搜索', exact: true })).toHaveCount(0);
  await search.fill('escape');
  await search.press('Escape');
  await expect(search).toHaveValue('');
  await page.setViewportSize({ width: 700, height: 900 });
  await expect(searchBox).toHaveCSS('width', '160px');
  await page.screenshot({ path: '.scratch/fc-search-narrow.png' });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: '.scratch/fc-search-focus.png' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.getByRole('navigation', { name: '运营步骤' })).toHaveCount(0);
  await page.getByRole('button', { name: '选择分仓', exact: true }).click();
  await page.locator('[role=option][data-value="A110"]').click();
  await page.locator('[role=option][data-value="A170"]').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-overview-cards="fc"] .kpi-card').first()).toContainText('400');
  await expect(page.locator('[data-overview-cards="fc"] .kpi-card').nth(1)).toContainText('25');
  await page.screenshot({ path: '.scratch/fc-multi-overview.png' });
  await page.getByRole('button', { name: '操作管理', exact: true }).click();
  const nav = page.getByRole('navigation', { name: '操作分仓' });
  const branchSearch = page.getByRole('searchbox', { name: '分仓', exact: true });
  await branchSearch.fill('不存在的分仓');
  await expect(branchSearch).toHaveCSS('box-shadow', 'none');
  await expect(branchSearch.locator('..')).toHaveCSS('width', '176px');
  await page.screenshot({ path: '.scratch/fc-branch-search-focus.png' });
  await page.getByRole('button', { name: '清空分仓', exact: true }).click();
  await expect(branchSearch).toHaveValue('');
  await expect(branchSearch).toBeFocused();
  await expect(nav.getByRole('button')).toHaveCount(2);
  await expect(page.locator('[data-overview-cards="fc"]')).toHaveCount(0);
  await nav.getByRole('button', { name: '成都分仓', exact: true }).click();
  await expect(nav.getByRole('button', { name: '成都分仓', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect
    .poll(() =>
      calls.some(
        (c) => c.id === 'replenishment.detail.atomic' && c.values.warehouse_code === 'A170',
      ),
    )
    .toBe(true);
  await page.getByRole('button', { name: '货龄结构', exact: true }).click();
  await expect(page.getByText('货龄结构加载中', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: '.scratch/fc-multi-actions.png' });
  await page.getByRole('button', { name: '产品大类', exact: true }).click();
  await expect(page.getByRole('listbox', { name: '产品大类' })).toBeVisible();
  await page.getByRole('option', { name: '汤圆', exact: true }).click();
  await expect(page.getByRole('button', { name: '产品大类', exact: true })).toContainText('汤圆');
  await page.getByRole('button', { name: '当前订单', exact: true }).click();
  await page.getByRole('button', { name: '订单状态', exact: true }).click();
  await page.getByRole('option', { name: '缺口', exact: true }).click();
  await expect(page.getByRole('button', { name: '订单状态', exact: true })).toContainText('缺口');
  await page.getByRole('button', { name: '基地资源', exact: true }).click();
  await page.getByRole('button', { name: '基地名称', exact: true }).click();
  await expect(page.getByRole('listbox', { name: '基地名称' })).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await page.getByRole('button', { name: '选择分仓', exact: true }).click();
  await page.locator('[role=option][data-value="A170"]').click();
  await page.keyboard.press('Escape');
  await expect(nav.getByRole('button')).toHaveCount(1);
  await expect(nav.getByRole('button', { name: '沈阳分仓', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await page.getByRole('button', { name: '选择分仓', exact: true }).click();
  await page.locator('[role=option][data-value=""]').click();
  await page.keyboard.press('Escape');
  await expect(nav.getByRole('button')).toHaveCount(23);
  await page.setViewportSize({ width: 800, height: 900 });
  const modes = page.getByRole('navigation', { name: '管理视图' });
  const m = await modes.boundingBox(),
    w = await nav.boundingBox();
  assert.ok(w.y >= m.y + m.height, 'warehouse tabs are on a separate second row');
  assert.ok(w.height < 60, 'all warehouses stay in one compact row');
  await expect(page.getByRole('button', { name: '向右滚动分仓' })).toBeEnabled();
  await page.getByRole('button', { name: '向右滚动分仓' }).click();
  await expect.poll(() => nav.evaluate((e) => e.scrollLeft)).toBeGreaterThan(0);
  await nav.getByRole('button', { name: '测试分仓19', exact: true }).click();
  await expect(nav.getByRole('button', { name: '测试分仓19', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await page.getByRole('button', { name: '运营管理', exact: true }).click();
  await expect(page.locator('[data-overview-cards="fc"] .kpi-card').first()).toContainText('900');
  await page.getByRole('button', { name: '操作管理', exact: true }).click();
  await expect(nav.getByRole('button', { name: '测试分仓19', exact: true })).toBeInViewport();
  await page.screenshot({ path: '.scratch/fc-all-warehouse-tabs.png' });
  assert.deepEqual(errors, []);
});
