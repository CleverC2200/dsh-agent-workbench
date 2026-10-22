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
    contents: `import{WorkbenchController}from'./src/workbench.ts';import{connectHtmlViewState}from'./src/html-view-channel.ts';import{validatePageCatalog}from'./src/page-bridge/catalog.ts';import{htmlPageCatalog}from'./src/html-page-catalog.ts';import{isBusinessViewPage}from'./src/html-view-state.ts';window.mockSession='session-11111111-1111-4111-8111-111111111111';let viewSession='mock-session';window.setViewSession=scope=>{viewSession=scope;};const viewScope=id=>isBusinessViewPage(id)?id==='plan-category-production'?viewSession:window.mockSession:undefined;window.mockContexts={};window.mockCatalogs={};window.mockChannels={};window.mockReplies={};window.mockErrors=[];window.contextMessages=[];const owner=new WorkbenchController({panel:()=>{},document:()=>{}});for(const[id,name]of[['workbench-html-table','sample'],['gea-regional-plan','regional'],['plan-region-category','category'],['plan-category-production','mps'],['inventory-customer','customer'],['inventory-orderworkbench','orderworkbench'],['inventory-orderfulfillment','fulfillment']])owner.registerFrame({id,kind:'html',src:'/'+name});let stop=()=>{},frame;window.openPage=async(id,name)=>{stop();frame?.remove();delete window.mockContexts[id];delete window.mockCatalogs[id];await owner.open(id);frame=document.createElement('iframe');frame.setAttribute('sandbox','allow-scripts');frame.style='width:1480px;height:920px;border:0';document.body.append(frame);stop=connectHtmlViewState(frame,id,viewScope(id),owner,new AbortController().signal);frame.src='/'+name;};window.hidePage=()=>{owner.leaveDocument();stop();frame?.remove();};window.rebindSession=async session=>{const id=owner.getSnapshot().selectedDocument.id;stop();window.mockSession=session;delete window.mockContexts[id];stop=connectHtmlViewState(frame,id,viewScope(id),owner,new AbortController().signal);window.mockChannels[id].postMessage({type:'context',context:{session,plugin:id}});};window.readState=id=>owner.readHtmlViewState(id,viewScope(id));window.seedState=(id,state)=>owner.saveHtmlViewState(id,viewScope(id),state);window.addEventListener('message',event=>{if(event.source!==frame?.contentWindow||event.data?.protocol!=='gea-html-v2'||event.data.type!=='ready')return;const id=owner.getSnapshot().selectedDocument.id;const channel=new MessageChannel();window.mockChannels[id]=channel.port1;window.switchViewSession=scope=>{viewSession=scope;stop();stop=connectHtmlViewState(frame,id,viewScope(id),owner,new AbortController().signal);window.mockSession=scope;channel.port1.postMessage({type:'context',context:{session:scope,plugin:id}});};let applied;window.applyMock=args=>new Promise(resolve=>{applied=resolve;channel.port1.postMessage({type:'apply',toolCallId:'fixture-apply',session:window.mockSession,args});});channel.port1.onmessage=({data})=>{if(data.type==='cancel')window.cancelContextTransport?.(data.id);if(data.type==='applied'){window.mockReplies[data.toolCallId]=data;applied?.(data);}if(data.type==='request'){if(data.method==='sql'&&id==='inventory-orderfulfillment'){const query=data.parameters.queryId;const rows=query.endsWith('.count')?[{total:0}]:query.endsWith('.summary')?[{source_orders:0,source_rows:0,matched_orders:0,overdue_orders:0,warning_orders:0}]:[];channel.port1.postMessage({type:'response',id:data.id,result:{rows,configVersion:'v1',returnedColumns:Object.keys(rows[0]??{}),rejectedColumns:[]}});}else if(data.method==='sql'&&id==='inventory-customer'){const rows=[{snapshot_date:'2026-10-17',cust_code:'10154963',cust_name:'郑州佳特商贸有限公司',region_name:'华中大区',province_name:'河南省',stock_qty:300,stock_amt:60000,sales_qty_30days:150,normal_stock_qty:270,no_sales_sku:2,sku_rows:3,stock_coverage:3,value_coverage:3,sales_coverage:3,normal_coverage:3}];channel.port1.postMessage({type:'response',id:data.id,result:{rows,total:rows.length,returnedColumns:Object.keys(rows[0]),rejectedColumns:[]}});}else{if(data.method!=='context')window.mockErrors.push(data.method);window.mockContexts[id]=data.parameters;window.contextMessages.push({session:data.session,context:data.parameters});if(window.hostContextTransport){void window.hostContextTransport(data).then(result=>channel.port1.postMessage({type:'response',id:data.id,result}),error=>channel.port1.postMessage({type:'response',id:data.id,error:error.message}));}else channel.port1.postMessage({type:'response',id:data.id,result:{ok:true}});}}if(data.type==='catalog'){try{const catalog=htmlPageCatalog({surface:'gea-html-'+id,tool:'gea_plugin_page_apply',label:'Mock reception',elements:data.elements});if(catalog)validatePageCatalog(catalog);window.mockCatalogs[id]=data.elements;}catch(error){window.mockErrors.push(error.message);}}};frame.contentWindow.postMessage({protocol:'gea-html-v2',type:'connect',context:{session:window.mockSession,plugin:id}},'*',[channel.port2]);});`,
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
    regional: 'lib/static/regional/index.html',
    category: 'lib/static/category/index.html',
    mps: 'lib/static/mps/index.html',
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
  await page.frameLocator('iframe').locator('#periodPickerTrigger').click();
  await page.frameLocator('iframe').locator('[data-period-week="2026-08-31"]').click();
  await expect
    .poll(() => page.evaluate(() => window.readState('inventory-orderworkbench')?.mode))
    .toBe('week');
  await page.evaluate(() => window.hidePage());
  await page.evaluate(() => window.openPage('inventory-orderworkbench', 'orderworkbench'));
  await expect(page.frameLocator('iframe').locator('#periodPickerTrigger')).toContainText(
    '2026年9月 · 第一周',
  );
  await expect
    .poll(() => page.evaluate(() => window.readState('inventory-orderworkbench')?.week))
    .toBe('2026-08-31');
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
  test(`received order report restores the retained ${taskLabel} filter while task controls remain hidden`, async (t) => {
    const page = await fixture(t, ['orderworkbench']);
    await page.evaluate(
      (task) =>
        window.seedState('inventory-orderworkbench', {
          version: 1,
          mode: 'week',
          month: '2026-09',
          week: '2026-08-31',
          task,
        }),
      taskFilter,
    );
    await page.evaluate(() => window.openPage('inventory-orderworkbench', 'orderworkbench'));
    const frame = page.frameLocator('iframe');
    await expect
      .poll(() =>
        page.evaluate(() => window.mockContexts['inventory-orderworkbench']?.filters.task),
      )
      .toBe(taskFilter);
    await expect(frame.locator('#wbTaskSection')).toBeHidden();
    await expect
      .poll(() => page.evaluate(() => window.mockContexts['inventory-orderworkbench']?.tasks))
      .toEqual([]);
    await page.evaluate(() => window.hidePage());
    await page.evaluate(() => window.openPage('inventory-orderworkbench', 'orderworkbench'));
    await expect
      .poll(() =>
        page.evaluate(() => window.mockContexts['inventory-orderworkbench']?.filters.task),
      )
      .toBe(taskFilter);
    await expect(frame.locator('#wbTaskSection')).toBeHidden();
    await expect(frame.locator('[data-wb-dimension-tab="base-performance"]')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    assert.deepEqual(await page.evaluate(() => window.mockErrors), []);
  });
}
test('received live fulfillment restores its filters and dimension across iframe replacement', async (t) => {
  const page = await fixture(t);
  await page.evaluate(() => window.openPage('inventory-orderfulfillment', 'fulfillment'));
  const frame = page.frameLocator('iframe');
  await frame.locator('#deliveryCustomerQuery').fill('10010126');
  await frame.locator('[data-fulfillment-dimension="warehouseDimensionPanel"]').click();
  await expect
    .poll(() => page.evaluate(() => window.readState('inventory-orderfulfillment')))
    .toMatchObject({ deliveryCustomerQuery: '10010126', dimension: 'warehouseDimensionPanel' });
  await page.evaluate(() => window.hidePage());
  await page.evaluate(() => window.openPage('inventory-orderfulfillment', 'fulfillment'));
  await expect(frame.locator('#deliveryCustomerQuery')).toHaveValue('10010126');
  await expect(
    frame.locator('[data-fulfillment-dimension="warehouseDimensionPanel"]'),
  ).toHaveAttribute('aria-selected', 'true');
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
  const apply = (id, target, value) =>
    page.evaluate(
      ({ id, target, value }) => {
        const port = window.mockChannels['gea-regional-plan'];
        port.postMessage({
          type: 'apply',
          session: window.mockSession,
          toolCallId: id,
          args: { kind: 'setValue', target, value },
        });
      },
      { id, target, value },
    );
  const cancel = (id) =>
    page.evaluate(
      (id) =>
        window.mockChannels['gea-regional-plan'].postMessage({
          type: 'cancel',
          session: window.mockSession,
          toolCallId: id,
        }),
      id,
    );
  await apply('hidden-dimension', 'filter:dimension', 'province');
  await expect
    .poll(() => page.evaluate(() => window.mockReplies['hidden-dimension']?.applied))
    .toBe(false);
  const author = page.frames().find((frame) => frame.url().endsWith('/regional'));
  assert.ok(author);
  // Hold the author's application frame so cancellation reaches its actual pending task.
  await author.evaluate(() => {
    const requestFrame = window.requestAnimationFrame;
    const checkAbort = AbortSignal.prototype.throwIfAborted;
    AbortSignal.prototype.throwIfAborted = function () {
      window.pendingApplicationSignal = this;
      AbortSignal.prototype.throwIfAborted = checkAbort;
      return checkAbort.call(this);
    };
    window.requestAnimationFrame = (callback) => {
      window.requestAnimationFrame = requestFrame;
      window.releaseApplicationFrame = () => requestFrame(callback);
      return 0;
    };
  });
  await apply('cancel-module', 'filter:module', 'follow');
  await expect
    .poll(() => author.evaluate(() => typeof window.releaseApplicationFrame))
    .toBe('function');
  await cancel('cancel-module');
  await expect
    .poll(() => author.evaluate(() => window.pendingApplicationSignal?.aborted))
    .toBe(true);
  await author.evaluate(() => window.releaseApplicationFrame());
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
  await cancel('change-module');
  await author.evaluate(() => new Promise(requestAnimationFrame));
  assert.equal(
    await page.evaluate(() => window.mockReplies['change-module'].applied),
    true,
    'cancellation after completion does not revoke the successful receipt',
  );
  await expect(page.frameLocator('iframe').locator('.modtab[data-mod="follow"]')).toHaveClass(/on/);
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
test('received MPS publishes committed source edits and removes the previous step context', async (t) => {
  const page = await fixture(t, ['mps']);
  await page.evaluate(() => window.openPage('plan-category-production', 'mps'));
  const frame = page.frameLocator('iframe');
  await frame.getByRole('button', { name: '新建评估版本', exact: true }).click();
  const dialog = frame.getByRole('dialog', { name: '新建评估版本', exact: true });
  await dialog.getByLabel('评估月份', { exact: true }).fill('2026-10');
  await dialog.getByRole('button', { name: '创建本地版本', exact: true }).click();
  await frame.getByLabel('选择产品关系CSV', { exact: true }).setInputFiles({
    name: 'products.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '基地,产品编码,产品名称,大类,系列,物料组,老品编码,老品名称\n郑州,A,产品甲,汤圆,系列,组,,',
    ),
  });
  await frame.getByLabel('选择计划提报CSV', { exact: true }).setInputFiles({
    name: 'report.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '月份,基地,产品编码,产品名称,大类,系列,物料组,月初数量,纠偏数量\n2026-10,郑州,A,产品甲,汤圆,系列,组,18,20',
    ),
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.mockContexts['plan-category-production']?.parts?.check?.sourceSummaries?.report
            ?.quantity,
      ),
    )
    .toBe(18);
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工' }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.mockContexts['plan-category-production']?.parts?.process?.rows[0]?.reportQuantity,
      ),
    )
    .toBe(18);
  const processed = await page.evaluate(
    () => window.mockContexts['plan-category-production'].parts.process,
  );
  assert.equal(processed.rows[0].demand, null);
  assert.ok(processed.rows[0].missing.demand.length);
  assert.equal(Object.hasOwn(processed, 'weights'), false);
  await frame.locator('.ap-page-tab').filter({ hasText: '本月预估发货' }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        Object.keys(window.mockContexts['plan-category-production']?.parts ?? {}).sort(),
      ),
    )
    .toEqual(['navigation', 'ship']);
  assert.equal(
    await page.evaluate(() => window.mockContexts['plan-category-production'].scope),
    'read-only-master-data-local-drafts',
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
  await expect(frame.locator('.ap-board-title')).toHaveText('产能评估与缺口');
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

test('received MPS context covers the seven current steps and preserves unassessed results', async (t) => {
  const page = await fixture(t, ['mps']);
  await page.evaluate(() => window.openPage('plan-category-production', 'mps'));
  const frame = page.frameLocator('iframe');
  for (const [key, label] of [
    ['check', '需求确认'],
    ['ship', '本月预估发货'],
    ['process', '需求加工'],
    ['masterdata', '主数据对应'],
    ['constraints', '约束与配置'],
    ['capacity', '产能评估'],
    ['report', '产销存报告'],
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
    if (key === 'check') {
      assert.equal(data.scope, 'local-check-only');
      assert.equal(data.productSource, 'demo');
      assert.equal(data.productCount, 15);
      assert.equal(data.sourceSummaries.report.rowCount, 0);
      assert.equal(data.businessSave, 'not-connected');
    }
    if (key === 'ship') {
      assert.equal(data.unit, '件');
      assert.equal(data.businessSave, 'not-connected');
      assert.equal(data.nextStage, 'shared-snapshot');
      assert.equal(data.sourceKind, 'demo');
      assert.equal(data.bases.length, 5);
      assert.equal(
        data.bases.some((base) => base.who === '濮阳'),
        false,
      );
    }
    if (['process', 'constraints', 'capacity', 'report'].includes(key)) {
      assert.equal(data.businessSave, 'not-connected');
      assert.equal(data.months.length, 4);
      assert.ok(data.categoryRows.every((row) => row.quantity === null));
      assert.ok(
        data.rows.every((row) => row.demand === null && row.mainPlan === null && row.gap === null),
      );
      assert.ok(data.missing.length);
      assert.equal(Object.hasOwn(data, 'weights'), false);
    }
    if (key === 'masterdata') {
      assert.equal(data.status, 'failed');
      assert.ok(data.error);
      assert.equal(data.total, 0);
    }
  }
  assert.equal(
    await page.evaluate(() => Object.hasOwn(window.readState('plan-category-production'), 'parts')),
    false,
  );
  assert.deepEqual(await page.evaluate(() => window.mockErrors), []);
});

test('received MPS commits restored navigation and clears local inputs before publishing into a rebound Session', async (t) => {
  const page = await fixture(t, ['mps']);
  await page.clock.setFixedTime(new Date('2026-10-20T04:00:00Z'));
  await page.evaluate(() => window.openPage('plan-category-production', 'mps'));
  const frame = page.frameLocator('iframe');
  await frame.getByLabel('选择产品关系CSV', { exact: true }).setInputFiles({
    name: 'products.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '基地,产品编码,产品名称,大类,系列,物料组,老品编码,老品名称\n郑州,A,产品甲,汤圆,系列,组,,',
    ),
  });
  await frame.getByLabel('选择计划提报CSV', { exact: true }).setInputFiles({
    name: 'session-a.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '月份,基地,产品编码,产品名称,大类,系列,物料组,月初数量,纠偏数量\n2026-10,郑州,A,产品甲,汤圆,系列,组,18,20',
    ),
  });
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工' }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.mockContexts['plan-category-production']?.parts?.process?.rows[0]?.reportQuantity,
      ),
    )
    .toBe(18);
  await page.evaluate(() => {
    window.setViewSession('session-22222222-2222-4222-8222-222222222222');
    window.seedState('plan-category-production', {
      version: 1,
      tab: 'capacity',
      assistantDraft: 'Session B 未发文字',
    });
    window.setViewSession('mock-session');
    window.contextMessages = [];
    window.switchViewSession('session-22222222-2222-4222-8222-222222222222');
  });
  await expect(frame.locator('.author-draft-recovery pre')).toHaveText('Session B 未发文字');
  await expect
    .poll(() =>
      page.evaluate(() => window.mockContexts['plan-category-production']?.parts?.navigation?.tab),
    )
    .toBe('capacity');
  const records = await page.evaluate(() =>
    window.contextMessages.filter(
      (row) => row.session === 'session-22222222-2222-4222-8222-222222222222',
    ),
  );
  assert.ok(records.length > 0);
  for (const row of records) {
    assert.deepEqual(Object.keys(row.context.parts).sort(), ['capacity', 'navigation']);
    assert.equal(row.context.parts.navigation.tab, 'capacity');
    assert.ok(
      row.context.parts.capacity.rows.every(
        (item) => item.reportQuantity === null && item.demand === null,
      ),
    );
    assert.equal(JSON.stringify(row.context).includes('session-a.csv'), false);
  }
  await page.evaluate(() => {
    window.contextMessages = [];
    window.switchViewSession('mock-session');
  });
  await expect
    .poll(() =>
      page.evaluate(() => window.mockContexts['plan-category-production']?.parts?.navigation?.tab),
    )
    .toBe('process');
  const returning = await page.evaluate(() =>
    window.contextMessages.filter((row) => row.session === 'mock-session'),
  );
  assert.ok(returning.length > 0);
  for (const row of returning) {
    assert.deepEqual(Object.keys(row.context.parts).sort(), ['navigation', 'process']);
    assert.ok(
      row.context.parts.process.rows.every(
        (item) => item.reportQuantity === null && item.demand === null,
      ),
    );
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
  return async (session = 'session-11111111-1111-4111-8111-111111111111', focus) => {
    const result = await ctx.tools.execute({
      callId: crypto.randomUUID(),
      name: 'gea_page',
      arguments: { action: 'context', ...(focus ? { focus } : {}) },
      agent: agents.get(session),
      signal: new AbortController().signal,
    });
    const value = JSON.parse(result.value);
    const key = JSON.stringify([session, focus ?? '']);
    if (!value.unchanged) observed.set(key, value.context);
    return observed.get(key);
  };
}
test('MPS Host context stays at the latest visible step when an earlier transport delivery is delayed', async (t) => {
  const page = await fixture(t, ['mps']),
    readHost = await publicMpsContext(t, page);
  await page.evaluate(() => window.openPage('plan-category-production', 'mps'));
  await expect.poll(async () => (await readHost())?.parts?.navigation?.tab).toBe('check');
  await page.evaluate(() => window.holdHostContext('ship'));
  const frame = page.frameLocator('iframe');
  await frame.locator('.ap-page-tab').filter({ hasText: '本月预估发货' }).click();
  await expect
    .poll(() => page.evaluate(() => window.heldHostContext?.parts?.navigation?.tab))
    .toBe('ship');
  await frame.getByLabel('西南 剩余天数入库', { exact: true }).fill('2100000');
  await frame.getByLabel('西南 剩余天数入库', { exact: true }).blur();
  await frame.locator('.ap-page-tab').filter({ hasText: '产能评估' }).click();
  await expect(frame.locator('.ap-board-title')).toHaveText('产能评估与缺口');
  await page.evaluate(() => window.releaseHostContext());
  await expect
    .poll(async () => Object.keys((await readHost())?.parts ?? {}).sort())
    .toEqual(['capacity', 'navigation']);
  assert.deepEqual(await page.evaluate(() => window.mockErrors), []);
});

test('MPS Host context keeps the latest edited shipment input when an earlier value arrives late', async (t) => {
  const page = await fixture(t, ['mps']),
    readHost = await publicMpsContext(t, page);
  await page.evaluate(() => window.openPage('plan-category-production', 'mps'));
  await expect.poll(async () => (await readHost())?.parts?.navigation?.tab).toBe('check');
  await page.evaluate(() => window.holdHostContext('ship'));
  const frame = page.frameLocator('iframe');
  await frame.locator('.ap-page-tab').filter({ hasText: '本月预估发货' }).click();
  await expect
    .poll(() => page.evaluate(() => window.heldHostContext?.parts?.navigation?.tab))
    .toBe('ship');
  const input = frame.getByLabel('西南 剩余天数入库', { exact: true });
  await input.fill('2100000');
  await input.blur();
  await expect(input).toHaveValue('2100000');
  await page.evaluate(() => window.releaseHostContext());
  await expect
    .poll(
      async () =>
        (await readHost(undefined, '西南'))?.parts?.ship?.bases.find((row) => row.who === '西南')
          ?.remaining,
    )
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
  await expect(frame.locator('.ap-board-title')).toHaveText('产能评估与缺口');
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
  await frame.getByRole('button', { name: '页面说明', exact: true }).click();
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

test('received MPS clears local files and in-flight file reads when the current Session changes', async (t) => {
  const page = await fixture(t, ['mps']);
  await page.evaluate(() => window.openPage('plan-category-production', 'mps'));
  const frame = page.frameLocator('iframe');
  await frame.getByRole('button', { name: '新建评估版本', exact: true }).click();
  const creating = frame.getByRole('dialog', { name: '新建评估版本', exact: true });
  await creating.getByLabel('评估月份', { exact: true }).fill('2026-12');
  await creating.getByRole('button', { name: '创建本地版本', exact: true }).click();
  const csv =
    '月份,基地,产品编码,产品名称,大类,系列,物料组,月初数量,纠偏数量\n2026-12,郑州,P1,产品,汤圆,系列,组,8,9';
  const upload = () =>
    frame
      .getByLabel('选择计划提报CSV')
      .setInputFiles({ name: 'local.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await upload();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.mockContexts['plan-category-production']?.parts?.check?.sourceSummaries?.report
            ?.quantity,
      ),
    )
    .toBe(8);
  await frame.locator('body').evaluate(() => {
    const read = File.prototype.text;
    File.prototype.text = function () {
      return new Promise((resolve) => {
        window.releaseLocalFile = async () => resolve(await read.call(this));
      });
    };
  });
  await upload();
  await expect(frame.getByRole('region', { name: '计划提报数据' })).toContainText('正在读取…');
  await page.evaluate(() =>
    window.switchViewSession('session-22222222-2222-4222-8222-222222222222'),
  );
  await frame.locator('body').evaluate(() => window.releaseLocalFile());
  await expect(frame.getByLabel('评估版本选择').locator('option')).toHaveCount(1);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.mockContexts['plan-category-production']?.parts?.check?.sourceSummaries?.report
            ?.rowCount,
      ),
    )
    .toBe(0);
  assert.equal(
    await page.evaluate(() =>
      Object.hasOwn(window.readState('plan-category-production'), 'report'),
    ),
    false,
  );
  await page.evaluate(() => window.switchViewSession('mock-session'));
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.mockContexts['plan-category-production']?.parts?.check?.sourceSummaries?.report
            ?.rowCount,
      ),
    )
    .toBe(0);
  await expect(frame.getByRole('region', { name: '计划提报数据' })).toContainText(
    '当前期间无已读取记录',
  );
});

for (const boundary of ['Session', 'identity']) {
  test(`MPS S2 rejects delayed file input when ${boundary} resets the same initial draft id and month`, async (t) => {
    const page = await fixture(t, ['mps']);
    await page.clock.install({ time: new Date('2026-10-20T04:00:00Z') });
    await page.evaluate(() => window.openPage('plan-category-production', 'mps'));
    const frame = page.frameLocator('iframe');
    await frame.locator('.ap-page-tab').filter({ hasText: '本月预估发货' }).click();
    await expect(frame.locator('.sp-count')).toHaveText(Array(5).fill('129 个单品'));
    await frame.locator('body').evaluate(() => {
      const original = File.prototype.text;
      File.prototype.text = function () {
        return new Promise((resolve) => {
          window.releaseShipmentFile = async () => resolve(await original.call(this));
        });
      };
    });
    await frame.getByLabel('选择发货输入CSV', { exact: true }).setInputFiles({
      name: 'old-identity.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(
        '月份,基地,产品编码,产品名称,大类,系列,物料组,本月已发货,已备,未备,近三天日均发货量,月初库存,本月生产入库,剩余天数入库\n2026-09,郑州,OLD,旧身份输入,汤圆,系列,组,1,0,0,1,0,0,0',
      ),
    });
    await expect(frame.getByRole('status')).toContainText('正在读取或校验输入');
    if (boundary === 'Session')
      await page.evaluate(() =>
        window.switchViewSession('session-22222222-2222-4222-8222-222222222222'),
      );
    else
      await page.evaluate(() =>
        window.mockChannels['plan-category-production'].postMessage({ type: 'identity-changed' }),
      );
    await expect(frame.getByLabel('评估版本选择')).toHaveValue('local-1');
    await frame.locator('body').evaluate(() => window.releaseShipmentFile());
    await frame.locator('.ap-page-tab').filter({ hasText: '需求确认' }).click();
    await frame.locator('.ap-page-tab').filter({ hasText: '本月预估发货' }).click();
    await expect(frame.locator('.sp-count')).toHaveText(Array(5).fill('129 个单品'));
    await expect(frame.getByRole('region', { name: '发货本地核对' })).not.toContainText(
      'old-identity.csv',
    );
  });
}

test('MPS S2 publishes actual local inputs and carry output within the Host context budget and withdraws the old step on navigation', async (t) => {
  const page = await fixture(t, ['mps']);
  await page.clock.install({ time: new Date('2026-10-20T04:00:00Z') });
  const readHost = await publicMpsContext(t, page);
  await page.evaluate(() => window.openPage('plan-category-production', 'mps'));
  const frame = page.frameLocator('iframe');
  await frame.locator('.ap-page-tab').filter({ hasText: '本月预估发货' }).click();
  await expect.poll(async () => (await readHost())?.parts?.ship?.rowCount).toBe(645);
  const demo = await readHost();
  assert.ok(JSON.stringify(demo).length < 100000);
  await frame.getByLabel('选择发货输入CSV', { exact: true }).setInputFiles({
    name: 'local-ship.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '月份,基地,产品编码,产品名称,大类,系列,物料组,本月已发货,已备,未备,近三天日均发货量,月初库存,本月生产入库,剩余天数入库\n2026-09,郑州,A,产品,汤圆,系列,组,220,10,10,10,100,200,80',
    ),
  });
  await expect.poll(async () => (await readHost())?.parts?.ship?.totals?.fin).toBe(300);
  const data = (await readHost()).parts.ship;
  assert.equal(data.totals.end, 80);
  assert.equal(data.rows[0][data.rowFields.indexOf('shipped')], 220);
  assert.equal(data.rows[0][data.rowFields.indexOf('end')], 80);
  assert.equal(data.carryToMonth, '2026-10');
  assert.equal(data.nextStage, 'shared-snapshot');
  await frame.getByRole('button', { name: '下一步：需求加工与收敛', exact: true }).click();
  await expect
    .poll(async () => Object.keys((await readHost())?.parts ?? {}).sort())
    .toEqual(['navigation', 'process']);
});
