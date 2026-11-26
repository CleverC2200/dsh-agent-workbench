import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
import { mpsComputePlugin } from '../scripts/mps-compute-build.mjs';
import { readFile } from 'node:fs/promises';
import * as XLSX from 'xlsx-republish';

const compiled = await build({
  stdin: {
    resolveDir: process.cwd(),
    contents: `
    import React from 'react';import {createRoot} from 'react-dom/client';
    import {createShipment} from './static/mps/source/shipment.js';
    import {downloadCsv} from './static/mps/source/demand-confirmation.js';
    const Dialog=({title,children,close})=>React.createElement('section',{role:'dialog','aria-label':title},children,React.createElement('button',{onClick:close},'关闭'));
    const Shipment=createShipment(React,()=>{},{Dialog,Upload:()=>null,downloadCsv,monthOffset:()=> '2026-10'});
    function Page(){const [draft,setDraft]=React.useState(window.initialDraft);const generation=React.useRef(0);
      return React.createElement(Shipment,{draft,scopeGeneration:generation,active:true,update:changes=>setDraft(d=>({...d,...changes})),onSnapshot:snapshot=>{window.snapshot=snapshot.rows;}});}
    createRoot(document.getElementById('root')).render(React.createElement(Page));`,
  },
  plugins: [await mpsComputePlugin(process.env.MPS_MANAGE_SOURCE)],
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'iife',
});
const row = (code, changes = {}) => ({
  month: '2026-10',
  base: '郑州',
  code,
  name: code,
  category: '汤圆',
  group: '组',
  series: '系列',
  shipped: 0,
  prepped: 0,
  unprepped: 0,
  daily3: 0,
  average: 0,
  open: 100,
  inbound: 0,
  remaining: 20,
  ...changes,
});
async function mount(t, rows) {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.route('https://mps-stock.test/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }),
  );
  await page.goto('https://mps-stock.test/');
  await page.evaluate((rows) => {
    window.initialDraft = {
      id: 'stock-v1',
      name: '库存验收',
      month: '2026-11',
      productSource: 'local-file',
      products: rows.map((row) => ({
        基地: row.base,
        产品编码: row.code,
        产品名称: row.name,
        大类: row.category,
        系列: row.series,
        物料组: row.group,
        物料组名称: row.group,
      })),
      shipment: {
        cutoff: '2026-10-22',
        activeSource: 'business',
        business: {
          month: '2026-10',
          cutoff: '2026-10-22',
          metadata: { partial: false },
          rows: rows.map((row) => ({
            ...row,
            transferIn: row.planIn ?? 5,
            transferOut: row.planOut ?? 10,
          })),
        },
      },
    };
  }, rows);
  await page.addScriptTag({ content: compiled.outputFiles[0].text });
  await expect.poll(() => page.evaluate(() => window.snapshot?.length)).toBe(rows.length);
  return page;
}
async function download(page, name) {
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name, exact: true }).click();
  const data = await readFile(await (await waiting).path());
  const book = XLSX.read(data, { type: 'buffer', raw: true });
  return XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { defval: '' });
}

test('三项确认无数量才预估0，后续入库和调拨形成115结存，缺近30天仍待补并下载原因', async (t) => {
  const page = await mount(t, [
    row('ZERO'),
    row('MISSING', { average: null }),
    row('NO-MOVE', { remaining: 0, planIn: 0, planOut: 0 }),
    row('RECENT', { average: 2 }),
    row('NO-SAP', { shipped: null }),
    row('NO-ORDER', { prepped: null }),
  ]);
  const rows = await page.evaluate(() => window.snapshot);
  assert.equal(rows[0].fin, 0);
  assert.equal(rows[0].end, 115);
  assert.equal(rows[1].fin, null);
  assert.equal(rows[1].end, null);
  assert.equal(rows[2].fin, 0);
  assert.equal(rows[2].end, 100);
  assert.equal(rows[3].fin, 0);
  assert.equal(rows[3].end, 115);
  assert.ok(rows.slice(4).every((row) => row.fin === null && row.end === null));
  await expect(
    page
      .getByRole('table', { name: '本月预估发货明细' })
      .getByRole('button', { name: '郑州 整月预估发货 计算过程', exact: true }),
  ).toHaveText('0');
  const detail = await download(page, '下载发货与结存');
  assert.equal(detail.find((row) => row.产品编码 === 'ZERO').预计月末结存, 115);
  assert.match(detail.find((row) => row.产品编码 === 'MISSING').预估待补原因, /近30天/);
});

test('负期初和负预测结存逐明细归0，正库存不抵消，页面及筛选下载保留原始不足', async (t) => {
  const page = await mount(t, [row('NEG', { open: -20, remaining: 0 }), row('POS')]);
  const rows = await page.evaluate(() => window.snapshot);
  assert.equal(rows[0].open, 0);
  assert.equal(rows[0].rawOpen, -20);
  assert.equal(rows[0].rawEnd, -5);
  assert.equal(rows[0].end, 0);
  assert.equal(rows[1].end, 115);
  await expect(
    page.getByRole('button', { name: '郑州 预计月末结存 计算过程', exact: true }),
  ).toHaveText('115');
  await page.getByText('发货与库存异常报告', { exact: true }).click();
  await expect(page.getByRole('table', { name: '发货与库存异常报告' })).toContainText('-20');
  await expect(page.getByRole('table', { name: '发货与库存异常报告' })).toContainText('-5');
  await page.getByLabel('搜索发货单品').fill('NEG');
  const detail = await download(page, '下载发货与结存');
  assert.equal(detail.length, 1);
  assert.equal(detail[0].原始月初库存, -20);
  assert.equal(detail[0].原始预计月末结存, -5);
  assert.equal(detail[0].预计月末结存, 0);
  const issues = await download(page, '下载发货与库存异常');
  assert.equal(issues.length, 2);
  assert.deepEqual(
    issues.map((row) => row.原始值),
    [-20, -5],
  );
  assert.ok(
    issues.every((row) => row.计算用值 === 0 && /待核/.test(row.原因) && row.产品编码 === 'NEG'),
  );
});

test('来源历史不完整或冲突不能把零数量认定为真实无发货', async (t) => {
  const page = await mount(t, [
    row('INCOMPLETE', { sourceDays: 21, duplicateDays: 0 }),
    row('CONFLICT', { sourceDays: 22, duplicateDays: 1 }),
  ]);
  const rows = await page.evaluate(() => window.snapshot);
  assert.ok(rows.every((row) => row.fin === null && row.end === null));
  const detail = await download(page, '下载发货与结存');
  assert.match(detail.find((row) => row.产品编码 === 'INCOMPLETE').预估待补原因, /实际21天，缺1天/);
  assert.match(detail.find((row) => row.产品编码 === 'CONFLICT').预估待补原因, /来源日期重复1条/);
});
