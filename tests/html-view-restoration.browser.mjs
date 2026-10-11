import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from './helpers/prepared-assets.mjs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
import { temporaryReferenceStorage } from './helpers/reference-storage.mjs';
const { outputFiles } = await build({
  stdin: {
    contents: `import{WorkbenchController}from'./src/workbench.ts';import{connectHtmlViewState}from'./src/html-view-channel.ts';import{validatePageCatalog}from'./src/page-bridge/catalog.ts';import{htmlPageCatalog}from'./src/html-page-catalog.ts';import{isBusinessViewPage}from'./src/html-view-state.ts';window.mockSession='session-11111111-1111-4111-8111-111111111111';let viewSession='mock-session';window.setViewSession=scope=>{viewSession=scope;};const viewScope=id=>isBusinessViewPage(id)?id==='plan-category-production'?viewSession:window.mockSession:undefined;window.mockContexts={};window.mockCatalogs={};window.mockChannels={};window.mockReplies={};window.mockErrors=[];window.contextMessages=[];const owner=new WorkbenchController({panel:()=>{},document:()=>{}});for(const[id,name]of[['workbench-html-table','sample'],['gea-regional-plan','regional'],['plan-region-category','category'],['plan-category-production','mps'],['inventory-customer','customer'],['inventory-orderworkbench','orderworkbench'],['inventory-orderfulfillment','fulfillment']])owner.registerFrame({id,kind:'html',src:'/'+name});let stop=()=>{},frame;window.openPage=async(id,name)=>{stop();frame?.remove();delete window.mockContexts[id];delete window.mockCatalogs[id];await owner.open(id);frame=document.createElement('iframe');frame.setAttribute('sandbox','allow-scripts');frame.style='width:1480px;height:920px;border:0';document.body.append(frame);stop=connectHtmlViewState(frame,id,viewScope(id),owner,new AbortController().signal);frame.src='/'+name;};window.hidePage=()=>{owner.leaveDocument();stop();frame?.remove();};window.rebindSession=async session=>{const id=owner.getSnapshot().selectedDocument.id;stop();window.mockSession=session;delete window.mockContexts[id];stop=connectHtmlViewState(frame,id,viewScope(id),owner,new AbortController().signal);window.mockChannels[id].postMessage({type:'context',context:{session,plugin:id}});};window.readState=id=>owner.readHtmlViewState(id,viewScope(id));window.seedState=(id,state)=>owner.saveHtmlViewState(id,viewScope(id),state);window.addEventListener('message',event=>{if(event.source!==frame?.contentWindow||event.data?.protocol!=='gea-html-v2'||event.data.type!=='ready')return;const id=owner.getSnapshot().selectedDocument.id;const channel=new MessageChannel();window.mockChannels[id]=channel.port1;window.switchViewSession=scope=>{viewSession=scope;stop();stop=connectHtmlViewState(frame,id,viewScope(id),owner,new AbortController().signal);window.mockSession=scope;channel.port1.postMessage({type:'context',context:{session:scope,plugin:id}});};let applied;window.applyMock=args=>new Promise(resolve=>{applied=resolve;channel.port1.postMessage({type:'apply',toolCallId:'fixture-apply',session:window.mockSession,args});});channel.port1.onmessage=({data})=>{if(data.type==='cancel')window.cancelContextTransport?.(data.id);if(data.type==='applied'){window.mockReplies[data.toolCallId]=data;applied?.(data);}if(data.type==='request'){if(data.method!=='context')window.mockErrors.push(data.method);window.mockContexts[id]=data.parameters;window.contextMessages.push({session:data.session,context:data.parameters});if(window.hostContextTransport){void window.hostContextTransport(data).then(result=>channel.port1.postMessage({type:'response',id:data.id,result}),error=>channel.port1.postMessage({type:'response',id:data.id,error:error.message}));}else channel.port1.postMessage({type:'response',id:data.id,result:{ok:true}});}if(data.type==='catalog'){try{const catalog=htmlPageCatalog({surface:'gea-html-'+id,tool:'gea_plugin_page_apply',label:'Mock reception',elements:data.elements});if(catalog)validatePageCatalog(catalog);window.mockCatalogs[id]=data.elements;}catch(error){window.mockErrors.push(error.message);}}};frame.contentWindow.postMessage({protocol:'gea-html-v2',type:'connect',context:{session:window.mockSession,plugin:id}},'*',[channel.port2]);});`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
});
const baseline = '312adf90f1abcc05d9421083b2386939634d8796';
async function fixture(t, includedAssets) {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  const assetPaths = {
    sample: 'lib/samples/index.html',
    regional: 'static/regional/index.html',
    category: 'static/category/index.html',
    mps: 'static/mps/index.html',
    customer: 'lib/business/inventory-customer/index.html',
    orderworkbench: 'lib/business/inventory-orderworkbench/index.html',
    fulfillment: 'lib/business/inventory-orderfulfillment/index.html',
  };
  const assets = Object.fromEntries(
    await Promise.all(
      (includedAssets ?? Object.keys(assetPaths)).map(async (name) => [
        name,
        await readFile(assetPaths[name], 'utf8'),
      ]),
    ),
  );
  if (process.env.MPS_CONTEXT_BASELINE)
    assets.mps = execFileSync(
      'git',
      ['show', process.env.MPS_CONTEXT_BASELINE + ':static/mps/index.html'],
      { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
    );
  if (process.env.HTML_VIEW_BASELINE === '1')
    assets.sample = execFileSync('git', ['show', `${baseline}:samples/html-table.html`], {
      encoding: 'utf8',
    }).replace('/* SHARED_THEME_RESOURCE */', await readFile('theme/tokens.css', 'utf8'));
  await page.route('http://127.0.0.1:19478/**', (route) => {
    const key = new URL(route.request().url()).pathname.slice(1);
    return route.fulfill({
      contentType: 'text/html',
      body: assets[key] ?? '<html><body></body></html>',
    });
  });
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
  await expect
    .poll(() => page.evaluate(() => window.readState('workbench-html-table')))
    .toEqual({ version: 1, keyword: '下单', stage: '进行中' });
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
  await expect
    .poll(() => page.evaluate(() => window.readState('plan-category-production')?.tab))
    .toBe('process');
  await page.evaluate(() =>
    window.seedState('plan-category-production', {
      ...window.readState('plan-category-production'),
      assistantDraft: '未发送的原型界面文字',
    }),
  );
  await page.evaluate(() => window.hidePage());
  await page.evaluate(() => window.openPage('plan-category-production', 'mps'));
  await expect(page.frameLocator('iframe').locator('.ap-board-title')).toHaveText('需求加工与收敛');
  await expect(page.frameLocator('iframe').locator('.author-draft-recovery pre')).toHaveText(
    '未发送的原型界面文字',
  );
});
test('Regional date and report dimension restore through their original script owner', async (t) => {
  const page = await fixture(t);
  await page.evaluate(() => window.openPage('gea-regional-plan', 'regional'));
  const frame = page.frameLocator('iframe');
  await frame.locator('#simBtn').click();
  await frame.locator('#simDate').fill('2026-10-12');
  await frame.locator('#simDate').dispatchEvent('change');
  await expect
    .poll(() => page.evaluate(() => window.readState('gea-regional-plan')?.date))
    .toBe('2026-10-12');
  await page.evaluate(() => window.hidePage());
  await page.evaluate(() => window.openPage('gea-regional-plan', 'regional'));
  await expect(page.frameLocator('iframe').locator('#simDate')).toHaveValue('2026-10-12');
  await page.frameLocator('iframe').locator('#rhythmBtn').click();
  await page.frameLocator('iframe').locator('.re-name').first().fill('未保存的节奏编辑');
  await expect
    .poll(() => page.evaluate(() => window.readState('gea-regional-plan')?.rhythmDraft?.[0]?.name))
    .toBe('未保存的节奏编辑');
  await page.evaluate(() => window.hidePage());
  await page.evaluate(() => window.openPage('gea-regional-plan', 'regional'));
  await expect(page.frameLocator('iframe').locator('.re-name').first()).toHaveValue(
    '未保存的节奏编辑',
  );
  assert.equal(
    await page.evaluate(() => Object.hasOwn(window.readState('gea-regional-plan'), 'ctx')),
    false,
    'derived data and contexts are not retained',
  );
});
test('Category selection and unfinished local input restore while tasks and simulated replies remain transient', async (t) => {
  const page = await fixture(t);
  await page.evaluate(() => window.openPage('plan-region-category', 'category'));
  const frame = page.frameLocator('iframe');
  const select = frame.locator('.scope-picker .arco-select');
  await select.click();
  await frame.locator('.arco-select-option').filter({ hasText: '面点' }).click();
  await expect
    .poll(() => page.evaluate(() => window.readState('plan-region-category')?.category))
    .toBeTruthy();
  const before = await select.innerText();
  await page.evaluate(() =>
    window.seedState('plan-region-category', {
      ...window.readState('plan-region-category'),
      draft: '未发送的品类界面文字',
    }),
  );
  await page.evaluate(() => window.hidePage());
  await page.evaluate(() => window.openPage('plan-region-category', 'category'));
  await expect(page.frameLocator('iframe').locator('.scope-picker .arco-select')).toHaveText(
    before,
  );
  await expect(page.frameLocator('iframe').locator('.author-draft-recovery pre')).toHaveText(
    '未发送的品类界面文字',
  );
  assert.equal(
    await page.evaluate(() => Object.hasOwn(window.readState('plan-region-category'), 'tasks')),
    false,
  );
  await page.evaluate(() => {
    window.hidePage();
    window.seedState('plan-region-category', { version: 1, category: 'unknown-category' });
  });
  await page.evaluate(() => window.openPage('plan-region-category', 'category'));
  await expect(page.frameLocator('iframe').locator('.scope-picker .arco-select')).toContainText(
    '全部品类',
  );
});

test('received customer mock preserves filters, pagination and visible current rows across iframe replacement', async (t) => {
  const page = await fixture(t);
  await page.evaluate(() => window.openPage('inventory-customer', 'customer'));
  await expect(page.frameLocator('iframe').getByPlaceholder('经销商筛选')).toBeVisible();
  await page.frameLocator('iframe').getByPlaceholder('经销商筛选').fill('佳特');
  await expect
    .poll(() => page.evaluate(() => window.mockContexts['inventory-customer']?.search))
    .toBe('佳特');
  await page.evaluate(() => window.hidePage());
  await page.evaluate(() => window.openPage('inventory-customer', 'customer'));
  await expect(page.frameLocator('iframe').getByPlaceholder('经销商筛选')).toHaveValue('佳特');
  await expect
    .poll(() => page.evaluate(() => window.mockContexts['inventory-customer']?.totalFilteredRows))
    .toBe(1);
  assert.deepEqual(await page.evaluate(() => window.mockErrors), []);
});
test('received order report restores the selected week and publishes current supported elements', async (t) => {
  const page = await fixture(t, ['orderworkbench']);
  await page.evaluate(() => window.openPage('inventory-orderworkbench', 'orderworkbench'));
  await page.frameLocator('iframe').locator('#weekMode').click();
  await expect
    .poll(() => page.evaluate(() => window.readState('inventory-orderworkbench')?.mode))
    .toBe('week');
  await page.evaluate(() => window.hidePage());
  await page.evaluate(() => window.openPage('inventory-orderworkbench', 'orderworkbench'));
  await expect(page.frameLocator('iframe').locator('#weekMode')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect
    .poll(() => page.evaluate(() => window.mockContexts['inventory-orderworkbench']?.period.mode))
    .toBe('week');
  assert.equal(
    await page.evaluate(() => window.mockContexts['inventory-orderworkbench']?.period.available),
    true,
    JSON.stringify(
      await page.evaluate(() => ({
        state: window.readState('inventory-orderworkbench'),
        period: window.mockContexts['inventory-orderworkbench']?.period,
      })),
    ),
  );
  await expect
    .poll(() => page.evaluate(() => window.mockCatalogs['inventory-orderworkbench']?.length ?? 0))
    .toBeGreaterThan(1);
  assert.deepEqual(await page.evaluate(() => window.mockErrors), []);
});
for (const [taskFilter, taskLabel] of [
  ['pending', '待跟进'],
  ['done', '已完成'],
]) {
  test(`received order report restores all events and the ${taskLabel} task filter highlight with their visible lists`, async (t) => {
    const page = await fixture(t, ['orderworkbench']);
    await page.evaluate(() => window.openPage('inventory-orderworkbench', 'orderworkbench'));
    const frame = page.frameLocator('iframe');
    await frame.getByRole('button', { name: '全部事项', exact: true }).click();
    await frame.getByRole('button', { name: new RegExp(`^${taskLabel}`) }).click();
    await expect
      .poll(() => page.evaluate(() => window.mockContexts['inventory-orderworkbench']?.filters))
      .toEqual({ event: 'all', task: taskFilter });
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
test('received fulfillment mock restores its filters and visible page without a business query', async (t) => {
  const page = await fixture(t);
  await page.evaluate(() => window.openPage('inventory-orderfulfillment', 'fulfillment'));
  await page.frameLocator('iframe').locator('#customerSearch').fill('10010126');
  await expect
    .poll(() => page.evaluate(() => window.readState('inventory-orderfulfillment')?.customer))
    .toBe('10010126');
  await page.evaluate(() => window.hidePage());
  await page.evaluate(() => window.openPage('inventory-orderfulfillment', 'fulfillment'));
  await expect(page.frameLocator('iframe').locator('#customerSearch')).toHaveValue('10010126');
  await expect
    .poll(() => page.evaluate(() => window.mockContexts['inventory-orderfulfillment']?.rows.length))
    .toBe(1);
  assert.deepEqual(await page.evaluate(() => window.mockErrors), []);
});

test('regional author reports the current module, period, dimension and original visible data through the public iframe', async (t) => {
  const page = await fixture(t);
  await page.evaluate(() => window.openPage('gea-regional-plan', 'regional'));
  const frame = page.frameLocator('iframe');
  await expect
    .poll(() => page.evaluate(() => window.mockContexts['gea-regional-plan']?.source))
    .toBe('regional-plan-prototype');
  await frame.locator('.modtab[data-mod="follow"]').click();
  await frame.locator('#repDim button[data-dim="province"]').click();
  await expect
    .poll(() => page.evaluate(() => window.mockContexts['gea-regional-plan']?.filters))
    .toMatchObject({ module: 'follow', dimension: 'province', date: '2026-09-18' });
  await expect
    .poll(() => page.evaluate(() => window.mockContexts['gea-regional-plan']?.period))
    .toMatchObject({ order: 'M', phase: 'open', label: '月计划' });
  await expect
    .poll(() =>
      page.evaluate(() => window.mockContexts['gea-regional-plan']?.customers.length ?? 0),
    )
    .toBeGreaterThan(0);
  await expect
    .poll(() =>
      page.evaluate(() => window.mockCatalogs['gea-regional-plan']?.map((row) => row.id) ?? []),
    )
    .toContain('filter:dimension');
  assert.equal(
    await page.evaluate(() =>
      window.mockCatalogs['gea-regional-plan'].some((row) => row.id === 'filter:date'),
    ),
    false,
  );
  await frame.locator('#simBtn').click();
  await expect
    .poll(() =>
      page.evaluate(() => window.mockCatalogs['gea-regional-plan']?.map((row) => row.id) ?? []),
    )
    .toContain('filter:date');
  await frame.locator('#simDate').fill('2026-10-12');
  await frame.locator('#simDate').dispatchEvent('change');
  await expect
    .poll(() => page.evaluate(() => window.mockContexts['gea-regional-plan']?.period))
    .toMatchObject({ order: 'Z', phase: 'open', label: '纠偏计划' });
  await page.evaluate(() => window.hidePage());
  await page.evaluate(() => window.openPage('gea-regional-plan', 'regional'));
  await expect(page.frameLocator('iframe').locator('.modtab[data-mod="follow"]')).toHaveClass(/on/);
  await expect
    .poll(() => page.evaluate(() => window.mockContexts['gea-regional-plan']?.filters))
    .toMatchObject({ module: 'follow', dimension: 'province', date: '2026-10-12' });
  assert.deepEqual(await page.evaluate(() => window.mockErrors), []);
});

test('regional UI restores only within its Core Session and a different Session starts with the original date', async (t) => {
  const page = await fixture(t);
  await page.evaluate(() => window.openPage('gea-regional-plan', 'regional'));
  await page.frameLocator('iframe').locator('#simBtn').click();
  await page.frameLocator('iframe').locator('#simDate').fill('2026-10-12');
  await page.frameLocator('iframe').locator('#simDate').dispatchEvent('change');
  await expect
    .poll(() => page.evaluate(() => window.readState('gea-regional-plan')?.date))
    .toBe('2026-10-12');
  await page.evaluate(() => {
    window.hidePage();
    window.mockSession = 'session-22222222-2222-4222-8222-222222222222';
  });
  await page.evaluate(() => window.openPage('gea-regional-plan', 'regional'));
  await expect(page.frameLocator('iframe').locator('#simDate')).toHaveValue('2026-09-18');
  await page.evaluate(() => {
    window.hidePage();
    window.mockSession = 'session-11111111-1111-4111-8111-111111111111';
  });
  await page.evaluate(() => window.openPage('gea-regional-plan', 'regional'));
  await expect(page.frameLocator('iframe').locator('#simDate')).toHaveValue('2026-10-12');
});

test('regional visible filters use the current public catalog and cancellation leaves the original author value unchanged', async (t) => {
  const page = await fixture(t);
  await page.evaluate(() => window.openPage('gea-regional-plan', 'regional'));
  await expect
    .poll(() => page.evaluate(() => window.mockCatalogs['gea-regional-plan']?.length ?? 0))
    .toBeGreaterThan(0);
  const apply = (id, target, value, cancel = false) =>
    page.evaluate(
      ({ id, target, value, cancel }) => {
        const port = window.mockChannels['gea-regional-plan'];
        port.postMessage({
          type: 'apply',
          session: window.mockSession,
          toolCallId: id,
          args: { kind: 'setValue', target, value },
        });
        if (cancel)
          port.postMessage({ type: 'cancel', session: window.mockSession, toolCallId: id });
      },
      { id, target, value, cancel },
    );
  await apply('hidden-dimension', 'filter:dimension', 'province');
  await expect
    .poll(() => page.evaluate(() => window.mockReplies['hidden-dimension']?.applied))
    .toBe(false);
  await apply('cancel-module', 'filter:module', 'follow', true);
  await expect
    .poll(() => page.evaluate(() => window.mockReplies['cancel-module']?.applied))
    .toBe(false);
  await expect(page.frameLocator('iframe').locator('.modtab[data-mod="overview"]')).toHaveClass(
    /on/,
  );
  await apply('change-module', 'filter:module', 'follow');
  await expect
    .poll(() => page.evaluate(() => window.mockReplies['change-module']?.applied))
    .toBe(true);
  await expect
    .poll(() => page.evaluate(() => window.mockContexts['gea-regional-plan']?.filters.module))
    .toBe('follow');
  await expect
    .poll(() =>
      page.evaluate(() => window.mockCatalogs['gea-regional-plan']?.map((row) => row.id) ?? []),
    )
    .toContain('filter:dimension');
  await apply('change-dimension', 'filter:dimension', 'province');
  await expect
    .poll(() => page.evaluate(() => window.mockReplies['change-dimension']?.applied))
    .toBe(true);
  await expect
    .poll(() => page.evaluate(() => window.mockContexts['gea-regional-plan']?.filters.dimension))
    .toBe('province');
  await page.frameLocator('iframe').locator('#simBtn').click();
  await expect
    .poll(() =>
      page.evaluate(() => window.mockCatalogs['gea-regional-plan']?.map((row) => row.id) ?? []),
    )
    .toContain('filter:date');
  await apply('invalid-date', 'filter:date', '2026-02-30');
  await expect
    .poll(() => page.evaluate(() => window.mockReplies['invalid-date']?.applied))
    .toBe(false);
  await expect(page.frameLocator('iframe').locator('#simDate')).toHaveValue('2026-09-18');
  assert.deepEqual(await page.evaluate(() => window.mockErrors), []);
});

test('regional mounted author restores and republishes after its existing channels move to another Core Session', async (t) => {
  const page = await fixture(t);
  await page.evaluate(() => window.openPage('gea-regional-plan', 'regional'));
  const frame = page.frameLocator('iframe');
  await expect
    .poll(() => page.evaluate(() => window.mockContexts['gea-regional-plan']?.source))
    .toBe('regional-plan-prototype');
  await frame.locator('#simBtn').click();
  await frame.locator('#simDate').fill('2026-10-12');
  await frame.locator('#simDate').dispatchEvent('change');
  await expect
    .poll(() => page.evaluate(() => window.mockContexts['gea-regional-plan']?.filters.date))
    .toBe('2026-10-12');
  await page.evaluate(() => window.rebindSession('session-22222222-2222-4222-8222-222222222222'));
  await expect(frame.locator('#simDate')).toHaveValue('2026-09-18');
  await expect
    .poll(() => page.evaluate(() => window.mockContexts['gea-regional-plan']?.filters.date))
    .toBe('2026-09-18');
  await frame.locator('#simDate').fill('2026-11-12');
  await frame.locator('#simDate').dispatchEvent('change');
  await expect
    .poll(() => page.evaluate(() => window.readState('gea-regional-plan')?.date))
    .toBe('2026-11-12');
  await page.evaluate(() => window.rebindSession('session-11111111-1111-4111-8111-111111111111'));
  await expect(frame.locator('#simDate')).toHaveValue('2026-10-12');
  await expect
    .poll(() => page.evaluate(() => window.mockContexts['gea-regional-plan']?.filters.date))
    .toBe('2026-10-12');
});

// MPS reception observes the existing authored iframe and current channel output.
test('received MPS publishes the committed visible demand edits and removes the previous step context', async (t) => {
  const page = await fixture(t, ['mps']);
  await page.evaluate(() => window.openPage('plan-category-production', 'mps'));
  const frame = page.frameLocator('iframe');
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工' }).click();
  await expect
    .poll(() =>
      page.evaluate(() => window.mockContexts['plan-category-production']?.parts?.navigation?.tab),
    )
    .toBe('process');
  assert.deepEqual(
    await page.evaluate(
      () => window.mockContexts['plan-category-production'].parts.process.weights,
    ),
    { report: 40, growth: 40, ship: 20 },
  );
  assert.equal(
    await page.evaluate(
      () => window.mockContexts['plan-category-production'].parts.process.rows[0].initialDemand,
    ),
    2032500,
  );
  const input = frame.locator('tbody tr').first().locator('input');
  await input.fill('2100000');
  await input.blur();
  await expect
    .poll(() =>
      page.evaluate(
        () => window.mockContexts['plan-category-production']?.parts?.process?.rows[0].finalDemand,
      ),
    )
    .toBe(2100000);
  await frame.locator('.ap-page-tab').filter({ hasText: '本月预估发货' }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        Object.keys(window.mockContexts['plan-category-production']?.parts ?? {}).sort(),
      ),
    )
    .toEqual(['navigation', 'ship']);
  assert.equal(
    await page.evaluate(() => window.mockContexts['plan-category-production'].mock),
    true,
  );
  assert.deepEqual(await page.evaluate(() => window.mockErrors), []);
  assert.equal(
    await page.evaluate(() =>
      window.mockCatalogs['plan-category-production']
        .filter((row) => row.id.startsWith('tab:'))
        .every((row) => row.effect === 'view'),
    ),
    true,
  );
  assert.equal(
    await page.evaluate(() =>
      window.mockCatalogs['plan-category-production'].some((row) => row.id === 'step:process'),
    ),
    false,
  );
  assert.equal(
    await page.evaluate(() =>
      window.mockCatalogs['plan-category-production'].some((row) => row.id === 'step:ship'),
    ),
    true,
  );
  assert.equal(
    (
      await page.evaluate(() =>
        window.applyMock({ kind: 'invoke', target: 'tab:capacity', action: 'invoke' }),
      )
    ).applied,
    true,
  );
  await expect(frame.locator('.ap-board-title')).toHaveText('产能评估');
  const stale = await page.evaluate(() =>
    window.applyMock({ kind: 'setValue', target: 'step:ship', value: 'old' }),
  );
  assert.equal(stale.applied, false);
  assert.equal(stale.error, 'ELEMENT_GONE');
  assert.deepEqual(await page.evaluate(() => window.mockErrors), []);
});

test('received MPS restores separate steps and unfinished text when switching Session addresses', async (t) => {
  const page = await fixture(t, ['mps']);
  await page.evaluate(() => window.openPage('plan-category-production', 'mps'));
  const frame = page.frameLocator('iframe');
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工' }).click();
  await expect
    .poll(() => page.evaluate(() => window.readState('plan-category-production')?.tab))
    .toBe('process');
  await page.evaluate(() => {
    window.seedState('plan-category-production', {
      ...window.readState('plan-category-production'),
      assistantDraft: 'Session A 未发送文字',
    });
    window.hidePage();
    window.setViewSession('mock-session-B');
  });
  await page.evaluate(() => window.openPage('plan-category-production', 'mps'));
  await expect(frame.locator('.ap-board-title')).toHaveText('需求确认');
  await expect(frame.locator('.author-draft-recovery')).toHaveCount(0);
  await frame.locator('.ap-page-tab').filter({ hasText: '产能评估' }).click();
  await expect
    .poll(() =>
      page.evaluate(() => window.mockContexts['plan-category-production']?.parts?.navigation?.tab),
    )
    .toBe('capacity');
  await page.evaluate(() => {
    window.hidePage();
    window.setViewSession('mock-session');
  });
  await page.evaluate(() => window.openPage('plan-category-production', 'mps'));
  await expect(frame.locator('.ap-board-title')).toHaveText('需求加工与收敛');
  await expect(frame.locator('.author-draft-recovery pre')).toHaveText('Session A 未发送文字');
  await expect
    .poll(() =>
      page.evaluate(() =>
        Object.keys(window.mockContexts['plan-category-production']?.parts ?? {}).sort(),
      ),
    )
    .toEqual(['navigation', 'process']);
  assert.deepEqual(await page.evaluate(() => window.mockErrors), []);
});

test('received MPS context covers each mounted original step and preserves sample gaps and reference-only plans', async (t) => {
  const page = await fixture(t, ['mps']);
  await page.evaluate(() => window.openPage('plan-category-production', 'mps'));
  const frame = page.frameLocator('iframe');
  for (const [key, label] of [
    ['check', '需求确认'],
    ['process', '需求加工'],
    ['ship', '本月预估发货'],
    ['masterdata', '主数据对应'],
    ['constraints', '约束与配置'],
    ['plans', '月度计划编制'],
    ['capacity', '产能评估'],
    ['gap', '缺口处置'],
  ]) {
    await frame.locator('.ap-page-tab').filter({ hasText: label }).click();
    await expect
      .poll(() =>
        page.evaluate(() =>
          Object.keys(window.mockContexts['plan-category-production']?.parts ?? {}).sort(),
        ),
      )
      .toEqual(['navigation', key].sort());
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.mockCatalogs['plan-category-production']
            ?.filter((row) => row.id.startsWith('step:'))
            .map((row) => row.id),
        ),
      )
      .toEqual(['step:' + key]);
    const data = await page.evaluate(
      (step) => window.mockContexts['plan-category-production'].parts[step],
      key,
    );
    if (key === 'check') assert.match(data.sources[0].note, /未同步/);
    if (key === 'process')
      assert.equal(data.rows.find((row) => row.sku === '300g 奶黄包').report, null);
    if (key === 'ship') assert.ok(data.missingBases.length > 0);
    if (key === 'masterdata')
      assert.ok(data.skuMappings.some((row) => !row.base || !row.shop || !row.lineId));
    if (key === 'plans') assert.ok(data.rows.some((row) => row.ref === true));
    if (key === 'gap') assert.ok(data.rows.every((row) => row.over));
  }
  assert.equal(
    await page.evaluate(() => Object.hasOwn(window.readState('plan-category-production'), 'parts')),
    false,
  );
  assert.deepEqual(await page.evaluate(() => window.mockErrors), []);
});

test('received MPS commits the restored inputs before publishing into a rebound Session in the same iframe', async (t) => {
  const page = await fixture(t, ['mps']);
  await page.evaluate(() => window.openPage('plan-category-production', 'mps'));
  const frame = page.frameLocator('iframe');
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工' }).click();
  await expect
    .poll(() =>
      page.evaluate(() => window.mockContexts['plan-category-production']?.parts?.process?.weights),
    )
    .toEqual({ report: 40, growth: 40, ship: 20 });
  await page.evaluate(() => {
    window.setViewSession('session-22222222-2222-4222-8222-222222222222');
    window.seedState('plan-category-production', {
      version: 1,
      tab: 'process',
      weights: { report: 20, growth: 50, ship: 30 },
      demandEdits: { '400g 黑芝麻': 1900000 },
      assistantDraft: 'Session B 未发文字',
    });
    window.setViewSession('mock-session');
    window.contextMessages = [];
    window.switchViewSession('session-22222222-2222-4222-8222-222222222222');
  });
  await expect(frame.locator('.author-draft-recovery pre')).toHaveText('Session B 未发文字');
  await expect
    .poll(() =>
      page.evaluate(() => window.mockContexts['plan-category-production']?.parts?.process?.weights),
    )
    .toEqual({ report: 20, growth: 50, ship: 30 });
  const records = await page.evaluate(() =>
    window.contextMessages.filter(
      (row) => row.session === 'session-22222222-2222-4222-8222-222222222222',
    ),
  );
  assert.ok(records.length > 0);
  assert.ok(
    records.every((row) => row.context.parts.process?.rows[0].finalDemand === 1900000),
    JSON.stringify(
      records.map((row) => ({
        session: row.session,
        parts: Object.keys(row.context.parts),
        tab: row.context.parts.navigation?.tab,
        weights: row.context.parts.process?.weights,
        row: row.context.parts.process?.rows[0],
      })),
      null,
      2,
    ),
  );
  for (const row of records) {
    assert.equal(row.context.parts.navigation.tab, 'process');
    assert.deepEqual(row.context.parts.process.weights, { report: 20, growth: 50, ship: 30 });
  }
  await page.evaluate(() => {
    window.contextMessages = [];
    window.switchViewSession('mock-session');
  });
  await expect
    .poll(() =>
      page.evaluate(() => window.mockContexts['plan-category-production']?.parts?.process?.weights),
    )
    .toEqual({ report: 40, growth: 40, ship: 20 });
  const returning = await page.evaluate(() =>
    window.contextMessages.filter((row) => row.session === 'mock-session'),
  );
  assert.ok(returning.length > 0);
  for (const row of returning) {
    assert.equal(row.context.parts.navigation.tab, 'process');
    assert.deepEqual(row.context.parts.process.weights, { report: 40, growth: 40, ship: 20 });
    assert.deepEqual(row.context.parts.process.adjustments, {});
  }
  assert.deepEqual(await page.evaluate(() => window.mockErrors), []);
});

// Delay only the external transport. Context writes and reads use the real public
// PageRuntime route and official Core tool service, never the iframe observation map.
async function publicMpsContext(t, page) {
  const official = (path) => pathToFileURL(resolve('../../official-latest-standard', path)).href;
  const { Context } = await import(official('vendor/cordis/lib/index.js'));
  const { default: Tools } = await import(official('packages/core/tools/lib/index.js'));
  const { default: SystemPrompt } = await import(
    official('packages/core/system-prompt/lib/index.js')
  );
  const { default: Agents } = await import(official('packages/core/agent/lib/index.js'));
  const { createScope } = await import(official('packages/core/scope/lib/index.js'));
  const {
    default: Sessions,
    Session,
    SessionId,
  } = await import(official('packages/core/session/lib/index.js'));
  const { default: Typert } = await import(official('packages/typert/registry/lib/index.js'));
  const { default: Projections } = await import(
    official('packages/session/session-projection/lib/index.js')
  );
  const { default: Query } = await import(
    official('packages/session-query/session-query/lib/index.js')
  );
  const { default: SessionController } = await import(
    official('packages/api/session-controller/lib/index.js')
  );
  const compiled = await build({
    entryPoints: ['src/html-pages.ts'],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
    plugins: [
      {
        name: 'official-tools',
        setup(builder) {
          builder.onResolve({ filter: /^@deepseek-ai\/dsh-tools$/ }, () => ({
            path: official('packages/core/tools/lib/index.js'),
            external: true,
          }));
        },
      },
    ],
  });
  await mkdir('.scratch', { recursive: true });
  await writeFile('.scratch/mps-public-runtime.mjs', compiled.outputFiles[0].text);
  const { HtmlPages } = await import(
    pathToFileURL(resolve('.scratch/mps-public-runtime.mjs')).href
  );
  const ctx = new Context(),
    routes = new Map(),
    owners = new Map(),
    agents = new Map();
  ctx.provide('connection', {
    fetch: {
      register(route) {
        routes.set(route.path, route);
        return () => routes.delete(route.path);
      },
    },
  });
  await temporaryReferenceStorage(t, ctx);
  await ctx.plugin(SystemPrompt, {});
  await ctx.plugin(Typert);
  await ctx.plugin(Sessions);
  await ctx.plugin(Projections);
  new Query(ctx);
  ctx.provide('agentDefaultModel', {
    currentSelection: () => ({ provider: 'fixture', model: 'fixture-model' }),
    saveSelection: async () => {},
  });
  ctx.provide('fileUploads', {
    registerAgentResolver: () => () => {},
    resolve: () => undefined,
    bindPrompt: () => ({ commit() {}, [Symbol.dispose]() {} }),
    retirePrompt() {},
  });
  new SessionController(ctx, { nativeOpen: false });
  await ctx.plugin(Tools);
  await ctx.plugin(Agents);
  for (const value of [
    'session-11111111-1111-4111-8111-111111111111',
    'session-22222222-2222-4222-8222-222222222222',
  ]) {
    const id = SessionId(value),
      agent = { id, session: Session.create(id) };
    await ctx.plugin(
      Object.assign(
        (inner) => {
          agent.ctx = createScope(inner, agent).ctx;
        },
        { inject: ['tools', 'systemPrompt'] },
      ),
    );
    await ctx.agents.register(agent);
    agents.set(value, agent);
  }
  let pages;
  await ctx.plugin(
    Object.assign(
      (inner) => {
        pages = new HtmlPages(inner, '', async () => '<picker-fixture>');
      },
      { inject: ['connection', 'tools', 'agents'] },
    ),
  );
  pages.registerBusinessPage(
    {
      id: 'plan-category-production',
      pluginId: 'inventory-mps',
      label: 'MPS mock',
      kind: 'html',
      resourceId: 'gea-html-inventory-mps',
      catalog: { surface: 'gea-html-inventory-mps', tool: 'gea_plugin_page_apply' },
    },
    async () => ({
      signal: new AbortController().signal,
      access: { mode: 'mock' },
      allowsEffect: (effect) => effect === 'view',
      release() {},
    }),
  );
  t.after(() => ctx.fiber.dispose());
  const call = async (input) => {
    const response = await routes.get('/api/agent-workbench/page').fetch(
      new Request('https://local/api/agent-workbench/page', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    );
    if (!response.ok) throw Error(JSON.stringify(await response.json()));
    return response.json();
  };
  for (const sessionId of agents.keys())
    owners.set(
      sessionId,
      (
        await call({
          operation: 'open',
          pageId: 'plan-category-production',
          sessionId,
          resourceId: 'gea-html-inventory-mps',
        })
      ).owner,
    );
  await page.exposeFunction('submitHostContext', async (data) =>
    call({ operation: 'context', owner: owners.get(data.session), parameters: data.parameters }),
  );
  await page.exposeFunction('closeHostPage', async (session) =>
    call({ operation: 'close', owner: owners.get(session) }),
  );
  await page.evaluate(() => {
    const pending = new Map();
    let holdStep, release, heldDelivery;
    window.holdHostContext = (step) => {
      holdStep = step;
      window.heldHostContext = undefined;
      window.heldContextCancelled = false;
    };
    window.releaseHostContext = async () => {
      release?.();
      await heldDelivery;
    };
    window.cancelContextTransport = (id) => pending.get(id)?.abort();
    window.hostContextTransport = (data) => {
      const controller = new AbortController();
      pending.set(data.id, controller);
      let finish;
      const finished = new Promise((resolve) => {
        finish = resolve;
      });
      const delivery = (async () => {
        if (data.parameters.parts.navigation.tab === holdStep) {
          holdStep = undefined;
          window.heldHostContext = data.parameters;
          heldDelivery = finished;
          controller.signal.addEventListener(
            'abort',
            () => {
              window.heldContextCancelled = true;
            },
            { once: true },
          );
          await new Promise((resolve) => {
            release = resolve;
            controller.signal.addEventListener('abort', resolve, { once: true });
          });
        }
        controller.signal.throwIfAborted();
        return window.submitHostContext(data);
      })();
      return delivery.finally(() => {
        pending.delete(data.id);
        finish();
      });
    };
  });
  const observed = new Map();
  return async (session = 'session-11111111-1111-4111-8111-111111111111') => {
    const result = await ctx.tools.execute({
      callId: crypto.randomUUID(),
      name: 'gea_page',
      arguments: { action: 'context' },
      agent: agents.get(session),
      signal: new AbortController().signal,
    });
    const value = JSON.parse(result.value);
    if (!value.unchanged) observed.set(session, value.context);
    return observed.get(session);
  };
}
test('MPS Host context stays at the latest visible step when an earlier transport delivery is delayed', async (t) => {
  const page = await fixture(t, ['mps']),
    readHost = await publicMpsContext(t, page);
  await page.evaluate(() => window.openPage('plan-category-production', 'mps'));
  await expect.poll(async () => (await readHost())?.parts?.navigation?.tab).toBe('check');
  await page.evaluate(() => window.holdHostContext('process'));
  const frame = page.frameLocator('iframe');
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工' }).click();
  await expect
    .poll(() => page.evaluate(() => window.heldHostContext?.parts?.navigation?.tab))
    .toBe('process');
  await frame.locator('tbody tr').first().locator('input').fill('2100000');
  await frame.locator('tbody tr').first().locator('input').blur();
  await frame.locator('.ap-page-tab').filter({ hasText: '产能评估' }).click();
  await expect(frame.locator('.ap-board-title')).toHaveText('产能评估');
  await page.evaluate(() => window.releaseHostContext());
  await expect
    .poll(async () => Object.keys((await readHost())?.parts ?? {}).sort())
    .toEqual(['capacity', 'navigation']);
  assert.deepEqual(await page.evaluate(() => window.mockErrors), []);
});

test('MPS Host context keeps the latest edited demand when an earlier value arrives late', async (t) => {
  const page = await fixture(t, ['mps']),
    readHost = await publicMpsContext(t, page);
  await page.evaluate(() => window.openPage('plan-category-production', 'mps'));
  await expect.poll(async () => (await readHost())?.parts?.navigation?.tab).toBe('check');
  await page.evaluate(() => window.holdHostContext('process'));
  const frame = page.frameLocator('iframe');
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工' }).click();
  await expect
    .poll(() => page.evaluate(() => window.heldHostContext?.parts?.navigation?.tab))
    .toBe('process');
  const input = frame.locator('tbody tr').first().locator('input');
  await input.fill('2100000');
  await input.blur();
  await expect
    .poll(() =>
      page.evaluate(
        () => window.readState('plan-category-production')?.demandEdits?.['400g 黑芝麻'],
      ),
    )
    .toBe(2100000);
  await page.evaluate(() => window.releaseHostContext());
  await expect
    .poll(async () => (await readHost())?.parts?.process?.rows[0].finalDemand)
    .toBe(2100000);
});
test('MPS Host context discards a held old Session publication before restored authors publish into the new Session', async (t) => {
  const page = await fixture(t, ['mps']),
    readHost = await publicMpsContext(t, page);
  await page.evaluate(() => window.openPage('plan-category-production', 'mps'));
  await expect.poll(async () => (await readHost())?.parts?.navigation?.tab).toBe('check');
  await page.evaluate(() => window.holdHostContext('process'));
  const frame = page.frameLocator('iframe');
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工' }).click();
  await expect
    .poll(() => page.evaluate(() => window.heldHostContext?.parts?.navigation?.tab))
    .toBe('process');
  await frame.locator('.ap-page-tab').filter({ hasText: '产能评估' }).click();
  // Settle the authored navigation/hash event before rebinding its Session;
  // the external context delivery remains held across the entire switch.
  await expect(frame.locator('.ap-board-title')).toHaveText('产能评估');
  await expect
    .poll(() => page.evaluate(() => window.readState('plan-category-production')?.tab))
    .toBe('capacity');
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  const beforeSwitch = await readHost();
  await page.evaluate(() => {
    const next = 'session-22222222-2222-4222-8222-222222222222';
    window.setViewSession(next);
    window.seedState('plan-category-production', {
      version: 1,
      tab: 'ship',
      assistantDraft: '新Session未发文字',
    });
    window.setViewSession('mock-session');
    window.switchViewSession(next);
  });
  await expect(frame.locator('.ap-board-title')).toHaveText('本月预估发货');
  await page.evaluate(() => window.releaseHostContext());
  await expect
    .poll(async () =>
      Object.keys(
        (await readHost('session-22222222-2222-4222-8222-222222222222'))?.parts ?? {},
      ).sort(),
    )
    .toEqual(['navigation', 'ship']);
  assert.deepEqual(await readHost(), beforeSwitch);
  await expect(frame.locator('.author-draft-recovery pre')).toHaveText('新Session未发文字');
});
test('MPS Host context does not receive a delayed old snapshot after the authored page hides', async (t) => {
  const page = await fixture(t, ['mps']),
    readHost = await publicMpsContext(t, page);
  await page.evaluate(() => window.openPage('plan-category-production', 'mps'));
  await expect.poll(async () => (await readHost())?.parts?.navigation?.tab).toBe('check');
  await page.evaluate(() => window.holdHostContext('process'));
  const frame = page.frameLocator('iframe');
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工' }).click();
  await expect
    .poll(() => page.evaluate(() => window.heldHostContext?.parts?.navigation?.tab))
    .toBe('process');
  await frame.locator('.ap-page-tab').filter({ hasText: '产能评估' }).click();
  const beforeHide = await readHost();
  await frame.locator('body').evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await expect.poll(() => page.evaluate(() => window.heldContextCancelled)).toBe(true);
  await page.evaluate(() => window.releaseHostContext());
  assert.deepEqual(await readHost(), beforeHide);
});

test('MPS Host context remains unavailable after identity withdrawal even when a held delivery is released', async (t) => {
  const page = await fixture(t, ['mps']),
    readHost = await publicMpsContext(t, page);
  await page.evaluate(() => window.openPage('plan-category-production', 'mps'));
  await expect.poll(async () => (await readHost())?.parts?.navigation?.tab).toBe('check');
  await page.evaluate(() => window.holdHostContext('process'));
  const frame = page.frameLocator('iframe');
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工' }).click();
  await expect
    .poll(() => page.evaluate(() => window.heldHostContext?.parts?.navigation?.tab))
    .toBe('process');
  await frame.locator('.ap-page-tab').filter({ hasText: '产能评估' }).click();
  await page.evaluate(async () => {
    await window.closeHostPage(window.mockSession);
    window.mockChannels['plan-category-production'].postMessage({ type: 'identity-changed' });
  });
  await expect.poll(readHost).toBeUndefined();
  await page.evaluate(() => window.releaseHostContext());
  assert.equal(await readHost(), undefined);
});
