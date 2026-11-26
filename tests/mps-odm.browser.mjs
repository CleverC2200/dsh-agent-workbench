import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
import * as XLSX from 'xlsx-republish';
import { mpsComputePlugin } from '../scripts/mps-compute-build.mjs';

test('ODM页面与导出结果一致：默认到货90，内部排产0，收货只记录一次并带估算说明', async (t) => {
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
        sample.draft.constraints.turnoverDays=[{base:'甲',code:'0',days:6.2}];
        sample.shipment.rows[0].end=30;
        sample.relations={sources:{tunnels:[],sku_capacity:[],transfers:[{stat_period:'2026-11',target_base:'甲',material_code:'0',transfer_tag:'ODM代工品',transfer_direction:''}]}};
        const result=buildMpsWorkflow(sample.draft,sample.relations,sample.shipment,sample.evaluation);
        window.downloads=[];
        const View=createEvaluationOverview(React,{Dialog:()=>null,downloadCsv:(name,columns,rows)=>window.downloads.push({name,columns,rows})});
        const h=React.createElement;
        const card=(title,body,actions)=>h('section',null,h('div',null,h('h2',null,title),actions),body);
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
  await expect(
    page.getByText('ODM默认供给，实际供方待确认', { exact: true }).first(),
  ).toBeVisible();
  const schedules = page.getByRole('table', { name: 'ODM供方SKU月度默认计划' });
  await expect(schedules.getByRole('cell', { name: '90', exact: true }).first()).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出求解结果', exact: true }).click();
  await page.getByRole('button', { name: '导出ODM默认计划到货', exact: true }).click();
  const downloads = await page.evaluate(() => window.downloads);
  const workbook = XLSX.read(await readFile(await (await download).path()), { type: 'buffer' });
  const solve = XLSX.utils.sheet_to_json(workbook.Sheets['求解结果'], { defval: '' });
  const row = solve.find((item) => item.月份 === '2026-12');
  assert.equal(row.内部实际排产量, 0);
  assert.equal(row.ODM默认计划到货量, 90);
  assert.equal(row.实际期末库存, 20);
  assert.equal(row.历史源数量, 1);
  assert.equal(row.替换系数, '');
  assert.equal(row.历史合计数量, 1);
  assert.equal(row.自身历史源数量, 1);
  assert.match(row.ODM估算说明, /默认估算/);
  const arrivals = downloads.find((item) => item.name.endsWith('ODM默认计划到货.csv'));
  assert.equal(arrivals.rows.filter((item) => item.月份 === '2026-12').length, 1);
  assert.equal(arrivals.rows[0]['默认计划到货量（件）'], 90);
  assert.match(arrivals.rows[0].说明, /未验证/);
  await page.evaluate(() => window.showReport());
  const balance = page.getByRole('table', { name: '产销存汇总', exact: true });
  await expect(
    balance.getByRole('columnheader', { name: 'ODM默认计划到货量', exact: true }),
  ).toBeVisible();
  const national = balance
    .getByRole('row')
    .filter({ hasText: /2026-12.*全国/ })
    .first();
  await expect(national.locator('td').nth(5)).toHaveText('90');
});
