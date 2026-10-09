import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from './helpers/prepared-assets.mjs';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';

// Real Cordis registration, official Renderer/AppFrame/store/controller and
// company UI. Only Session/workspace data and composer are recording fixtures.
const bundle = await build({
  stdin: {
    contents: `
 import React from 'react';import{Context}from'@deepseek-ai/cordis';
 import{apply as rendererApply}from'../../official-latest-standard/packages/client/ui-renderer/src/client/index.ts';
 import{apply as layoutApply,inject as layoutInject}from'../../official-latest-standard/packages/client/ui-layout/src/client/index.ts';
 import{mountCompanyUI}from'./src/company/ui.tsx';import{WorkbenchController}from'./src/workbench.ts';
 import{mountFramePresentation}from'./src/frame-presenter.tsx';
 (async()=>{const source=value=>({getSnapshot:()=>value,subscribe:()=>()=>{}});
 const ctx=new Context();const dictionaries={};const localeSnapshot={active:'zh',revision:0};
 const locale={...source(localeSnapshot),register:(name,copy)=>{dictionaries[name]=copy.zh;return()=>{}},bind:name=>key=>dictionaries[name]?.[key]??key};
 ctx.provide('locale',locale);ctx.provide('theme',{getTheme:()=>({active:{colorScheme:'light',tokens:{}},fontSize:14})});
 ctx.provide('shortcuts',{register:()=>()=>{},catalog:source([])});ctx.provide('uiWorkspace',{startSession:()=>{}});
 await ctx.plugin({apply:rendererApply}).await();
 ctx.slots.installLocale(locale);
 // Natural absent Session scope: no fabricated binding or private state writes.
 const absent=source({key:undefined,hooks:{session:source(undefined),conversation:source(undefined)},keyedHooks:{projection:undefined},props:{}});
 ctx.slots.installScope('session',{current:absent,bindingSource:()=>absent,renderArea:(_binding,{children})=>children});
 ctx.slots.provideRoot({hooks:{sessions:source({byId:{}}),workspaces:source({items:[]})},props:{selectWorkspace:()=>{},inputActions:{}}});
 await ctx.plugin({inject:layoutInject,apply:layoutApply}).await();
 ctx.slots.registerFactory({name:'conversation.content',scope:'session-maybe',locale:'companyWorkbench',children:{'conversation.hero.workspace':{kind:'single',scope:'root'},'conversation.hero.agentPreset':{kind:'single',scope:'session-maybe'}},slots:{views:{scope:'session-maybe'},widthControls:{scope:'session-maybe'}}},({useFactorySlot})=>{
   const ColdStart=useFactorySlot('widthControls',()=>null);return <div style={{height:'100%',display:'flex',flexDirection:'column'}}><ColdStart/><textarea aria-label="首页草稿" defaultValue="保留首页草稿"/></div>;
 });
 ctx.slots.register({name:'main',key:'conversation',children:{'main.conversation':{kind:'single',scope:'session-maybe'}}},({renderSlot})=>renderSlot('main.conversation',{}));
 const workbench=new WorkbenchController({panel:id=>ctx.layout.selectPanel(id),document:()=>ctx.layout.selectPanel(null),hasPanel:id=>ctx.slots.entries('main').some(entry=>entry.options.key===id)});
 mountCompanyUI(ctx,workbench,()=>null);
 ctx.provide('inputTriggers',{registerSource:()=>()=>{}});ctx.provide('conversation',{input:{for:()=>({})}});
 ctx.provide('remote',{session:{}});ctx.provide('businessAccount',{...source({state:'confirmed',scope:null,status:{authenticated:false}})});
 mountFramePresentation(ctx,()=>undefined,key=>key,workbench);
 const page={id:'inventory-fc',kind:'local',label:'分仓库存',body:()=> <input aria-label="业务筛选" defaultValue="保留业务筛选"/>};
 workbench.registerFrame(page);
 const second={id:"plan-region-category",kind:"local",label:"第二静态页面",body:()=> <input aria-label="第二页面筛选" defaultValue=""/>};workbench.registerFrame(second);
 ctx.uiRenderer.mount(document.getElementById('root'));
 window.sidebarProbe=()=>({main:ctx.layout.panelInfo.getSnapshot().activePanelId,document:workbench.getSnapshot().selectedDocument?.id,leadingEntries:ctx.slots.entries('shell.leading').length});
 window.selectBusiness=()=>workbench.open(page.id);
 window.selectSecond=()=>workbench.open(second.id);
 window.selectHome=()=>{workbench.leaveDocument();ctx.layout.selectPanel(null);};
 window.fixtureReady=true;})().catch(error=>{console.error(error);window.fixtureFailure=error.message});
 `,
    resolveDir: process.cwd(),
    loader: 'tsx',
  },
  bundle: true,
  write: false,
  outfile: 'fixture.js',
  platform: 'browser',
  jsx: 'automatic',
  define: {
    'process.env.DSH_CLIENT_TITLE': '"Sidebar regression"',
    'process.env.NODE_ENV': '"test"',
  },
  alias: { react: resolve('node_modules/react'), 'react-dom': resolve('node_modules/react-dom') },
  loader: { '.png': 'dataurl', '.css': 'text' },
  plugins: [
    {
      name: 'official-css-modules',
      setup(build) {
        build.onLoad({ filter: /\.module\.css$/ }, async (args) => ({
          contents: await readFile(args.path, 'utf8'),
          loader: 'local-css',
        }));
      },
    },
  ],
});

async function fixture(t) {
  const browser = await chromium.launch({ headless: true });
  const proof = process.env.SIDEBAR_VERIFY_EVIDENCE;
  const requests = [];
  t.after(async () => {
    await browser.close();
    if (proof)
      await writeFile(
        resolve(proof, 'cleanup.json'),
        JSON.stringify(
          {
            browserConnected: browser.isConnected(),
            contextRequests: requests,
            at: new Date().toISOString(),
          },
          null,
          2,
        ),
      );
  });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
    reducedMotion: 'reduce',
  });
  if (proof)
    await page.context().route('**/*', (route) => {
      requests.push({ url: route.request().url(), method: route.request().method() });
      return route.abort('blockedbyclient');
    });
  page.on('pageerror', (error) => console.error(error));
  const officialCss = bundle.outputFiles.find((file) => file.path.endsWith('.css'))?.text ?? '';
  const tokens = await readFile('theme/tokens.css', 'utf8');
  await page.setContent(
    '<style>' +
      tokens +
      '\n' +
      officialCss +
      '\nhtml,body,#root{margin:0;height:100%}</style><div id="root"></div>',
  );
  await page.evaluate(() => (document.documentElement.dataset.platform = 'darwin'));
  await page.addScriptTag({
    content: bundle.outputFiles.find((file) => file.path.endsWith('.js')).text,
  });
  await expect
    .poll(() => page.evaluate(() => window.fixtureReady ?? window.fixtureFailure))
    .toBe(true);
  return page;
}

test('macOS window controls stay above company identity with one consistent panel glyph', async (t) => {
  const page = await fixture(t);
  const brand = await page.locator('.gea-sidebar-brand-row').boundingBox();
  const close = page.getByRole('button', { name: '收起侧边栏', exact: true });
  const closeBox = await close.boundingBox();
  const closeSvg = await close.locator('svg').evaluate((node) => node.innerHTML);
  await close.click();
  const open = page
    .locator('[data-shell-leading]')
    .getByRole('button', { name: '展开业务菜单', exact: true });
  await expect(open).toBeVisible();
  const openBox = await open.boundingBox();
  const facts = await page.evaluate(() => ({
    entries: window.sidebarProbe().leadingEntries,
    columns: getComputedStyle(document.querySelector('[data-sidebar-collapsed]'))
      .gridTemplateColumns,
  }));
  assert.equal(facts.entries, 1, 'one window control occupant handles the collapsed sidebar');
  assert.equal(parseFloat(facts.columns), 0, 'closed macOS sidebar occupies no rail width');
  assert.equal(
    await open.locator('svg').evaluate((node) => node.innerHTML),
    closeSvg,
    'both states reuse the official panel glyph',
  );
  assert.equal(closeBox.y, openBox.y, 'the panel toggle stays on the window-control row');
  assert.ok(brand.y >= closeBox.y + closeBox.height, 'company brand is on the lower content row');
  await open.click();
  await expect(page.locator('.gea-sidebar-brand-row')).toBeVisible();
  await page.evaluate(() => document.documentElement.setAttribute('data-fullscreen', ''));
  const fullscreenClose = await close.boundingBox();
  await close.click();
  const fullscreenOpen = await open.boundingBox();
  assert.equal(
    fullscreenClose.x,
    fullscreenOpen.x,
    'fullscreen keeps the toggle at the shared left anchor',
  );
  assert.equal(fullscreenClose.y, fullscreenOpen.y, 'fullscreen keeps the same window-control row');
  await open.click();
});

for (const target of ['home', 'business'])
  test('Darwin ' + target + ' can reopen its sidebar after every collapse', async (t) => {
    const page = await fixture(t);
    if (target === 'business') {
      await page.evaluate(() => window.selectBusiness());
      await expect(page.getByRole('textbox', { name: '业务筛选' })).toHaveValue('保留业务筛选');
    } else await expect(page.getByText('让 AI 进入工作流程')).toBeVisible();
    const content = page.getByRole('textbox', {
      name: target === 'home' ? '首页草稿' : '业务筛选',
    });
    const preserved = target === 'home' ? '用户输入首页草稿\n第二行\n第三行' : '用户输入库存筛选';
    await content.fill(preserved);
    const proof = target === 'home' ? process.env.SIDEBAR_VERIFY_EVIDENCE : undefined;
    const actions = [];
    const capture = async (step) => {
      if (!proof) return;
      const state = {
        step,
        at: new Date().toISOString(),
        draft: await content.inputValue(),
        collapsed: (await page.locator('[data-sidebar-collapsed]').count()) === 1,
      };
      actions.push(state);
      await writeFile(resolve(proof, 'actions.json'), JSON.stringify(actions, null, 2));
      await page.screenshot({ path: resolve(proof, step + '.png') });
      await writeFile(
        resolve(proof, step + '.aria.yml'),
        await page.locator('body').ariaSnapshot(),
      );
    };
    await capture('draft-filled');
    for (let cycle = 0; cycle < 3; cycle++) {
      await page.getByRole('button', { name: '收起侧边栏', exact: true }).click();
      await expect(page.locator('[data-shell-leading]')).toHaveCount(1);
      await capture('collapsed-' + cycle);
      const reopen = page
        .locator('[data-shell-leading]')
        .getByRole('button', { name: '展开业务菜单', exact: true });
      try {
        await expect(reopen).toBeVisible({ timeout: 1000 });
        await reopen.click({ trial: true, timeout: 1000 });
        const geometry = await reopen.boundingBox();
        assert.ok(
          geometry.width === 28 &&
            geometry.x >= 0 &&
            geometry.y >= 0 &&
            geometry.x + geometry.width <= 1280,
          'reopen remains inside the window',
        );
        const newConversation = page
          .locator('[data-shell-leading]')
          .getByRole('button', { name: '新会话', exact: true });
        await newConversation.click({ trial: true, timeout: 1000 });
        const next = await newConversation.boundingBox();
        assert.ok(
          next.x >= geometry.x + geometry.width,
          'each leading control owns a separate hit area',
        );
        if (cycle === 0 && process.env.SIDEBAR_REOPEN_EVIDENCE) {
          const evidence = process.env.SIDEBAR_REOPEN_EVIDENCE;
          await page.screenshot({ path: resolve(evidence, target + '-green.png') });
          const measured = await page.evaluate(() => {
            const leading = document.querySelector('[data-shell-leading]');
            const ancestors = [];
            for (let node = leading; node; node = node.parentElement)
              ancestors.push({
                tag: node.tagName,
                rect: node.getBoundingClientRect().toJSON(),
                overflow: getComputedStyle(node).overflow,
                zIndex: getComputedStyle(node).zIndex,
              });
            const buttons = [...leading.querySelectorAll('button')].map((node) => {
              const rect = node.getBoundingClientRect();
              return {
                label: node.getAttribute('aria-label'),
                rect: rect.toJSON(),
                position: getComputedStyle(node).position,
                hit: node.contains(document.elementFromPoint(rect.x + 14, rect.y + 14)),
              };
            });
            return { public: window.sidebarProbe(), ancestors, buttons };
          });
          await writeFile(
            resolve(evidence, target + '-green-probe.json'),
            JSON.stringify(measured, null, 2),
          );
        }
        await reopen.click();
        await expect(page.getByRole('button', { name: '收起侧边栏', exact: true })).toBeVisible();
      } catch (error) {
        const evidence = process.env.SIDEBAR_REOPEN_EVIDENCE;
        if (evidence) {
          await page.screenshot({ path: resolve(evidence, target + '-red.png') });
          await writeFile(
            resolve(evidence, target + '-probe.json'),
            JSON.stringify(
              await page.evaluate(() => ({
                public: window.sidebarProbe(),
                buttons: [...document.querySelectorAll('[data-shell-leading] button')].map(
                  (node) => ({
                    label: node.getAttribute('aria-label'),
                    rect: node.getBoundingClientRect().toJSON(),
                    position: getComputedStyle(node).position,
                    display: getComputedStyle(node).display,
                    hit: document
                      .elementFromPoint(
                        node.getBoundingClientRect().x + 14,
                        node.getBoundingClientRect().y + 14,
                      )
                      ?.outerHTML?.slice(0, 160),
                  }),
                ),
              })),
              null,
              2,
            ),
          );
        }
        throw error;
      }
      await expect(content).toHaveValue(preserved);
      await capture('reopened-' + cycle);
    }
  });

test('static Documents preserve their own body and mode while the actual Core main Conversation remains selected', async (t) => {
  const page = await fixture(t);
  await page.evaluate(() => window.selectBusiness());
  const first = page.getByRole('textbox', { name: '业务筛选' });
  await expect(first).toBeVisible();
  await first.fill('第一个页面自己的筛选');
  await page.getByRole('button', { name: '中间区域最大，隐藏会话区' }).click();
  assert.deepEqual(
    await page.evaluate(() => ({
      main: window.sidebarProbe().main,
      document: window.sidebarProbe().document,
    })),
    { main: null, document: 'inventory-fc' },
  );
  await page.evaluate(() => window.selectSecond());
  const second = page.getByRole('textbox', { name: '第二页面筛选' });
  await expect(second).toBeVisible();
  await second.fill('第二个页面自己的筛选');
  await expect(first).toBeHidden();
  await page.evaluate(() => window.selectBusiness());
  await expect(first).toHaveValue('第一个页面自己的筛选');
  await expect(second).toBeHidden();
  await expect(page.locator('.view-center:visible')).toHaveCount(1);
  await page.evaluate(() => window.selectHome());
  await expect(page.getByRole('textbox', { name: '首页草稿' })).toBeVisible();
  await expect(first).toBeHidden();
  await page.evaluate(() => window.selectSecond());
  await expect(second).toHaveValue('第二个页面自己的筛选');
  assert.equal(
    await page.evaluate(() => window.sidebarProbe().main),
    null,
    'no business main key or invented Session is needed for static presentation',
  );
});
