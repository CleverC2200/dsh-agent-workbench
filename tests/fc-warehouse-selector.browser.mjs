import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
const config = JSON.parse(await readFile('business/inventory-fc/sql.config.json', 'utf8'));
const bundle = await build({
  stdin: {
    contents: `import React from 'react';import{createRoot}from'react-dom/client';import{configuredQueryFreshAfter}from'./business/shared/query-cache';window.queryFreshAfter=configuredQueryFreshAfter;import Page from './business/inventory-fc/source/inventory-light-plugins/src/pages/configured-workbench.tsx';createRoot(document.getElementById('app')).render(React.createElement(Page));`,
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
test('FC warehouse selector scopes cards, tabs and reset; returning to all does not force cache invalidation', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const calls = [],
    errors = [];
  t.after(() => assert.deepEqual(errors, []));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('http://127.0.0.1:19486/**', async (route) => {
    if (route.request().method() !== 'POST')
      return route.fulfill({
        contentType: 'text/html',
        body: `<style>${css}</style><main id="app"></main><script id="agent-sql-direct" type="application/json">{"path":"/api/agents/inventory-fc/query","token":"fixture-only"}</script><script>${js}</script>`,
      });
    const { queryId: id, parameters: values } = route.request().postDataJSON();
    calls.push({ id, values });
    const q = config.queries[id];
    assert.ok(q, id);
    let rows;
    if (id === 'branch-warehouse.directory')
      rows = [
        { warehouse_code: 'A170', warehouse_name: '成都分仓', base: '西南' },
        { warehouse_code: 'N417', warehouse_name: '郑州配送中心', base: '郑州' },
      ];
    else if (id.startsWith('source.')) rows = [{ day: '2026-10-27' }];
    else if (id.endsWith('.count') || id.endsWith('_count')) rows = [{ total: 0 }];
    else if (id === 'current-shortage.summary')
      rows = [
        {
          ...Object.fromEntries(q.resultColumns.map((k) => [k, null])),
          demand: values.warehouse_code ? 23 : 230,
          allocated: 2,
          remaining: 21,
          available: 10,
          shortage: 11,
          invalid: 0,
        },
      ];
    else if (id === 'current-shortage.detail' || id.includes('atomic'))
      rows = [{ page_scope_total: 0, page_row_present: null }];
    else if (id.endsWith('.detail') || id.includes('batch-age.groups')) rows = [];
    else {
      const row = Object.fromEntries(q.resultColumns.map((k) => [k, 0]));
      Object.assign(row, {
        row_count: 1,
        total_qty: values.warehouse_code ? 123 : 999,
        fulfillment_rate: 0.95,
        demand: 100,
        shortage: 5,
        recommended_qty: values.warehouse_code ? 7 : 70,
        age_weight_qty: 1,
        weighted_age_sum: 20,
      });
      rows = [row];
    }
    await route.fulfill({
      json: {
        rows,
        configVersion: 'fixture',
        returnedColumns: q.resultColumns,
        rejectedColumns: [],
      },
    });
  });
  await page.goto('http://127.0.0.1:19486/');
  const picker = page.getByRole('combobox', { name: '选择分仓' });
  await expect(picker).toBeEnabled();
  await expect(picker.locator('option')).toHaveCount(3);
  const firstCard = page.locator('[data-overview-cards="fc"] article').first();
  await expect(firstCard).toContainText('999');
  const initialDirectoryReads = calls.filter((c) => c.id === 'branch-warehouse.directory').length;
  const freshAfter = await page.evaluate(() => window.queryFreshAfter());
  await picker.selectOption('A170');
  await expect(firstCard).toContainText('123');
  await expect(page.locator('[data-overview-cards="fc"] article').last()).toContainText('23');
  await expect
    .poll(() => calls.some((c) => c.id === 'orders.summary' && c.values.warehouse_code === 'A170'))
    .toBe(true);
  await expect
    .poll(() =>
      calls.some((c) => c.id === 'replenishment.summary' && c.values.warehouse_code === 'A170'),
    )
    .toBe(true);
  await expect
    .poll(() =>
      calls.some((c) => c.id === 'current-shortage.summary' && c.values.warehouse_code === 'A170'),
    )
    .toBe(true);
  await page.getByRole('button', { name: '当前订单', exact: true }).click();
  await expect
    .poll(() =>
      calls.some((c) => c.id === 'current-shortage.detail' && c.values.warehouse_code === 'A170'),
    )
    .toBe(true);
  await page.getByRole('button', { name: '清空筛选', exact: true }).click();
  await expect(picker).toHaveValue('A170');
  const orderCalls = calls.filter((c) => c.id === 'current-shortage.detail');
  assert.ok(orderCalls.every((c) => c.values.warehouse_code === 'A170'));
  await page.getByRole('button', { name: '分仓计划', exact: true }).click();
  await expect
    .poll(() =>
      calls.some((c) => c.id.startsWith('transfer_plan.') && c.values.warehouse_code === 'A170'),
    )
    .toBe(true);
  await mkdir('.scratch', { recursive: true });
  await page.screenshot({ path: '.scratch/fc-warehouse-selector.png' });
  await picker.selectOption('');
  await expect(firstCard).toContainText('999');
  assert.equal(
    calls.filter((c) => c.id === 'branch-warehouse.directory').length,
    initialDirectoryReads,
  );
  assert.equal(await page.evaluate(() => window.queryFreshAfter()), freshAfter);
  assert.deepEqual(errors, []);
  await page.setViewportSize({ width: 520, height: 900 });
  await expect(picker).toBeVisible();
  await picker.selectOption('N417');
  await expect(firstCard).toContainText('123');
});
