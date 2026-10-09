import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
const compile = async (contents) =>
  (
    await build({
      stdin: { contents, resolveDir: process.cwd() },
      bundle: true,
      write: false,
      format: 'iife',
      platform: 'browser',
    })
  ).outputFiles[0].text;
const child = await compile(
  `import{memoryStorage}from'./business/inventory-fc/source/inventory-light-plugins/src/native/memory-storage.ts';import{BrowserRepository}from'./business/inventory-fc/source/fc/src/lib/browser-repository.ts';const repo=new BrowserRepository(memoryStorage);const scope={userId:'user',conversationId:'actual-session',warehouseId:'changsha',month:'2026-10'};window.saveIntent=()=>{repo.saveFilters(scope,{search:'保留筛选',businessOnly:true,urgentOnly:false,riskOnly:false,ageFilters:[],orderStatusV2:'全部'});repo.saveDraft(scope,{quantities:{SKU1:12.5},reasons:{SKU1:'用户理由'},dirty:true});repo.saveCycleEdit(scope,{level:'sku',object:'SKU1',days:'9',from:'2026-10-01',to:'',overrides:[]});};window.readIntent=()=>({filters:repo.loadFilters(scope),draft:repo.loadDraft(scope),cycle:repo.loadCycleEdit(scope)});document.body.dataset.repositoryReady='true';`,
);
const outer = await compile(
  `import{WorkbenchController}from'./src/workbench.ts';import{connectHtmlViewState}from'./src/html-view-channel.ts';const owner=new WorkbenchController({panel:()=>{},document:()=>{}});owner.registerFrame({id:'inventory-fc',kind:'html',resourceId:'inventory-fc',src:'/fc'});let frame,stop=()=>{};window.openFc=async(scope)=>{stop();frame?.remove();await owner.open('inventory-fc');frame=document.createElement('iframe');frame.sandbox='allow-scripts';document.body.append(frame);stop=connectHtmlViewState(frame,'inventory-fc',scope,owner,new AbortController().signal);frame.src='/fc';};window.readOwner=scope=>owner.readHtmlViewState('inventory-fc',scope);let lastSave;window.addEventListener('message',event=>{if(event.data?.protocol==='dsh-workbench-view-v1'&&event.data.type==='save')lastSave=event.data;});window.replaceScope=scope=>{const old=lastSave;stop();stop=connectHtmlViewState(frame,'inventory-fc',scope,owner,new AbortController().signal);return old;};window.lateRestore=old=>frame.contentWindow.postMessage({...old,type:'restore'},'*');`,
);
test('FC typed Repository UI records restore across an opaque frame generation and never cross an identity/Session partition', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.route('http://127.0.0.1:19479/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body:
        new URL(route.request().url()).pathname === '/fc'
          ? `<html><body><script>${child}</script></body></html>`
          : '<html><body></body></html>',
    }),
  );
  await page.goto('http://127.0.0.1:19479/');
  await page.addScriptTag({ content: outer });
  await page.evaluate(() => window.openFc('host-scope/actual-session'));
  const body = () => page.frameLocator('iframe').locator('body[data-repository-ready]');
  await expect(body()).toBeVisible();
  await body().evaluate(() => window.saveIntent());
  await expect
    .poll(() =>
      page.evaluate(
        () => window.readOwner('host-scope/actual-session')?.drafts?.[0]?.value.quantities.SKU1,
      ),
    )
    .toBe(12.5);
  await page.evaluate(() => window.openFc('host-scope/actual-session'));
  await expect
    .poll(() => body().evaluate(() => window.readIntent().draft?.quantities.SKU1))
    .toBe(12.5);
  assert.equal((await body().evaluate(() => window.readIntent())).cycle.days, '9');
  const old = await page.evaluate(() => window.replaceScope('next-host-scope/actual-session'));
  await expect.poll(() => body().evaluate(() => window.readIntent().draft)).toBe(null);
  await page.evaluate((old) => window.lateRestore(old), old);
  await page.waitForTimeout(30);
  await expect.poll(() => body().evaluate(() => window.readIntent().draft)).toBe(null);
  await page.evaluate(() => window.openFc('next-host-scope/actual-session'));
  await expect.poll(() => body().evaluate(() => window.readIntent().draft)).toBe(null);
  assert.equal(
    await page.evaluate(() => window.readOwner('next-host-scope/actual-session')),
    undefined,
  );
});
