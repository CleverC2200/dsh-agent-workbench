import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
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
    else if (
      id === 'current-shortage.detail' ||
      id.includes('atomic') ||
      id.startsWith('branch-current-orders.')
    )
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
      if (id === 'replenishment.summary' && !values.warehouse_code)
        Object.assign(row, {
          recommended_qty: null,
          known_recommended_qty: 70,
          calculated_sku_count: 1,
          missing_calculation_count: 2,
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
  const replenishmentCard = page
    .locator('[data-overview-cards="fc"] article')
    .filter({ hasText: '待补货量' });
  await expect(replenishmentCard).toContainText('70');
  await expect(replenishmentCard).toContainText('已测算部分；2 项待核实');
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
      calls.some(
        (c) => c.id === 'branch-current-orders.page' && c.values.warehouse_code === 'A170',
      ),
    )
    .toBe(true);
  await page.getByRole('button', { name: '清空筛选', exact: true }).click();
  await expect(picker).toHaveValue('A170');
  const orderCalls = calls.filter((c) => c.id === 'branch-current-orders.page');
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
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  await expect(firstCard).toContainText('999');
  await expect(picker).toBeEnabled();
  assert.equal(
    calls.filter((c) => c.id === 'branch-warehouse.directory').length,
    initialDirectoryReads,
    'valid 20-minute directory must survive card refresh without another request',
  );
  assert.deepEqual(errors, []);
  await page.setViewportSize({ width: 520, height: 900 });
  await expect(picker).toBeVisible();
  await picker.selectOption('N417');
  await expect(firstCard).toContainText('123');
  await page.evaluate(() => {
    const now = Date.now();
    Date.now = () => now + 21 * 60 * 1000;
  });
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  await expect
    .poll(() => calls.filter((c) => c.id === 'branch-warehouse.directory').length)
    .toBe(initialDirectoryReads + 1);
  await expect(picker).toBeEnabled();
  await page.evaluate(() => window.dispatchEvent(new Event('gea-identity-changed')));
  await expect
    .poll(() => calls.filter((c) => c.id === 'branch-warehouse.directory').length)
    .toBe(initialDirectoryReads + 2);
  await expect(picker).toHaveValue('');
});

test('FC aging exposes immediate risk filters, leading risk column and cached page blocks', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const calls = [],
    errors = [];
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
    let rows;
    if (id.startsWith('source.')) rows = [{ day: '2026-10-28' }];
    else if (id === 'batch-age.atomic') {
      const total = values.risk ? 13 : 235;
      rows = Array.from({ length: Math.min(values.page_size, total - values.offset) }, (_, i) => ({
        ...Object.fromEntries(q.resultColumns.map((k) => [k, null])),
        material_code: `TEST-SKU-${values.offset + i}`,
        material_name: '货龄筛选测试商品',
        warning: values.risk || '正常',
        total_qty: 120,
        average_age: 20,
        page_scope_total: total,
        page_row_present: 1,
      }));
    } else if (id.includes('atomic') || id === 'current-shortage.detail')
      rows = [{ page_scope_total: 0, page_row_present: null }];
    else if (id.endsWith('.count') || id.endsWith('_count')) rows = [{ total: 0 }];
    else if (id === 'branch-warehouse.directory') rows = [];
    else rows = [{ ...Object.fromEntries(q.resultColumns.map((k) => [k, null])), row_count: 0 }];
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
  await page.getByRole('button', { name: '货龄结构', exact: true }).click();
  const list = page.getByRole('region', { name: '货龄结构', exact: true });
  const quick = list.getByRole('group', { name: '风险快捷查询' });
  await expect(quick.getByRole('button', { name: '全部', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(list.locator('th').first()).toHaveText('风险状态');
  await expect(list.locator('tbody tr')).toHaveCount(10);
  const pager = list.getByRole('navigation', { name: '货龄结构分页' });
  await pager.getByRole('button', { name: '下一页' }).click();
  await expect(list.locator('tbody tr').first()).toContainText('TEST-SKU-10');
  const agingReads = calls.filter((c) => c.id === 'batch-age.atomic');
  assert.equal(agingReads.length, 2);
  assert.deepEqual(
    agingReads[0].values,
    agingReads[1].values,
    'adjacent pages retain one Host cache key',
  );
  const freshAfter = await page.evaluate(() => window.queryFreshAfter());
  for (const risk of ['预警', '滞库', '正常']) {
    await quick.getByRole('button', { name: risk, exact: true }).click();
    await expect(quick.getByRole('button', { name: risk, exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(list.locator('tbody tr').first()).toContainText('TEST-SKU-0');
    await expect(list.locator('tbody tr').first().locator('td').first()).toHaveText(risk);
    await expect(pager).toContainText('共 13 条');
    assert.equal(calls.filter((c) => c.id === 'batch-age.atomic').at(-1).values.risk, risk);
  }
  await quick.getByRole('button', { name: '全部', exact: true }).click();
  await expect(pager).toContainText('共 235 条');
  assert.equal(calls.filter((c) => c.id === 'batch-age.atomic').at(-1).values.risk, null);
  assert.equal(await page.evaluate(() => window.queryFreshAfter()), freshAfter);
  if (process.env.FC_AGING_EVIDENCE) {
    await mkdir(process.env.FC_AGING_EVIDENCE, { recursive: true });
    await page.screenshot({
      path: process.env.FC_AGING_EVIDENCE + '/aging-desktop.png',
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 520, height: 900 });
  for (const label of ['预警', '滞库', '正常', '全部'])
    await expect(quick.getByRole('button', { name: label, exact: true })).toBeVisible();
  if (process.env.FC_AGING_EVIDENCE)
    await page.screenshot({
      path: process.env.FC_AGING_EVIDENCE + '/aging-narrow.png',
      fullPage: true,
    });
  assert.deepEqual(errors, []);
});

test('FC shows system plans before import and downloads every authorized row through bounded template pages', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const calls = [],
    errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('http://127.0.0.1:19486/**', async (route) => {
    if (route.request().method() !== 'POST')
      return route.fulfill({
        contentType: 'text/html',
        body: `<style>${css}</style><main id="app"></main><script id="agent-sql-direct" type="application/json">{"path":"/api/agents/inventory-fc/query","token":"fixture-only"}</script><script>${js}</script>`,
      });
    const { queryId: id, parameters: values } = route.request().postDataJSON();
    calls.push({ id, values });
    const query = config.queries[id];
    let rows;
    if (id.startsWith('source.')) rows = [{ day: '2026-10-28' }];
    else if (id === 'transfer_plan.detail.atomic' || id === 'transfer_plan.template.atomic') {
      const count = Math.max(0, Math.min(values.page_size, 121 - values.offset));
      rows = Array.from({ length: count }, (_, index) => ({
        ...Object.fromEntries(query.resultColumns.map((key) => [key, null])),
        warehouse_code: '001',
        warehouse_name: '模板测试分仓',
        sku: `SKU-${values.offset + index}`,
        material_name: '系统计划商品',
        stat_month: '202610',
        month_out_plan: 310,
        period_current_out: 310,
        period_next_out: 600,
        period_current_source: '分仓同步表',
        period_next_source: '分仓同步表',
        period_plan_status: '出货计划已同步；月调拨计划待接入',
        page_scope_total: 121,
        page_row_present: 1,
      }));
    } else if (id.includes('atomic') || id === 'current-shortage.detail')
      rows = [{ page_scope_total: 0, page_row_present: null }];
    else if (id.endsWith('.count') || id.endsWith('_count')) rows = [{ total: 0 }];
    else if (id === 'branch-warehouse.directory') rows = [];
    else
      rows = [
        { ...Object.fromEntries(query.resultColumns.map((key) => [key, null])), row_count: 0 },
      ];
    return route.fulfill({
      json: {
        rows,
        configVersion: 'fixture',
        returnedColumns: query.resultColumns,
        rejectedColumns: [],
      },
    });
  });
  await page.goto('http://127.0.0.1:19486/');
  await page.getByRole('button', { name: '分仓计划', exact: true }).click();
  const list = page.getByRole('region', { name: '分仓计划', exact: true });
  await expect(list.locator('tbody tr')).toHaveCount(10);
  await expect(list.locator('tbody tr').first()).toContainText('SKU-0');
  await expect(list.locator('tbody tr').first()).toContainText('310');
  await expect(list.locator('tbody tr').first()).toContainText('分仓同步表');
  await list.getByRole('button', { name: '下载模板', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '下载分仓计划模板', exact: true });
  await dialog.getByRole('combobox', { name: '模板计划月份', exact: true }).selectOption('2026-11');
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: '下载模板', exact: true }).click();
  const file = await download;
  assert.equal(file.suggestedFilename(), '分仓计划-2026-11.xlsx');
  const { unzipWorkbook } =
    await import('../business/inventory-fc/source/inventory-light-plugins/src/dsh-ui/workbook.ts');
  const content = await unzipWorkbook(new Uint8Array(await readFile(await file.path())).buffer);
  const sheet = new TextDecoder().decode(content.get('xl/worksheets/sheet1.xml'));
  assert.equal((sheet.match(/<row /g) || []).length, 122);
  assert.match(sheet, />001</);
  assert.match(sheet, /SKU-120/);
  assert.match(sheet, />600</, 'November uses the next-month system plan');
  const reads = calls.filter(
    (call) => call.id === 'transfer_plan.template.atomic' && call.values.page_size === 200,
  );
  assert.deepEqual(
    reads.map((call) => call.values.offset).sort((a, b) => a - b),
    [0],
  );
  assert.deepEqual(errors, []);
});

test('FC current orders shows customer orders, expands exact order SKUs and preserves branch scope', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const calls = [],
    errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('http://127.0.0.1:19486/**', async (route) => {
    if (route.request().method() !== 'POST')
      return route.fulfill({
        contentType: 'text/html',
        body: `<style>${css}</style><main id="app"></main><script id="agent-sql-direct" type="application/json">{"path":"/api/agents/inventory-fc/query","token":"fixture-only"}</script><script>${js}</script>`,
      });
    const { queryId: id, parameters: values } = route.request().postDataJSON();
    calls.push({ id, values });
    const query = config.queries[id];
    let rows;
    if (id === 'branch-warehouse.directory')
      rows = [{ warehouse_code: 'A020', warehouse_name: '长沙分仓', base: '遂平' }];
    else if (id === 'branch-current-orders.page')
      rows = [
        {
          ...Object.fromEntries(query.resultColumns.map((key) => [key, null])),
          warehouse_code: 'A020',
          warehouse_name: '长沙分仓',
          order_no: 'CE2600000190',
          customer_code: 'C1',
          customer_name: '长沙直营',
          requested_at: '2026-10-29',
          created_at: '2026-10-26 13:30',
          ordered: 1180,
          demand: 1180,
          allocated: 1180,
          shipped: 300,
          remaining: 0,
          satisfaction: 1,
          sku_count: 2,
          order_status: '备单完成',
          page_row_present: 1,
          page_scope_total: 1,
        },
      ];
    else if (id === 'branch-current-orders.lines')
      rows = ['10006223', '10006224'].map((sku) => ({
        ...Object.fromEntries(query.resultColumns.map((key) => [key, null])),
        warehouse_code: 'A020',
        order_no: 'CE2600000190',
        customer_code: 'C1',
        sku,
        material_name: '订单商品',
        ordered: 590,
        demand: 590,
        allocated: 590,
        shipped: 150,
        remaining: 0,
        order_status: '备单完成',
        page_row_present: 1,
        page_scope_total: 2,
      }));
    else if (id.startsWith('source.')) rows = [{ day: '2026-10-28' }];
    else if (id.includes('atomic') || id === 'current-shortage.detail')
      rows = [{ page_scope_total: 0, page_row_present: null }];
    else if (id.endsWith('.count') || id.endsWith('_count')) rows = [{ total: 0 }];
    else
      rows = [
        { ...Object.fromEntries(query.resultColumns.map((key) => [key, null])), row_count: 0 },
      ];
    return route.fulfill({
      json: {
        rows,
        configVersion: 'fixture',
        returnedColumns: query.resultColumns,
        rejectedColumns: [],
      },
    });
  });
  await page.goto('http://127.0.0.1:19486/');
  const picker = page.getByRole('combobox', { name: '选择分仓' });
  await expect(picker).toBeEnabled();
  await picker.selectOption('A020');
  await page.getByRole('button', { name: '当前订单', exact: true }).click();
  const list = page.getByRole('region', { name: '当前订单', exact: true });
  await expect(list.getByText('长沙直营', { exact: true })).toBeVisible();
  await expect(list.getByText('100.0%', { exact: true })).toBeVisible();
  await expect(list.locator('thead').first()).toContainText('订单号');
  await expect(list.locator('thead').first()).not.toContainText('可用库存');
  await list.getByRole('button', { name: '展开订单CE2600000190', exact: true }).click();
  const detail = list.getByRole('region', { name: 'CE2600000190订单明细' });
  await expect(detail.locator('tbody tr')).toHaveCount(2);
  await expect(detail).toContainText('10006224');
  const detailCall = calls.find((call) => call.id === 'branch-current-orders.lines');
  assert.equal(detailCall.values.warehouse_code, 'A020');
  assert.equal(detailCall.values.order_no, 'CE2600000190');
  assert.equal(detailCall.values.customer_code, 'C1');
  assert.ok(!calls.some((call) => call.id === 'current-shortage.detail'));
  await list.getByRole('textbox', { name: '订单号或客户名称', exact: true }).fill('CE2600000190');
  await list.getByRole('button', { name: '查询', exact: true }).click();
  await expect
    .poll(
      () =>
        calls.filter((call) => call.id === 'branch-current-orders.page').at(-1)?.values
          .search_pattern,
    )
    .toBe('%CE2600000190%');
  await list.getByRole('button', { name: '清空筛选', exact: true }).click();
  await expect(picker).toHaveValue('A020');
  assert.ok(
    calls
      .filter((call) => call.id.startsWith('branch-current-orders.'))
      .every((call) => call.values.warehouse_code === 'A020'),
  );
  assert.deepEqual(errors, []);
});
