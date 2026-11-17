import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as XLSX from 'xlsx-republish';
import { mpsComputePlugin } from '../scripts/mps-compute-build.mjs';

test('设备范围与产品层级在产能及报告页查看下载一致，缺产线归属保持待补', async (t) => {
  const output = await build({
    stdin: {
      resolveDir: process.cwd(),
      contents: `import React from 'react';import {createRoot} from 'react-dom/client';
        import {createEvaluationOverview} from './static/mps/source/evaluation-view.js';
        import {buildMpsWorkflow} from './static/mps/source/workflow-inputs.js';
        import {downloadCsv} from './static/mps/source/demand-confirmation.js';
        import {workflowPerformanceInput} from './tests/helpers/mps-workflow-fixture.mjs';
        const root=createRoot(document.getElementById('root'));
        window.runCapacity=(size=2)=>{
        const sample=workflowPerformanceInput(size);
        sample.draft.resources[0]={...sample.draft.resources[0],workshop:'一车间',tunnel:'T1',productionLines:['一产线','共用产线']};
        sample.draft.resources.push({id:'R2',base:'甲',kind:'tunnel',name:'第二隧道',dailyTons:2,workshop:'二车间',tunnel:'T2'});
        sample.draft.resourceAssignments.push(...sample.draft.resourceAssignments.map(row=>({...row,resourceId:'R2'})));
        const result=buildMpsWorkflow(sample.draft,sample.relations,sample.shipment,sample.evaluation);
        window.result=result;window.downloads=[];
        const View=createEvaluationOverview(React,{Dialog:()=>null,downloadCsv:(name,columns,rows)=>{window.downloads.push({name,columns,rows});return downloadCsv(name,columns,rows)}});
        const h=React.createElement;
        const card=(title,body)=>h('section',{className:'dc-card','aria-label':title},h('div',{className:'dc-card-head'},h('h2',null,title)),body);
        const table=(name,columns,rows)=>h('div',{className:'dc-table-scroll wf-table-scroll'},h('table',{'aria-label':name},h('thead',null,h('tr',null,...columns.map((c,i)=>h('th',{key:i,scope:'col'},c)))),h('tbody',null,...rows.map((r,i)=>h('tr',{key:i},...r.map((v,j)=>h('td',{key:j},v?.content??v)))))));
        window.showStep=(step)=>root.render(h(View,{step,draft:sample.draft,currentEvaluation:{at:'验收时间',result},filters:{month:'2026-12'},table,card,numberText:value=>value===null?'待补':new Intl.NumberFormat('zh-CN',{maximumFractionDigits:2}).format(value),onExecute(){}}));
        window.showStep('capacity');};window.runCapacity();`,
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
  await page.route('https://mps-capacity.test/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<main class="dc-page wf-page" data-planning="true"><div id="root"></div></main>',
    }),
  );
  await page.goto('https://mps-capacity.test/');
  await page.setViewportSize({ width: 1200, height: 1000 });
  for (const name of ['vendor.css', 'layout.css', 'demand-confirmation.css', 'workflow.css'])
    await page.addStyleTag({ content: await readFile('static/mps/source/' + name, 'utf8') });
  await page.addScriptTag({ content: output.outputFiles[0].text });
  await expect(
    page.getByRole('heading', { name: '设备范围与产品占用', exact: true }),
  ).toBeVisible();
  if (process.env.MPS_CAPACITY_EXPORT_DIR) {
    const section = page.getByRole('region', { name: '设备范围与产品占用', exact: true });
    await section.screenshot({
      path: join(process.env.MPS_CAPACITY_EXPORT_DIR, 'scope-desktop.png'),
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await section.screenshot({
      path: join(process.env.MPS_CAPACITY_EXPORT_DIR, 'scope-narrow.png'),
    });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.setViewportSize({ width: 1200, height: 1000 });
  }
  await expect(
    page.getByRole('region', { name: '设备范围明细滚动区', exact: true }),
  ).toHaveAttribute('tabindex', '0');
  const summary = page.getByRole('table', { name: '所选设备范围汇总', exact: true });
  await expect(summary).toContainText('100');
  await page.getByLabel('产品查看层级', { exact: true }).selectOption('sku');
  const filePromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载设备范围与产品占用', exact: true }).click();
  const file = await filePromise;
  assert.equal(file.suggestedFilename(), '2026-12-设备范围与产品占用.xlsx');
  const directory =
    process.env.MPS_CAPACITY_EXPORT_DIR || (await mkdtemp(join(tmpdir(), 'mps-capacity-')));
  if (!process.env.MPS_CAPACITY_EXPORT_DIR) t.after(() => rm(directory, { recursive: true }));
  const path = join(directory, file.suggestedFilename());
  await file.saveAs(path);
  const workbook = XLSX.read(await readFile(path), { type: 'buffer' });
  const saved = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
  assert.equal(saved.length, 2);
  assert.equal(
    saved.reduce((sum, row) => sum + row.关联需求吨数, 0),
    100,
  );
  assert.ok(saved.every((row) => row.范围月产能吨数 === 100));
  let exported = await page.evaluate(() => window.downloads.at(-1));
  assert.equal(exported.rows.length, 2);
  assert.equal(
    exported.rows.reduce((sum, row) => sum + row.关联需求吨数, 0),
    100,
  );
  assert.ok(Math.abs(exported.rows.reduce((sum, row) => sum + row.实际占用吨数, 0) - 100) < 1e-6);
  assert.ok(exported.rows.every((row) => row.范围月产能吨数 === 100));
  await page.getByLabel('设备基地', { exact: true }).selectOption('甲');
  await page.getByLabel('设备车间', { exact: true }).selectOption(JSON.stringify('一车间'));
  await page.getByLabel('设备产线', { exact: true }).selectOption(JSON.stringify('共用产线'));
  await page.getByLabel('设备隧道', { exact: true }).selectOption('R');
  await expect(page.getByRole('table', { name: '设备范围明细', exact: true })).toContainText('T1');
  await page.getByRole('button', { name: '下载设备范围与产品占用', exact: true }).click();
  exported = await page.evaluate(() => window.downloads.at(-1));
  assert.ok(exported.rows.every((row) => row.范围月产能吨数 === 50));
  assert.equal(
    exported.rows.reduce((sum, row) => sum + row.关联需求吨数, 0),
    100,
  );
  await page.getByLabel('设备车间', { exact: true }).selectOption(JSON.stringify('二车间'));
  await expect(page.getByRole('table', { name: '设备范围明细', exact: true })).toContainText(
    '产线归属待补',
  );
  await expect(page.getByRole('table', { name: '设备归属问题', exact: true })).toContainText(
    '来源未提供独立产线',
  );
  await page.evaluate(() => window.showStep('report'));
  await expect(
    page.getByRole('heading', { name: '设备范围与产品占用', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '下载设备范围明细', exact: true }).click();
  exported = await page.evaluate(() => window.downloads.at(-1));
  assert.equal(exported.rows.length, 1);
  assert.equal(exported.rows[0].隧道号, 'T2');
  await page.evaluate(() => window.runCapacity(26));
  await page.getByLabel('设备车间', { exact: true }).selectOption('*');
  await page.getByLabel('产品查看层级', { exact: true }).selectOption('sku');
  const productTable = page.getByRole('table', { name: '设备范围产品占用', exact: true });
  await expect(productTable.locator('tbody tr')).toHaveCount(25);
  await page.getByRole('button', { name: '下一页产品', exact: true }).click({ timeout: 1000 });
  await expect(productTable.locator('tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: '下载设备范围与产品占用', exact: true }).click();
  exported = await page.evaluate(() => window.downloads.at(-1));
  assert.equal(exported.rows.length, 26);
});
