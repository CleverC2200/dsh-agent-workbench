import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
import { mpsComputePlugin } from '../scripts/mps-compute-build.mjs';

test('成型机配置经页面装配限制真实求解入口，页面占用与CSV一致且不重复生产量', async (t) => {
  const output = await build({
    stdin: {
      resolveDir: process.cwd(),
      contents: `import React from 'react';import {createRoot} from 'react-dom/client';
        import {createEvaluationOverview} from './static/mps/source/evaluation-view.js';
        import {buildMpsWorkflow} from './static/mps/source/workflow-inputs.js';
        import {workflowPerformanceInput} from './tests/helpers/mps-workflow-fixture.mjs';
        const root=createRoot(document.getElementById('root'));
        window.runForming=(enabled)=>{
        const sample=workflowPerformanceInput(2);
        if(enabled){
          sample.draft.resources.push({id:'F',base:'甲',kind:'forming',name:'已批准成型机',dailyTons:0.4});
          sample.draft.resourceAssignments.push(...['2026-12','2027-01','2027-02'].flatMap(month=>sample.draft.products.map(row=>({month,base:'甲',code:row.产品编码,resourceId:'F',share:1}))));
        }
        const result=buildMpsWorkflow(sample.draft,sample.relations,sample.shipment,sample.evaluation);
        window.downloads=[];window.result=result;
        const View=createEvaluationOverview(React,{Dialog:()=>null,downloadCsv:(name,columns,rows)=>window.downloads.push({name,columns,rows})});
        const h=React.createElement;
        const card=(title,body)=>h('section',null,h('h2',null,title),body);
        const table=(name,columns,rows)=>h('table',{'aria-label':name},h('thead',null,h('tr',null,...columns.map((c,i)=>h('th',{key:i},c)))),h('tbody',null,...rows.map((r,i)=>h('tr',{key:i},...r.map((v,j)=>h('td',{key:j},v?.content??v))))));
        root.render(h(View,{step:'capacity',draft:sample.draft,currentEvaluation:{at:'验收时间',result},filters:{month:'2026-12'},table,card,numberText:value=>value===null?'待补':String(value),onExecute(){}}));
        };window.runForming(true);`,
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
  await page.route('https://mps-forming.test/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }),
  );
  await page.goto('https://mps-forming.test/');
  await page.addScriptTag({ content: output.outputFiles[0].text });
  await expect(page.getByRole('heading', { name: '成型机实际占用', exact: true })).toBeVisible();
  await expect(page.getByRole('table', { name: '成型机实际占用', exact: true })).toContainText(
    '已批准成型机',
  );
  await page.getByRole('button', { name: '导出成型机实际占用', exact: true }).click();
  await page.getByRole('button', { name: '导出求解结果', exact: true }).click();
  const { result, downloads } = await page.evaluate(() => ({
    result: window.result,
    downloads: window.downloads,
  }));
  const first = result.plan.rows.filter((row) => row.month === '2026-12');
  assert.ok(first.every((row) => Math.abs(row.mainPlan - 5) < 1e-6));
  const machines = downloads.find((item) => item.name.endsWith('成型机实际占用.csv'));
  assert.ok(Math.abs(machines.rows.find((row) => row.月份 === '2026-12').实际占用吨数 - 10) < 1e-6);
  assert.ok(result.plan.resourceSchedules.every((row) => row.scheduledTons <= row.capacity));
  const solved = downloads.find((item) => item.name.endsWith('求解结果.csv'));
  assert.ok(
    Math.abs(
      solved.rows
        .filter((row) => row.月份 === '2026-12')
        .reduce((sum, row) => sum + row.内部实际排产量, 0) - 10,
    ) < 1e-6,
  );
  await page.evaluate(() => window.runForming(false));
  await expect(page.getByRole('heading', { name: '成型机实际占用', exact: true })).toHaveCount(0);
  const tunnelOnly = await page.evaluate(() => window.result.plan);
  assert.ok(
    tunnelOnly.rows.every((row) => !row.planMissing.some((reason) => /成型机/.test(reason))),
  );
  assert.ok(
    Math.abs(
      tunnelOnly.rows
        .filter((row) => row.month === '2026-12')
        .reduce((sum, row) => sum + row.scheduledTons, 0) - 50,
    ) < 1e-6,
  );
});
