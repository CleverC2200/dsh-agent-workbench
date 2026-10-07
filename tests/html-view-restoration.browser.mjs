import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
const { outputFiles } = await build({ stdin: { contents: `import{WorkbenchController}from'./src/workbench.ts';import{connectHtmlViewState}from'./src/html-view-channel.ts';import{validatePageCatalog}from'./src/page-bridge/catalog.ts';import{htmlPageCatalog}from'./src/html-page-catalog.ts';import{isBusinessViewPage}from'./src/html-view-state.ts';window.mockSession='session-11111111-1111-4111-8111-111111111111';const viewScope=id=>isBusinessViewPage(id)?window.mockSession:undefined;window.mockContexts={};window.mockCatalogs={};window.mockChannels={};window.mockReplies={};window.mockErrors=[];const owner=new WorkbenchController({panel:()=>{},document:()=>{}});for(const[id,name]of[['workbench-html-table','sample'],['gea-regional-plan','regional'],['plan-region-category','category'],['plan-category-production','mps'],['inventory-customer','customer'],['inventory-orderworkbench','orderworkbench'],['inventory-orderfulfillment','fulfillment']])owner.registerFrame({id,kind:'html',src:'/'+name});let stop=()=>{},frame;window.openPage=async(id,name)=>{stop();frame?.remove();delete window.mockContexts[id];delete window.mockCatalogs[id];await owner.open(id);frame=document.createElement('iframe');frame.setAttribute('sandbox','allow-scripts');frame.style='width:1480px;height:920px;border:0';document.body.append(frame);stop=connectHtmlViewState(frame,id,viewScope(id),owner,new AbortController().signal);frame.src='/'+name;};window.hidePage=()=>{owner.leaveDocument();stop();frame?.remove();};window.rebindSession=async session=>{const id=owner.getSnapshot().selectedDocument.id;stop();window.mockSession=session;delete window.mockContexts[id];stop=connectHtmlViewState(frame,id,viewScope(id),owner,new AbortController().signal);window.mockChannels[id].postMessage({type:'context',context:{session,plugin:id}});};window.readState=id=>owner.readHtmlViewState(id,viewScope(id));window.seedState=(id,state)=>owner.saveHtmlViewState(id,viewScope(id),state);window.addEventListener('message',event=>{if(event.source!==frame?.contentWindow||event.data?.protocol!=='gea-html-v2'||event.data.type!=='ready')return;const id=owner.getSnapshot().selectedDocument.id;const channel=new MessageChannel();window.mockChannels[id]=channel.port1;channel.port1.onmessage=({data})=>{if(data.type==='applied')window.mockReplies[data.toolCallId]=data;if(data.type==='request'){if(data.method!=='context')window.mockErrors.push(data.method);window.mockContexts[id]=data.parameters;channel.port1.postMessage({type:'response',id:data.id,result:{ok:true}});}if(data.type==='catalog'){try{const catalog=htmlPageCatalog({surface:'gea-html-'+id,tool:'gea_plugin_page_apply',label:'Mock reception',elements:data.elements});if(catalog)validatePageCatalog(catalog);window.mockCatalogs[id]=data.elements;}catch(error){window.mockErrors.push(error.message);}}};frame.contentWindow.postMessage({protocol:'gea-html-v2',type:'connect',context:{session:window.mockSession,plugin:id}},'*',[channel.port2]);});`, resolveDir: process.cwd() }, bundle: true, write: false, format: 'iife', platform: 'browser' });
const baseline = '312adf90f1abcc05d9421083b2386939634d8796';
async function fixture(t, includedAssets) {
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    t.after(() => browser.close());
    const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
    const assetPaths = { sample: 'lib/samples/index.html', regional: 'static/regional/index.html', category: 'static/category/index.html', mps: 'static/mps/index.html', customer: 'lib/business/inventory-customer/index.html', orderworkbench: 'lib/business/inventory-orderworkbench/index.html', fulfillment: 'lib/business/inventory-orderfulfillment/index.html' };
    const assets = Object.fromEntries(await Promise.all((includedAssets ?? Object.keys(assetPaths)).map(async name => [name, await readFile(assetPaths[name], 'utf8')])));
    if (process.env.HTML_VIEW_BASELINE === '1')
        assets.sample = execFileSync('git', ['show', `${baseline}:samples/html-table.html`], { encoding: 'utf8' }).replace('/* SHARED_THEME_RESOURCE */', await readFile('theme/tokens.css', 'utf8'));
    await page.route('http://127.0.0.1:19478/**', route => { const key = new URL(route.request().url()).pathname.slice(1); return route.fulfill({ contentType: 'text/html', body: assets[key] ?? '<html><body></body></html>' }); });
    await page.goto('http://127.0.0.1:19478/');
    await page.addScriptTag({ content: outputFiles[0].text });
    return page;
}
test('sample filter intent survives destroying and reopening its real opaque iframe without GEA or a Core Session', async (t) => {
    const page = await fixture(t);
    await page.evaluate(() => window.openPage('workbench-html-table', 'sample'));
    const frame = page.frameLocator('iframe');
    await expect(frame.locator('#query')).toBeEnabled();
    await frame.locator('#query').fill('下单');
    await frame.locator('#stage').selectOption('进行中');
    await expect.poll(() => page.evaluate(() => window.readState('workbench-html-table'))).toEqual({ version: 1, keyword: '下单', stage: '进行中' });
    await page.evaluate(() => window.hidePage());
    await page.evaluate(() => window.openPage('workbench-html-table', 'sample'));
    await expect(page.frameLocator('iframe').locator('#query')).toHaveValue('下单');
    await expect(page.frameLocator('iframe').locator('#stage')).toHaveValue('进行中');
});
test('the current MPS step and unfinished assistant draft restore without replaying a simulated response', async (t) => {
    const page = await fixture(t);
    await page.evaluate(() => window.openPage('plan-category-production', 'mps'));
    const frame = page.frameLocator('iframe');
    await frame.locator('.ap-page-tab').filter({ hasText: '需求加工' }).click();
    await expect.poll(() => page.evaluate(() => window.readState('plan-category-production')?.tab)).toBe('process');
    await page.evaluate(() => window.seedState('plan-category-production',{...window.readState('plan-category-production'),assistantDraft:'未发送的原型界面文字'}));
    await page.evaluate(() => window.hidePage());
    await page.evaluate(() => window.openPage('plan-category-production', 'mps'));
    await expect(page.frameLocator('iframe').locator('.ap-board-title')).toHaveText('需求加工与收敛');
    await expect(page.frameLocator('iframe').locator('.author-draft-recovery pre')).toHaveText('未发送的原型界面文字');
});
test('Regional date and report dimension restore through their original script owner', async (t) => {
    const page = await fixture(t);
    await page.evaluate(() => window.openPage('gea-regional-plan', 'regional'));
    const frame = page.frameLocator('iframe');
    await frame.locator('#simBtn').click();
    await frame.locator('#simDate').fill('2026-10-12');
    await frame.locator('#simDate').dispatchEvent('change');
    await expect.poll(() => page.evaluate(() => window.readState('gea-regional-plan')?.date)).toBe('2026-10-12');
    await page.evaluate(() => window.hidePage());
    await page.evaluate(() => window.openPage('gea-regional-plan', 'regional'));
    await expect(page.frameLocator('iframe').locator('#simDate')).toHaveValue('2026-10-12');
    await page.frameLocator('iframe').locator('#rhythmBtn').click();
    await page.frameLocator('iframe').locator('.re-name').first().fill('未保存的节奏编辑');
    await expect.poll(() => page.evaluate(() => window.readState('gea-regional-plan')?.rhythmDraft?.[0]?.name)).toBe('未保存的节奏编辑');
    await page.evaluate(() => window.hidePage());
    await page.evaluate(() => window.openPage('gea-regional-plan', 'regional'));
    await expect(page.frameLocator('iframe').locator('.re-name').first()).toHaveValue('未保存的节奏编辑');
    assert.equal(await page.evaluate(() => Object.hasOwn(window.readState('gea-regional-plan'), 'ctx')), false, 'derived data and contexts are not retained');
});
test('Category selection and unfinished local input restore while tasks and simulated replies remain transient', async (t) => {
    const page = await fixture(t);
    await page.evaluate(() => window.openPage('plan-region-category', 'category'));
    const frame = page.frameLocator('iframe');
    const select = frame.locator('.scope-picker .arco-select');
    await select.click();
    await frame.locator('.arco-select-option').filter({ hasText: '面点' }).click();
    await expect.poll(() => page.evaluate(() => window.readState('plan-region-category')?.category)).toBeTruthy();
    const before = await select.innerText();
    await page.evaluate(() => window.seedState('plan-region-category',{...window.readState('plan-region-category'),draft:'未发送的品类界面文字'}));
    await page.evaluate(() => window.hidePage());
    await page.evaluate(() => window.openPage('plan-region-category', 'category'));
    await expect(page.frameLocator('iframe').locator('.scope-picker .arco-select')).toHaveText(before);
    await expect(page.frameLocator('iframe').locator('.author-draft-recovery pre')).toHaveText('未发送的品类界面文字');
    assert.equal(await page.evaluate(() => Object.hasOwn(window.readState('plan-region-category'), 'tasks')), false);
    await page.evaluate(() => {window.hidePage();window.seedState('plan-region-category',{version:1,category:'unknown-category'});});
    await page.evaluate(() => window.openPage('plan-region-category','category'));
    await expect(page.frameLocator('iframe').locator('.scope-picker .arco-select')).toContainText('全部品类');
});

test('received customer mock preserves filters, pagination and visible current rows across iframe replacement', async t => {
  const page = await fixture(t);
  await page.evaluate(() => window.openPage('inventory-customer','customer'));
  await expect(page.frameLocator('iframe').getByPlaceholder('经销商筛选')).toBeVisible();
  await page.frameLocator('iframe').getByPlaceholder('经销商筛选').fill('佳特');
  await expect.poll(() => page.evaluate(() => window.mockContexts['inventory-customer']?.search)).toBe('佳特');
  await page.evaluate(() => window.hidePage());
  await page.evaluate(() => window.openPage('inventory-customer','customer'));
  await expect(page.frameLocator('iframe').getByPlaceholder('经销商筛选')).toHaveValue('佳特');
  await expect.poll(() => page.evaluate(() => window.mockContexts['inventory-customer']?.totalFilteredRows)).toBe(1);
  assert.deepEqual(await page.evaluate(() => window.mockErrors),[]);
});
test('received order report restores the selected week and publishes current supported elements', async t => {
  const page = await fixture(t, ['orderworkbench']);
  await page.evaluate(() => window.openPage('inventory-orderworkbench','orderworkbench'));
  await page.frameLocator('iframe').locator('#weekMode').click();
  await expect.poll(() => page.evaluate(() => window.readState('inventory-orderworkbench')?.mode)).toBe('week');
  await page.evaluate(() => window.hidePage());
  await page.evaluate(() => window.openPage('inventory-orderworkbench','orderworkbench'));
  await expect(page.frameLocator('iframe').locator('#weekMode')).toHaveAttribute('aria-pressed','true');
  await expect.poll(() => page.evaluate(() => window.mockContexts['inventory-orderworkbench']?.period.mode)).toBe('week');
  assert.equal(await page.evaluate(() => window.mockContexts['inventory-orderworkbench']?.period.available),true,JSON.stringify(await page.evaluate(()=>({state:window.readState('inventory-orderworkbench'),period:window.mockContexts['inventory-orderworkbench']?.period}))));
  await expect.poll(() => page.evaluate(() => window.mockCatalogs['inventory-orderworkbench']?.length ?? 0)).toBeGreaterThan(1);
  assert.deepEqual(await page.evaluate(() => window.mockErrors),[]);
});
for (const [taskFilter, taskLabel] of [['pending', '待跟进'], ['done', '已完成']]) {
  test(`received order report restores all events and the ${taskLabel} task filter highlight with their visible lists`, async t => {
    const page = await fixture(t, ['orderworkbench']);
    await page.evaluate(() => window.openPage('inventory-orderworkbench', 'orderworkbench'));
    const frame = page.frameLocator('iframe');
    await frame.getByRole('button', { name: '全部事项', exact: true }).click();
    await frame.getByRole('button', { name: new RegExp(`^${taskLabel}`) }).click();
    await expect.poll(() => page.evaluate(() => window.mockContexts['inventory-orderworkbench']?.filters)).toEqual({ event: 'all', task: taskFilter });
    await expect(frame.locator('[data-wb-event-filter].active')).toHaveText('全部事项');
    await expect(frame.locator('[data-wb-task-filter].active')).toContainText(taskLabel);
    await expect(frame.locator('#wbEvents .wb-event')).toHaveCount(5);
    await expect(frame.locator('#wbEvents')).toContainText('火锅料与汤圆可发货天数偏高');
    await expect(frame.locator('#wbTaskRows')).toContainText('尚未建立任务');
    await page.evaluate(() => window.hidePage());
    await page.evaluate(() => window.openPage('inventory-orderworkbench', 'orderworkbench'));
    await expect(frame.locator('[data-wb-event-filter].active')).toHaveText('全部事项');
    await expect(frame.locator('[data-wb-task-filter].active')).toContainText(taskLabel);
    await expect(frame.locator('#wbEvents .wb-event')).toHaveCount(5);
    await expect(frame.locator('#wbEvents')).toContainText('火锅料与汤圆可发货天数偏高');
    await expect(frame.locator('#wbTaskRows')).toContainText('尚未建立任务');
    assert.deepEqual(await page.evaluate(() => window.mockErrors), []);
  });
}
test('received fulfillment mock restores its filters and visible page without a business query', async t => {
  const page = await fixture(t);
  await page.evaluate(() => window.openPage('inventory-orderfulfillment','fulfillment'));
  await page.frameLocator('iframe').locator('#customerSearch').fill('10010126');
  await expect.poll(() => page.evaluate(() => window.readState('inventory-orderfulfillment')?.customer)).toBe('10010126');
  await page.evaluate(() => window.hidePage());
  await page.evaluate(() => window.openPage('inventory-orderfulfillment','fulfillment'));
  await expect(page.frameLocator('iframe').locator('#customerSearch')).toHaveValue('10010126');
  await expect.poll(() => page.evaluate(() => window.mockContexts['inventory-orderfulfillment']?.rows.length)).toBe(1);
  assert.deepEqual(await page.evaluate(() => window.mockErrors),[]);
});


test('regional author reports the current module, period, dimension and original visible data through the public iframe', async t => {
  const page=await fixture(t);
  await page.evaluate(()=>window.openPage('gea-regional-plan','regional'));
  const frame=page.frameLocator('iframe');
  await expect.poll(()=>page.evaluate(()=>window.mockContexts['gea-regional-plan']?.source)).toBe('regional-plan-prototype');
  await frame.locator('.modtab[data-mod="follow"]').click();
  await frame.locator('#repDim button[data-dim="province"]').click();
  await expect.poll(()=>page.evaluate(()=>window.mockContexts['gea-regional-plan']?.filters)).toMatchObject({module:'follow',dimension:'province',date:'2026-09-18'});
  await expect.poll(()=>page.evaluate(()=>window.mockContexts['gea-regional-plan']?.period)).toMatchObject({order:'M',phase:'open',label:'月计划'});
  await expect.poll(()=>page.evaluate(()=>window.mockContexts['gea-regional-plan']?.customers.length??0)).toBeGreaterThan(0);
  await expect.poll(()=>page.evaluate(()=>window.mockCatalogs['gea-regional-plan']?.map(row=>row.id)??[])).toContain('filter:dimension');
  assert.equal(await page.evaluate(()=>window.mockCatalogs['gea-regional-plan'].some(row=>row.id==='filter:date')),false);
  await frame.locator('#simBtn').click();
  await expect.poll(()=>page.evaluate(()=>window.mockCatalogs['gea-regional-plan']?.map(row=>row.id)??[])).toContain('filter:date');
  await frame.locator('#simDate').fill('2026-10-12');
  await frame.locator('#simDate').dispatchEvent('change');
  await expect.poll(()=>page.evaluate(()=>window.mockContexts['gea-regional-plan']?.period)).toMatchObject({order:'Z',phase:'open',label:'纠偏计划'});
  await page.evaluate(()=>window.hidePage());
  await page.evaluate(()=>window.openPage('gea-regional-plan','regional'));
  await expect(page.frameLocator('iframe').locator('.modtab[data-mod="follow"]')).toHaveClass(/on/);
  await expect.poll(()=>page.evaluate(()=>window.mockContexts['gea-regional-plan']?.filters)).toMatchObject({module:'follow',dimension:'province',date:'2026-10-12'});
  assert.deepEqual(await page.evaluate(()=>window.mockErrors),[]);
});

test('regional UI restores only within its Core Session and a different Session starts with the original date', async t => {
  const page=await fixture(t);
  await page.evaluate(()=>window.openPage('gea-regional-plan','regional'));
  await page.frameLocator('iframe').locator('#simBtn').click();
  await page.frameLocator('iframe').locator('#simDate').fill('2026-10-12');
  await page.frameLocator('iframe').locator('#simDate').dispatchEvent('change');
  await expect.poll(()=>page.evaluate(()=>window.readState('gea-regional-plan')?.date)).toBe('2026-10-12');
  await page.evaluate(()=>{window.hidePage();window.mockSession='session-22222222-2222-4222-8222-222222222222';});
  await page.evaluate(()=>window.openPage('gea-regional-plan','regional'));
  await expect(page.frameLocator('iframe').locator('#simDate')).toHaveValue('2026-09-18');
  await page.evaluate(()=>{window.hidePage();window.mockSession='session-11111111-1111-4111-8111-111111111111';});
  await page.evaluate(()=>window.openPage('gea-regional-plan','regional'));
  await expect(page.frameLocator('iframe').locator('#simDate')).toHaveValue('2026-10-12');
});


test('regional visible filters use the current public catalog and cancellation leaves the original author value unchanged', async t => {
  const page=await fixture(t);
  await page.evaluate(()=>window.openPage('gea-regional-plan','regional'));
  await expect.poll(()=>page.evaluate(()=>window.mockCatalogs['gea-regional-plan']?.length??0)).toBeGreaterThan(0);
  const apply=(id,target,value,cancel=false)=>page.evaluate(({id,target,value,cancel})=>{
    const port=window.mockChannels['gea-regional-plan'];
    port.postMessage({type:'apply',session:window.mockSession,toolCallId:id,args:{kind:'setValue',target,value}});
    if(cancel)port.postMessage({type:'cancel',session:window.mockSession,toolCallId:id});
  },{id,target,value,cancel});
  await apply('hidden-dimension','filter:dimension','province');
  await expect.poll(()=>page.evaluate(()=>window.mockReplies['hidden-dimension']?.applied)).toBe(false);
  await apply('cancel-module','filter:module','follow',true);
  await expect.poll(()=>page.evaluate(()=>window.mockReplies['cancel-module']?.applied)).toBe(false);
  await expect(page.frameLocator('iframe').locator('.modtab[data-mod="overview"]')).toHaveClass(/on/);
  await apply('change-module','filter:module','follow');
  await expect.poll(()=>page.evaluate(()=>window.mockReplies['change-module']?.applied)).toBe(true);
  await expect.poll(()=>page.evaluate(()=>window.mockContexts['gea-regional-plan']?.filters.module)).toBe('follow');
  await expect.poll(()=>page.evaluate(()=>window.mockCatalogs['gea-regional-plan']?.map(row=>row.id)??[])).toContain('filter:dimension');
  await apply('change-dimension','filter:dimension','province');
  await expect.poll(()=>page.evaluate(()=>window.mockReplies['change-dimension']?.applied)).toBe(true);
  await expect.poll(()=>page.evaluate(()=>window.mockContexts['gea-regional-plan']?.filters.dimension)).toBe('province');
  await page.frameLocator('iframe').locator('#simBtn').click();
  await expect.poll(()=>page.evaluate(()=>window.mockCatalogs['gea-regional-plan']?.map(row=>row.id)??[])).toContain('filter:date');
  await apply('invalid-date','filter:date','2026-02-30');
  await expect.poll(()=>page.evaluate(()=>window.mockReplies['invalid-date']?.applied)).toBe(false);
  await expect(page.frameLocator('iframe').locator('#simDate')).toHaveValue('2026-09-18');
  assert.deepEqual(await page.evaluate(()=>window.mockErrors),[]);
});


test('regional mounted author restores and republishes after its existing channels move to another Core Session', async t => {
  const page=await fixture(t);
  await page.evaluate(()=>window.openPage('gea-regional-plan','regional'));
  const frame=page.frameLocator('iframe');
  await expect.poll(()=>page.evaluate(()=>window.mockContexts['gea-regional-plan']?.source)).toBe('regional-plan-prototype');
  await frame.locator('#simBtn').click();
  await frame.locator('#simDate').fill('2026-10-12');
  await frame.locator('#simDate').dispatchEvent('change');
  await expect.poll(()=>page.evaluate(()=>window.mockContexts['gea-regional-plan']?.filters.date)).toBe('2026-10-12');
  await page.evaluate(()=>window.rebindSession('session-22222222-2222-4222-8222-222222222222'));
  await expect(frame.locator('#simDate')).toHaveValue('2026-09-18');
  await expect.poll(()=>page.evaluate(()=>window.mockContexts['gea-regional-plan']?.filters.date)).toBe('2026-09-18');
  await frame.locator('#simDate').fill('2026-11-12');
  await frame.locator('#simDate').dispatchEvent('change');
  await expect.poll(()=>page.evaluate(()=>window.readState('gea-regional-plan')?.date)).toBe('2026-11-12');
  await page.evaluate(()=>window.rebindSession('session-11111111-1111-4111-8111-111111111111'));
  await expect(frame.locator('#simDate')).toHaveValue('2026-10-12');
  await expect.poll(()=>page.evaluate(()=>window.mockContexts['gea-regional-plan']?.filters.date)).toBe('2026-10-12');
});
