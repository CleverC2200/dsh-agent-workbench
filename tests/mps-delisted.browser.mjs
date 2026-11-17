import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
import { mpsComputePlugin } from '../scripts/mps-compute-build.mjs';

const compiled = await build({
  stdin: {
    resolveDir: process.cwd(),
    contents: `import React from 'react';import {createRoot} from 'react-dom/client';
      import {createWorkflow} from './static/mps/source/workflow-view.js';
      import {computeWorkflow} from './static/mps/source/workflow-worker-client.js';
      import {buildMpsWorkflow} from './static/mps/source/workflow-inputs.js';
      import {delistedInput} from './tests/helpers/mps-delisted.mjs';
      const sample=delistedInput();sample.shipment.rows[0].average=null;
      sample.draft.adjustments={quantities:[{kind:'base-sku',month:'2026-12',category:'点心',group:'包点',code:'0',base:'甲',quantity:120,reason:'人工确认',at:'2026-11-17T08:00:00Z',systemValue:50}]};
      window.downloads=[];window.originalAdjustments=structuredClone(sample.draft.adjustments);
      window.runFailedWorker=()=>computeWorkflow(sample.draft,sample.relations,{...sample.shipment,status:'failed',error:'库存源访问拒绝'},sample.evaluation,new AbortController().signal);
      const Workflow=createWorkflow(React,()=>{},{downloadCsv:(name,columns,rows)=>window.downloads.push({name,columns,rows}),downloadAmounts:()=>{},Dialog:()=>null,Upload:()=>null});
      function Page(){const [draft,setDraft]=React.useState(sample.draft);const [step,setStep]=React.useState('process');
        const result=buildMpsWorkflow(draft,sample.relations,sample.shipment,sample.evaluation);window.result=result;window.adjustments=draft.adjustments;
        window.showReport=()=>setStep('report');
        return React.createElement(Workflow,{draft,result,step,scopeGeneration:0,relations:sample.relations,shipmentSnapshot:sample.shipment,update:changes=>setDraft(d=>({...d,...changes})),evaluation:{at:'验收时间',draft,result,scopeGeneration:0,relations:sample.relations,shipmentSnapshot:sample.shipment},setEvaluation:()=>{}});}
      createRoot(document.getElementById('root')).render(React.createElement(Page));`,
  },
  plugins: [await mpsComputePlugin(process.env.MPS_MANAGE_SOURCE)],
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'iife',
});

test('下市品报告及需求和产销存下载保留人工有效修正、日均缺失补零和筛选范围', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('https://mps-delisted.test/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }),
  );
  await page.goto('https://mps-delisted.test/');
  await page.addScriptTag({ content: compiled.outputFiles[0].text });
  const report = page.getByRole('region', {
    name: '下市品需求与库存报告',
    exact: true,
  });
  await expect(report).toBeVisible();
  await expect(report).toContainText('下市品人工正需求');
  await expect(report).toContainText('下市品日均缺失');
  await expect(report).toContainText('保留人工原值');
  await page.getByLabel('月份筛选', { exact: true }).selectOption('2027-01');
  await report.getByRole('button', { name: '下载下市品异常明细', exact: true }).click();
  const issues = await page.evaluate(() => window.downloads.at(-1));
  assert.ok(
    issues.rows.length > 0 && issues.rows.every((row) => row.月份 === '2027-01' && row.SKU === '0'),
  );
  assert.ok(
    issues.rows.some(
      (row) =>
        row.异常类别 === '下市品日均缺失' && row.原始值 === '缺失或无效' && row.计算用值 === 0,
    ),
  );
  await page.getByRole('button', { name: '下载需求拆分', exact: true }).click();
  const demand = await page.evaluate(() => window.downloads.at(-1));
  const retired = demand.rows.find((row) => row.产品编码 === '0');
  assert.equal(retired.需求数量, 0);
  assert.equal(retired.下市品处理, '停止自动新增需求及补货');
  assert.equal(retired.预计发货量, 0);
  await page.evaluate(() => window.showReport());
  await page.getByLabel('月份筛选', { exact: true }).selectOption('2026-12');
  await page.getByRole('button', { name: '导出产销存结果', exact: true }).click();
  const planned = await page.evaluate(() => window.downloads.at(-1));
  const manual = planned.rows.find((row) => row.产品编码 === '0');
  assert.equal(manual.需求数量, 120);
  assert.equal(manual.下市品处理, '有效人工正需求继续计算');
  assert.ok(manual.内部实际排产量 > 0);
  assert.equal(manual.预计发货量, 120);
  assert.deepEqual(
    await page.evaluate(() => window.adjustments),
    await page.evaluate(() => window.originalAdjustments),
  );
  const failed = await page.evaluate(() => window.runFailedWorker());
  assert.ok(
    failed.delistedIssues.some(
      (issue) => issue.kind === '下市品日均缺失' && /库存源访问拒绝/.test(issue.reason),
    ),
  );
  assert.deepEqual(errors, []);
});
