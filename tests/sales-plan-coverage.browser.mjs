import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';

// Exercise the actual workbench effects, monthly cells and visible failure feedback.
// This fixture has no GEA/Core runtime, credentials, model or write transport.
const bundle = await build({
  stdin: {
    resolveDir: process.cwd(), loader: 'tsx', contents: `
import React,{useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import i18next from 'i18next';
import zh from './src/workbench/original/zh-CN.json';
import Workbench from './src/workbench/original/workbenches/regionalApproval/RegionalApprovalWorkbench.tsx';
import {WorkbenchHostProvider} from './src/workbench/original/bridge.ts';
const i18n=i18next.createInstance();
await i18n.init({lng:'zh-CN',resources:{'zh-CN':{translation:{common:zh}}},interpolation:{escapeValue:false}});
const rows=[1,2,3].map(n=>({planId:'p'+n,versionId:'v'+n,seq:1,periodId:'period',planTypeCode:'Y',orderType:'M',dealerCode:'d'+n,orgCode:'org'+n,orgName:'销售组'+n,areaCode:'area'+n,areaName:'大区'+n,provinceCode:'province'+n,provinceName:'省区'+n,baseName:'基地'+n,status:1,updatedAt:'2026-10-0'+(4-n),currentQty:'20',currentAmount:'200',targetQty:'0',targetAmount:'400',skuCount:1}));
window.coverageCalls={sku:[],model:0,write:0};
const forbid=async()=>{window.coverageCalls.write++;throw Error('fixture write forbidden')};
const noop=()=>{};
function App(){
 const [mode,setMode]=useState('limited');
 const salesPlan=useMemo(()=>({
  periods:{invoke:async()=>({records:[{periodId:'period',periodMonth:'2026-10',planTypeCode:'Y',status:'OPEN'}],total:1,size:100,current:1,pages:1})},
  list:{invoke:async(q)=>{const records=q?.status===undefined||q.status===1?rows:[];return {records,total:records.length,size:q?.pageSize??200,current:q?.pageNo??1,pages:records.length?1:0}}},
  detail:{invoke:async({planId})=>({currentVersion:{...rows.find(x=>x.planId===planId),id:planId.replace('p','v'),effective:true},skus:[],versions:[],logs:[]})},
  versions:{invoke:async()=>[]},logs:{invoke:async()=>[]},compare:{invoke:async()=>[]},
  versionSkus:{invoke:async({versionId,signal})=>{signal?.throwIfAborted();window.coverageCalls.sku.push({versionId,mode});if(mode==='pending')return new Promise((resolve,reject)=>{window.rejectPending=()=>reject(Error('late cancelled read failure'))});if(mode==='limited'&&versionId==='v3')throw Object.assign(Error('本次销售只读额度已用完，未发出额外请求'),{code:'GEA_SALES_READONLY_LIMIT'});return [{id:'s'+versionId,versionId,skuCode:'sku'+versionId,productCategName:'汤圆',qty:'20',amt:'200',baseQty:'10',amtBase:'100',price:'10'}]}},
  action:{invoke:forbid},submit:{invoke:forbid}
 }),[mode]);
 const host=useMemo(()=>({salesPlan,modelInference:{invoke:async()=>{window.coverageCalls.model++;throw Error('fixture model forbidden')}}}),[salesPlan]);
 return <><button onClick={()=>setMode('complete')}>切换到完整读取的测试上下文</button><button onClick={()=>setMode('pending')}>切换到等待中的测试上下文</button><WorkbenchHostProvider value={host}><Workbench stateScope="coverage-test" t={i18n.t.bind(i18n)} onContextChange={noop} queryClient={salesPlan} detailClient={salesPlan} liveActionsEnabled={false}/></WorkbenchHostProvider></>;
}
createRoot(document.getElementById('root')).render(<App/>);
`,
  },
  outfile: '/fixture/app.js', bundle: true, write: false, format: 'esm',
  platform: 'browser', target: 'es2022', define: { 'process.env.NODE_ENV': '"test"' },
  loader: { '.svg': 'dataurl', '.png': 'dataurl' },
});

test('incomplete automatic SKU reads remain unknown, show a failure and recover in a new context', {timeout:30000}, async t => {
  const assets = new Map(bundle.outputFiles.map(x => [x.path.split('/').at(-1), x.text]));
  const server = createServer((req,res) => {
    const name = req.url.slice(1);
    if (assets.has(name)) {
      res.setHeader('content-type', name.endsWith('.css') ? 'text/css' : 'text/javascript');
      res.end(assets.get(name));
    } else {res.setHeader('content-type','text/html; charset=utf-8');res.end('<meta charset="utf-8"><link rel="stylesheet" href="/app.css"><div id="root"></div><script type="module" src="/app.js"></script>');}
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const browser = await chromium.launch({channel:'chrome',headless:true});
  t.after(() => browser.close());
  const page = await browser.newPage({viewport:{width:1100,height:900}});
  let externalRequests=0;
  const pageErrors=[];
  page.on('pageerror',error=>pageErrors.push(error.message));
  await page.route(/^https?:\/\//,route => {
    if (new URL(route.request().url()).hostname !== '127.0.0.1') {externalRequests++;return route.abort();}
    return route.continue();
  });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await expect.poll(() => page.evaluate(() => window.coverageCalls?.sku.length ?? 0)).toBe(3);
  const monthly = page.locator('[data-testid^="regional-approval-month-plan-"]').first();
  await expect(monthly).toHaveText('——');
  await expect(page.getByTestId('regional-approval-sku-coverage-error')).toContainText('月计划明细未完整读取');
  const totals = page.getByRole('region',{name:'当前页明细汇总',exact:true});
  await expect(totals).toContainText('¥600');
  await page.getByRole('button',{name:'切换到完整读取的测试上下文'}).click();
  await expect(monthly).toContainText('¥100');
  await expect(monthly).toContainText('10 件');
  await expect(page.getByTestId('regional-approval-sku-coverage-error')).toHaveCount(0);
  await page.getByRole('button',{name:'切换到等待中的测试上下文'}).click();
  await expect.poll(()=>page.evaluate(()=>window.coverageCalls.sku.some(x=>x.mode==='pending'))).toBe(true);
  await page.getByRole('button',{name:'切换到完整读取的测试上下文'}).click();
  await page.evaluate(()=>window.rejectPending());
  await expect(monthly).toContainText('¥100');
  await expect(page.getByTestId('regional-approval-sku-coverage-error')).toHaveCount(0);
  assert.deepEqual(pageErrors,[]);
  assert.deepEqual(await page.evaluate(() => ({model:window.coverageCalls.model,write:window.coverageCalls.write})),{model:0,write:0});
  assert.equal(externalRequests,0);
});
