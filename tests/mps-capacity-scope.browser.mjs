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

test('设备范围按基地、车间、隧道筛选，产能及报告页查看下载一致', async (t) => {
  const output = await build({
    stdin: {
      resolveDir: process.cwd(),
      contents: `import React from 'react';import {createRoot} from 'react-dom/client';
        import {createEvaluationOverview} from './static/mps/source/evaluation-view.js';
        import {buildMpsWorkflow} from './static/mps/source/workflow-inputs.js';
        import {downloadCsv} from './static/mps/source/demand-confirmation.js';
        import {encodeLocalDrafts,decodeLocalDrafts} from './static/mps/source/local-draft.js';
        import {createStepViewState} from './static/mps/source/step-view-state.js';
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
        if(scenario==='reference') sample.evaluation.annual={referenceMonth:'2026-11',rows:[]};
        if(scenario==='demand') sample.draft.categoryDemand[0].quantity=null;
        if(scenario==='upstream') {delete sample.draft.categoryDemand;sample.draft.historicalIndicatorsRead={status:'failed',month:sample.draft.month,error:'历史源读取拒绝-评估上游原因完整保留'};}
        if(scenario==='zero') sample.draft.categoryDemand.forEach(row=>row.quantity=0);
        const result=buildMpsWorkflow(sample.draft,sample.relations,sample.shipment,sample.evaluation);
        window.result=result;window.downloads=[];
        const View=createEvaluationOverview(React,{Dialog:()=>null,downloadCsv:(name,columns,rows)=>{window.downloads.push({name,columns,rows});return downloadCsv(name,columns,rows)}});
        const h=React.createElement;
        const card=(title,body,actions)=>h('section',{className:'dc-card','aria-label':title},h('div',{className:'dc-card-head'},h('h2',null,title),actions),body);
        const table=(name,columns,rows)=>h('div',{className:'dc-table-scroll wf-table-scroll'},h('table',{'aria-label':name},h('thead',null,h('tr',null,...columns.map((c,i)=>h('th',{key:i,scope:'col'},c)))),h('tbody',null,...rows.map((r,i)=>h('tr',{key:i},...r.map((v,j)=>h('td',{key:j},v?.content??v)))))));
        const view=createStepViewState();
        window.showStep=(step,filters={month:scenario==='reference'?'':'2026-12'})=>root.render(h(View,{view,step,draft:sample.draft,currentEvaluation:{at:'验收时间',result},filters,table,card,numberText:value=>value===null?'待补':new Intl.NumberFormat('zh-CN',{maximumFractionDigits:2}).format(value),onExecute(){}}));
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
  assert.ok(Math.abs(saved.reduce((sum, row) => sum + row.实际占用吨数, 0) - 100) < 1e-6);
  assert.ok(saved.every((row) => row.隧道利用率 === 0.5));
  assert.deepEqual(workbook.SheetNames.slice(0, 2), ['产品占用', '设备范围']);
  const downloadSheet = async (label, name) => {
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: label, exact: true }).click();
    const file = await pending;
    const book = XLSX.read(await readFile(await file.path()), { type: 'buffer' });
    assert.ok(book.Sheets[name]);
    return { rows: XLSX.utils.sheet_to_json(book.Sheets[name], { defval: null }) };
  };
  const reportDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出产能评估报告', exact: true }).click();
  await reportDownload;
  const capacityExport = await page.evaluate(() => window.downloads.at(-1));
  assert.ok(capacityExport.columns.includes('隧道利用率'));
  assert.ok(!capacityExport.columns.includes('负荷率'));
  assert.equal(capacityExport.rows.find((row) => row.月份 === '2026-12').隧道利用率, 1);
  let exported;
  await page.getByLabel('设备基地', { exact: true }).selectOption('甲');
  await page.getByLabel('设备车间', { exact: true }).selectOption(JSON.stringify('一车间'));
  await expect(page.getByLabel('设备产线', { exact: true })).toHaveCount(0);
  await page.getByLabel('设备隧道', { exact: true }).selectOption('R');
  await expect(page.getByRole('table', { name: '设备范围明细', exact: true })).toContainText('T1');
  exported = await downloadSheet('下载设备范围与产品占用', '产品占用');
  assert.ok(exported.rows.every((row) => row.范围月产能吨数 === 50));
  assert.equal(
    exported.rows.reduce((sum, row) => sum + row.关联需求吨数, 0),
    100,
  );
  await page.getByLabel('设备车间', { exact: true }).selectOption(JSON.stringify('二车间'));
  const equipment = page.getByRole('table', { name: '设备范围明细', exact: true });
  await expect(equipment).toContainText('T2');
  await expect(equipment).not.toContainText('产线归属待补');
  await expect(equipment.getByRole('columnheader', { name: '产线', exact: true })).toHaveCount(0);
  await expect(equipment.getByRole('columnheader', { name: '物理资源ID' })).toHaveCount(0);
  await expect(equipment.getByRole('columnheader', { name: '排产占用（吨）' })).toBeVisible();
  await expect(page.getByRole('table', { name: '设备归属问题', exact: true })).toHaveCount(0);
  await page.evaluate(() => window.showStep('report'));
  const deviceDetails = page.locator('summary').filter({ hasText: '设备范围与产品占用' });
  await expect(deviceDetails).toBeVisible();
  await expect(page.getByRole('heading', { name: '设备范围与产品占用', exact: true })).toHaveCount(
    0,
  );
  await deviceDetails.click();
  await expect(
    page.getByRole('heading', { name: '设备范围与产品占用', exact: true }),
  ).toBeVisible();
  exported = await downloadSheet('下载设备范围与产品占用', '设备范围');
  assert.equal(exported.rows.length, 1);
  assert.equal(exported.rows[0].隧道号, 'T2');
  assert.equal(exported.rows[0].关联需求吨数, 100);
  assert.equal(exported.rows[0].隧道利用率, 2);
  assert.equal(exported.rows[0].月产能吨数, 50);
  assert.ok(!('产线' in exported.rows[0]) && !('物理资源ID' in exported.rows[0]));
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
  exported = await downloadSheet('下载设备范围与产品占用', '产品占用');
  assert.equal(exported.rows.length, 26);
  await page.evaluate(() => window.runCapacity(2, false, 'missing'));
  await expect(summary).toContainText('尚未形成排产分配');
  exported = await downloadSheet('下载设备范围与产品占用', '产品占用');
  assert.ok(exported.rows.every((row) => row.排产状态.includes('尚未形成排产分配')));
  assert.ok(exported.rows.every((row) => row.实际占用吨数 === 0));
  await page.evaluate(() => window.runCapacity(2, false, 'zero'));
  await expect(summary).toContainText('本轮排产已计算，排产占用为0');
  await expect(summary).toContainText('0.00%');
  await page.evaluate(() => window.runCapacity(2, false, 'demand'));
  await expect(summary).toContainText('项待补');
  exported = await downloadSheet('下载设备范围与产品占用', '产品占用');
  assert.ok(exported.rows.every((row) => row.隧道利用率 === '' || row.隧道利用率 === null));
  assert.ok(exported.rows.every((row) => row.关联需求吨数 === '' || row.关联需求吨数 === null));
  assert.ok(exported.rows.every((row) => row.范围月产能吨数 === 100));
  assert.ok(exported.rows.every((row) => row.待补需求项数 === 2));
  await page.evaluate(() => window.showStep('capacity', { month: '2026-12', base: '无符合基地' }));
  for (const label of ['下载设备范围与产品占用', '导出分类问题清单', '导出年度评估缺项']) {
    await expect(page.getByRole('button', { name: label, exact: true })).toBeDisabled();
  }
  for (const label of ['下载设备范围与产品占用', '导出分类问题清单', '导出年度评估缺项']) {
    await expect(
      page.locator('.dc-card-head').getByRole('button', { name: label, exact: true }),
    ).toBeVisible();
  }

  await page.evaluate(() => window.runCapacity(2, false, 'movement'));
  await expect(summary).toContainText('本轮排产已计算');
  const movements = await page.evaluate(() =>
    window.result.plan.rows.find((row) => row.month === '2026-12' && row.code === '0'),
  );
  assert.equal(movements.existingProductionInbound, 0);
  assert.equal(movements.existingTransferIn, 0);
  exported = await downloadSheet('导出求解结果', '求解结果');
  const scheduled = exported.rows.find((row) => row.产品编码 === '0');
  assert.ok(scheduled.内部实际排产量 > 0);
  assert.doesNotMatch(scheduled.问题分类, /既有入库或调拨计划缺项/);
  await page.evaluate(() => window.runCapacity(2, false, 'reference'));
  await expect(page.getByText(/设备数据月份 2026-12/)).toBeVisible();
  await expect(summary).toContainText('本轮排产已计算');
  await page.evaluate(() => window.runCapacity(2, false, 'upstream'));
  await page.getByText('查看大类需求上游原因', { exact: false }).click();
  await expect(page.getByRole('table', { name: '大类需求上游原因', exact: true })).toContainText(
    '历史源读取拒绝-评估上游原因完整保留',
  );
  const causeGroup = await page
    .getByLabel('上游原因组筛选', { exact: true })
    .locator('option')
    .nth(1)
    .getAttribute('value');
  await page.getByLabel('上游原因组筛选', { exact: true }).selectOption(causeGroup);
  const issuesDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出分类问题清单', exact: true }).click();
  const issuesFile = await issuesDownload;
  const issuesPath = join(directory, issuesFile.suggestedFilename());
  await issuesFile.saveAs(issuesPath);
  const issuesBook = XLSX.read(await readFile(issuesPath), { type: 'buffer' });
  const issueRecords = XLSX.utils.sheet_to_json(issuesBook.Sheets[issuesBook.SheetNames[0]], {
    defval: '',
  });
  const demandIssues = issueRecords.filter((row) => row.问题分类 === '缺有效需求');
  assert.equal(demandIssues.length, 2);
  assert.ok(demandIssues.every((row) => row.上游原因组 === causeGroup));
  const groupRecord = issueRecords.find((row) => row.粒度 === '大类需求上游组');
  assert.equal(groupRecord.上游原因组, causeGroup);
  const causes = issueRecords.filter((row) => row.粒度 === '大类需求上游原因');
  assert.equal(
    causes.filter((row) => row.源值与证据.includes('历史源读取拒绝-评估上游原因完整保留')).length,
    1,
  );
  assert.equal(
    causes.filter((row) => row.上游原因组.split('；').includes(causeGroup)).length,
    groupRecord.上游原因数,
  );
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
