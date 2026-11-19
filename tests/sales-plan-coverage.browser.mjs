import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
import { readFile } from './helpers/prepared-assets.mjs';
import * as XLSX from 'xlsx-republish';

const bundle = await build({
  stdin: {
    resolveDir: process.cwd(),
    loader: 'tsx',
    contents: `
import React,{useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import i18next from 'i18next';
import zh from './src/workbench/original/zh-CN.json';
import {RegionalApprovalResubmitDialog} from './src/workbench/original/workbenches/regionalApproval/RegionalApprovalResubmitDialog.tsx';
import Workbench from './src/workbench/original/workbenches/regionalApproval/RegionalApprovalWorkbench.tsx';
import {WorkbenchHostProvider} from './src/workbench/original/bridge.ts';
const i18n=i18next.createInstance();
await i18n.init({lng:'zh-CN',resources:{'zh-CN':{translation:{common:zh}}},interpolation:{escapeValue:false}});
const rowCount=Number(new URL(location.href).searchParams.get('fixtureRows')??3);
const rows=Array.from({length:rowCount},(_,index)=>index+1).map(n=>({planId:'p'+n,versionId:'v'+n,seq:1,periodId:'period',planTypeCode:'Y',orderType:'M',dealerCode:'d'+n,dealerName:'客户'+n,orgCode:'org'+n,orgName:'销售组'+n,areaCode:'area'+n,areaName:'大区'+n,provinceCode:'province'+n,provinceName:'省区'+n,baseName:'基地'+n,status:1,updatedAt:'2026-10-'+String(31-n).padStart(2,'0'),currentQty:'20',currentAmount:'200',targetQty:'0',targetAmount:'400',skuCount:1}));
window.coverageCalls={sku:[],detail:[],draft:0,draftWrite:0,model:0,write:0};
window.exportBehavior='normal';
window.fixtureRows=rows;
window.localDrafts=JSON.parse(localStorage.getItem('coverage-host-drafts')??'{}');
window.exportReads=[];
window.exportReleases=[];
const sku=(versionId)=>({id:'s'+versionId,versionId,skuCode:'sku'+versionId,productCategName:'汤圆',skuName:'汤圆',qty:'20',amt:'200',baseQty:'10',amtBase:'100',price:'10',regionConfirmedQty:null,regionConfirmedAmount:null,provinceConfirmedQty:null,provinceConfirmedAmount:null,areaConfirmedQty:null,areaConfirmedAmount:null,categoryConfirmedQty:null,categoryConfirmedAmount:null});
const forbid=async()=>{window.coverageCalls.write++;throw Error('fixture write forbidden')};
const noop=()=>{};
function App(){
 const [mode,setMode]=useState('limited');
 const [submissionItems,setSubmissionItems]=useState();
 const [submissionRefreshRequest,setSubmissionRefreshRequest]=useState();
 const salesPlan=useMemo(()=>({
  periods:{invoke:async()=>({records:[{periodId:'period',periodMonth:'2026-10',planTypeCode:'Y',status:'OPEN'}],total:1,size:100,current:1,pages:1})},
  list:{invoke:async(q)=>{const records=q?.orderType!=='Z'&&(q?.status===undefined||q.status===1)?rows:[];return {records,total:records.length,size:q?.pageSize??200,current:q?.pageNo??1,pages:records.length?1:0}}},
  detail:{invoke:async({planId})=>{window.coverageCalls.detail.push(planId);const versionId=rows.find(x=>x.planId===planId).versionId;return {currentVersion:{...rows.find(x=>x.planId===planId),id:versionId,effective:true},skus:[sku(versionId)],versions:[],logs:[]}}},
  draft:{invoke:async(query)=>{window.coverageCalls.draft++;if(query.draft){window.coverageCalls.draftWrite++;window.localDrafts[query.versionId]=query.draft;}return {draft:window.localDrafts[query.versionId]??null}}},
  versions:{invoke:async()=>[]},logs:{invoke:async()=>[]},compare:{invoke:async()=>[]},
  skuQuotes:{invoke:async({skuCodes})=>skuCodes.filter(code=>code==='10004778').map(skuCode=>({skuCode,skuName:'新增测试商品',productCategName:'汤圆',price:localStorage.getItem('coverage-latest-price')??'295.00'}))},
  reportFacts:{invoke:async({planId,versionId})=>({planId,versionId,month:'2026-10',rows:window.exportBehavior==='unread-facts'?[]:[sku(versionId).skuCode,...(window.exportBehavior==='added-at-province'?['10004778']:[])].map(skuCode=>({skuCode,grading:'FACTORY_WH',inventoryOrganization:'总部库存',customerType:'经销商',customerGroup:'组',materialGroupCode:'0001',materialGroupName:'组'}))})},
  versionSkus:{invoke:async({versionId,signal})=>{
   signal?.throwIfAborted();window.coverageCalls.sku.push({versionId,mode});
   const behavior=window.exportBehavior;
   if(behavior!=='normal'){
    const read={versionId,behavior,aborted:false};window.exportReads.push(read);
    signal?.addEventListener('abort',()=>{read.aborted=true},{once:true});
    if(behavior==='held')return new Promise(resolve=>window.exportReleases.push(()=>resolve([sku(versionId)])));
    if(behavior==='partial'&&versionId==='v3')return [];
    if(behavior==='foreign'&&versionId==='v3')return [sku('foreign-version')];
    if(behavior==='failed'&&versionId==='v3')throw Error('fixture detail request failed');
    if(behavior==='added-at-province')return [{...sku(versionId),regionConfirmedQty:'20',regionConfirmedAmount:'200',provinceConfirmedQty:'20',provinceConfirmedAmount:'200'},{...sku(versionId),id:'added-'+versionId,skuCode:'10004778',baseQty:'0',corrBaseQty:null,qty:'0',amtBase:'0',amt:'0',price:'295.00',provinceConfirmedQty:'12',provinceConfirmedAmount:'3540.00'}];
    if(behavior==='precise')return [{...sku(versionId),qty:'9007199254740993.125',amt:'123456789012345.6789'}];
   }
   if(mode==='pending')return new Promise((resolve,reject)=>{window.rejectPending=()=>reject(Error('late cancelled read failure'))});
   if(mode==='limited'&&versionId==='v3')throw Object.assign(Error('本次销售只读额度已用完，未发出额外请求'),{code:'GEA_SALES_READONLY_LIMIT'});
   return [sku(versionId)];
  }},
  action:{invoke:forbid},submit:{invoke:forbid}
 }),[mode]);
 const host=useMemo(()=>({salesPlan,modelInference:{invoke:async()=>{window.coverageCalls.model++;throw Error('fixture model forbidden')}}}),[salesPlan]);
 return <><button onClick={()=>setMode('complete')}>切换到完整读取的测试上下文</button><button onClick={()=>setMode('pending')}>切换到等待中的测试上下文</button><button onClick={()=>{rows[0].versionId='v1-new'}}>模拟后台计划换版</button><WorkbenchHostProvider value={host}><Workbench submissionRefreshRequest={submissionRefreshRequest} onSubmitBatch={setSubmissionItems} stateScope="coverage-test" t={i18n.t.bind(i18n)} onContextChange={noop} approvalStages={['region']} liveActionsEnabled={new URL(location.href).searchParams.has('fixtureAccess')}/></WorkbenchHostProvider>{submissionItems&&<RegionalApprovalResubmitDialog items={submissionItems} client={{...salesPlan,currentUser:{invoke:async()=>({id:'test',username:'test'})}}} connected t={i18n.t.bind(i18n)} onClose={()=>setSubmissionItems(undefined)} onRefresh={ids=>{setSubmissionItems(undefined);setSubmissionRefreshRequest(ids)}}/>}</>;
}
createRoot(document.getElementById('root')).render(<App/>);
`,
  },
  outfile: '/fixture/app.js',
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  define: { 'process.env.NODE_ENV': '"test"' },
  loader: { '.svg': 'dataurl', '.png': 'dataurl' },
});

async function openWorkbench(t, fixtureRows = 3, fixtureAccess = false) {
  const assets = new Map(bundle.outputFiles.map((x) => [x.path.split(/[\\/]/).at(-1), x.text]));
  const server = createServer((req, res) => {
    const name = req.url.slice(1);
    if (assets.has(name)) {
      res.setHeader('content-type', name.endsWith('.css') ? 'text/css' : 'text/javascript');
      res.end(assets.get(name));
    } else {
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.end(
        '<meta charset="utf-8"><link rel="stylesheet" href="/app.css"><div id="root"></div><script type="module" src="/app.js"></script>',
      );
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  let browser;
  t.after(async () => {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  });
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.GEA_TEST_CHROMIUM,
  });
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  let externalRequests = 0;
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.route(/^https?:\/\//, (route) => {
    if (new URL(route.request().url()).hostname !== '127.0.0.1') {
      externalRequests++;
      return route.abort();
    }
    return route.continue();
  });
  await page.goto(
    `http://127.0.0.1:${server.address().port}?fixtureRows=${fixtureRows}${fixtureAccess ? '&fixtureAccess=1' : ''}`,
  );
  return { page, pageErrors, externalRequests: () => externalRequests };
}

test(
  'incomplete automatic SKU reads remain unknown, show a failure and recover in a new context',
  { timeout: 30000 },
  async (t) => {
    const { page, pageErrors, externalRequests } = await openWorkbench(t);
    await expect.poll(() => page.evaluate(() => window.coverageCalls?.sku.length ?? 0)).toBe(3);
    const monthly = page.locator('[data-testid^="regional-approval-month-plan-"]').first();
    await expect(monthly).toHaveText('——');
    await expect(page.getByTestId('regional-approval-sku-coverage-error')).toContainText(
      '月计划明细未完整读取',
    );
    const totals = page.getByRole('region', { name: '当前页明细汇总', exact: true });
    await expect(totals.locator('strong').nth(1)).toHaveText('—');
    await page.getByRole('button', { name: '切换到完整读取的测试上下文' }).click();
    await expect(monthly).toContainText('¥200');
    await expect(monthly).toContainText('20 件');
    await expect(page.getByTestId('regional-approval-sku-coverage-error')).toHaveCount(0);
    await page.getByRole('button', { name: '切换到等待中的测试上下文' }).click();
    await expect
      .poll(() => page.evaluate(() => window.coverageCalls.sku.some((x) => x.mode === 'pending')))
      .toBe(true);
    await page.getByRole('button', { name: '切换到完整读取的测试上下文' }).click();
    await page.evaluate(() => window.rejectPending());
    await expect(monthly).toContainText('¥200');
    await expect(page.getByTestId('regional-approval-sku-coverage-error')).toHaveCount(0);
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(
      await page.evaluate(() => ({
        model: window.coverageCalls.model,
        write: window.coverageCalls.write,
      })),
      { model: 0, write: 0 },
    );
    assert.equal(externalRequests(), 0);
  },
);

test(
  'stored monthly draft contributes to collapsed summaries after a fresh mount and refresh without saving',
  { timeout: 30000 },
  async (t) => {
    const { page, pageErrors, externalRequests } = await openWorkbench(t, 3, true);
    await page.evaluate(() => {
      localStorage.setItem(
        'coverage-host-drafts',
        JSON.stringify({
          v1: {
            planId: 'p1',
            versionId: 'v1',
            status: 1,
            role: 'region',
            sourceSnapshot: 'fixture',
            adjustments: [{ skuCode: 'skuv1', adjustQty: '1' }],
            remark: '',
          },
        }),
      );
    });
    await page.reload();
    await page.getByRole('button', { name: '切换到完整读取的测试上下文' }).click();
    const monthly = page.locator('[data-testid^="regional-approval-month-plan-"]').first();
    const totals = page.getByRole('region', { name: '当前页明细汇总', exact: true });
    await expect(monthly).toContainText('¥210');
    await expect(monthly).toContainText('21 件');
    await expect(totals.locator('strong').nth(1)).toHaveText('¥610');
    await expect(page.locator('section[aria-label="SKU 编码 / 物料描述"]')).toHaveCount(0);
    await page.getByRole('switch', { name: '品类维度' }).click();
    const category = page.getByRole('button', { name: '汤圆品类', exact: true }).first();
    await expect(category.locator('xpath=ancestor::tr')).toContainText('¥210');
    await page.getByRole('button', { name: '刷新数据', exact: true }).click();
    await expect(monthly).toContainText('¥210');
    await expect(totals.locator('strong').nth(1)).toHaveText('¥610');
    assert.equal(await page.evaluate(() => window.coverageCalls.draftWrite), 0);
    assert.equal(await page.evaluate(() => window.coverageCalls.write), 0);
    assert.deepEqual(pageErrors, []);
    assert.equal(externalRequests(), 0);
  },
);

test(
  'normal readable detail opens its local draft and viewing or collapsing never saves it',
  { timeout: 30000 },
  async (t) => {
    const { page, pageErrors, externalRequests } = await openWorkbench(t, 3, true);
    await page.getByRole('button', { name: '切换到完整读取的测试上下文' }).click();
    await expect(
      page.locator('[data-testid^="regional-approval-month-plan-"]').first(),
    ).toContainText('¥200');
    await expect
      .poll(() => page.evaluate(() => window.coverageCalls.detail.includes('p1')))
      .toBe(true);
    const open = page.getByRole('button', { name: /^打开 .* 调整明细$/ }).first();
    const draftReads = await page.evaluate(() => window.coverageCalls.draft);
    assert.ok(draftReads >= 3);
    await open.click();
    const detail = page.locator('section[aria-label="SKU 编码 / 物料描述"]');
    await expect(detail).toContainText('skuv1');
    await expect(detail.locator('input[type="number"]')).toHaveCount(1);
    await expect.poll(() => page.evaluate(() => window.coverageCalls.draft)).toBe(draftReads + 1);
    await open.click();
    await expect(detail).toHaveCount(0);
    assert.deepEqual(pageErrors, []);
    assert.equal(externalRequests(), 0);
    assert.deepEqual(
      await page.evaluate(() => ({
        model: window.coverageCalls.model,
        write: window.coverageCalls.write,
      })),
      { model: 0, write: 0 },
    );
  },
);

test(
  'unified XLSX downloads all 23 readable plans and retains exact large values',
  { timeout: 30000 },
  async (t) => {
    const { page, pageErrors, externalRequests } = await openWorkbench(t, 23);
    await page.getByRole('button', { name: '切换到完整读取的测试上下文' }).click();
    await expect(
      page.locator('[data-testid^="regional-approval-month-plan-"]').first(),
    ).toContainText('¥200');
    await page.evaluate(() => {
      window.exportBehavior = 'precise';
    });
    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: '导出月度计划报表', exact: true }).click();
    const download = await downloaded;
    assert.equal(download.suggestedFilename(), '月度计划报表.xlsx');
    const workbook = XLSX.read(await readFile(await download.path()), { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets['月度计划'], {
      header: 1,
      defval: null,
    });
    assert.equal(rows.length, 24);
    assert.equal(rows[0].length, 24);
    assert.deepEqual(workbook.SheetNames, ['月度计划']);
    const exportedIds = Array.from({ length: 23 }, (_, index) => 'd' + (index + 1));
    assert.deepEqual(
      rows
        .slice(1)
        .map((row) => row[8])
        .sort(),
      [...exportedIds].sort(),
    );
    for (const row of rows.slice(1)) {
      assert.equal(row[17], '2026-10');
      assert.deepEqual(row.slice(18), [
        '9007199254740993',
        0,
        0,
        '9007199254740993',
        '90071992547409930.00',
        '90071992547409930.00',
      ]);
    }
    await expect(
      page.getByText('已导出全部可读月份，共 23 条客户商品计划。', { exact: true }),
    ).toBeVisible();
    assert.deepEqual(
      (await page.evaluate(() => window.exportReads.map((x) => x.versionId))).sort(),
      exportedIds.map((id) => id.replace('d', 'v')).sort(),
    );
    assert.deepEqual(pageErrors, []);
    assert.equal(externalRequests(), 0);
    assert.deepEqual(
      await page.evaluate(() => ({
        model: window.coverageCalls.model,
        write: window.coverageCalls.write,
      })),
      { model: 0, write: 0 },
    );
  },
);

test(
  'actual XLSX download includes an added SKU without prior node amounts',
  { timeout: 30000 },
  async (t) => {
    const { page, pageErrors, externalRequests } = await openWorkbench(t);
    await page.getByRole('button', { name: '切换到完整读取的测试上下文' }).waitFor();
    await page.evaluate(() => {
      window.exportBehavior = 'added-at-province';
      window.fixtureRows.forEach((row) => {
        row.skuCount = 2;
      });
    });
    await page.getByRole('button', { name: '切换到完整读取的测试上下文' }).click();
    await expect(
      page.locator('[data-testid^="regional-approval-month-plan-"]').first(),
    ).toContainText('¥200');
    const downloaded = page.waitForEvent('download', { timeout: 5000 });
    await page.getByRole('button', { name: '导出月度计划报表', exact: true }).click();
    const download = await downloaded;
    const workbook = XLSX.read(await readFile(await download.path()), { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets['月度计划'], {
      header: 1,
      defval: null,
    });
    assert.equal(rows.length, 7);
    const added = rows.slice(1).filter((row) => row[13] === '10004778');
    assert.equal(added.length, 3);
    for (const row of added) assert.deepEqual(row.slice(18), [12, 0, 0, 12, 3540, 3540]);
    assert.deepEqual(pageErrors, []);
    assert.equal(externalRequests(), 0);
    assert.equal(await page.evaluate(() => window.coverageCalls.write), 0);
  },
);

test(
  'context cancellation and incomplete or foreign-version SKU reads produce no XLSX file',
  { timeout: 30000 },
  async (t) => {
    const { page, pageErrors, externalRequests } = await openWorkbench(t);
    const downloads = [];
    page.on('download', (download) => downloads.push(download.suggestedFilename()));
    await page.getByRole('button', { name: '切换到完整读取的测试上下文' }).click();
    await expect(
      page.locator('[data-testid^="regional-approval-month-plan-"]').first(),
    ).toContainText('¥200');
    await page.evaluate(() => {
      window.exportBehavior = 'held';
    });
    await page.getByRole('button', { name: '导出月度计划报表', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.exportReads.length)).toBe(3);
    await page.evaluate(() => {
      window.exportBehavior = 'normal';
    });
    await page.getByRole('button', { name: '切换到等待中的测试上下文' }).click();
    await expect
      .poll(() => page.evaluate(() => window.exportReads.every((x) => x.aborted)))
      .toBe(true);
    await page.evaluate(() => window.exportReleases.forEach((release) => release()));
    await expect(page.getByRole('button', { name: '导出月度计划报表', exact: true })).toBeEnabled();
    assert.deepEqual(downloads, []);
    await page.getByRole('button', { name: '切换到完整读取的测试上下文' }).click();
    await expect(
      page.locator('[data-testid^="regional-approval-month-plan-"]').first(),
    ).toContainText('¥200');
    for (const behavior of ['partial', 'foreign', 'failed', 'unread-facts']) {
      await page.evaluate((behavior) => {
        window.exportBehavior = behavior;
      }, behavior);
      await page.getByRole('button', { name: '导出月度计划报表', exact: true }).click();
      await expect(
        page.getByText('月度计划报表读取失败、数据不完整或版本已变化，请重试；未产生文件。', {
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: '导出月度计划报表', exact: true }),
      ).toBeEnabled();
      await expect
        .poll(() =>
          page.evaluate(
            (behavior) => window.exportReads.filter((x) => x.behavior === behavior).length,
            behavior,
          ),
        )
        .toBe(3);
      assert.deepEqual(downloads, []);
    }
    assert.deepEqual(pageErrors, []);
    assert.equal(externalRequests(), 0);
    assert.deepEqual(
      await page.evaluate(() => ({
        model: window.coverageCalls.model,
        write: window.coverageCalls.write,
      })),
      { model: 0, write: 0 },
    );
  },
);

test(
  'the shipped dashboard, filter toggle, progress and row selection work through Host responses',
  { timeout: 30000 },
  async (t) => {
    const { page, pageErrors, externalRequests } = await openWorkbench(t, 3, true);
    await page.getByRole('button', { name: '切换到完整读取的测试上下文' }).click();
    await expect(page.getByRole('region', { name: '当前页明细汇总', exact: true })).toContainText(
      '¥600',
    );
    const filters = page.getByRole('button', { name: '筛选条件', exact: true });
    await expect(filters).toHaveAttribute('aria-expanded', 'false');
    await filters.click();
    await expect(filters).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByLabel('大区', { exact: true })).toBeVisible();
    await filters.click();
    await expect(filters).toHaveAttribute('aria-expanded', 'false');
    await page.getByRole('button', { name: '查看提报进度', exact: true }).click();
    await expect(page.getByTestId('regional-approval-progress-results')).toBeVisible();
    await page.getByRole('button', { name: '关闭', exact: true }).last().click();
    const checks = page.locator('tbody input[type="checkbox"]:not(:disabled)');
    await expect(checks.first()).toBeEnabled();
    await checks.first().check();
    await expect(checks.first()).toBeChecked();
    await expect(page.getByRole('button', { name: /通过/ }).first()).toBeEnabled();
    assert.deepEqual(
      await page.evaluate(() => ({
        model: window.coverageCalls.model,
        write: window.coverageCalls.write,
      })),
      { model: 0, write: 0 },
    );
    assert.deepEqual(pageErrors, []);
    assert.equal(externalRequests(), 0);
  },
);

test(
  'submission recovery refreshes the real queue and clears the old selection and quantities',
  { timeout: 30000 },
  async (t) => {
    const { page, pageErrors } = await openWorkbench(t, 2, true);
    await page.getByRole('button', { name: '切换到完整读取的测试上下文' }).click();
    const open = page.getByRole('button', { name: /^打开 .* 调整明细$/ }).first();
    await open.click();
    const input = page
      .locator('section[aria-label="SKU 编码 / 物料描述"] input[type="number"]')
      .first();
    await expect(input).toHaveValue('20');
    await input.fill('15');
    await input.blur();
    await expect.poll(() => page.evaluate(() => Object.keys(window.localDrafts).length)).toBe(1);
    const savedDraft = await page.evaluate(() => window.localDrafts.v1);
    for (const checkbox of await page.locator('input[type="checkbox"]').all())
      await checkbox.check();
    await page.getByRole('button', { name: '模拟后台计划换版' }).click();
    await page.getByRole('button', { name: '通过', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(
      dialog.getByText('计划版本已变化：选中版本 v1，当前版本 v1-new', { exact: false }),
    ).toBeVisible();
    await dialog.getByRole('button', { name: '刷新列表并重新选择', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('input[type="checkbox"]:checked')).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(() => window.coverageCalls.sku.some((x) => x.versionId === 'v1-new')),
      )
      .toBe(true);
    const detail = page.locator('section[aria-label="SKU 编码 / 物料描述"]');
    if ((await detail.count()) === 0) await open.click();
    await expect(detail.locator('input[type="number"]').first()).toHaveValue('20');
    assert.deepEqual(await page.evaluate(() => window.localDrafts.v1), savedDraft);
    assert.equal(await page.evaluate(() => window.coverageCalls.write), 0);
    assert.deepEqual(pageErrors, []);
  },
);

test(
  'customer detail looks up a sellable SKU and saves its quantity in the approval draft',
  { timeout: 40000 },
  async (t) => {
    const { page, pageErrors, externalRequests } = await openWorkbench(t, 3, true);
    await page.getByRole('button', { name: '切换到完整读取的测试上下文' }).click();
    await page.getByRole('tab', { name: '按客户', exact: true }).click();
    await page
      .getByRole('button', { name: /打开 客户1/ })
      .first()
      .click();
    const editor = page.getByRole('region', { name: '新增 SKU' });
    await editor.getByLabel('SKU 编码').fill('10004778');
    await editor.getByLabel('确认数量').fill('12');
    await editor.getByRole('button', { name: '新增 SKU' }).click();
    await expect(editor.getByText('10004778 新增测试商品')).toBeVisible();
    await expect(editor.getByText('295.00', { exact: true })).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => window.localDrafts.v1?.addedSkus))
      .toEqual([{ skuCode: '10004778', qty: '12' }]);
    await expect(page.getByTestId('regional-approval-month-plan-p1')).toContainText('¥3,740');
    await page.evaluate(() => {
      localStorage.setItem('coverage-host-drafts', JSON.stringify(window.localDrafts));
      localStorage.setItem('coverage-latest-price', '300.00');
    });
    await page.reload();
    await page.getByRole('button', { name: '切换到完整读取的测试上下文' }).click();
    await page.getByRole('tab', { name: '按客户', exact: true }).click();
    await expect(page.getByTestId('regional-approval-month-plan-p1')).toContainText('¥3,800');
    assert.equal(await page.evaluate(() => window.coverageCalls.write), 0);
    assert.equal(externalRequests(), 0);
    assert.deepEqual(pageErrors, []);
  },
);
