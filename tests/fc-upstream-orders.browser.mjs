import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
const config = JSON.parse(await readFile('business/inventory-fc/sql.config.json', 'utf8'));
const bundle = await build({
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

async function openFixture(t, denied = false) {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const calls = [];
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  t.after(() => assert.deepEqual(errors, []));
  await page.route('http://127.0.0.1:19487/**', async (route) => {
    if (route.request().method() !== 'POST')
      return route.fulfill({
        contentType: 'text/html',
        body: `<style>${css}</style><main id="app"></main><script id="agent-sql-direct" type="application/json">{"path":"/api/agents/inventory-fc/query","token":"fixture-only"}</script><script>${js}</script>`,
      });
    const { queryId: id, parameters } = route.request().postDataJSON();
    calls.push({ id, parameters });
    const q = config.queries[id];
    assert.ok(q, id);
    if (
      denied &&
      (id === 'branch-supply.summary' ||
        id === 'replenishment.summary' ||
        id === 'current-shortage.summary')
    )
      return route.fulfill({
        status: 403,
        json: {
          code: 'ROW_SCOPE_DENIED',
          message: 'denied',
          failure: { stage: 'AUTHORIZE', reasonCode: 'ROW_SCOPE_DENIED' },
        },
      });
    let row = Object.fromEntries(q.resultColumns.map((key) => [key, 0]));
    let rows = [row];
    if (id === 'branch-warehouse.directory')
      rows = [{ warehouse_code: 'A230', warehouse_name: '杭州分仓', base: '华东' }];
    else if (id.startsWith('source.')) rows = [{ day: '2026-10-30' }];
    else if (id === 'branch-supply.summary')
      Object.assign(row, {
        row_count: parameters.period_mode === 'current' ? 43 : 163,
        demand: parameters.period_mode === 'current' ? 17068 : 32124,
        shipped: parameters.period_mode === 'current' ? 11069 : 26416,
        pending: parameters.period_mode === 'current' ? 5999 : 5708,
        in_transit: 1644,
        fulfillment_rate: 26416 / 32124,
      });
    else if (id === 'current-shortage.summary')
      Object.assign(row, {
        location_type: '分仓',
        location_code: 'A230',
        warehouseid: 'A230',
        demand: 5999,
        allocated: 1000,
        remaining: 4999,
        available: 3999,
        shortage: 1000,
        invalid: 0,
      });
    else if (id === 'replenishment.summary')
      Object.assign(row, {
        row_count: 1,
        recommended_qty: 600,
        known_in_transit: 1644,
        known_preparing: 100,
      });
    else if (id === 'branch-current-orders.page')
      Object.assign(row, {
        page_scope_total: 1,
        page_row_present: 1,
        warehouse_code: 'A230',
        warehouse_name: '杭州分仓',
        order_no: 'BASE-SUPPLY-1',
        order_status: '00',
        customer_code: '郑州',
        customer_name: '郑州',
        requested_at: '2026-10-30',
        created_at: '2026-10-01',
        ordered: 20,
        allocated: 10,
        remaining: 10,
        shortage: 5,
        sku_count: 1,
        satisfaction: 0.5,
        line_no: 1,
        sku: 'SKU1',
        material_name: '基地补货商品',
        base_warehouse: 'N411',
        base: '郑州',
        order_type: 'ZUB',
        demand: 20,
        shipped: 15,
        received: 10,
        pending: 5,
        in_transit: 5,
      });
    else if (id.includes('atomic') || id.endsWith('.detail')) rows = [];
    else
      Object.assign(row, {
        row_count: 1,
        total_qty: 13200,
        recommended_qty: 600,
        age_weight_qty: 10,
        weighted_age_sum: 210,
      });
    return route.fulfill({
      json: {
        rows,
        returnedColumns: q.resultColumns,
        rejectedColumns: [],
        configVersion: 'fixture',
      },
    });
  });
  await page.goto('http://127.0.0.1:19487/');
  return { page, calls };
}
test('FC renders base supply fulfillment and cross-month orders independently of customer outbound demand', async (t) => {
  const { page, calls } = await openFixture(t);
  const cards = page.locator('[data-overview-cards="fc"] article');
  await expect(cards.filter({ hasText: '订单满足率' }).locator('.kpi-value')).toHaveText('82.23%');
  await expect(cards.filter({ hasText: '当前订单' })).toContainText('5,999');
  await expect(cards.filter({ hasText: '待补货量' })).toContainText('1,644');
  await page.getByRole('button', { name: '选择分仓' }).click();
  await page.locator('[role=option][data-value="A230"]').click();
  await page.getByRole('button', { name: '当前订单', exact: true }).click();
  await expect(page.locator('table')).toContainText('BASE-SUPPLY-1');
  await expect(page.locator('table')).toContainText('郑州');
  await expect(page.getByRole('button', { name: '选择分仓' })).toContainText('A230');
  assert.ok(
    calls.some(
      (c) => c.id === 'branch-current-orders.page' && c.parameters.warehouse_code === 'A230',
    ),
  );
  assert.ok(!calls.some((c) => ['orders.summary', 'branch-supply-current.summary'].includes(c.id)));
  await expect(page.getByRole('button', { name: '客户订单', exact: true })).toHaveCount(0);
  assert.ok(calls.some((c) => c.id === 'current-shortage.summary'));
  assert.ok(!calls.some((c) => c.id === 'branch-supply.detail.atomic'));
});
test('FC exposes denied domains and preserves ready inventory without fabricating zero', async (t) => {
  const { page, calls } = await openFixture(t, true);
  await expect(
    page.getByRole('alert').filter({ hasText: '当前账号的数据权限未就绪' }).first(),
  ).toBeVisible();
  const cards = page.locator('[data-overview-cards="fc"] article');
  await expect(cards.filter({ hasText: '订单满足率' }).locator('.kpi-value')).toHaveText('-');
  await expect(cards.filter({ hasText: '当前订单' }).locator('.kpi-value')).toHaveText('-');
  await expect(cards.filter({ hasText: '待补货量' }).locator('.kpi-value')).toHaveText('-');
  await expect(cards.first().locator('.kpi-value')).toHaveText('1.32万件');
  assert.equal(calls.filter((c) => c.id === 'branch-supply.summary').length, 1);
  assert.equal(calls.filter((c) => c.id === 'replenishment.summary').length, 1);
});
