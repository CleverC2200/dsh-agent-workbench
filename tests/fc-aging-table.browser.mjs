import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
import { directSourceFixture } from './fixtures/configured-page.mjs';

const config = directSourceFixture(
  JSON.parse(await readFile('business/inventory-fc/sql.config.json', 'utf8')),
);
const output = await build({
  stdin: {
    contents: `import React from 'react';import{createRoot}from'react-dom/client';
      import './business/inventory-fc/source/inventory-light-plugins/src/dsh-ui/base.css';
      import './business/inventory-fc/source/inventory-light-plugins/src/pages/fc.css';
      import {ConfiguredFactsPage} from './business/shared/configured-facts-page';
      import {originalFcView} from './business/shared/original-business-views';
      import {FcConfiguredList,FcWorkflowProvider} from './business/inventory-fc/source/inventory-light-plugins/src/pages/configured-fc-list';
      const config=${JSON.stringify(config)};
      createRoot(document.getElementById('app')).render(<FcWorkflowProvider><ConfiguredFactsPage config={config}
        businessList={FcConfiguredList} date="2026-10-22" viewIds={['inventory']}
        presentation={originalFcView(config,'structure')}/></FcWorkflowProvider>);`,
    resolveDir: process.cwd(),
    loader: 'tsx',
  },
  bundle: true,
  write: false,
  outfile: 'aging.js',
  format: 'iife',
  platform: 'browser',
  alias: {
    react: resolve('node_modules/react'),
    'react-dom': resolve('node_modules/react-dom'),
  },
  define: { PLUGIN_ID: '"fc"', 'process.env.NODE_ENV': '"test"' },
  loader: { '.css': 'css', '.module.css': 'local-css' },
});
const js = output.outputFiles.find((file) => file.path.endsWith('.js')).text;
const css = output.outputFiles.find((file) => file.path.endsWith('.css')).text;

test('aging filters apply inside the client restricted frame and keep all-scope totals aligned', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const host = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  const calls = [],
    errors = [];
  host.on('pageerror', (error) => errors.push(error.message));
  host.on('console', (message) => {
    if (message.type() === 'error' && message.text().includes('same key'))
      errors.push(message.text());
  });
  const all = Array.from({ length: 14 }, (_, i) => ({
    material_code: `S${String(i + 1).padStart(2, '0')}`,
    material_name: `商品${i + 1}`,
    product_categ_name: i === 13 ? '面点' : '饺子',
    total_qty: i === 13 ? 0 : i + 1,
    age_weight_qty: i === 13 ? 0 : i + 1,
    weighted_age: (i === 13 ? 0 : i + 1) * 20,
    unknown_age_qty: 0,
    average_age: 20,
    max_age: 20,
    age0_30: i === 13 ? 0 : i + 1,
    age31_60: 0,
    age61_90: 0,
    age90_plus: 0,
    daily_movement: 1,
    warning:
      i === 0 ? '货龄待核实' : i === 13 ? '无库存' : i === 12 ? '滞库' : i === 11 ? '预警' : '正常',
  }));
  await host.route('http://127.0.0.1:19497/**', async (route) => {
    const headers = {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': '*',
    };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (route.request().method() !== 'POST')
      return route.fulfill({
        contentType: 'text/html',
        headers,
        body:
          new URL(route.request().url()).pathname === '/'
            ? '<body style="margin:0"><iframe sandbox="allow-scripts allow-downloads" src="/aging" style="width:100%;height:900px;border:0"></iframe></body>'
            : `<style>${css}</style><div id="app"></div><script id="agent-sql-direct" type="application/json">{"path":"/api/agents/inventory-fc/query","token":"fixture-only"}</script><script>${js}</script>`,
      });
    const { queryId, parameters: values } = route.request().postDataJSON();
    calls.push({ queryId, values });
    const query = config.queries[queryId];
    assert.ok(query, queryId);
    let rows;
    if (queryId === 'source.branch-stock-date') rows = [{ day: '2026-10-22' }];
    else if (queryId === 'batch-age.atomic' && values.group_level === 'category') {
      rows = ['饺子', '面点'].map((level) => ({
        ...Object.fromEntries(query.resultColumns.map((field) => [field, null])),
        level,
        page_scope_total: 2,
        page_row_present: 1,
      }));
    } else {
      assert.equal(queryId, 'batch-age.atomic');
      const filtered = all.filter(
        (row) =>
          (!values.risk || row.warning === values.risk) &&
          (!values.category || row.product_categ_name === values.category) &&
          (values.stock_presence !== '有库存' || row.total_qty > 0) &&
          (values.stock_presence !== '无库存' || row.total_qty === 0) &&
          (!values.column_material_code_contains ||
            row.material_code.includes(values.column_material_code_contains.replaceAll('%', ''))) &&
          (values.column_total_qty_min == null || row.total_qty >= values.column_total_qty_min) &&
          (values.column_total_qty_max == null || row.total_qty <= values.column_total_qty_max),
      );
      const summary = {
        total_qty: filtered.reduce((sum, row) => sum + row.total_qty, 0),
        average_age: filtered.length ? 20 : null,
        age_weight_qty: filtered.reduce((sum, row) => sum + row.total_qty, 0),
        age0_30: filtered.reduce((sum, row) => sum + row.total_qty, 0),
        unknown_age_qty: 0,
      };
      const scope = Object.fromEntries(
        Object.entries(query.scopeSummaryColumns).map(([field, alias]) => [
          alias,
          summary[field] ?? null,
        ]),
      );
      rows = filtered.slice(values.offset, values.offset + values.page_size).map((row) => ({
        ...Object.fromEntries(query.resultColumns.map((field) => [field, null])),
        ...row,
        ...scope,
        page_scope_total: filtered.length,
        page_row_present: 1,
      }));
      if (!rows.length)
        rows = [
          {
            ...Object.fromEntries(query.resultColumns.map((field) => [field, null])),
            ...scope,
            page_scope_total: 0,
          },
        ];
    }
    return route.fulfill({
      headers,
      json: {
        rows,
        returnedColumns: query.resultColumns,
        rejectedColumns: [],
        configVersion: 'fixture',
      },
    });
  });
  await host.goto('http://127.0.0.1:19497/');
  const page = host.frames().find((frame) => frame !== host.mainFrame());
  assert.ok(page, 'the inventory page must run inside the restricted client frame');
  const table = page.locator('table[data-resizable]');
  const footer = table.locator('tfoot');
  await expect(table.locator('th[data-field="total_qty"]')).toContainText('SKU总库存量');
  await expect(
    page.getByRole('checkbox', { name: '90天以上', exact: true }).locator('..'),
  ).toHaveAttribute(
    'title',
    '筛选包含对应货龄批次的SKU；SKU总库存含全部批次，分段数量见对应货龄列。',
  );
  await expect(table.locator('tbody tr')).toHaveCount(10);
  await expect(table.locator('th[data-field="warehouseid"]')).toHaveCount(0);
  await page.getByLabel('列设置', { exact: true }).click();
  await expect(page.getByRole('checkbox', { name: '分仓编码', exact: true })).toHaveCount(0);
  await page.getByLabel('列设置', { exact: true }).click();
  await page.getByRole('button', { name: '筛选产品大类', exact: true }).click();
  await expect(page.getByRole('combobox', { name: '筛选值', exact: true })).toBeEnabled();
  await expect(
    page.getByRole('combobox', { name: '筛选值', exact: true }).locator('option'),
  ).toHaveText([
    '全部',
    '汤圆',
    '饺子',
    '馄饨',
    '休闲',
    '饼类',
    '面点',
    '调理肉制品',
    '粽子',
    '饺鲜说',
  ]);
  await page.getByRole('combobox', { name: '筛选值', exact: true }).selectOption('面点');
  await page.getByRole('button', { name: '应用', exact: true }).click();
  await expect(table.locator('tbody tr')).toHaveCount(1);
  assert.equal(calls.at(-1).values.category, '面点');
  await expect(table.locator('tbody [data-column="material_code"]')).toHaveText('S14');
  await page.getByRole('button', { name: '筛选产品大类', exact: true }).click();
  await page.getByRole('button', { name: '清除', exact: true }).click();
  await expect(table.locator('tbody tr')).toHaveCount(10);
  await expect(footer.locator('[data-column="total_qty"]')).toHaveText('91');
  await expect(footer.locator('[data-column="missing_age_5"]')).toHaveText('20.0');
  for (const [risk, sku] of [
    ['货龄待核实', 'S01'],
    ['无库存', 'S14'],
    ['滞库', 'S13'],
    ['预警', 'S12'],
  ]) {
    await page.getByRole('button', { name: '筛选风险状态', exact: true }).click();
    await page.getByRole('combobox', { name: '筛选值', exact: true }).selectOption(risk);
    await page.getByRole('button', { name: '应用', exact: true }).click();
    await expect(table.locator('tbody tr')).toHaveCount(1);
    await expect(table.locator('tbody [data-column="material_code"]')).toHaveText(sku);
    assert.equal(calls.at(-1).values.risk, risk);
    await page.getByRole('button', { name: '筛选风险状态', exact: true }).click();
    await page.getByRole('button', { name: '清除', exact: true }).click();
    await expect(table.locator('tbody tr')).toHaveCount(10);
  }
  await page.getByRole('button', { name: '筛选风险状态', exact: true }).click();
  await page.getByRole('combobox', { name: '筛选值', exact: true }).selectOption('正常');
  await page.getByRole('button', { name: '应用', exact: true }).click();
  await expect(footer.locator('[data-column="total_qty"]')).toHaveText('65');
  assert.equal(calls.at(-1).values.risk, '正常');
  await page.getByRole('button', { name: '筛选风险状态', exact: true }).click();
  await page.getByRole('combobox', { name: '筛选值', exact: true }).selectOption('');
  await page.getByRole('button', { name: '应用', exact: true }).click();
  await expect(footer.locator('[data-column="total_qty"]')).toHaveText('91');
  const categorySelect = page.getByRole('combobox', {
    name: '产品大类',
    exact: true,
  });
  await expect(categorySelect.locator('option')).toHaveCount(10);
  await categorySelect.selectOption('面点');
  await page.getByRole('button', { name: '查询', exact: true }).click();
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await expect(table.locator('tbody [data-column="material_code"]')).toHaveText('S14');
  await page.getByRole('button', { name: '清空筛选', exact: true }).click();
  await expect(table.locator('tbody tr')).toHaveCount(10);
  const header = table.locator('th[data-field="material_name"]');
  const before = await header.boundingBox();
  const handle = page.getByRole('separator', { name: '调整产品名称列宽' });
  await handle.scrollIntoViewIfNeeded();
  const bounds = await handle.boundingBox(),
    reads = calls.length;
  await host.mouse.move(bounds.x + bounds.width / 2, bounds.y + 12);
  await host.mouse.down();
  await host.mouse.move(bounds.x + 103, bounds.y + 12);
  await host.mouse.up();
  await expect
    .poll(async () => (await header.boundingBox()).width)
    .toBeGreaterThan(before.width + 90);
  await handle.focus();
  await host.keyboard.press('ArrowLeft');
  await expect(handle).toHaveAttribute('aria-valuenow', String(Math.round(before.width + 90)));
  assert.equal(calls.length, reads, 'resizing must not read business data');
  const stockFilters = page.getByRole('group', {
    name: '库存情况',
    exact: true,
  });
  await stockFilters.getByRole('button', { name: '无库存', exact: true }).click();
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await expect(table.locator('tbody [data-column="material_code"]')).toHaveText('S14');
  await expect(footer.locator('[data-column="total_qty"]')).toHaveText('0');
  assert.equal(calls.at(-1).values.stock_presence, '无库存');
  await stockFilters.getByRole('button', { name: '有库存', exact: true }).click();
  await expect(table.locator('tbody tr')).toHaveCount(10);
  await expect(footer.locator('[data-column="total_qty"]')).toHaveText('91');
  await page.getByRole('button', { name: '下一页', exact: true }).click();
  await expect(table.locator('tbody tr')).toHaveCount(3);
  await expect(footer.locator('[data-column="total_qty"]')).toHaveText('91');
  await page.getByRole('button', { name: '筛选产品编码', exact: true }).click();
  await page.getByLabel('包含', { exact: true }).fill('S13');
  await page.getByRole('button', { name: '应用', exact: true }).click();
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await expect(footer.locator('[data-column="total_qty"]')).toHaveText('13');
  assert.equal(calls.at(-1).values.column_material_code_contains, '%S13%');
  assert.equal(calls.at(-1).values.offset, 0);
  assert.equal(calls.at(-1).values.stock_presence, '有库存');
  await page.getByRole('button', { name: '筛选产品编码', exact: true }).click();
  await page.getByRole('button', { name: '清除', exact: true }).click();
  await expect(table.locator('tbody tr')).toHaveCount(10);
  await page.getByRole('button', { name: '筛选SKU总库存量', exact: true }).scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: '筛选SKU总库存量', exact: true }).click();
  await page.getByLabel('最小值', { exact: true }).fill('11');
  await page.getByLabel('最大值', { exact: true }).fill('12');
  await page.getByRole('button', { name: '应用', exact: true }).click();
  await expect(table.locator('tbody tr')).toHaveCount(2);
  await expect(footer.locator('[data-column="total_qty"]')).toHaveText('23');
  assert.equal(calls.at(-1).values.column_total_qty_min, '11');
  assert.equal(calls.at(-1).values.column_total_qty_max, '12');
  await page.getByLabel('列设置', { exact: true }).click();
  await page.getByRole('checkbox', { name: '产品大类', exact: true }).uncheck();
  await expect(table.locator('th[data-field="product_categ_name"]')).toHaveCount(0);
  assert.equal(await footer.locator('td').count(), await table.locator('thead th').count());
  await page.getByLabel('列设置', { exact: true }).click();
  await table
    .locator('th[data-field="material_name"]')
    .dragTo(table.locator('th[data-field="material_code"]'));
  const headerOrder = await table
    .locator('thead th')
    .evaluateAll((headers) => headers.map((cell) => cell.dataset.column));
  const footerOrder = await footer
    .locator('td')
    .evaluateAll((cells) => cells.map((cell) => cell.dataset.column));
  assert.deepEqual(footerOrder, headerOrder);
  assert.ok(headerOrder.indexOf('material_name') < headerOrder.indexOf('material_code'));
  await table.locator('th[data-field="total_qty"]').dragTo(table.locator('thead th').first());
  await expect(footer.locator('td').first()).toHaveText('合计 · 23');
  await page.getByRole('button', { name: '筛选SKU总库存量', exact: true }).click();
  await page.getByLabel('最小值', { exact: true }).fill('99');
  await page.getByLabel('最大值', { exact: true }).fill('100');
  await page.getByRole('button', { name: '应用', exact: true }).click();
  await expect(table.locator('tbody tr')).toHaveCount(0);
  await expect(footer.locator('td').first()).toHaveText('合计 · 0');
  await expect(footer.locator('[data-column="missing_age_5"]')).toHaveText('-');
  await page.getByRole('button', { name: '清空筛选', exact: true }).click();
  await expect(table.locator('tbody tr')).toHaveCount(10);
  await expect(footer.locator('td').first()).toHaveText('合计 · 91');
  await expect(stockFilters.getByRole('button', { name: '全部库存', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  assert.equal(calls.at(-1).values.stock_presence, null);
  await host.screenshot({
    path: '/tmp/fc-aging-table-desktop.png',
    fullPage: true,
  });
  await host.setViewportSize({ width: 768, height: 900 });
  await host.screenshot({
    path: '/tmp/fc-aging-table-narrow.png',
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    true,
  );
  assert.deepEqual(errors, []);
});
