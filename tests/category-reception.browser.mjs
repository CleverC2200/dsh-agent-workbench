import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
const { outputFiles } = await build({
  stdin: {
    contents: `import{WorkbenchController}from'./src/workbench.ts';import{connectHtmlViewState}from'./src/html-view-channel.ts';import{validatePageCatalog}from'./src/page-bridge/catalog.ts';const owner=new WorkbenchController({panel(){},document(){}});owner.registerFrame({id:'plan-region-category',kind:'html',src:'/category',resourceId:'gea-html-category-plan'});window.contexts=[];window.catalog=[];window.requests=[];window.errors=[];let frame,stop=()=>{},scope,port;window.openCategory=async(session)=>{stop();frame?.remove();scope='subject/'+session;await owner.open('plan-region-category');frame=document.createElement('iframe');frame.setAttribute('sandbox','allow-scripts');frame.style='width:1480px;height:920px;border:0';document.body.append(frame);stop=connectHtmlViewState(frame,'plan-region-category',scope,owner,new AbortController().signal);frame.src='/category';};window.rebind=async(session)=>{stop();scope='subject/'+session;stop=connectHtmlViewState(frame,'plan-region-category',scope,owner,new AbortController().signal);port.postMessage({type:'context',context:{session,plugin:'category-plan'}});};window.state=()=>owner.readHtmlViewState('plan-region-category',scope);window.seed=state=>owner.saveHtmlViewState('plan-region-category',scope,state);window.addEventListener('message',event=>{if(event.source!==frame?.contentWindow||event.data?.protocol!=='gea-html-v2'||event.data.type!=='ready')return;const channel=new MessageChannel();port=channel.port1;channel.port1.onmessage=({data})=>{if(data.type==='request'){window.requests.push(data.method);if(data.method==='context')window.contexts.push(data.parameters);channel.port1.postMessage({type:'response',id:data.id,result:{ok:true}});}if(data.type==='catalog'){try{if(data.elements.length)validatePageCatalog({surface:'gea-html-category-plan',tool:'gea_plugin_page_apply',description:'品类模拟原型',elements:data.elements});window.catalog=data.elements;}catch(error){window.errors.push(error.message);}}};frame.contentWindow.postMessage({protocol:'gea-html-v2',type:'connect',context:{session:scope.slice(8),plugin:'category-plan'}},'*',[channel.port2]);});`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
});
async function fixture(t) {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({
    viewport: { width: 1500, height: 1000 },
  });
  page.on('pageerror', (error) => console.error(error.message));
  const html = process.env.CATEGORY_SOURCE_BASELINE
    ? execFileSync(
        'git',
        ['show', process.env.CATEGORY_SOURCE_BASELINE + ':static/category/index.html'],
        { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
      )
    : await readFile('static/category/index.html', 'utf8');
  await page.route('http://127.0.0.1:19479/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body:
        new URL(route.request().url()).pathname === '/category'
          ? html
          : '<html><body></body></html>',
    }),
  );
  await page.goto('http://127.0.0.1:19479/');
  await page.addScriptTag({ content: outputFiles[0].text });
  return page;
}
test('the original category selector publishes its current simulated metrics and replaces the previous range', async (t) => {
  const page = await fixture(t);
  await page.evaluate(() => window.openCategory('session-A'));
  await expect
    .poll(() => page.evaluate(() => window.contexts.at(-1)?.parts?.categoryLabel))
    .toBe('全部品类');
  await page.frameLocator('iframe').locator('.scope-picker .arco-select').click();
  await page
    .frameLocator('iframe')
    .locator('.arco-select-option')
    .filter({ hasText: '面点' })
    .click();
  await expect
    .poll(() => page.evaluate(() => window.contexts.at(-1)?.parts?.categoryLabel))
    .toBe('面点');
  await expect
    .poll(() =>
      page.evaluate(() => window.catalog.find((row) => row.id === 'category:scope')?.value),
    )
    .toBe('面点');
  const current = await page.evaluate(() => ({
    context: window.contexts.at(-1),
    catalog: window.catalog,
    requests: window.requests,
  }));
  assert.equal(current.context.mock, true);
  assert.equal(current.context.pageId, 'plan-region-category');
  assert.equal(current.context.parts.summary.planTons, 1860);
  assert.equal(current.context.parts.kpis.order.value, 89.4);
  assert.ok(current.catalog.some((row) => row.id === 'category:scope' && row.value === '面点'));
  assert.ok(
    current.context.parts.events.every((row) => row.category === 'mianmo' || row.category === null),
  );
  assert.ok(current.requests.every((method) => method === 'context'));
  assert.deepEqual(await page.evaluate(() => window.errors), []);
  assert.deepEqual(
    current.catalog.filter((row) => row.id.startsWith('event:')).map((row) => row.id),
    current.context.parts.events.map((row) => 'event:' + row.id),
  );
  assert.equal(Object.hasOwn(current.context.parts, 'draft'), false);
});
test('category UI intent and unfinished text restore only in the original Session', async (t) => {
  const page = await fixture(t);
  await page.evaluate(() => window.openCategory('session-A'));
  await page.frameLocator('iframe').locator('.scope-picker .arco-select').click();
  await page
    .frameLocator('iframe')
    .locator('.arco-select-option')
    .filter({ hasText: '面点' })
    .click();
  await expect.poll(() => page.evaluate(() => window.state()?.category)).toBe('mianmo');
  await page.evaluate(() => window.seed({ ...window.state(), draft: '未发送的品类说明' }));
  await page.evaluate(() => window.openCategory('session-B'));
  await expect
    .poll(() => page.evaluate(() => window.contexts.at(-1)?.parts?.categoryLabel))
    .toBe('全部品类');
  await expect(page.frameLocator('iframe').locator('.author-draft-recovery')).toHaveCount(0);
  await page.evaluate(() => window.openCategory('session-A'));
  await expect
    .poll(() => page.evaluate(() => window.contexts.at(-1)?.parts?.categoryLabel))
    .toBe('面点');
  await expect(page.frameLocator('iframe').locator('.author-draft-recovery pre')).toHaveText(
    '未发送的品类说明',
  );
  assert.equal(
    Object.hasOwn(await page.evaluate(() => window.contexts.at(-1).parts), 'draft'),
    false,
  );
});

test('a live category iframe restores missing fields to authored defaults after a Session change', async (t) => {
  const page = await fixture(t);
  await page.evaluate(() => window.openCategory('session-A'));
  await page.frameLocator('iframe').locator('.scope-picker .arco-select').click();
  await page
    .frameLocator('iframe')
    .locator('.arco-select-option')
    .filter({ hasText: '面点' })
    .click();
  await expect.poll(() => page.evaluate(() => window.state()?.category)).toBe('mianmo');
  await page.evaluate(() => window.rebind('session-B'));
  await expect(page.frameLocator('iframe').locator('.scope-picker')).toContainText('全部品类');
  await expect
    .poll(() => page.evaluate(() => window.contexts.at(-1)?.parts?.categoryLabel))
    .toBe('全部品类');
  await page.evaluate(() => window.rebind('session-A'));
  await expect(page.frameLocator('iframe').locator('.scope-picker')).toContainText('面点');
});
test('the category task tab publishes the same unfinished simulated tasks that the author displays', async (t) => {
  const page = await fixture(t);
  await page.evaluate(() => window.openCategory('session-A'));
  await expect
    .poll(() => page.evaluate(() => window.contexts.at(-1)?.parts?.tasks?.length))
    .toBeGreaterThan(0);
  await page
    .frameLocator('iframe')
    .getByText(/^待跟进 /)
    .click();
  await expect
    .poll(() => page.evaluate(() => window.contexts.at(-1)?.parts?.taskStatus))
    .toBe('todo');
  const tasks = await page.evaluate(() => window.contexts.at(-1).parts.tasks);
  assert.ok(tasks.length > 0);
  assert.ok(tasks.every((row) => row.status !== 'done'));
});

test('the category suggestion detail restores from the original current author objects', async (t) => {
  const page = await fixture(t);
  await page.evaluate(() => window.openCategory('session-A'));
  await page
    .frameLocator('iframe')
    .locator('.sug')
    .first()
    .getByText('查看依据', { exact: true })
    .click();
  await expect.poll(() => page.evaluate(() => window.state()?.suggestionId)).not.toBeNull();
  await page.evaluate(() => window.openCategory('session-A'));
  await expect(page.frameLocator('iframe').locator('.arco-modal-title')).toHaveText(
    '行动建议 · 依据与影响',
  );
});

test('the original category event detail opens and restores its current simulated event', async (t) => {
  const page = await fixture(t);
  await page.evaluate(() => window.openCategory('session-A'));
  await page
    .frameLocator('iframe')
    .locator('.event-item')
    .first()
    .getByText('查看详情', { exact: true })
    .click();
  await expect(page.frameLocator('iframe').locator('.arco-modal-title')).toHaveText(
    '粽子产能缺口将拉低品类订单满足率',
  );
  await page.evaluate(() => window.openCategory('session-A'));
  await expect(page.frameLocator('iframe').locator('.arco-modal-title')).toHaveText(
    '粽子产能缺口将拉低品类订单满足率',
  );
});
