import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
import * as XLSX from 'xlsx-republish';
import { mpsComputePlugin } from '../scripts/mps-compute-build.mjs';

test('第6步各产能表与下载把ODM需求单独汇总于表尾，收货与内部排产口径正常', async (t) => {
  const output = await build({
    stdin: {
      resolveDir: process.cwd(),
      contents: `import React from 'react';import {createRoot} from 'react-dom/client';
        import {createEvaluationOverview} from './static/mps/source/evaluation-view.js';
        import {renderTableFooter} from './static/mps/source/report-page.js';
        import {buildMpsWorkflow} from './static/mps/source/workflow-inputs.js';
        import {workflowPerformanceInput} from './tests/helpers/mps-workflow-fixture.mjs';
        const sample=workflowPerformanceInput(3);
        sample.draft.name='ODM验收';
        sample.draft.categoryDemand.forEach(row=>{row.quantity=300});
        sample.draft.products[2]['物料组']='外供组';
        sample.draft.resourceAssignments=sample.draft.resourceAssignments.filter(row=>row.code==='1');
        sample.draft.constraints.turnoverDays[0].days=6.2;
        sample.shipment.rows[0].end=30;
        sample.relations={sources:{tunnels:[],sku_capacity:[],transfers:['0','2'].map(code=>({stat_period:'2026-11',target_base:'甲',material_code:code,transfer_tag:'ODM代工品',transfer_direction:''}))}};
        sample.evaluation.annual={referenceMonth:'2026-12',rows:[{month:'2026-12',base:'甲',code:'0',quantity:60},{month:'2027-01',base:'甲',code:'0',quantity:80},{month:'2026-12',base:'甲',code:'1',quantity:200},{month:'2026-12',base:'甲',code:'2',quantity:15}]};
        const result=buildMpsWorkflow(sample.draft,sample.relations,sample.shipment,sample.evaluation);
        window.downloads=[];
        const View=createEvaluationOverview(React,{Dialog:()=>null,downloadCsv:(name,columns,rows)=>window.downloads.push({name,columns,rows})});
        const h=React.createElement;
        const card=(title,body,actions)=>h('section',null,h('div',null,h('h2',null,title),actions),body);
        const table=(name,columns,rows,_,footer)=>h('div',null,h('table',{'aria-label':name},h('thead',null,h('tr',null,...columns.map((c,i)=>h('th',{key:i},c)))),h('tbody',null,...rows.map((r,i)=>h('tr',{key:i},...r.map((v,j)=>h('td',{key:j},v?.content??v))))),renderTableFooter(h,columns,footer)));
        const root=createRoot(document.getElementById('root'));
        const numberText=(value,percent=false)=>value===null?'待补':new Intl.NumberFormat('zh-CN',{maximumFractionDigits:percent?2:0}).format(percent?value*100:value)+(percent?'%':'');
        window.renderStep=(step,filters={})=>root.render(h(View,{step,draft:sample.draft,currentEvaluation:{at:'验收时间',result},filters:{month:'2026-12',...filters},table,card,numberText,onExecute(){}}));
        window.renderStep('capacity');`,
    },
    plugins: [await mpsComputePlugin(process.env.MPS_MANAGE_SOURCE)],
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
  });
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.route('https://mps-odm.test/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }),
  );
  await page.goto('https://mps-odm.test/');
  await page.addScriptTag({ content: output.outputFiles[0].text });
  for (const [name, demandColumn, expected] of [
    ['所选设备范围汇总', 2, '200'],
    ['设备范围产品占用', 5, '200'],
    ['设备范围明细', 6, '200'],
    ['基地需求与月总产能', 2, '200'],
    ['基地大类RCCP', 2, '200'],
    ['全年月度隧道利用率矩阵', 13, '155'],
  ]) {
    const table = page.getByRole('table', { name, exact: true });
    const footer = table.locator('tfoot tr');
    await expect(footer.getByRole('rowheader', { name: 'ODM外部供应' })).toBeVisible();
    const cells = await footer.locator('th, td').allTextContents();
    assert.equal(cells[demandColumn], expected);
    assert.deepEqual(cells.filter(Boolean), ['ODM外部供应', expected]);
    await expect(table.locator('tbody')).not.toContainText('ODM外部供应');
  }
  await expect(page.getByRole('table', { name: 'ODM需求汇总', exact: true })).toContainText('200');
  await page.getByRole('button', { name: '甲 点心 系列明细' }).click();
  const series = page.getByRole('table', { name: 'RCCP系列明细', exact: true });
  await expect(series.locator('tfoot')).toContainText('200');
  await expect(series.locator('tbody')).not.toContainText('外供组');
  await page.getByLabel('产品查看层级', { exact: true }).selectOption('sku');
  const products = page.getByRole('table', { name: '设备范围产品占用', exact: true });
  await expect(products.locator('tfoot')).toContainText('200');
  await page.getByLabel('设备隧道', { exact: true }).selectOption('R');
  await expect(products.locator('tfoot')).toHaveCount(0);
  await page.getByLabel('设备隧道', { exact: true }).selectOption('');
  await expect(products.locator('tfoot')).toContainText('200');
  await page.evaluate(() => window.renderStep('capacity', { search: '2' }));
  await expect(products.locator('tfoot')).toContainText('100');
  await page.evaluate(() => window.renderStep('capacity'));
  await expect(products.locator('tfoot')).toContainText('200');
  const scopeDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载设备范围与产品占用', exact: true }).click();
  const scopeBook = XLSX.read(await readFile(await (await scopeDownload).path()), {
    type: 'buffer',
  });
  for (const [sheet, label] of [
    ['产品占用', '名称'],
    ['设备范围', '基地'],
  ]) {
    const summary = XLSX.utils.sheet_to_json(scopeBook.Sheets[sheet], { defval: '' }).at(-1);
    assert.equal(summary[label], 'ODM外部供应');
    assert.equal(summary.关联需求吨数, 200);
    assert.equal(summary.隧道利用率, '');
    assert.equal(summary.月产能吨数 ?? summary.范围月产能吨数, '');
  }
  await page.getByRole('button', { name: '导出产能评估报告', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'ODM默认计划到货', exact: true })).toBeVisible();
  await expect(
    page.getByText('ODM默认供给，实际供方待确认', { exact: true }).first(),
  ).toBeVisible();
  const schedules = page.getByRole('table', { name: 'ODM供方SKU月度默认计划' });
  await expect(schedules.getByRole('cell', { name: '90', exact: true }).first()).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出求解结果', exact: true }).click();
  await page.getByRole('button', { name: '导出ODM默认计划到货', exact: true }).click();
  const downloads = await page.evaluate(() => window.downloads);
  const capacityExport = downloads.find((item) => item.name.endsWith('产能评估报告.csv'));
  const exportedOdm = capacityExport.rows.filter((row) => row.基地 === 'ODM外部供应');
  assert.equal(exportedOdm.find((row) => row.月份 === '2026-12').ODM需求吨数, 200);
  assert.ok(exportedOdm.every((row) => row.隧道利用率 == null && row.月产能 == null));
  const workbook = XLSX.read(await readFile(await (await download).path()), { type: 'buffer' });
  const solve = XLSX.utils.sheet_to_json(workbook.Sheets['求解结果'], { defval: '' });
  const row = solve.find((item) => item.月份 === '2026-12' && String(item.产品编码) === '0');
  assert.equal(row.内部实际排产量, 0);
  assert.ok(Math.abs(row.ODM默认计划到货量 - 90) < 1e-8);
  assert.ok(Math.abs(row.实际期末库存 - 20) < 1e-8);
  assert.equal(row.历史源数量, 1);
  assert.equal(row.替换系数, '');
  assert.equal(row.历史合计数量, 1);
  assert.equal(row.自身历史源数量, 1);
  assert.match(row.ODM估算说明, /默认估算/);
  const arrivals = downloads.find((item) => item.name.endsWith('ODM默认计划到货.csv'));
  const receipt = arrivals.rows.filter((item) => item.月份 === '2026-12' && item.产品编码 === '0');
  assert.equal(receipt.length, 1);
  assert.ok(Math.abs(receipt[0]['默认计划到货量（件）'] - 90) < 1e-8);
  assert.match(receipt[0].说明, /未验证/);
  await page.evaluate(() => window.renderStep('report'));
  const balance = page.getByRole('table', { name: '产销存汇总', exact: true });
  await expect(
    balance.getByRole('columnheader', { name: 'ODM默认计划到货量', exact: true }),
  ).toBeVisible();
  const national = balance
    .getByRole('row')
    .filter({ hasText: /2026-12.*全国/ })
    .first();
  await expect(national.locator('td').nth(5)).toHaveText('190');
});
