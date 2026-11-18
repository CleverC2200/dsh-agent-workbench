import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
import * as XLSX from 'xlsx-republish';
import { mpsComputePlugin } from '../scripts/mps-compute-build.mjs';
import { mpsDownloadText } from './helpers/mps-download.mjs';

test('业务提报按大类筛选后池外双来源页面与实际下载一致且总清单去重', async (t) => {
  const output = await build({
    stdin: {
      resolveDir: process.cwd(),
      contents: `
    import React from 'react';import {createRoot} from 'react-dom/client';
    import {createPoolExceptionReport} from './static/mps/source/pool-exception-view.js';
    import {buildMpsWorkflow} from './static/mps/source/workflow-inputs.js';
    import {workflowDraft} from './tests/helpers/mps-workflow-fixture.mjs';
    import {downloadCsv} from './static/mps/source/demand-confirmation.js';
    const draft=workflowDraft();draft.reportSource='business';draft.planRatesRead={status:'ready'};
    draft.planRates=[{'维度类型':'基地+产品','月份':draft.month,'基地':'甲','产品编码':'OUT','大类':'点心','当前维度计划量':8}];
    draft.historyAnnual.periods[0].rows.push({'基地':'甲','产品编码':'OUT','大类':'点心','数量':20});
    const result=buildMpsWorkflow(draft);const View=createPoolExceptionReport(React,{downloadCsv});const h=React.createElement;
    const table=(name,columns,rows)=>h('div',null,h('table',{'aria-label':name},h('thead',null,h('tr',null,columns.map((c,i)=>h('th',{key:i},c)))),h('tbody',null,rows.map((r,i)=>h('tr',{key:i},r.map((v,j)=>h('td',{key:j},v)))))));
    function Page(){const [category,setCategory]=React.useState('');return h(React.Fragment,null,h('label',null,'大类',h('select',{'aria-label':'大类',value:category,onChange:e=>setCategory(e.target.value)},h('option',{value:''},'全部'),h('option',{value:'点心'},'点心'))),h(View,{draft,result,filters:{category},table}));}
    createRoot(document.getElementById('root')).render(h(Page));
  `,
    },
    plugins: [await mpsComputePlugin()],
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
  });
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.route('https://mps-pool.test/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }),
  );
  await page.goto('https://mps-pool.test/');
  await page.addScriptTag({ content: output.outputFiles[0].text });
  await page.getByLabel('大类', { exact: true }).selectOption('点心');
  const panel = page.getByRole('region', { name: '产品范围与池外异常', exact: true });
  const download = async () => {
    const pending = page.waitForEvent('download');
    await panel.getByRole('button', { name: '下载当前池外异常明细', exact: true }).click();
    const text = await mpsDownloadText(await (await pending).path());
    const book = XLSX.read(text, { type: 'string', raw: true });
    return XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { defval: '' });
  };
  await expect(panel.getByRole('table')).toContainText('历史发货；销售提报');
  let rows = await download();
  assert.equal(rows.length, 1);
  assert.match(rows[0].来源, /历史发货.*销售提报/);
  await panel.getByRole('button', { name: '历史有发货SKU（1条）', exact: true }).click();
  rows = await download();
  assert.equal(rows[0].原始值, '20');
  await panel.getByRole('button', { name: '销售提报SKU（1条）', exact: true }).click();
  await expect(panel.getByRole('table')).toContainText('8');
  rows = await download();
  assert.equal(rows[0].原始值, '8');
});
