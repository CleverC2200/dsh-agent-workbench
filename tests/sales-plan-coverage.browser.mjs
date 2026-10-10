import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import * as XLSX from 'xlsx-republish';

// Exercise the actual workbench effects, monthly cells and visible failure feedback.
// This fixture has no GEA/Core runtime, credentials, model or write transport.
const bundle = await build({
  stdin: {
    resolveDir: process.cwd(),
    loader: 'tsx',
    contents: `
import React,{useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import i18next from 'i18next';
import zh from './src/workbench/original/zh-CN.json';
import Workbench from './src/workbench/original/workbenches/regionalApproval/RegionalApprovalWorkbench.tsx';
import {WorkbenchHostProvider} from './src/workbench/original/bridge.ts';
const i18n=i18next.createInstance();
await i18n.init({lng:'zh-CN',resources:{'zh-CN':{translation:{common:zh}}},interpolation:{escapeValue:false}});
const rowCount=Number(new URL(location.href).searchParams.get('fixtureRows')??3);
const rows=Array.from({length:rowCount},(_,index)=>index+1).map(n=>({planId:'p'+n,versionId:'v'+n,seq:1,periodId:'period',planTypeCode:'Y',orderType:'M',dealerCode:'d'+n,orgCode:'org'+n,orgName:'销售组'+n,areaCode:'area'+n,areaName:'大区'+n,provinceCode:'province'+n,provinceName:'省区'+n,baseName:'基地'+n,status:1,updatedAt:'2026-10-'+String(31-n).padStart(2,'0'),currentQty:'20',currentAmount:'200',targetQty:'0',targetAmount:'400',skuCount:1}));
window.coverageCalls={sku:[],detail:[],draft:0,model:0,write:0};
window.exportBehavior='normal';
window.exportReads=[];
window.exportReleases=[];
const sku=(versionId)=>({id:'s'+versionId,versionId,skuCode:'sku'+versionId,productCategName:'汤圆',qty:'20',amt:'200',baseQty:'10',amtBase:'100',price:'10'});
const forbid=async()=>{window.coverageCalls.write++;throw Error('fixture write forbidden')};
const noop=()=>{};
function App(){
 const [mode,setMode]=useState('limited');
 const salesPlan=useMemo(()=>({
  periods:{invoke:async()=>({records:[{periodId:'period',periodMonth:'2026-10',planTypeCode:'Y',status:'OPEN'}],total:1,size:100,current:1,pages:1})},
  list:{invoke:async(q)=>{const records=q?.status===undefined||q.status===1?rows:[];return {records,total:records.length,size:q?.pageSize??200,current:q?.pageNo??1,pages:records.length?1:0}}},
  detail:{invoke:async({planId})=>{window.coverageCalls.detail.push(planId);const versionId=planId.replace('p','v');return {currentVersion:{...rows.find(x=>x.planId===planId),id:versionId,effective:true},skus:[sku(versionId)],versions:[],logs:[]}}},
  draft:{invoke:async(query)=>{window.coverageCalls.draft++;if(query.draft)return forbid();return {draft:null}}},
  versions:{invoke:async()=>[]},logs:{invoke:async()=>[]},compare:{invoke:async()=>[]},
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
    if(behavior==='precise')return [{...sku(versionId),qty:'9007199254740993.125',amt:'123456789012345.6789'}];
   }
   if(mode==='pending')return new Promise((resolve,reject)=>{window.rejectPending=()=>reject(Error('late cancelled read failure'))});
   if(mode==='limited'&&versionId==='v3')throw Object.assign(Error('本次销售只读额度已用完，未发出额外请求'),{code:'GEA_SALES_READONLY_LIMIT'});
   return [sku(versionId)];
  }},
  action:{invoke:forbid},submit:{invoke:forbid}
 }),[mode]);
 const host=useMemo(()=>({salesPlan,modelInference:{invoke:async()=>{window.coverageCalls.model++;throw Error('fixture model forbidden')}}}),[salesPlan]);
 return <><button onClick={()=>setMode('complete')}>切换到完整读取的测试上下文</button><button onClick={()=>setMode('pending')}>切换到等待中的测试上下文</button><WorkbenchHostProvider value={host}><Workbench stateScope="coverage-test" t={i18n.t.bind(i18n)} onContextChange={noop} queryClient={salesPlan} detailClient={salesPlan} liveActionsEnabled={new URL(location.href).searchParams.has('fixtureAccess')}/></WorkbenchHostProvider></>;
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
  const assets = new Map(bundle.outputFiles.map((x) => [x.path.split('/').at(-1), x.text]));
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
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
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
    await expect(totals).toContainText('¥600');
    await page.getByRole('button', { name: '切换到完整读取的测试上下文' }).click();
    await expect(monthly).toContainText('¥100');
    await expect(monthly).toContainText('10 件');
    await expect(page.getByTestId('regional-approval-sku-coverage-error')).toHaveCount(0);
    await page.getByRole('button', { name: '切换到等待中的测试上下文' }).click();
    await expect
      .poll(() => page.evaluate(() => window.coverageCalls.sku.some((x) => x.mode === 'pending')))
      .toBe(true);
    await page.getByRole('button', { name: '切换到完整读取的测试上下文' }).click();
    await page.evaluate(() => window.rejectPending());
    await expect(monthly).toContainText('¥100');
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
  'normal readable detail opens its local draft and viewing or collapsing never saves it',
  { timeout: 30000 },
  async (t) => {
    const { page, pageErrors, externalRequests } = await openWorkbench(t, 3, true);
    await page.getByRole('button', { name: '切换到完整读取的测试上下文' }).click();
    await expect(
      page.locator('[data-testid^="regional-approval-month-plan-"]').first(),
    ).toContainText('¥100');
    await expect
      .poll(() => page.evaluate(() => window.coverageCalls.detail.includes('p1')))
      .toBe(true);
    const open = page.getByRole('button', { name: /^打开 .* 调整明细$/ }).first();
    await open.click();
    const detail = page.locator('section[aria-label="SKU 编码 / 物料描述"]');
    await expect(detail).toContainText('skuv1');
    await expect(detail.locator('input[type="number"]')).toHaveCount(1);
    await expect.poll(() => page.evaluate(() => window.coverageCalls.draft)).toBe(1);
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
  'actual current-page XLSX download preserves exact decimals and reports its scope',
  { timeout: 30000 },
  async (t) => {
    const { page, pageErrors, externalRequests } = await openWorkbench(t, 23);
    await page.getByRole('button', { name: '切换到完整读取的测试上下文' }).click();
    await expect(
      page.locator('[data-testid^="regional-approval-month-plan-"]').first(),
    ).toContainText('¥100');
    await page.evaluate(() => {
      window.exportBehavior = 'precise';
    });
    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: '导出当前页', exact: true }).click();
    const download = await downloaded;
    assert.match(download.suggestedFilename(), /^sales-plan-approval-2026-10-.*-page-1.xlsx$/);
    const workbook = XLSX.read(await readFile(await download.path()), { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets['当前页计划'], {
      header: 1,
      defval: null,
    });
    assert.equal(rows.length, 21);
    const exportedIds = Array.from({ length: 20 }, (_, index) => 'p' + (index + 1));
    assert.deepEqual(
      rows.slice(1).map((row) => row[0]),
      exportedIds,
    );
    for (const row of rows.slice(1)) {
      assert.equal(row[17], '9007199254740993.125');
      assert.equal(row[18], '123456789012345.6789');
      assert.deepEqual(row.slice(19, 27), Array(8).fill(null));
    }
    const scope = Object.fromEntries(
      XLSX.utils.sheet_to_json(workbook.Sheets['导出说明'], { header: 1 }),
    );
    assert.equal(scope['导出范围'], '仅当前页');
    assert.equal(scope['计划月份'], '2026-10');
    assert.equal(scope['数据版本'], '当前有效版本');
    assert.equal(scope['页码'], 1);
    assert.equal(scope['每页条数'], 20);
    assert.equal(scope['导出条数'], 20);
    assert.equal(scope['筛选结果总条数'], 23);
    await expect(page.getByText('已导出当前页 20 条 GEA 队列数据', { exact: true })).toBeVisible();
    assert.deepEqual(
      await page.evaluate(() => window.exportReads.map((x) => x.versionId)),
      exportedIds.map((id) => id.replace('p', 'v')),
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
  'context cancellation and incomplete or foreign-version SKU reads produce no XLSX file',
  { timeout: 30000 },
  async (t) => {
    const { page, pageErrors, externalRequests } = await openWorkbench(t);
    const downloads = [];
    page.on('download', (download) => downloads.push(download.suggestedFilename()));
    await page.getByRole('button', { name: '切换到完整读取的测试上下文' }).click();
    await expect(
      page.locator('[data-testid^="regional-approval-month-plan-"]').first(),
    ).toContainText('¥100');
    await page.evaluate(() => {
      window.exportBehavior = 'held';
    });
    await page.getByRole('button', { name: '导出当前页', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.exportReads.length)).toBe(3);
    await page.evaluate(() => {
      window.exportBehavior = 'normal';
    });
    await page.getByRole('button', { name: '切换到等待中的测试上下文' }).click();
    await expect
      .poll(() => page.evaluate(() => window.exportReads.every((x) => x.aborted)))
      .toBe(true);
    await page.evaluate(() => window.exportReleases.forEach((release) => release()));
    await expect(page.getByRole('button', { name: '导出当前页', exact: true })).toBeEnabled();
    assert.deepEqual(downloads, []);
    await page.getByRole('button', { name: '切换到完整读取的测试上下文' }).click();
    await expect(
      page.locator('[data-testid^="regional-approval-month-plan-"]').first(),
    ).toContainText('¥100');
    for (const behavior of ['partial', 'foreign', 'failed']) {
      await page.evaluate((behavior) => {
        window.exportBehavior = behavior;
      }, behavior);
      await page.getByRole('button', { name: '导出当前页', exact: true }).click();
      await expect(
        page.getByText('版本明细读取失败或数据不完整，请刷新后重试；未产生文件。', { exact: true }),
      ).toBeVisible();
      await expect(page.getByRole('button', { name: '导出当前页', exact: true })).toBeEnabled();
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
