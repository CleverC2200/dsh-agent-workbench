import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';

// Actual React hook, fixed local responses. Hidden business version controls stay unchanged.
const bundle = await build({
  stdin: {
    resolveDir: process.cwd(),
    loader: 'tsx',
    contents: `
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {useSalesPlanDetail} from './src/workbench/original/workbenches/regionalApproval/hooks/useSalesPlanDetail.ts';
import {BackendHttpError} from './src/workbench/original/http-error.ts';
import {WorkbenchHostProvider} from './src/workbench/original/bridge.ts';
window.detailCalls=[];window.detailScenario='good';window.lateReads=[];
const versions=planId=>[1,2].map(seq=>({id:planId+'-v'+seq,planId,seq}));
const sku=versionId=>({id:'sku-id',skuCode:'sku',versionId,qty:'2.000',amt:'344.24'});
const client={
 detail:{invoke:async({planId,signal})=>{
  window.detailCalls.push({kind:'detail',planId});
  const value={currentVersion:versions(planId)[1],skus:[],versions:[],logs:[]};
  if(/^http/.test(window.detailScenario))throw new BackendHttpError({method:'GET',path:'/fixture/detail',status:Number(window.detailScenario.slice(4)),body:{code:'fixture'}});
  if(window.detailScenario==='late-overview'&&planId==='B')return new Promise(resolve=>window.lateReads.push({signal,resolve:()=>resolve(value)}));
  return value;
 }},
 versions:{invoke:async({planId})=>window.detailScenario==='foreign-overview'?versions('other-plan'):versions(planId)},
 logs:{invoke:async()=>[]},
 versionSkus:{invoke:async({versionId,signal})=>{
  window.detailCalls.push({kind:'sku',versionId});
  if(window.detailScenario==='late-sku'&&versionId==='A-v1')return new Promise(resolve=>window.lateReads.push({signal,resolve:()=>resolve([sku('foreign-version')])}));
  return [sku(window.detailScenario==='foreign-sku'?'foreign-version':versionId)];
 }},
 compare:{invoke:async({planId,fromVersionId,toVersionId,signal})=>{
  window.detailCalls.push({kind:'compare',planId,fromVersionId,toVersionId});
  if(window.detailScenario==='late-compare'&&planId==='A')return new Promise(resolve=>window.lateReads.push({signal,resolve:()=>resolve([{skuCode:'sku',changeType:'UPDATED',before:sku('foreign-version'),after:sku('foreign-version')}])}));
  return [{skuCode:'sku',changeType:'UPDATED',before:sku(fromVersionId),after:sku(window.detailScenario==='foreign-compare'?'foreign-version':toVersionId)}];
 }}
};
function App(){
 const [planId,setPlanId]=useState('A');
 const detail=useSalesPlanDetail({client,planId,initialVersionId:planId+'-v2'});
 return <><button onClick={()=>detail.selectVersion(planId+'-v1')}>历史版本</button><button onClick={()=>detail.selectVersion(planId+'-v2')}>当前版本</button><button onClick={()=>detail.selectVersion('foreign-version')}>其他计划版本</button><button onClick={()=>detail.selectFromVersion('foreign-version')}>其他计划比较版本</button><button onClick={()=>setPlanId('B')}>计划 B</button><button onClick={()=>setPlanId('A')}>计划 A</button><button onClick={detail.retryOverview}>重新读取概览</button><button onClick={detail.retrySkus}>重新读取 SKU</button><button onClick={detail.retryCompare}>重新读取比较</button><output data-testid="detail-state">{JSON.stringify({overview:detail.overviewState,sku:detail.skuState,compare:detail.compareState,selected:detail.selectedVersionId})}</output></>;
}
createRoot(document.getElementById('root')).render(<WorkbenchHostProvider value={{salesPlan:client}}><App/></WorkbenchHostProvider>);
`,
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  define: { 'process.env.NODE_ENV': '"test"' },
});

test(
  'actual version hook enforces plan ownership, classifies permission and ignores cancelled late responses',
  { timeout: 30000 },
  async (t) => {
    const server = createServer((req, res) => {
      res.setHeader(
        'content-type',
        req.url === '/app.js' ? 'text/javascript' : 'text/html; charset=utf-8',
      );
      res.end(
        req.url === '/app.js'
          ? bundle.outputFiles[0].text
          : '<div id="root"></div><script type="module" src="/app.js"></script>',
      );
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const browser = await chromium.launch({ headless: true });
    t.after(() => browser.close());
    const page = await browser.newPage();
    const errors = [];
    let external = 0;
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route(/^https?:\/\//, (route) => {
      if (new URL(route.request().url()).hostname !== '127.0.0.1') {
        external++;
        return route.abort();
      }
      return route.continue();
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const state = async () => JSON.parse(await page.getByTestId('detail-state').textContent());
    await expect.poll(async () => (await state()).compare.status).toBe('success');
    await page.getByRole('button', { name: '历史版本', exact: true }).click();
    await expect.poll(async () => (await state()).sku.data?.[0]?.versionId).toBe('A-v1');
    assert.deepEqual(
      await page.evaluate(() => window.detailCalls.filter((x) => x.kind === 'compare')),
      [{ kind: 'compare', planId: 'A', fromVersionId: 'A-v1', toVersionId: 'A-v2' }],
    );

    await page.getByRole('button', { name: '当前版本', exact: true }).click();
    await expect.poll(async () => (await state()).sku.data?.[0]?.versionId).toBe('A-v2');
    await page.evaluate(() => {
      window.detailScenario = 'late-sku';
    });
    await page.getByRole('button', { name: '历史版本', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.lateReads.length)).toBe(1);
    await page.getByRole('button', { name: '当前版本', exact: true }).click();
    await expect.poll(async () => (await state()).sku.data?.[0]?.versionId).toBe('A-v2');
    assert.equal(await page.evaluate(() => window.lateReads[0].signal.aborted), true);
    await page.evaluate(() => window.lateReads.shift().resolve());
    await expect.poll(async () => (await state()).sku.data?.[0]?.versionId).toBe('A-v2');

    await page.evaluate(() => {
      window.detailScenario = 'late-overview';
    });
    await page.getByRole('button', { name: '计划 B', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.lateReads.length)).toBe(1);
    await page.getByRole('button', { name: '计划 A', exact: true }).click();
    await expect
      .poll(async () => (await state()).overview.data?.detail.currentVersion.planId)
      .toBe('A');
    assert.equal(await page.evaluate(() => window.lateReads[0].signal.aborted), true);
    await page.evaluate(() => window.lateReads.shift().resolve());
    await expect
      .poll(async () => (await state()).overview.data?.detail.currentVersion.planId)
      .toBe('A');

    await page.evaluate(() => {
      window.detailScenario = 'late-compare';
    });
    await page.getByRole('button', { name: '重新读取比较', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.lateReads.length)).toBe(1);
    await page.getByRole('button', { name: '计划 B', exact: true }).click();
    await expect.poll(async () => (await state()).compare.data?.[0]?.after.versionId).toBe('B-v2');
    assert.equal(await page.evaluate(() => window.lateReads[0].signal.aborted), true);
    await page.evaluate(() => window.lateReads.shift().resolve());
    await expect.poll(async () => (await state()).compare.data?.[0]?.after.versionId).toBe('B-v2');
    await page.evaluate(() => {
      window.detailScenario = 'good';
    });
    await page.getByRole('button', { name: '计划 A', exact: true }).click();
    await expect.poll(async () => (await state()).compare.data?.[0]?.after.versionId).toBe('A-v2');
    for (const [button, key, kind] of [
      ['其他计划版本', 'sku', 'sku'],
      ['其他计划比较版本', 'compare', 'compare'],
    ]) {
      const calls = await page.evaluate(
        (kind) => window.detailCalls.filter((x) => x.kind === kind).length,
        kind,
      );
      await page.getByRole('button', { name: button, exact: true }).click();
      await expect.poll(async () => (await state())[key].error).toBe('versionMismatch');
      assert.equal(
        await page.evaluate(
          (kind) => window.detailCalls.filter((x) => x.kind === kind).length,
          kind,
        ),
        calls,
      );
    }

    for (const [scenario, error] of [
      ['http403', 'permission'],
      ['http401', 'expired'],
      ['http404', 'missing'],
      ['foreign-overview', 'versionMismatch'],
    ]) {
      await page.evaluate((value) => {
        window.detailScenario = value;
      }, scenario);
      await page.getByRole('button', { name: '重新读取概览', exact: true }).click();
      await expect.poll(async () => (await state()).overview.error).toBe(error);
      await expect.poll(async () => (await state()).sku.status).toBe('idle');
    }
    await page.evaluate(() => {
      window.detailScenario = 'good';
    });
    await page.getByRole('button', { name: '重新读取概览', exact: true }).click();
    await expect.poll(async () => (await state()).compare.status).toBe('success');
    for (const [scenario, button, key] of [
      ['foreign-sku', '重新读取 SKU', 'sku'],
      ['foreign-compare', '重新读取比较', 'compare'],
    ]) {
      await page.evaluate((value) => {
        window.detailScenario = value;
      }, scenario);
      await page.getByRole('button', { name: button, exact: true }).click();
      await expect.poll(async () => (await state())[key].error).toBe('versionMismatch');
    }
    assert.deepEqual(errors, []);
    assert.equal(external, 0);
  },
);
