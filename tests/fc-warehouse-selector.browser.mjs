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
  let releaseConfirmation;
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
    if (id === 'replenishment.detail.atomic' && values.page_size === 200)
      await new Promise((resolve) => {
        releaseConfirmation = resolve;
      });
    const q = config.queries[id];
    assert.ok(q, id);
    let rows;
    if (id === 'branch-warehouse.directory')
      rows = [
        { warehouse_code: 'A170', warehouse_name: '成都分仓', base: '西南' },
        { warehouse_code: 'N417', warehouse_name: '郑州配送中心', base: '郑州' },
      ];
    else if (id === 'warehouse-outbound.summary')
      rows = [
        {
          ...Object.fromEntries(q.resultColumns.map((k) => [k, null])),
          row_count: 1923,
          outgoing_qty: 44689,
          known_outgoing_qty: 44689,
          missing_quantity_count: 0,
        },
      ];
    else if (id === 'branch_shipments.summary')
      rows = [
        {
          ...Object.fromEntries(q.resultColumns.map((k) => [k, null])),
          row_count: 79,
          month_ship_positive: 38116,
        },
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
      rows = [
        {
          ...Object.fromEntries(q.resultColumns.map((k) => [k, null])),
          page_scope_total: 0,
          page_row_present: null,
        },
      ];
    else if (id.endsWith('.detail') || id.includes('batch-age.groups')) rows = [];
    else {
      const row = Object.fromEntries(q.resultColumns.map((k) => [k, 0]));
      Object.assign(row, {
        row_count: 1,
        total_qty: values.warehouse_code ? 123 : 210750.2,
        known_in_transit: 1103569,
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
      for (const key of ['age_weight_qty', 'weighted_age_sum'])
        if (!q.resultColumns.includes(key)) delete row[key];
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
  const picker = page.getByRole('button', { name: '选择分仓' });
  await expect(picker).toBeEnabled();
  await picker.click();
  await expect(page.getByRole('listbox', { name: '选择分仓' }).getByRole('option')).toHaveCount(3);
  await picker.click();
  const firstCard = page.locator('[data-overview-cards="fc"] article').first();
  await expect(firstCard.locator('.kpi-value')).toHaveText('21.08万件');
  await expect(page.getByRole('region', { name: '分仓业务保存' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '保存人工计划', exact: true })).toHaveCount(0);
  const replenishmentCard = page
    .locator('[data-overview-cards="fc"] article')
    .filter({ hasText: '待补货量' });
  await expect(replenishmentCard).toContainText('70');
  await expect(replenishmentCard).toContainText('110.36万件');
  await expect(replenishmentCard).toContainText('已测算部分；2 项待核实');
  const toolbar = page.locator('form[data-business-filters="fc"]');
  for (const width of [1280, 900, 640]) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await toolbar.evaluate((form) => {
      const controls = [...form.children].map((node) => node.getBoundingClientRect());
      const bounds = form.getBoundingClientRect();
      return {
        sameLine: controls.every((rect) => Math.abs(rect.top - controls[0].top) < 2),
        contained: controls.every((rect) => rect.left >= bounds.left && rect.right <= bounds.right),
      };
    });
    assert.equal(layout.contained, true, `toolbar controls fit at ${width}px`);
    if (width >= 900)
      assert.equal(layout.sameLine, true, `toolbar stays on one line at ${width}px`);
  }
  await page.setViewportSize({ width: 900, height: 900 });
  await mkdir('.scratch', { recursive: true });
  await toolbar.screenshot({ path: '.scratch/fc-toolbar-inline.png' });
  await page.setViewportSize({ width: 1280, height: 900 });
  const warehouseSearch = toolbar.getByRole('textbox', { name: '分仓', exact: true });
  await expect(warehouseSearch).toHaveAttribute('placeholder', '请输入分仓名称或编码');
  for (const term of ['长沙', 'a02']) {
    await warehouseSearch.fill(term);
    await toolbar.getByRole('button', { name: '查询', exact: true }).click();
    await expect
      .poll(() =>
        calls.some(
          (call) =>
            call.id === 'replenishment.detail.atomic' &&
            call.values.warehouse_search_pattern === '%' + term + '%' &&
            call.values.warehouse_code_mode === 'all',
        ),
      )
      .toBe(true);
  }
  await toolbar.getByRole('button', { name: '清空筛选', exact: true }).click();
  const initialDirectoryReads = calls.filter((c) => c.id === 'branch-warehouse.directory').length;
  const freshAfter = await page.evaluate(() => window.queryFreshAfter());
  await picker.click();
  await page.locator('[role=option][data-value="A170"]').click();
  await expect(firstCard).toContainText('123');
  const ageCard = page
    .locator('[data-overview-cards="fc"] article')
    .filter({ hasText: '平均货龄' });
  await expect(ageCard.locator('.kpi-value')).toContainText('20');
  assert.ok(calls.some((c) => c.id === 'health.cards' && c.values.warehouse_code === 'A170'));
  assert.ok(!calls.some((c) => c.id === 'health.summary'));
  await expect(page.locator('[data-overview-cards="fc"] article').last()).toContainText('23');
  await expect
    .poll(() =>
      calls.some((c) => c.id === 'branch-supply.summary' && c.values.warehouse_code === 'A170'),
    )
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
  await expect(picker).toContainText('A170');
  const orderCalls = calls.filter((c) => c.id === 'branch-current-orders.page');
  assert.ok(orderCalls.every((c) => c.values.warehouse_code === 'A170'));
  await page.getByRole('button', { name: '运营观察', exact: true }).click();
  const outboundCard = page.locator('.resource-card').filter({ hasText: '本月出库' });
  await expect(outboundCard).toContainText('4.47万件');
  assert.ok(
    calls.some((c) => c.id === 'warehouse-outbound.summary' && c.values.warehouse_code === 'A170'),
  );
  await page.getByRole('button', { name: '分仓计划', exact: true }).click();
  await expect
    .poll(() =>
      calls.some((c) => c.id === 'branch-plan.detail.atomic' && c.values.warehouse_code === 'A170'),
    )
    .toBe(true);
  await mkdir('.scratch', { recursive: true });
  await page.screenshot({ path: '.scratch/fc-warehouse-selector.png' });
  await picker.click();
  await page.locator('[role=option][data-value=""]').click();
  await expect(firstCard.locator('.kpi-value')).toHaveText('21.08万件');
  assert.equal(
    calls.filter((c) => c.id === 'branch-warehouse.directory').length,
    initialDirectoryReads,
  );
  assert.equal(await page.evaluate(() => window.queryFreshAfter()), freshAfter);
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  await expect(firstCard.locator('.kpi-value')).toHaveText('21.08万件');
  await expect(picker).toBeEnabled();
  assert.equal(
    calls.filter((c) => c.id === 'branch-warehouse.directory').length,
    initialDirectoryReads,
    'valid 20-minute directory must survive card refresh without another request',
  );
  assert.deepEqual(errors, []);
  await page.setViewportSize({ width: 520, height: 900 });
  await expect(picker).toBeVisible();
  await picker.click();
  await page.locator('[role=option][data-value="N417"]').click();
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
  await expect(picker).toContainText('全部分仓');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('button', { name: '补货确认', exact: true }).click();
  await page.getByRole('button', { name: '提交', exact: true }).click();
  const confirmation = page.getByRole('dialog');
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toContainText('请先选择本次补货的分仓');
  assert.equal(
    releaseConfirmation,
    undefined,
    'opening all-warehouse confirmation must not scan every warehouse',
  );
  await confirmation.getByLabel('导出补货分仓').selectOption('N417');
  await expect(confirmation).toContainText('正在读取补货清单，请稍候');
  await expect(confirmation.getByRole('button', { name: '确认暂存至DMS' })).toHaveCount(0);
  await expect.poll(() => typeof releaseConfirmation).toBe('function');
  assert.equal(
    calls.findLast((c) => c.id === 'replenishment.detail.atomic' && c.values.page_size === 200)
      .values.warehouse_code,
    'N417',
  );
  assert.equal(
    calls.filter((c) => c.id === 'branch-warehouse.directory').length,
    initialDirectoryReads + 2,
    'confirmation reuses the authorized directory',
  );
  await confirmation.screenshot({ path: '.scratch/fc-confirmation-loading.png' });
  releaseConfirmation();
  await expect(confirmation).not.toContainText('正在读取补货清单');
  await expect(confirmation.getByRole('button', { name: '确认暂存至DMS' })).toBeDisabled();
  await expect(confirmation).toContainText('0个SKU');
  await confirmation.getByRole('button', { name: '取消', exact: true }).click();
  await expect(confirmation).toHaveCount(0);
  await page.getByRole('button', { name: '分仓计划', exact: true }).click();
  const planPanel = page.getByRole('region', { name: '分仓计划', exact: true });
  await planPanel.getByRole('textbox', { name: 'SKU／产品名称', exact: true }).fill('SHARED-SKU');
  await planPanel.getByRole('button', { name: '查询', exact: true }).click();
  await page.getByRole('button', { name: '货龄结构', exact: true }).click();
  const agePanel = page.getByRole('region', { name: '货龄结构', exact: true });
  await expect(agePanel.getByRole('textbox', { name: 'SKU／产品名称', exact: true })).toHaveValue(
    'SHARED-SKU',
  );
  await agePanel.getByRole('button', { name: '清空筛选', exact: true }).click();
  await page.getByRole('button', { name: '当前订单', exact: true }).click();
  const orderPanel = page.getByRole('region', { name: '当前订单', exact: true });
  await expect(
    orderPanel.getByRole('textbox', { name: '调拨单号或供货基地', exact: true }),
  ).toHaveValue('');
  await orderPanel
    .getByRole('textbox', { name: '调拨单号或供货基地', exact: true })
    .fill('CE-SHARED');
  await page.getByRole('button', { name: '补货确认', exact: true }).click();
  const replenishmentPanel = page.getByRole('region', { name: '补货确认', exact: true });
  await expect(
    replenishmentPanel.getByRole('textbox', { name: 'SKU／产品名称', exact: true }),
  ).toHaveValue('CE-SHARED');
  await replenishmentPanel.getByRole('button', { name: '清空筛选', exact: true }).click();
  await replenishmentPanel.getByLabel('列设置', { exact: true }).click();
  await replenishmentPanel.getByRole('checkbox', { name: '现库存', exact: true }).uncheck();
  await replenishmentPanel.getByRole('checkbox', { name: '冻结产品名称', exact: true }).check();
  await page.getByRole('button', { name: '货龄结构', exact: true }).click();
  await page.getByRole('button', { name: '补货确认', exact: true }).click();
  await expect(replenishmentPanel.getByRole('columnheader', { name: /^现库存/ })).toHaveCount(0);
  await replenishmentPanel.getByLabel('列设置', { exact: true }).click();
  await expect(
    replenishmentPanel.getByRole('checkbox', { name: '冻结产品名称', exact: true }),
  ).toBeChecked();
  await replenishmentPanel.getByRole('button', { name: '恢复默认顺序', exact: true }).click();

  await page.getByRole('button', { name: '运营观察', exact: true }).click();
  await expect(page.locator('[aria-label="分仓运营考核"] .resource-card')).toHaveCount(6);
  const operationsDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'CSV', exact: true }).click();
  const csv = await readFile(await (await operationsDownload).path(), 'utf8');
  assert.match(csv, /"级别","标题","详情","建议动作"/);
  assert.match(csv, /按有效周期与计划联动补货/);
  assert.match(csv, /仓库流量事实/);
  assert.deepEqual(errors, []);
});

test('FC aging exposes immediate risk filters, leading risk column and ten-row server pages', async (t) => {
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
        warehouseid: 'N436',
        stat_date: '2026-10-28',
        material_name: '货龄筛选测试商品',
        warning: values.risk || '正常',
        total_qty: 120,
        average_age: 20,
        page_scope_total: total,
        page_row_present: 1,
      }));
    } else if (id === 'branch-batches.page')
      rows = Array.from({ length: Math.min(10, 12 - values.offset) }, (_, i) => ({
        warehouse_code: values.warehouse_code,
        sku: values.sku,
        production_date: '20261001',
        quantity: i + 1,
        available_qty: i,
        page_row_present: 1,
        page_scope_total: 12,
      }));
    else if (id.includes('atomic') || id === 'current-shortage.detail')
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
  await list.getByRole('button', { name: 'TEST-SKU-0', exact: true }).click();
  const batches = list.getByRole('region', { name: 'TEST-SKU-0库存批次' });
  await expect(batches).toContainText('2026-10-01');
  await expect(batches.locator('tbody tr')).toHaveCount(10);
  await batches.getByRole('button', { name: '下一页', exact: true }).click();
  await expect(batches.locator('tbody tr')).toHaveCount(2);
  assert.deepEqual(
    calls
      .filter((c) => c.id === 'branch-batches.page')
      .map((c) => [c.values.warehouse_code, c.values.sku, c.values.page_size, c.values.offset]),
    [
      ['N436', 'TEST-SKU-0', 10, 0],
      ['N436', 'TEST-SKU-0', 10, 10],
    ],
  );
  await list.getByRole('button', { name: 'TEST-SKU-0', exact: true }).click();
  const pager = list.getByRole('navigation', { name: '货龄结构分页' });
  await pager.getByRole('button', { name: '下一页' }).click();
  await expect(list.locator('tbody tr').first()).toContainText('TEST-SKU-10');
  const agingReads = calls.filter((c) => c.id === 'batch-age.atomic');
  assert.equal(agingReads.length, 2);
  assert.deepEqual(
    agingReads.map((call) => [call.values.page_size, call.values.offset]),
    [
      [10, 0],
      [10, 10],
    ],
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
    else if (id === 'branch-plan.detail.atomic' || id === 'transfer_plan.template.atomic') {
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
  await expect(list.locator('table').first().locator('tbody tr')).toHaveCount(10);
  await expect(list.locator('table').first().locator('tbody tr').first()).toContainText('SKU-0');
  await expect(list.locator('table').first().locator('tbody tr').first()).toContainText('310');
  await expect(list.locator('table').first().locator('tbody tr').first()).toContainText(
    '分仓同步表',
  );
  await list.getByRole('button', { name: '下载模板', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '下载分仓计划模板', exact: true });
  await dialog.getByRole('button', { name: '模板计划月份', exact: true }).click();
  await dialog.getByRole('option', { name: '2026年11月' }).click();
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

test('FC upstream transfer orders show supply bases, exact SKUs and preserve receiving branch scope', async (t) => {
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
          customer_name: '遂平',
          requested_at: '2026-10-29',
          created_at: '2026-10-26 13:30',
          ordered: 1180,
          demand: 1180,
          allocated: 1180,
          shipped: 300,
          remaining: 0,
          shortage: 0,
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
        shortage: 0,
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
  const picker = page.getByRole('button', { name: '选择分仓' });
  await expect(picker).toBeEnabled();
  await picker.click();
  await page.locator('[role=option][data-value="A020"]').click();
  await page.getByRole('button', { name: '当前订单', exact: true }).click();
  const list = page.getByRole('region', { name: '当前订单', exact: true });
  await expect(list.getByText('遂平', { exact: true })).toBeVisible();
  await expect(list.locator('thead').first().locator('th')).toHaveText([
    '订单号',
    '供货基地',
    '订单日期',
    'SKU个数',
    '需求量（件）',
    '基地已占用（件）',
    '剩余需求量（件）',
    '缺货量（件）',
    '状态',
  ]);
  await expect(list.getByText('正常', { exact: true })).toBeVisible();
  await list.getByRole('combobox', { name: '订单状态' }).selectOption('缺口');
  await expect
    .poll(
      () =>
        calls.filter((call) => call.id === 'branch-current-orders.page').at(-1)?.values
          .shortage_only,
    )
    .toBe(true);
  await page.getByRole('button', { name: '货龄结构', exact: true }).click();
  await page.getByRole('button', { name: '当前订单', exact: true }).click();
  await expect(list.getByRole('combobox', { name: '订单状态' })).toHaveValue('缺口');
  await list.getByRole('combobox', { name: '订单状态' }).selectOption('全部');
  await expect
    .poll(
      () =>
        calls.filter((call) => call.id === 'branch-current-orders.page').at(-1)?.values
          .shortage_only,
    )
    .toBe(false);
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
  await list.getByRole('textbox', { name: '调拨单号或供货基地', exact: true }).fill('CE2600000190');
  await list.getByRole('button', { name: '查询', exact: true }).click();
  await expect
    .poll(
      () =>
        calls.filter((call) => call.id === 'branch-current-orders.page').at(-1)?.values
          .search_pattern,
    )
    .toBe('%CE2600000190%');
  await list.getByRole('button', { name: '清空筛选', exact: true }).click();
  await expect(picker).toContainText('A020');
  assert.ok(
    calls
      .filter((call) => call.id.startsWith('branch-current-orders.'))
      .every((call) => call.values.warehouse_code === 'A020'),
  );
  assert.deepEqual(errors, []);
});

test('DSH replenishment filters, server sorting and reload recover an unavailable list without signing out', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const requests = [];
  let failFirst = true,
    failPersistent = false;
  await page.route('http://127.0.0.1:19487/**', async (route) => {
    if (route.request().method() !== 'POST')
      return route.fulfill({
        contentType: 'text/html',
        body: `<style>${css}</style><main id="app"></main><script id="agent-sql-direct" type="application/json">{"path":"/api/agents/inventory-fc/query","token":"fixture-only"}</script><script>${js}</script>`,
      });
    const { queryId: id, parameters: values } = route.request().postDataJSON();
    requests.push({ id, values });
    const q = config.queries[id];
    let rows = [];
    if (id === 'branch-transfers.page')
      return route.fulfill({
        status: 403,
        json: { code: 'RESOURCE_NOT_IN_DATASET', message: '调拨资源未加入当前数据集' },
      });
    if (id === 'branch-warehouse.directory')
      rows = [{ warehouse_code: 'N436', warehouse_name: '郑州DC仓', base: '郑州' }];
    else if (id.startsWith('source.')) rows = [{ day: '2026-10-29' }];
    else if (id === 'replenishment.detail.atomic') {
      if (failPersistent)
        return route.fulfill({
          status: 503,
          json: { code: 'GEA_SQL_QUERY_FAILED', message: '本次读取未完成' },
        });
      if (failFirst) {
        failFirst = false;
        rows = [
          {
            ...Object.fromEntries(q.resultColumns.map((k) => [k, null])),
            page_scope_total: 1,
            page_row_present: null,
          },
        ];
      } else
        rows = [
          {
            ...Object.fromEntries(q.resultColumns.map((k) => [k, null])),
            warehouse_code: 'N436',
            sku: '10000034',
            material_name: '测试汤圆',
            inventory_qty: 5,
            available_qty: 2,
            recommended_qty: 10,
            target_inventory_qty: 12.4,
            rolling_ship_daily: 7.11,
            historical_turnover_days: 2.09,
            page_scope_has_material_group: 0,
            open_transfer_reported_qty: 45,
            page_scope_total: 1,
            page_row_present: 1,
          },
        ];
    } else if (q.resultColumns.includes('page_scope_total'))
      rows = [
        {
          ...Object.fromEntries(q.resultColumns.map((k) => [k, null])),
          page_scope_total: 0,
          page_row_present: null,
        },
      ];
    else rows = [Object.fromEntries(q.resultColumns.map((k) => [k, k === 'row_count' ? 1 : 0]))];
    return route.fulfill({
      json: {
        rows,
        configVersion: 'fixture',
        returnedColumns: q.resultColumns,
        rejectedColumns: [],
      },
    });
  });
  await page.goto('http://127.0.0.1:19487/');
  await expect(page.getByRole('button', { name: '10000034', exact: true })).toBeVisible();
  const actual = page.getByRole('spinbutton', { name: '10000034实际补货量', exact: true });
  await expect(actual).toBeEnabled();
  await actual.fill('');
  await expect(actual).toHaveValue('');
  await actual.fill('12');
  await actual.press('Tab');
  await expect(actual).toHaveValue('12');
  await page.getByRole('button', { name: '45', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
    '调拨资源未加入当前数据集',
  );
  assert.equal(
    requests.filter((r) => r.id === 'branch-transfers.page').length,
    1,
    'authorization refusal is not retried',
  );
  await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click();
  await expect(actual).toHaveValue('12');
  await expect(page.locator('table.replenishment-table th').first()).toContainText('产品编码');
  await expect(page.locator('table.replenishment-table th').last()).toContainText('实际补货量');
  assert.equal(await actual.evaluate((el) => getComputedStyle(el.closest('td')).right), '0px');
  await expect(
    page.locator('table.replenishment-table th').filter({ hasText: '物料组' }),
  ).toHaveCount(0);
  for (const [field, value] of [
    ['target_inventory_qty', '13'],
    ['rolling_ship_daily', '8'],
    ['historical_turnover_days', '2.1'],
  ]) {
    const index = await page
      .locator('table.replenishment-table th')
      .evaluateAll((headers, field) => headers.findIndex((h) => h.dataset.field === field), field);
    await expect(
      page.locator('table.replenishment-table tbody tr').first().locator('td').nth(index),
    ).toHaveText(value);
  }
  const recoveryReads = requests.filter((r) => r.id === 'replenishment.detail.atomic');
  assert.equal(
    recoveryReads.filter((r) => r.values.positive_actual_keys.every((key) => !key)).length,
    2,
    'one clean cohort restart after invalid cached page',
  );
  assert.ok(
    recoveryReads.at(-1).values.positive_actual_keys.includes('4:N43610000034'),
    'editing a positive draft updates the complete-scope filter once',
  );
  await expect(page.getByRole('button', { name: '有业务', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: '低于建议', exact: true }).click();
  await expect
    .poll(
      () => requests.filter((r) => r.id === 'replenishment.detail.atomic').at(-1)?.values.list_mode,
    )
    .toBe('recommended');
  await page.getByRole('button', { name: /现库存 ↕/ }).click();
  await expect
    .poll(
      () =>
        requests.filter((r) => r.id === 'replenishment.detail.atomic').at(-1)?.values.sort_field,
    )
    .toBe('inventory_qty');
  await page.locator('summary[aria-label="列设置"]').click();
  await expect(page.getByRole('checkbox', { name: '冻结现库存', exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: '冻结现库存', exact: true }).check();
  await page.locator('summary[aria-label="列设置"]').click();
  failPersistent = true;
  await page.getByRole('button', { name: '紧急 SKU', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: '该列表读取失败' })).toBeVisible();
  failPersistent = false;
  await page.getByRole('button', { name: '重新加载数据', exact: true }).click();
  await expect(page.getByRole('button', { name: '10000034', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '选择分仓', exact: true }).click();
  await page.locator('[role=option][data-value="N436"]').click();
  await expect(
    page.getByRole('spinbutton', { name: '10000034实际补货量', exact: true }),
  ).toBeEnabled();
  await page.getByRole('button', { name: '提交', exact: true }).click();
  const confirmation = page.getByRole('dialog');
  const confirmationQty = confirmation.getByRole('spinbutton', {
    name: '10000034实际补货量',
    exact: true,
  });
  await expect(confirmationQty).toBeEnabled();
  await confirmationQty.fill('');
  await expect(confirmationQty).toHaveValue('');
  await confirmationQty.fill('25');
  await confirmationQty.press('Tab');
  await expect(confirmationQty).toHaveValue('25');
  await confirmation.getByRole('button', { name: '取消', exact: true }).click();
  await expect(
    page.getByRole('spinbutton', { name: '10000034实际补货量', exact: true }),
  ).toHaveValue('25');
  await mkdir('.scratch', {
    recursive: true,
  });
  await page.screenshot({
    path: '.scratch/fc-list-local.png',
  });
});

test('replenishment quick filters use server scope, product links expand inline and frozen columns stay visible', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const calls = [],
    errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('http://127.0.0.1:19488/**', async (route) => {
    if (route.request().method() !== 'POST')
      return route.fulfill({
        contentType: 'text/html',
        body: `<style>${css}</style><div id="app"></div><script id="agent-sql-direct" type="application/json">{"path":"/api/agents/inventory-fc/query","token":"fixture-only"}</script><script>${js}</script>`,
      });
    const { queryId: id, parameters: values } = route.request().postDataJSON();
    calls.push({ id, values });
    const q = config.queries[id];
    assert.ok(q, id);
    let rows = [];
    if (id === 'branch-warehouse.directory')
      rows = [{ warehouse_code: 'W1', warehouse_name: '测试分仓', base: '华东' }];
    else if (id.startsWith('source.')) rows = [{ day: '2026-10-30' }];
    else if (id === 'replenishment.detail.atomic') {
      const all = [
        {
          warehouse_code: 'W1',
          sku: 'SKU1',
          material_name: '产品一',
          inventory_qty: 3,
          recommended_qty: 3,
        },
        {
          warehouse_code: 'W1',
          sku: 'SKU2',
          material_name: '产品二',
          inventory_qty: 2,
          recommended_qty: 0,
        },
      ];
      const matched = all.filter(
        (row) =>
          !values.needed_only ||
          row.recommended_qty > 0 ||
          values.positive_actual_keys?.includes('2:W1' + row.sku),
      );
      rows = matched.map((row) => ({
        ...Object.fromEntries(q.resultColumns.map((key) => [key, null])),
        ...row,
        page_scope_total: matched.length,
        page_row_present: 1,
      }));
    } else if (id === 'base_resources.detail.atomic')
      rows = [
        {
          ...Object.fromEntries(q.resultColumns.map((key) => [key, null])),
          base: '华东',
          row_count: 1,
          known_available: 100,
          known_available_count: 1,
          page_scope_total: 1,
          page_row_present: 1,
        },
      ];
    else if (id.includes('atomic') || id === 'current-shortage.detail')
      rows = [
        {
          ...Object.fromEntries(q.resultColumns.map((key) => [key, null])),
          page_scope_total: 0,
          page_row_present: null,
        },
      ];
    else if (id.endsWith('.count') || id.endsWith('_count')) rows = [{ total: 0 }];
    else if (id.endsWith('.summary') || id.endsWith('.cards') || id === 'health.inventory')
      rows = [Object.fromEntries(q.resultColumns.map((key) => [key, 0]))];
    await route.fulfill({
      json: {
        rows,
        configVersion: 'fixture',
        returnedColumns: q.resultColumns,
        rejectedColumns: [],
      },
    });
  });
  await page.goto('http://127.0.0.1:19488/');
  const needed = page.getByRole('checkbox', { name: '需补货', exact: true });
  await expect(needed).toBeChecked();
  await expect(page.getByRole('button', { name: 'SKU1', exact: true })).toBeVisible();
  assert.equal(
    calls.filter((c) => c.id === 'replenishment.detail.atomic').at(-1).values.needed_only,
    true,
  );
  await needed.uncheck();
  await expect(page.getByRole('button', { name: 'SKU2', exact: true })).toBeVisible();
  await page.getByRole('spinbutton', { name: 'SKU2实际补货量' }).fill('5');
  await needed.check();
  await expect(page.getByRole('button', { name: 'SKU2', exact: true })).toBeVisible();
  assert.ok(
    calls
      .filter((c) => c.id === 'replenishment.detail.atomic')
      .at(-1)
      .values.positive_actual_keys.includes('2:W1SKU2'),
  );
  await page.getByRole('checkbox', { name: '有业务', exact: true }).check();
  await expect
    .poll(
      () => calls.filter((c) => c.id === 'replenishment.detail.atomic').at(-1).values.business_only,
    )
    .toBe(true);
  await page.getByRole('button', { name: 'SKU1', exact: true }).click();
  const resources = page.getByRole('region', { name: 'SKU1基地资源', exact: true });
  await expect(resources).toContainText('华东');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  assert.equal(calls.find((c) => c.id === 'base_resources.detail.atomic').values.sku, 'SKU1');
  const scroll = page
    .locator('.table-scroll')
    .filter({ has: page.locator(':scope > .replenishment-table') })
    .first();
  const box = await resources.boundingBox();
  await scroll.evaluate((node) => {
    node.scrollLeft = 800;
  });
  const after = await resources.boundingBox();
  assert.ok(Math.abs(after.x - box.x) < 3, 'inline resource panel keeps its position');
  const outer = await scroll.boundingBox();
  for (const field of ['sku', 'material_name', 'missing_actualQty']) {
    const cell = scroll.locator(`.replenishment-table > thead > tr > [data-column=${field}]`);
    const rect = await cell.boundingBox();
    assert.ok(
      rect.x >= outer.x - 2 && rect.x + rect.width <= outer.x + outer.width + 2,
      field + ' stays visible',
    );
  }
  await page.setViewportSize({ width: 560, height: 1000 });
  await expect(resources).toBeVisible();
  await expect(needed).toBeVisible();
  await page.screenshot({ path: '.scratch/fc-inline-narrow.png' });
  assert.deepEqual(errors, []);
});
