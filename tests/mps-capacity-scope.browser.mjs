import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as XLSX from 'xlsx-republish';
import { mpsComputePlugin } from '../scripts/mps-compute-build.mjs';
import { mpsDownloadText } from './helpers/mps-download.mjs';

test('设备范围与产品层级在产能及报告页查看下载一致，缺产线归属保持待补', async (t) => {
  const output = await build({
    stdin: {
      resolveDir: process.cwd(),
      contents: `import React from 'react';import {createRoot} from 'react-dom/client';
        import {createEvaluationOverview} from './static/mps/source/evaluation-view.js';
        import {buildMpsWorkflow} from './static/mps/source/workflow-inputs.js';
        import {downloadCsv} from './static/mps/source/demand-confirmation.js';
        import {encodeLocalDrafts,decodeLocalDrafts} from './static/mps/source/local-draft.js';
        import {workflowPerformanceInput} from './tests/helpers/mps-workflow-fixture.mjs';
        const root=createRoot(document.getElementById('root'));
        window.runCapacity=(size=2,restore=false,scenario='complete')=>{
        const sample=workflowPerformanceInput(size);
        sample.draft.resources[0]={...sample.draft.resources[0],workshop:'一车间',tunnel:'T1',productionLines:['一产线','共用产线']};
        sample.draft.resources.push({id:'R2',base:'甲',kind:'tunnel',name:'第二隧道',dailyTons:2,workshop:'二车间',tunnel:'T2'});
        sample.draft.resourceAssignments.push(...sample.draft.resourceAssignments.map(row=>({...row,resourceId:'R2'})));
        sample.draft.files={};
        sample.draft.resourceAssignments=sample.draft.resourceAssignments.map(row=>({...row,month:sample.draft.month}));
        if(!restore) localStorage.setItem('capacityDraft',JSON.stringify(encodeLocalDrafts([sample.draft],sample.draft.id)));
        const restored=decodeLocalDrafts(JSON.parse(localStorage.getItem('capacityDraft')),(id,month)=>({id,month,files:{}}),()=>{throw Error('草稿恢复失败')});
        sample.draft={...sample.draft,...restored.drafts[0]};
        if(scenario==='missing') sample.shipment.rows.forEach(row=>row.end=null);
        if(scenario==='partial') sample.shipment.rows[0].end=null;
        if(scenario==='movement') {sample.draft.inventoryMovements[0].productionInbound=null;sample.draft.inventoryMovements[0].transferIn=null;}
        if(scenario==='demand') sample.draft.categoryDemand[0].quantity=null;
        if(scenario==='zero') sample.draft.categoryDemand.forEach(row=>row.quantity=0);
        const result=buildMpsWorkflow(sample.draft,sample.relations,sample.shipment,sample.evaluation);
        window.result=result;window.downloads=[];
        const View=createEvaluationOverview(React,{Dialog:()=>null,downloadCsv:(name,columns,rows)=>{window.downloads.push({name,columns,rows});return downloadCsv(name,columns,rows)}});
        const h=React.createElement;
        const card=(title,body)=>h('section',{className:'dc-card','aria-label':title},h('div',{className:'dc-card-head'},h('h2',null,title)),body);
        const table=(name,columns,rows)=>h('div',{className:'dc-table-scroll wf-table-scroll'},h('table',{'aria-label':name},h('thead',null,h('tr',null,...columns.map((c,i)=>h('th',{key:i,scope:'col'},c)))),h('tbody',null,...rows.map((r,i)=>h('tr',{key:i},...r.map((v,j)=>h('td',{key:j},v?.content??v)))))));
        window.showStep=(step)=>root.render(h(View,{step,draft:sample.draft,currentEvaluation:{at:'验收时间',result},filters:{month:'2026-12'},table,card,numberText:value=>value===null?'待补':new Intl.NumberFormat('zh-CN',{maximumFractionDigits:2}).format(value),onExecute(){}}));
        window.showStep('capacity');};window.runCapacity(2,localStorage.getItem('capacityDraft')!==null);`,
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
  await page.evaluate(() => window.runCapacity(3));
  const savedDraft = await page.evaluate(() => localStorage.getItem('capacityDraft'));
  await page.reload();
  for (const name of ['vendor.css', 'layout.css', 'demand-confirmation.css', 'workflow.css'])
    await page.addStyleTag({ content: await readFile('static/mps/source/' + name, 'utf8') });
  await page.addScriptTag({ content: output.outputFiles[0].text });
  assert.equal(await page.evaluate(() => localStorage.getItem('capacityDraft')), savedDraft);
  assert.ok(await page.evaluate(() => window.result.rows.some((row) => row.code === '2')));
  await page.evaluate(() => window.runCapacity(2));

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
  await expect(
    summary.getByRole('columnheader', { name: '隧道利用率', exact: true }),
  ).toBeVisible();
  await expect(summary).toContainText('100.00%');
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
  assert.ok(exported.rows.every((row) => row.隧道利用率 === 0.5));
  await page.getByRole('button', { name: '导出产能评估报告', exact: true }).click();
  const capacityExport = await page.evaluate(() => window.downloads.at(-1));
  assert.ok(capacityExport.columns.includes('隧道利用率'));
  assert.ok(!capacityExport.columns.includes('负荷率'));
  assert.equal(capacityExport.rows.find((row) => row.月份 === '2026-12').隧道利用率, 1);
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
  assert.equal(exported.rows[0].关联需求吨数, 100);
  assert.equal(exported.rows[0].隧道利用率, 2);
  assert.equal(exported.rows[0].月产能吨数, 50);
  await page.evaluate(() => window.runCapacity(26));
  await expect(page.getByLabel('产品查看层级', { exact: true })).toHaveValue('category');
  await page.getByLabel('设备车间', { exact: true }).selectOption('*');
  await page.getByLabel('产品查看层级', { exact: true }).selectOption('sku');
  const productTable = page.getByRole('table', { name: '设备范围产品占用', exact: true });
  await expect(productTable.locator('tbody tr')).toHaveCount(25);
  await expect(
    productTable.getByRole('columnheader', { name: '隧道利用率', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '下一页产品', exact: true }).click({ timeout: 1000 });
  await expect(productTable.locator('tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: '下载设备范围与产品占用', exact: true }).click();
  exported = await page.evaluate(() => window.downloads.at(-1));
  assert.equal(exported.rows.length, 26);
  await page.evaluate(() => window.runCapacity(2, false, 'missing'));
  await expect(summary).toContainText('尚未形成排产分配');
  await page.getByRole('button', { name: '下载设备范围与产品占用', exact: true }).click();
  exported = await page.evaluate(() => window.downloads.at(-1));
  assert.ok(exported.rows.every((row) => row.排产状态.includes('尚未形成排产分配')));
  assert.ok(exported.rows.every((row) => row.实际占用吨数 === 0));
  await page.evaluate(() => window.runCapacity(2, false, 'zero'));
  await expect(summary).toContainText('本轮排产已计算，实际占用为0');
  await expect(summary).toContainText('0.00%');
  await page.evaluate(() => window.runCapacity(2, false, 'demand'));
  await expect(summary).toContainText('项待补');
  await page.getByRole('button', { name: '下载设备范围与产品占用', exact: true }).click();
  exported = await page.evaluate(() => window.downloads.at(-1));
  assert.ok(exported.rows.every((row) => row.隧道利用率 === null));
  assert.ok(exported.rows.every((row) => row.关联需求吨数 === null));
  assert.ok(exported.rows.every((row) => row.范围月产能吨数 === 100));
  assert.ok(exported.rows.every((row) => row.待补需求项数 === 2));
  await page.evaluate(() => {
    window.runCapacity(2, false, 'movement');
  });
  const problems = page.getByRole('region', { name: '问题分类与补充清单', exact: true });
  await expect(problems).toContainText('既有入库或调拨计划缺项');
  await page.getByRole('button', { name: '导出求解结果', exact: true }).click();
  exported = await page.evaluate(() => window.downloads.at(-1));
  const blocked = exported.rows.find((row) => row.产品编码 === '0');
  assert.match(blocked.问题分类, /既有入库或调拨计划缺项/);
  assert.match(blocked.异常说明, /缺既有生产入库、既有调入/);
  assert.doesNotMatch(blocked.异常说明, /缺既有在途入库|缺既有调出/);
  assert.match(blocked.需人工补齐, /第五步约束与配置/);
  for (const [scenario, quantity, missing, status] of [
    ['partial', 0, 1, '已知小计'],
    ['missing', null, 2, '未知'],
    ['complete', 0, 0, '完整'],
  ]) {
    await page.waitForTimeout(1100);
    await page.evaluate((scenario) => {
      window.runCapacity(2, false, scenario);
      window.showStep('report');
    }, scenario);
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: '下载产销存分层汇总及明细', exact: true }).click();
    const csv = await mpsDownloadText(await (await pending).path());
    const book = XLSX.read(csv, { type: 'string', raw: true });
    const rows = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { defval: '' });
    const national = rows.find((row) => row.基地 === '全国' && row.粒度 === '合计');
    assert.equal(national.期初库存, quantity === null ? '' : String(quantity));
    assert.equal(national.期初库存待补数, String(missing));
    assert.equal(national.期初库存完整性, status);
    assert.equal(national.需求数量完整性, '完整');
    assert.equal(national.需求数量待补数, '0');
    assert.equal(rows.filter((row) => row.粒度 === 'SKU').length, 4);
    if (scenario === 'partial') {
      const unknown = rows.find(
        (row) => row.基地 === '全国' && row.粒度 === 'SKU' && row.产品编码 === '0',
      );
      assert.equal(unknown.期初库存完整性, '未知');
      const zero = rows.find(
        (row) => row.基地 === '全国' && row.粒度 === 'SKU' && row.产品编码 === '1',
      );
      assert.equal(zero.期初库存, '0');
      assert.equal(zero.期初库存完整性, '完整');
      await expect(
        page.locator('.wf-plan-balances [aria-label="已知小计，含缺项"]').first(),
      ).toBeVisible();
    }
  }
});
