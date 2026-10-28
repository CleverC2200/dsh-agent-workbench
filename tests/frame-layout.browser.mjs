import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { readFile } from './helpers/prepared-assets.mjs';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
const bundle = await build({
  stdin: {
    contents: `
 import React from 'react';import{createRoot}from'react-dom/client';import{mountFramePresentation}from'./src/frame-presenter.tsx';import{WorkbenchController as DocumentWorkbench}from'./src/workbench.ts';
 let Document;const locale={active:'zh'};const identity={state:'confirmed',scope:null,status:{authenticated:false}};
 const ctx={get:()=>undefined,provide(){},locale:{subscribe:()=>()=>{},getSnapshot:()=>locale},theme:{getTheme:()=>({active:{colorScheme:'light',tokens:{}},fontSize:14})},on:()=>()=>{},effect:fn=>fn(),inputTriggers:{registerSource:()=>()=>{}},conversation:{input:{for:()=>({})}},slots:{registerFactory:(_meta,component)=>{Document=component;return()=>{};},register:()=>()=>{},inject:(_name,fn)=>fn()},inject:(names,fn)=>{if(names.includes('sidebarRight'))return;return fn({...ctx,businessAccount:{getSnapshot:()=>identity,subscribe:()=>()=>{}},remote:{session:{}}})}};
 const documents=new DocumentWorkbench({panel:()=>{},document:()=>{}});mountFramePresentation(ctx,()=>undefined,key=>key,documents);
 const root=createRoot(document.getElementById('root'));const page={id:window.testPageId??'business',kind:'local',label:'业务页面',body:()=>React.createElement('input',{'aria-label':'业务筛选',defaultValue:''})};
 documents.registerFrame(page);documents.open(page.id);
 window.remount=()=>{root.render(null);setTimeout(()=>root.render(React.createElement(Document,{page,active:true,useSessions:fn=>fn({byId:{}}),useSession:()=>undefined,useProjection:()=>undefined,renderSlot:()=>{throw Error('no unbound Conversation')}})),0)};
 root.render(React.createElement(Document,{page,active:true,useSessions:fn=>fn({byId:{}}),useSession:()=>undefined,useProjection:()=>undefined,renderSlot:()=>{throw Error('no unbound Conversation')}}));`,
    resolveDir: process.cwd(),
    loader: 'tsx',
  },
  bundle: true,
  write: false,
  platform: 'browser',
  loader: { '.png': 'dataurl', '.css': 'text' },
});
async function documentFixture(t, pageId = 'business') {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1600, height: 700 } });
  const css = (
    await Promise.all(
      ['theme/tokens.css', 'src/company/shell.css', 'src/company/layout.css'].map((file) =>
        readFile(file, 'utf8'),
      ),
    )
  ).join('\n');
  await page.setContent(
    `<style>${css} html,body{margin:0;height:100%} #root{height:100%;margin-left:280px}</style><div id="root"></div>`,
  );
  await page.evaluate((id) => {
    window.testPageId = id;
  }, pageId);
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await expect(page.getByRole('complementary', { name: 'AI对话' })).toBeVisible();
  return page;
}
test('business Document uses the formal wide default beside the unchanged left column', async (t) => {
  const page = await documentFixture(t);
  const ai = page.getByRole('complementary', { name: 'AI对话' });
  assert.equal((await ai.boundingBox()).width, 520);
  const business = page.getByRole('textbox', { name: '业务筛选' });
  await business.fill('保留筛选');
  await page.getByRole('button', { name: '会话区最大，隐藏中间区域' }).click();
  await expect(business).toBeHidden();
  await expect(ai).toBeVisible();
  await page.getByRole('button', { name: '中间区域最大，隐藏会话区' }).click();
  await expect(business).toBeVisible();
  await expect(ai).toBeHidden();
  await page.getByRole('button', { name: '同时显示中间区域和会话区' }).click();
  await expect(business).toHaveValue('保留筛选');
  await expect(ai).toBeVisible();
  assert.equal((await ai.boundingBox()).width, 520);
});
test('wide drag obeys the formal range and plugin lifetime memory while narrow breakpoints take priority', async (t) => {
  const page = await documentFixture(t);
  const ai = page.getByRole('complementary', { name: 'AI对话' });
  const handle = page.getByRole('separator', { name: '调整业务与AI栏宽' });
  await expect(handle).toBeVisible();
  const box = await handle.boundingBox();
  await page.mouse.move(box.x + box.width / 2, 200);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 80, 200);
  await page.mouse.up();
  assert.equal((await ai.boundingBox()).width, 600);
  await page.evaluate(() => window.remount());
  await expect
    .poll(async () => (await ai.boundingBox())?.width, {
      message: 'remount remembers the plugin instance preference',
    })
    .toBe(600);
  for (const [viewport, width] of [
    [1201, 521],
    [1200, 440],
    [1025, 440],
    [1024, 360],
    [861, 360],
    [860, 320],
    [859, 320],
    [1600, 600],
  ]) {
    await page.setViewportSize({ width: viewport, height: 700 });
    await expect
      .poll(async () => (await ai.boundingBox())?.width, {
        message: 'responsive AI width at ' + viewport,
      })
      .toBe(width);
    const business = await page.getByRole('textbox', { name: '业务筛选' }).boundingBox();
    const right = await ai.boundingBox();
    assert.ok(business.x < right.x, 'business and AI stay side by side');
    if (viewport <= 1200) await expect(handle).toBeHidden();
    else await expect(handle).toBeVisible();
  }
  const minBox = await handle.boundingBox();
  await page.mouse.move(minBox.x + 4, 200);
  await page.mouse.down();
  await page.mouse.move(1550, 200);
  await page.mouse.up();
  assert.equal((await ai.boundingBox()).width, 300);
  const maxBox = await handle.boundingBox();
  await page.mouse.move(maxBox.x + 4, 200);
  await page.mouse.down();
  await page.mouse.move(0, 200);
  await page.mouse.up();
  assert.equal(
    (await ai.boundingBox()).width,
    920,
    'the business pane retains its formal 400px minimum',
  );
  await page.setViewportSize({ width: 1600, height: 700 });
  await page.evaluate(() => {
    document.getElementById('root').style.marginLeft = '56px';
  });
  await expect.poll(async () => (await ai.boundingBox())?.width).toBe(920);
  const ratioBox = await handle.boundingBox();
  await page.mouse.move(ratioBox.x + 4, 200);
  await page.mouse.down();
  await page.mouse.move(0, 200);
  await page.mouse.up();
  assert.equal(
    (await ai.boundingBox()).width,
    1120,
    'the original whole-frame 70% maximum also applies',
  );
});

test('the shared Document title row reserves safe space and window drag above both business and AI panes', async (t) => {
  const page = await documentFixture(t);
  const chrome = page.locator('[data-workbench-window-chrome]');
  await expect(chrome).toBeVisible();
  assert.notEqual(await chrome.getAttribute('data-window-drag'), null);
  assert.equal(
    await chrome.evaluate((node) => getComputedStyle(node).getPropertyValue('-webkit-app-region')),
    'drag',
  );
  const title = await chrome.boundingBox();
  assert.equal(title.y, 0);
  assert.equal(title.height, 58);
  for (const view of [
    '同时显示中间区域和会话区',
    '中间区域最大，隐藏会话区',
    '会话区最大，隐藏中间区域',
  ]) {
    await page.getByRole('button', { name: view }).click();
    assert.equal(await page.getByRole('toolbar', { name: '对话区视图与会话操作' }).count(), 1);
    const body = await page.locator('.agent-workbench-document-body').boundingBox();
    assert.ok(body.y >= title.y + title.height, 'page content starts beneath window controls');
    assert.notEqual(await chrome.getAttribute('data-window-drag'), null);
  }
});

for (const id of [
  'gea-proof',
  'inventory-qll',
  'inventory-fc',
  'inventory-aqkc',
  'inventory-dealer',
  'inventory-apsplan',
])
  test(`${id}: business content starts at the top and conversation controls remain accessible`, async (t) => {
    const page = await documentFixture(t, id);
    const business = page.locator('.agent-workbench-business');
    const input = page.getByRole('textbox', { name: '业务筛选' });
    const ai = page.getByRole('complementary', { name: 'AI对话' });
    await expect(page.locator('.agent-workbench-document-title')).toHaveCount(0);
    await input.fill('保留业务筛选');
    for (const width of [1600, 860]) {
      await page.setViewportSize({ width, height: 700 });
      assert.equal((await business.boundingBox()).y, 0);
      await expect(ai.getByRole('toolbar', { name: '对话区视图与会话操作' })).toBeVisible();
      assert.equal((await ai.boundingBox()).y, 0);
      assert.equal((await ai.getByRole('toolbar').boundingBox()).y, 0);
      await page.getByRole('button', { name: '中间区域最大，隐藏会话区' }).click();
      await expect(ai).toBeHidden();
      const businessBox = await business.boundingBox();
      const toolbar = page.getByRole('toolbar', { name: '对话区视图与会话操作' });
      const toolbarBox = await toolbar.boundingBox();
      assert.equal(toolbarBox.y, 0, 'controls stay at the upper right');
      assert.equal(businessBox.y, 58, 'expanded business content starts below controls');
      assert.ok(toolbarBox.x + toolbarBox.width >= width - 1);
      await page.getByRole('button', { name: '会话区最大，隐藏中间区域' }).click();
      await expect(business).toBeHidden();
      await expect(ai.getByRole('toolbar', { name: '对话区视图与会话操作' })).toBeVisible();
      await page.getByRole('button', { name: '同时显示中间区域和会话区' }).click();
      await expect(input).toHaveValue('保留业务筛选');
      assert.equal(await toolbar.count(), 1);
    }
  });

test('Document overlay preserves both Core resize hit strips and the native leading band', async (t) => {
  const core = resolve(process.env.DSH_TEST_CORE ?? '../../official-latest-standard');
  const css = (
    await Promise.all([
      readFile(resolve(core, 'packages/client/ui-layout/src/client/AppFrame.module.css'), 'utf8'),
      readFile('src/company/layout.css', 'utf8'),
    ])
  ).join('\n');
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1536, height: 920 } });
  await page.setContent(`<style>${css} html,body{margin:0;height:100%}</style>
    <div class="frame" style="grid-template-columns:280px minmax(0,1fr) 360px;--dsh-frame-leading-clearance:160px">
      <aside class="sidebarCol"></aside><main class="centerCol"><div class="gea-workbench-document-viewport"></div></main><aside class="rightbarCol"></aside>
      <div class="overlayLayer"><div class="gea-workbench-documents"><iframe style="width:100%;height:100%;border:0;display:block"></iframe></div></div>
      <div class="handle" data-side="sidebar" style="left:280px"></div><div class="handle" data-side="rightbar" style="left:1176px"></div>
    </div>`);
  const documents = page.locator('.gea-workbench-documents');
  await expect(documents).toHaveCSS('height', '920px');
  assert.deepEqual(await documents.boundingBox(), { x: 280, y: 0, width: 896, height: 920 });
  for (const [x, side] of [
    [280, 'sidebar'],
    [283, 'sidebar'],
    [1176, 'rightbar'],
    [1173, 'rightbar'],
  ])
    assert.equal(
      await page.evaluate((x) => document.elementFromPoint(x, 460)?.getAttribute('data-side'), x),
      side,
    );
  assert.notEqual(await page.evaluate(() => document.elementFromPoint(320, 24)?.tagName), 'IFRAME');
  assert.equal(await page.evaluate(() => document.elementFromPoint(450, 24)?.tagName), 'IFRAME');
  assert.equal(await page.evaluate(() => document.elementFromPoint(320, 100)?.tagName), 'IFRAME');
});
