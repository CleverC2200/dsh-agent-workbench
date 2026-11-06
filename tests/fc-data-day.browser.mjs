import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
const config = JSON.parse(await readFile('business/inventory-fc/sql.config.json', 'utf8'));
delete config.dailySummary.bundle;
const output = await build({
  plugins: [
    {
      name: 'clock-fixture',
      setup(api) {
        api.onLoad({ filter: /inventory-fc\/sql\.config\.json$/ }, () => ({
          contents: JSON.stringify(config),
          loader: 'json',
        }));
      },
    },
  ],
  stdin: {
    contents:
      "import './business/inventory-fc/source/inventory-light-plugins/src/dsh-ui/base.css';import React from 'react';import{createRoot}from'react-dom/client';import Page from './business/inventory-fc/source/inventory-light-plugins/src/pages/configured-workbench.tsx';createRoot(document.getElementById('app')).render(React.createElement(Page));",
    resolveDir: process.cwd(),
    loader: 'tsx',
  },
  bundle: true,
  write: false,
  outfile: 'fc-clock.js',
  format: 'iife',
  platform: 'browser',
  alias: { react: resolve('node_modules/react'), 'react-dom': resolve('node_modules/react-dom') },
  define: { PLUGIN_ID: '"fc"', 'process.env.NODE_ENV': '"test"' },
  loader: { '.css': 'css', '.module.css': 'local-css' },
});
const js = output.outputFiles.find((f) => f.path.endsWith('.js')).text;
const css = output.outputFiles.find((f) => f.path.endsWith('.css')).text;
test('current FC page stays populated on an older complete batch and refresh advances every calculation day', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.clock.install({ time: new Date('2026-11-06T01:00:00Z') });
  let businessDate = '2026-11-05';
  const calls = [];
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('http://fc-clock.test/**', async (route) => {
    if (route.request().method() !== 'POST')
      return route.fulfill({
        contentType: 'text/html',
        body: `<style>${css}</style><div id="app"></div><script id="agent-sql-direct" type="application/json">{"path":"/api/agents/inventory-fc/query","token":"fixture"}</script><script>${js}</script>`,
      });
    const { queryId: id, parameters } = route.request().postDataJSON();
    calls.push({ id, parameters });
    const q = config.queries[id];
    assert.ok(q, id);
    let row = Object.fromEntries(q.resultColumns.map((k) => [k, 0]));
    if (id === 'summary.snapshot')
      Object.assign(row, {
        batch_id: 'batch-' + businessDate,
        business_date: businessDate,
        stock_date: '2026-11-04',
        target_month: '2026-11-01',
      });
    else if (id === 'snapshot.branch-warehouse.directory.count') Object.assign(row, { total: 1 });
    else if (id === 'snapshot.branch-warehouse.directory')
      Object.assign(row, { warehouse_code: 'A110', warehouse_name: '测试分仓', base: '郑州' });
    else if (id === 'snapshot.source.branch-stock-date')
      Object.assign(row, {
        day: '2026-11-04',
        row_count: 1,
        total_qty: 80,
        available_qty: 70,
        pack_unit_qty: 10,
        freeze_qty: 0,
      });
    else
      Object.assign(row, {
        row_count: 1,
        warehouse_count: 1,
        warehouse_code: 'A110',
        warehouse_name: '测试分仓',
        sku: 'SKU1',
        material_name: '测试产品',
        stock_date: '2026-11-04',
        day: '2026-11-04',
        page_scope_total: 1,
        page_row_present: 1,
        recommended_qty: 32,
        known_recommended_qty: 32,
        known_preparing: 12,
        known_in_transit: 27,
        inventory_qty: 80,
        available_qty: 70,
        stock_present: 1,
        plan_present: 1,
        plan_calculable: 1,
        cycle_days: 7,
        calculation_status: '正常',
        stat_month: '202611',
        order_no: 'O1',
        customer_code: 'C1',
        customer_name: '测试客户',
        created_at: '2026-11-04',
        requested_at: null,
        order_status: '正常',
      });
    await route.fulfill({
      json: {
        rows: [row],
        returnedColumns: q.resultColumns,
        rejectedColumns: [],
        configVersion: 'fixture',
      },
    });
  });
  for (let entry = 0; entry < 2; entry++) {
    await page.goto('http://fc-clock.test/');
    const card = page.locator('.kpi-card').filter({ hasText: '待补货量' });
    await expect(card.locator('.kpi-value')).toHaveText('32件');
    await expect(card).toContainText('12件');
    await expect(card).toContainText('27件');
    await expect(page.locator('table')).toContainText('测试产品');
    await expect(page.locator('body')).toContainText('汇总日期：2026-11-05');
  }
  const selected = calls.filter((c) => c.id.startsWith('snapshot-default.replenishment'));
  assert.ok(selected.length > 0);
  assert.ok(
    selected.every((c) => c.parameters.as_of === undefined || c.parameters.as_of === '2026-11-05'),
  );
  assert.equal(
    calls.some((c) => c.id.startsWith('replenishment.')),
    false,
  );
  businessDate = '2026-11-06';
  await page.clock.runFor(1000);
  const before = calls.length;
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  await expect
    .poll(() =>
      calls
        .slice(before)
        .some(
          (c) =>
            c.id.startsWith('snapshot-default.replenishment') &&
            c.parameters.as_of === '2026-11-06',
        ),
    )
    .toBe(true);
  await expect(page.locator('body')).not.toContainText('汇总日期：2026-11-05');
  await expect(page.locator('table')).toContainText('测试产品');
  await mkdir('.scratch/fc-data-day', { recursive: true });
  await page.screenshot({ path: '.scratch/fc-data-day/restored.png', fullPage: true });
  assert.deepEqual(errors, []);
});
