import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
import { mpsComputePlugin } from '../scripts/mps-compute-build.mjs';

const config = JSON.parse(await readFile('static/mps/sql.config.json', 'utf8'));
const compiled = await build({
  stdin: {
    resolveDir: process.cwd(),
    contents: `import React from 'react';import {createRoot} from 'react-dom/client';
      import {createShipment} from './static/mps/source/shipment.js';
      const Shipment=createShipment(React,()=>{},{Dialog:()=>null,Upload:()=>null,downloadCsv(){},monthOffset:()=> '2026-10'});
      function Page(){
        const [draft,setDraft]=React.useState({id:'restore',month:'2026-11',productSource:'business',products:[{基地:'郑州',产品编码:'A',大类:'汤圆'}],shipment:window.initialShipment??{cutoff:'2026-10-22',activeSource:'business',values:{},remaining:{}}});
        const generation=React.useRef(0);
        return React.createElement(Shipment,{draft,scopeGeneration:generation,active:false,autoRead:true,update:changes=>setDraft(d=>({...d,...changes})),onSnapshot:snapshot=>{window.snapshot={status:snapshot.status,error:snapshot.error,sourceKind:snapshot.sourceKind,rows:snapshot.rows.map(({base,code,fin,end})=>({base,code,fin,end}))};}});
      }
      createRoot(document.getElementById('root')).render(React.createElement(Page));`,
  },
  plugins: [await mpsComputePlugin(process.env.MPS_MANAGE_SOURCE)],
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'iife',
});

async function mount(t, initialShipment) {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  const calls = [];
  await page.exposeFunction('query', ({ queryId }) => {
    calls.push(queryId);
    return {
      rows:
        queryId === 'facts.shipment-latest'
          ? [{ latest_date: null }]
          : queryId.endsWith('.count')
            ? [{ total: 1 }]
            : [
                {
                  belong_base: '郑州',
                  material_code: 'A',
                  material_name: '产品A',
                  series: '系列',
                  product_item: '组',
                  shipped: 220,
                  prepped: 10,
                  unprepped: 10,
                  daily3: 10,
                  average: 10,
                  open: 100,
                  inbound: 210,
                  source_days: 22,
                  duplicate_days: 0,
                },
              ],
      returnedColumns: config.queries[queryId].columns,
      configVersion: 'v1',
    };
  });
  await page.route('https://mps-shipment-prepare.test/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<script id="agent-sql-config" type="application/json">${JSON.stringify(config)}</script><div id="root"></div>`,
    }),
  );
  await page.goto('https://mps-shipment-prepare.test/');
  await page.evaluate(() => {
    window.addEventListener('message', (event) => {
      if (event.data?.type !== 'ready') return;
      const pair = new MessageChannel();
      pair.port1.onmessage = async ({ data }) => {
        if (data.type === 'request')
          pair.port1.postMessage({
            type: 'response',
            id: data.id,
            result: await window.query(data.parameters),
          });
      };
      window.postMessage(
        {
          protocol: 'gea-html-v2',
          type: 'connect',
          context: { session: 'fixture', plugin: 'mps' },
        },
        '*',
        [pair.port2],
      );
    });
  });
  if (initialShipment)
    await page.evaluate((value) => {
      window.initialShipment = value;
    }, initialShipment);
  await page.addScriptTag({ content: compiled.outputFiles[0].text });
  return { page, calls };
}
test(
  '恢复后直接进入评估时，隐藏的发货步骤同步业务输入并发布有效预估和期初库存',
  { timeout: 20000 },
  async (t) => {
    const { page, calls } = await mount(t);

    await expect
      .poll(() => page.evaluate(() => window.snapshot?.sourceKind), { timeout: 3000 })
      .toBe('business');
    const snapshot = await page.evaluate(() => window.snapshot);
    assert.equal(snapshot.status, 'ok');
    assert.deepEqual(snapshot.rows, [{ base: '郑州', code: 'A', fin: 310, end: 90 }]);
    assert.deepEqual(calls, ['facts.shipment.count', 'facts.shipment', 'facts.shipment.count']);
  },
);
test('没有可用截止日时发布失败状态，不永久停在输入准备中', { timeout: 20000 }, async (t) => {
  const { page, calls } = await mount(t, { cutoff: '', activeSource: 'business' });
  await expect
    .poll(() => page.evaluate(() => window.snapshot?.status), { timeout: 3000 })
    .toBe('failed');
  assert.match(await page.evaluate(() => window.snapshot.error), /暂无可用发货日期/);
  assert.deepEqual(calls, ['facts.shipment-latest']);
});
test('背景准备保留本地CSV和人工发货调整，不覆盖为业务来源', { timeout: 20000 }, async (t) => {
  const { page, calls } = await mount(t, {
    cutoff: '2026-10-22',
    activeSource: 'local-file',
    file: '本地输入.csv',
    rows: [
      {
        month: '2026-10',
        base: '郑州',
        code: 'A',
        category: '汤圆',
        shipped: 220,
        prepped: 10,
        unprepped: 10,
        daily3: 10,
        open: 100,
        inbound: 210,
        remaining: 90,
      },
    ],
    values: { '["郑州","A"]': { value: 400 } },
    remaining: {},
  });
  await expect.poll(() => page.evaluate(() => window.snapshot?.sourceKind)).toBe('local-file');
  assert.deepEqual(await page.evaluate(() => window.snapshot.rows), [
    { base: '郑州', code: 'A', fin: 400, end: 0 },
  ]);
  assert.equal(calls.length, 0);
});
