import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
import { mpsComputePlugin } from '../scripts/mps-compute-build.mjs';

test('ODM页面与CSV同一结果：默认到货90，内部排产0，收货只记录一次并带估算说明', async (t) => {
  const output = await build({
    stdin: {
      resolveDir: process.cwd(),
      contents: `import React from 'react';import {createRoot} from 'react-dom/client';
        import {createEvaluationOverview} from './static/mps/source/evaluation-view.js';
        import {buildMpsWorkflow} from './static/mps/source/workflow-inputs.js';
        import {workflowPerformanceInput} from './tests/helpers/mps-workflow-fixture.mjs';
        const sample=workflowPerformanceInput(1);
        sample.draft.name='ODM验收';
        sample.draft.resourceAssignments=[];
        sample.draft.constraints.safetyDays=[{base:'甲',days:6.2}];
        sample.shipment.rows[0].end=30;
        sample.draft.products[0]['老品编码']='OLD';
        sample.draft.historyAnnual.periods[0].rows[0]['产品编码']='OLD';
        sample.draft.productRaw=[{material_code:'0',target_base:'甲',replacement_material_code:'OLD',replace_num:'2'}];
        sample.relations={sources:{tunnels:[],sku_capacity:[],transfers:[{stat_period:'2026-11',target_base:'甲',material_code:'0',transfer_tag:'ODM代工品',transfer_direction:''}]}};
        const result=buildMpsWorkflow(sample.draft,sample.relations,sample.shipment,sample.evaluation);
        window.downloads=[];
        const View=createEvaluationOverview(React,{Dialog:()=>null,downloadCsv:(name,columns,rows)=>window.downloads.push({name,columns,rows})});
        const h=React.createElement;
        const card=(title,body)=>h('section',null,h('h2',null,title),body);
        const table=(name,columns,rows)=>h('table',{'aria-label':name},h('thead',null,h('tr',null,...columns.map((c,i)=>h('th',{key:i},c)))),h('tbody',null,...rows.map((r,i)=>h('tr',{key:i},...r.map((v,j)=>h('td',{key:j},v?.content??v))))));
        const root=createRoot(document.getElementById('root'));
        const render=step=>root.render(h(View,{step,draft:sample.draft,currentEvaluation:{at:'验收时间',result},filters:{month:'2026-12'},table,card,numberText:value=>value===null?'待补':String(value),onExecute(){}}));
        window.showReport=()=>render('report');render('capacity');`,
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
  await expect(page.getByRole('heading', { name: 'ODM默认计划到货', exact: true })).toBeVisible();
  await expect(page.getByText(/供方真实能力、交期及实际到货尚未验证/).first()).toBeVisible();
  const schedules = page.getByRole('table', { name: 'ODM供方SKU月度默认计划' });
  await expect(schedules.getByRole('cell', { name: '90', exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: '导出求解结果', exact: true }).click();
  await page.getByRole('button', { name: '导出ODM默认计划到货', exact: true }).click();
  const downloads = await page.evaluate(() => window.downloads);
  const solve = downloads.find((item) => item.name.endsWith('求解结果.csv'));
  assert.ok(solve.columns.includes('ODM默认计划到货量'));
  const row = solve.rows.find((item) => item.月份 === '2026-12');
  assert.equal(row.内部实际排产量, 0);
  assert.equal(row.ODM默认计划到货量, 90);
  assert.equal(row.实际期末库存, 20);
  assert.equal(row.历史源数量, 1);
  assert.equal(row.替换系数, 2);
  assert.match(row.历史参考口径, /系数/);
  assert.match(row.ODM估算说明, /默认估算/);
  const arrivals = downloads.find((item) => item.name.endsWith('ODM默认计划到货.csv'));
  assert.equal(arrivals.rows.filter((item) => item.月份 === '2026-12').length, 1);
  assert.equal(arrivals.rows[0]['默认计划到货量（件）'], 90);
  assert.match(arrivals.rows[0].说明, /未验证/);
  await page.evaluate(() => window.showReport());
  await expect(page.locator('.wf-plan-month').first()).toContainText('ODM默认计划到货 90 件');
  await expect(page.locator('.wf-plan-months')).not.toContainText('[object Object]');
});
