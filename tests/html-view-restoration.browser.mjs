import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
const { outputFiles } = await build({ stdin: { contents: `import{WorkbenchController}from'./src/workbench.ts';import{connectHtmlViewState}from'./src/html-view-channel.ts';import{validatePageCatalog}from'./src/page-bridge/catalog.ts';import{htmlPageCatalog}from'./src/html-page-catalog.ts';import{isBusinessViewPage}from'./src/html-view-state.ts';let viewSession='mock-session';const viewScope=id=>isBusinessViewPage(id)?viewSession:undefined;window.setViewSession=scope=>{viewSession=scope;};window.mockContexts={};window.mockCatalogs={};window.mockErrors=[];window.contextMessages=[];const owner=new WorkbenchController({panel:()=>{},document:()=>{}});for(const[id,name]of[['workbench-html-table','sample'],['gea-regional-plan','regional'],['plan-region-category','category'],['plan-category-production','mps'],['inventory-customer','customer'],['inventory-orderworkbench','orderworkbench'],['inventory-orderfulfillment','fulfillment']])owner.registerFrame({id,kind:'html',src:'/'+name});let stop=()=>{},frame;window.openPage=async(id,name)=>{stop();frame?.remove();await owner.open(id);frame=document.createElement('iframe');frame.setAttribute('sandbox','allow-scripts');frame.style='width:1480px;height:920px;border:0';document.body.append(frame);stop=connectHtmlViewState(frame,id,viewScope(id),owner,new AbortController().signal);frame.src='/'+name;};window.hidePage=()=>{owner.leaveDocument();stop();frame?.remove();};window.readState=id=>owner.readHtmlViewState(id,viewScope(id));window.seedState=(id,state)=>owner.saveHtmlViewState(id,viewScope(id),state);window.addEventListener('message',event=>{if(event.source!==frame?.contentWindow||event.data?.protocol!=='gea-html-v2'||event.data.type!=='ready')return;const id=owner.getSnapshot().selectedDocument.id;const channel=new MessageChannel();window.switchViewSession=scope=>{viewSession=scope;stop();stop=connectHtmlViewState(frame,id,viewScope(id),owner,new AbortController().signal);channel.port1.postMessage({type:'context',context:{session:scope,plugin:id}});};let applied;window.applyMock=args=>new Promise(resolve=>{applied=resolve;channel.port1.postMessage({type:'apply',toolCallId:'fixture-apply',session:'session-11111111-1111-4111-8111-111111111111',args});});channel.port1.onmessage=({data})=>{if(data.type==='applied')applied?.(data);if(data.type==='request'){if(data.method!=='context')window.mockErrors.push(data.method);window.mockContexts[id]=data.parameters;window.contextMessages.push({session:data.session,context:data.parameters});channel.port1.postMessage({type:'response',id:data.id,result:{ok:true}});}if(data.type==='catalog'){try{const catalog=htmlPageCatalog({surface:'gea-html-'+id,tool:'gea_plugin_page_apply',label:'Mock reception',elements:data.elements});if(catalog)validatePageCatalog(catalog);window.mockCatalogs[id]=data.elements;}catch(error){window.mockErrors.push(error.message);}}};frame.contentWindow.postMessage({protocol:'gea-html-v2',type:'connect',context:{session:'session-11111111-1111-4111-8111-111111111111',plugin:id}},'*',[channel.port2]);});`, resolveDir: process.cwd() }, bundle: true, write: false, format: 'iife', platform: 'browser' });
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

// MPS reception observes the existing authored iframe and current channel output.
test('received MPS publishes the committed visible demand edits and removes the previous step context', async t => {
  const page = await fixture(t, ['mps']);
  await page.evaluate(() => window.openPage('plan-category-production', 'mps'));
  const frame = page.frameLocator('iframe');
  await frame.locator('.ap-page-tab').filter({hasText:'需求加工'}).click();
  await expect.poll(() => page.evaluate(() => window.mockContexts['plan-category-production']?.parts?.navigation?.tab)).toBe('process');
  assert.deepEqual(await page.evaluate(() => window.mockContexts['plan-category-production'].parts.process.weights), {report:40,growth:40,ship:20});
  assert.equal(await page.evaluate(() => window.mockContexts['plan-category-production'].parts.process.rows[0].initialDemand), 2032500);
  const input = frame.locator('tbody tr').first().locator('input');
  await input.fill('2100000');
  await input.blur();
  await expect.poll(() => page.evaluate(() => window.mockContexts['plan-category-production']?.parts?.process?.rows[0].finalDemand)).toBe(2100000);
  await frame.locator('.ap-page-tab').filter({hasText:'本月预估发货'}).click();
  await expect.poll(() => page.evaluate(() => Object.keys(window.mockContexts['plan-category-production']?.parts ?? {}).sort())).toEqual(['navigation','ship']);
  assert.equal(await page.evaluate(() => window.mockContexts['plan-category-production'].mock),true);
  assert.deepEqual(await page.evaluate(() => window.mockErrors),[]);
  assert.equal(await page.evaluate(() => window.mockCatalogs['plan-category-production'].filter(row=>row.id.startsWith('tab:')).every(row=>row.effect==='view')),true);
  assert.equal(await page.evaluate(() => window.mockCatalogs['plan-category-production'].some(row=>row.id==='step:process')),false);
  assert.equal(await page.evaluate(() => window.mockCatalogs['plan-category-production'].some(row=>row.id==='step:ship')),true);
  assert.equal((await page.evaluate(() => window.applyMock({kind:'invoke',target:'tab:capacity',action:'invoke'}))).applied,true);
  await expect(frame.locator('.ap-board-title')).toHaveText('产能评估');
  const stale = await page.evaluate(() => window.applyMock({kind:'setValue',target:'step:ship',value:'old'}));
  assert.equal(stale.applied,false);
  assert.equal(stale.error,'ELEMENT_GONE');
  assert.deepEqual(await page.evaluate(() => window.mockErrors),[]);
});

test('received MPS restores separate steps and unfinished text when switching Session addresses', async t => {
  const page = await fixture(t, ['mps']);
  await page.evaluate(() => window.openPage('plan-category-production','mps'));
  const frame = page.frameLocator('iframe');
  await frame.locator('.ap-page-tab').filter({hasText:'需求加工'}).click();
  await expect.poll(()=>page.evaluate(()=>window.readState('plan-category-production')?.tab)).toBe('process');
  await page.evaluate(()=>{window.seedState('plan-category-production',{...window.readState('plan-category-production'),assistantDraft:'Session A 未发送文字'});window.hidePage();window.setViewSession('mock-session-B');});
  await page.evaluate(()=>window.openPage('plan-category-production','mps'));
  await expect(frame.locator('.ap-board-title')).toHaveText('需求确认');
  await expect(frame.locator('.author-draft-recovery')).toHaveCount(0);
  await frame.locator('.ap-page-tab').filter({hasText:'产能评估'}).click();
  await expect.poll(()=>page.evaluate(()=>window.mockContexts['plan-category-production']?.parts?.navigation?.tab)).toBe('capacity');
  await page.evaluate(()=>{window.hidePage();window.setViewSession('mock-session');});
  await page.evaluate(()=>window.openPage('plan-category-production','mps'));
  await expect(frame.locator('.ap-board-title')).toHaveText('需求加工与收敛');
  await expect(frame.locator('.author-draft-recovery pre')).toHaveText('Session A 未发送文字');
  await expect.poll(()=>page.evaluate(()=>Object.keys(window.mockContexts['plan-category-production']?.parts??{}).sort())).toEqual(['navigation','process']);
  assert.deepEqual(await page.evaluate(()=>window.mockErrors),[]);
});

test('received MPS context covers each mounted original step and preserves sample gaps and reference-only plans', async t => {
  const page = await fixture(t, ['mps']);
  await page.evaluate(()=>window.openPage('plan-category-production','mps'));
  const frame = page.frameLocator('iframe');
  for (const [key,label] of [['check','需求确认'],['process','需求加工'],['ship','本月预估发货'],['masterdata','主数据对应'],['constraints','约束与配置'],['plans','月度计划编制'],['capacity','产能评估'],['gap','缺口处置']]) {
    await frame.locator('.ap-page-tab').filter({hasText:label}).click();
    await expect.poll(()=>page.evaluate(()=>Object.keys(window.mockContexts['plan-category-production']?.parts??{}).sort())).toEqual(['navigation',key].sort());
    await expect.poll(()=>page.evaluate(()=>window.mockCatalogs['plan-category-production']?.filter(row=>row.id.startsWith('step:')).map(row=>row.id))).toEqual(['step:'+key]);
    const data = await page.evaluate(step=>window.mockContexts['plan-category-production'].parts[step],key);
    if (key==='check') assert.match(data.sources[0].note,/未同步/);
    if (key==='process') assert.equal(data.rows.find(row=>row.sku==='300g 奶黄包').report,null);
    if (key==='ship') assert.ok(data.missingBases.length>0);
    if (key==='masterdata') assert.ok(data.skuMappings.some(row=>!row.base||!row.shop||!row.lineId));
    if (key==='plans') assert.ok(data.rows.some(row=>row.ref===true));
    if (key==='gap') assert.ok(data.rows.every(row=>row.over));
  }
  assert.equal(await page.evaluate(()=>Object.hasOwn(window.readState('plan-category-production'),'parts')),false);
  assert.deepEqual(await page.evaluate(()=>window.mockErrors),[]);
});

test('received MPS commits the restored inputs before publishing into a rebound Session in the same iframe', async t => {
  const page = await fixture(t,['mps']);
  await page.evaluate(()=>window.openPage('plan-category-production','mps'));
  const frame = page.frameLocator('iframe');
  await frame.locator('.ap-page-tab').filter({hasText:'需求加工'}).click();
  await expect.poll(()=>page.evaluate(()=>window.mockContexts['plan-category-production']?.parts?.process?.weights)).toEqual({report:40,growth:40,ship:20});
  await page.evaluate(()=>{
    window.setViewSession('session-22222222-2222-4222-8222-222222222222');
    window.seedState('plan-category-production',{version:1,tab:'process',weights:{report:20,growth:50,ship:30},demandEdits:{'400g 黑芝麻':1900000},assistantDraft:'Session B 未发文字'});
    window.setViewSession('mock-session');
    window.contextMessages=[];
    window.switchViewSession('session-22222222-2222-4222-8222-222222222222');
  });
  await expect(frame.locator('.author-draft-recovery pre')).toHaveText('Session B 未发文字');
  await expect.poll(()=>page.evaluate(()=>window.mockContexts['plan-category-production']?.parts?.process?.weights)).toEqual({report:20,growth:50,ship:30});
  const records=await page.evaluate(()=>window.contextMessages.filter(row=>row.session==='session-22222222-2222-4222-8222-222222222222'));
  assert.ok(records.length>0);
  assert.ok(records.every(row=>row.context.parts.process?.rows[0].finalDemand===1900000));
  await page.evaluate(()=>window.switchViewSession('mock-session'));
  await expect.poll(()=>page.evaluate(()=>window.mockContexts['plan-category-production']?.parts?.process?.weights)).toEqual({report:40,growth:40,ship:20});
  assert.deepEqual(await page.evaluate(()=>window.mockErrors),[]);
});
