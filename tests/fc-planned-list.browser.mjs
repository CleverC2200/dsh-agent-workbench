import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
const config = JSON.parse(await readFile('business/inventory-fc/sql.config.json', 'utf8'));
const pages = './business/inventory-fc/source/inventory-light-plugins/src/pages';
const bundle = await build({
  stdin: {
    contents: `import React,{useMemo}from'react';import{createRoot}from'react-dom/client';import './business/inventory-fc/source/inventory-light-plugins/src/dsh-ui/base.css';import '${pages}/fc.css';import{FcWorkflowProvider,useFcWorkflow,FcConfiguredList}from'${pages}/configured-fc-list';import{fcPlannedReader}from'${pages}/fc-planned-page';import{ConfiguredFactsPage}from'./business/shared/configured-facts-page';import{originalFcView}from'./business/shared/original-business-views';import config from'./business/inventory-fc/sql.config.json';function Page(){const{planningPlans,setPlanningPlans}=useFcWorkflow();window.applyPlans=setPlanningPlans;const reader=useMemo(()=>fcPlannedReader(planningPlans),[planningPlans]);return <ConfiguredFactsPage embedded config={config} viewIds={['replenishment']} date="2026-10-30" presentation={originalFcView(config,'replenishment')} businessList={FcConfiguredList} readFacts={reader}/>;}createRoot(document.getElementById('app')).render(<FcWorkflowProvider><Page/></FcWorkflowProvider>);`,
    resolveDir: process.cwd(),
    loader: 'tsx',
  },
  bundle: true,
  write: false,
  outfile: 'parity.js',
  format: 'iife',
  platform: 'browser',
  alias: { react: resolve('node_modules/react'), 'react-dom': resolve('node_modules/react-dom') },
  define: { PLUGIN_ID: '"fc"', 'process.env.NODE_ENV': '"test"' },
  loader: { '.css': 'css', '.module.css': 'local-css' },
});
const js = bundle.outputFiles.find((file) => file.path.endsWith('.js')).text;
const css = bundle.outputFiles.find((file) => file.path.endsWith('.css')).text;
test('manual plan results, ten-row pagination and CSV all use the same recalculated order', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    acceptDownloads: true,
  });
  const errors = [],
    calls = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const rows = Array.from({ length: 25 }, (_, i) => ({
    warehouse_code: '001',
    warehouse_name: '测试分仓',
    sku: `S${String(i + 1).padStart(2, '0')}`,
    material_name: '联动测试商品',
    category: '汤圆',
    material_group: '测试组',
    inventory_qty: 50,
    available_qty: 25,
    current_order_demand: 0,
    current_order_remaining: 0,
    calculation_order_remaining: 0,
    open_transfer_reported_qty: 0,
    cycle_days: 7,
    period_current_out: 31,
    period_next_out: 300,
    month_out_plan: 31,
    month_ship_positive: 0,
    period_current_transfer: 0,
    period_next_transfer: 0,
    recommended_qty: 0,
    target_inventory_qty: 10,
    page_scope_has_material_group: 1,
  }));
  await page.route('http://127.0.0.1:19489/**', async (route) => {
    if (route.request().method() !== 'POST')
      return route.fulfill({
        contentType: 'text/html',
        body: `<style>${css}</style><main id="app"></main><script id="agent-sql-direct" type="application/json">{"path":"/api/agents/inventory-fc/query","token":"fixture"}</script><script>${js}</script>`,
      });
    const { queryId, parameters } = route.request().postDataJSON();
    calls.push({ queryId, parameters });
    const q = config.queries[queryId];
    assert.ok(q, queryId);
    let result;
    if (queryId.startsWith('source.')) result = [{ day: '2026-10-29' }];
    else if (queryId === 'replenishment.detail.atomic')
      result = rows
        .slice(parameters.offset, parameters.offset + parameters.page_size)
        .map((row) => ({
          ...Object.fromEntries(q.resultColumns.map((key) => [key, null])),
          ...row,
          page_scope_total: 25,
          page_row_present: 1,
        }));
    else if (queryId.endsWith('.count') || queryId.endsWith('_count')) result = [{ total: 25 }];
    else throw Error('unexpected query ' + queryId);
    return route.fulfill({
      json: {
        rows: result,
        configVersion: 'fixture',
        returnedColumns: q.resultColumns,
        rejectedColumns: [],
      },
    });
  });
  await page.goto('http://127.0.0.1:19489/');
  const list = page.getByRole('region', { name: '补货确认', exact: true });
  await expect(list.locator('tbody > tr')).toHaveCount(10);
  await page.evaluate(
    (plans) => window.applyPlans(plans),
    rows.map((row, i) => ({
      warehouseCode: '001',
      warehouseName: '测试分仓',
      sku: row.sku,
      productName: row.material_name,
      month: '2026-10',
      category: '汤圆',
      materialGroup: '测试组',
      outboundQty: (i + 1) * 31,
      transferQty: 0,
    })),
  );
  await expect(list.getByRole('button', { name: 'S25', exact: true })).toBeVisible();
  await expect(list.locator('tbody > tr')).toHaveCount(10);
  await expect(list.getByRole('spinbutton', { name: 'S25实际补货量' })).toHaveValue('225');
  await list
    .getByRole('group', { name: '补货筛选' })
    .getByRole('button', { name: '低于建议', exact: true })
    .click();
  await expect(list).toContainText('共 23 条');
  await list.getByRole('button', { name: '下一页', exact: true }).click();
  await expect(list.getByRole('button', { name: 'S15', exact: true })).toBeVisible();
  await expect(list.getByRole('button', { name: 'S25', exact: true })).toHaveCount(0);
  const downloadPromise = page.waitForEvent('download');
  await list.getByRole('button', { name: 'CSV', exact: true }).click();
  const download = await downloadPromise;
  const csv = await readFile(await download.path(), 'utf8');
  const records = csv.trim().split('\r\n');
  assert.equal(records.length, 24);
  assert.match(records[1], /S25/);
  assert.match(records.at(-1), /S03/);
  assert.equal(
    calls
      .filter((call) => call.queryId === 'replenishment.detail.atomic')
      .some((call) => call.parameters.page_size === 200 && call.parameters.list_mode === 'all'),
    true,
  );
  assert.deepEqual(errors, []);
  await mkdir('.scratch', { recursive: true });
  await page.screenshot({ path: '.scratch/fc-planned-list-parity.png', fullPage: true });
});
