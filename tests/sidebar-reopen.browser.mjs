import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
import { verifyOfficialCore } from '../scripts/verify-official-input.mjs';

const core = resolve(process.env.DSH_TEST_CORE ?? '../../official-latest-standard');
verifyOfficialCore(core);

// Real Cordis registration, official Renderer/AppFrame/store/controller and
// company UI. Only Session/workspace data and composer are recording fixtures.
const bundle = await build({
  stdin: {
    contents: `
 import React from 'react';import{Context}from ${JSON.stringify(resolve(core, 'vendor/cordis/lib/index.js'))};
 import{apply as rendererApply}from ${JSON.stringify(resolve(core, 'packages/client/ui-renderer/src/client/index.ts'))};
 import{apply as layoutApply,inject as layoutInject}from ${JSON.stringify(resolve(core, 'packages/client/ui-layout/src/client/index.ts'))};
 import{ConversationMainPanel}from ${JSON.stringify(resolve(core, 'packages/client/ui-conversation/src/client/skeleton/ConversationMainPanel.tsx'))};
 import{HeroShell}from ${JSON.stringify(resolve(core, 'packages/client/ui-conversation/src/client/skeleton/EmptyHero.tsx'))};
 import{WorkspaceBrowser}from ${JSON.stringify(resolve(core, 'packages/client/ui-workspace/src/client/rows/WorkspaceBrowser.tsx'))};
 import{createWorkspaceViewStore}from ${JSON.stringify(resolve(core, 'packages/client/ui-workspace/src/client/stores.ts'))};
 import{createWorkspaceShortcutControls}from ${JSON.stringify(resolve(core, 'packages/client/ui-workspace/src/client/shortcuts.ts'))};
 import{zh as workspaceCopy}from ${JSON.stringify(resolve(core, 'packages/client/ui-workspace/src/client/locales.ts'))};
 import{zh as commonCopy}from ${JSON.stringify(resolve(core, 'packages/client/locale/src/locales/zh.ts'))};
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
 ctx.slots.registerFactory({name:'conversation.content',scope:'session-maybe',locale:'companyWorkbench',children:{'conversation.hero.content':{kind:'single',scope:'root'},'conversation.hero.brand.mark':{kind:'single',scope:'root'},'conversation.hero.workspace':{kind:'single',scope:'root'},'conversation.hero.agentPreset':{kind:'single',scope:'session-maybe'}},slots:{views:{scope:'session-maybe'},widthControls:{scope:'session-maybe'}}},({renderSlot})=>{
   return <div data-core-content style={{height:'100%',display:'flex',flexDirection:'column'}}><HeroShell t={key=>key==='hero.headline'?'探索未至之境':key} renderSlot={renderSlot}/><textarea aria-label="首页草稿" defaultValue="保留首页草稿"/></div>;
 });
 ctx.slots.register({name:'main',key:'conversation',children:{'main.conversation':{kind:'single',scope:'session-maybe'}}},({renderSlot})=>renderSlot('main.conversation',{}));
 ctx.slots.register({name:'main.conversation',children:{'conversation.header':{kind:'single',scope:'session-maybe'}}},ConversationMainPanel);
 ctx.slots.register({name:'conversation.header',children:{'settings.launcher':{kind:'single',scope:'root'}}},({renderSlot})=><header data-core-header style={{height:48,flexShrink:0}}>{renderSlot('settings.launcher',{})}</header>);
 const workbench=new WorkbenchController({panel:id=>ctx.layout.selectPanel(id),document:()=>ctx.layout.selectPanel(null),hasPanel:id=>ctx.slots.entries('main').some(entry=>entry.options.key===id)});
 mountCompanyUI(ctx,workbench);
 const workspaceStore=createWorkspaceViewStore().create();workspaceStore.actions.setGroupBy('flat');
 const controls=createWorkspaceShortcutControls();const useSnapshot=observable=>selector=>selector(React.useSyncExternalStore(observable.subscribe,observable.getSnapshot,observable.getSnapshot));
 const session={id:'fixture-session',title:'保留的示例会话',displayTitle:'保留的示例会话',running:false,blank:false,updatedAt:1,retainedBy:{}};
 window.requestWorkspaceSearch=controls.search;
 const workspaceSnapshot={items:[],archivedSessionIds:[],pinnedSessionIds:[],state:'idle',phase:'ready',error:null};
 const sessionSnapshot={ids:[session.id],byId:{[session.id]:session},phase:'ready',projectionsBySession:{}};
 const noPendingInteraction=new Map();
 const workspaceProps={useShortcuts:select=>select([]),useWorkspaceShortcuts:useSnapshot(controls.state),requestSearch:controls.search,requestAddWorkspace:controls.add,closeAddWorkspace:controls.closeAdd,setDirectoryBusy:controls.directoryBusy,requestSessionRename:controls.rename,dismissForkError:controls.dismissForkError,
 useSessions:select=>select(sessionSnapshot),useSessionStatus:select=>select(noPendingInteraction),useSessionRetainInfo:()=>undefined,usePanelInfo:select=>select({activePanelId:null}),useResource:()=>({status:'none'}),
 useWorkspaces:select=>select(workspaceSnapshot),useStore:useSnapshot(workspaceStore),actions:workspaceStore.actions,startSession:()=>{},open:()=>{},searchSessions:async()=>({items:[],hasMore:false}),searchResultLimit:20,notifyArchivedNotOpenable:()=>{},renameWorkspace:async()=>{},deleteWorkspace:async()=>{},unarchiveSession:async()=>{},insertWorkspaceBefore:async()=>{},createWorkspace:async()=>{},useDirectoryFlow:select=>select(false),useHostInfo:select=>select({home:undefined,isLoopback:true})};
 ctx.slots.inject('sidebar.workspaces',()=>ctx.slots.register({name:'sidebar.workspaces',children:{'sidebar.workspaces.session.menu.item':{kind:'list',scope:'root'},'sidebar.workspaces.session.row.action':{kind:'list',scope:'root'},'sidebar.session.row.leading':{kind:'single',scope:'root'},'sidebar.session.row.hover':{kind:'list',scope:'root'},'sidebar.workspaces.directoryFlow':{kind:'single',scope:'root'}}},props=><WorkspaceBrowser {...props} {...workspaceProps} t={key=>workspaceCopy[key]??commonCopy[key]??key}/>));

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
 window.selectHome=()=>{workbench.leaveDocument();ctx.layout.selectPanel('conversation');};
 // A recording conversation body isolates shell controls from Session restoration.
 window.useConversationFixture=()=>ctx.slots.register({name:'main.conversation',priority:-1},()=> <section><HeroShell t={key=>key==='hero.headline'?'探索未至之境':key} renderSlot={(_name,_owner,options)=>options?.fallback??null}/><textarea aria-label="首页草稿" defaultValue="保留首页草稿"/></section>);
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
  alias: {
    react: resolve('node_modules/react'),
    'react-dom': resolve('node_modules/react-dom'),
    '@deepseek-ai/cordis': resolve(core, 'vendor/cordis/lib/index.js'),
  },
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

async function fixture(t, platform = 'darwin', conversation = false) {
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.DSH_TEST_BROWSER_CHANNEL,
  });
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
  const documentHtml =
    '<style>' +
    tokens +
    '\n' +
    officialCss +
    '\nhtml,body,#root{margin:0;height:100%}</style><div id="root"></div>';
  await page.route('http://client-ui.fixture.test/', (route) =>
    route.fulfill({ contentType: 'text/html', body: documentHtml }),
  );
  await page.goto('http://client-ui.fixture.test/');
  await page.evaluate((platform) => {
    document.documentElement.dataset.platform = platform;
    if (platform === 'win32') {
      document.documentElement.setAttribute('data-windows-titlebar', '');
      document.documentElement.style.setProperty('--dsh-windows-titlebar-height', '40px');
    }
  }, platform);
  await page.addScriptTag({
    content: bundle.outputFiles.find((file) => file.path.endsWith('.js')).text,
  });
  await expect
    .poll(() => page.evaluate(() => window.fixtureReady ?? window.fixtureFailure))
    .toBe(true);
  await page.evaluate(() => window.selectHome());
  if (conversation) await page.evaluate(() => window.useConversationFixture());
  return page;
}

test('company sidebar follows light and dark theme with readable controls', async (t) => {
  const page = await fixture(t, 'win32');
  const luminance = (color) => {
    const rgb = color
      .match(/[\d.]+/g)
      .slice(0, 3)
      .map((part) => {
        const value = Number(part) / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  const contrast = (a, b) =>
    (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
  for (const dark of [false, true, false]) {
    await page.evaluate((dark) => {
      document.body.toggleAttribute('data-ds-dark-theme', dark);
      document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    }, dark);
    await expect
      .poll(async () => {
        const background = await page
          .locator('.gea-sidebar-owned')
          .evaluate((node) => getComputedStyle(node).backgroundColor);
        const color = await page
          .locator('.gea-sidebar-tab')
          .first()
          .evaluate((node) => getComputedStyle(node).color);
        return contrast(color, background);
      })
      .toBeGreaterThanOrEqual(4.5);
    const colors = await page.evaluate(() => {
      const sidebar = document.querySelector('.gea-sidebar-owned');
      const entry = sidebar.querySelector('.gea-ai-workbench-entry');
      return {
        background: getComputedStyle(sidebar).backgroundColor,
        labels: [
          '.gea-sidebar-tab',
          '.gea-brand-subtitle',
          '[data-slot="sidebar.brand.name"] span',
        ].map((selector) => ({
          selector,
          color: getComputedStyle(sidebar.querySelector(selector)).color,
        })),
        entry: {
          color: getComputedStyle(entry).color,
          stops: getComputedStyle(entry).backgroundImage.match(/rgba?\([^)]+\)/g),
        },
      };
    });
    assert.ok(
      dark ? luminance(colors.background) < 0.1 : luminance(colors.background) > 0.8,
      'sidebar surface follows the active theme',
    );
    for (const label of colors.labels)
      assert.ok(
        contrast(label.color, colors.background) >= 4.5,
        `${label.selector} remains readable in ${dark ? 'dark' : 'light'} mode`,
      );
    for (const stop of colors.entry.stops)
      assert.ok(
        contrast(colors.entry.color, stop) >= 4.5,
        'AI workbench label remains readable across its entry surface',
      );
  }
});

for (const target of ['home', 'business'])
  test(
    'Windows ' + target + ' retains a clickable caption toggle after zero-width collapse',
    async (t) => {
      const page = await fixture(t, 'win32', target === 'home');
      if (target === 'business') await page.evaluate(() => window.selectBusiness());
      const content = page.getByRole('textbox', {
        name: target === 'home' ? '首页草稿' : '业务筛选',
      });
      await content.fill('Windows 收起展开保留原输入');
      for (let cycle = 0; cycle < 3; cycle++) {
        await page.getByRole('button', { name: '收起侧边栏', exact: true }).click();
        const reopen = page.getByRole('button', { name: '展开业务菜单', exact: true });
        try {
          await expect(reopen).toBeVisible({ timeout: 1000 });
          await reopen.click({ trial: true, timeout: 1000 });
          const box = await reopen.boundingBox();
          assert.ok(
            box.x >= 0 && box.x + box.width <= 48 && box.y >= 0 && box.y + box.height <= 40,
            'caption control stays before the native menu and inside the 40px titlebar',
          );
          assert.equal(
            await reopen.evaluate((node) => {
              const r = node.getBoundingClientRect();
              return node.contains(
                document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
              );
            }),
            true,
            'caption control owns its hit area',
          );
          await reopen.click();
          await expect(content).toHaveValue('Windows 收起展开保留原输入');
        } catch (error) {
          const evidence = process.env.SIDEBAR_REOPEN_EVIDENCE;
          if (evidence) {
            await page.screenshot({ path: resolve(evidence, 'windows-' + target + '-red.png') });
            await writeFile(
              resolve(evidence, 'windows-' + target + '-probe.json'),
              JSON.stringify(
                await page.evaluate(() => ({
                  probe: window.sidebarProbe(),
                  buttons: [...document.querySelectorAll('.gea-owned-sidebar-toggle')].map(
                    (node) => ({
                      label: node.getAttribute('aria-label'),
                      rect: node.getBoundingClientRect().toJSON(),
                      position: getComputedStyle(node).position,
                      display: getComputedStyle(node).display,
                      styles: [...document.querySelectorAll('style')].map((s) =>
                        s.textContent.includes(
                          'html[data-windows-titlebar] .gea-owned-sidebar-toggle',
                        ),
                      ),
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
      }
      const evidence = process.env.SIDEBAR_REOPEN_EVIDENCE;
      if (evidence)
        await page.screenshot({ path: resolve(evidence, 'windows-' + target + '-green.png') });
    },
  );

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
    const page = await fixture(t, 'darwin', target === 'home');
    if (target === 'business') {
      await page.evaluate(() => window.selectBusiness());
      const geometry = await page.evaluate(() => {
        const viewport = document.querySelector('.gea-workbench-document-viewport');
        const docs = document.querySelector('.gea-workbench-documents');
        return {
          viewport: viewport.getBoundingClientRect().toJSON(),
          docs: docs.getBoundingClientRect().toJSON(),
          anchor: getComputedStyle(docs).positionAnchor,
        };
      });
      assert.ok(Math.abs(geometry.docs.x - geometry.viewport.x) < 1, JSON.stringify(geometry));
      assert.ok(Math.abs(geometry.docs.y - geometry.viewport.y) < 1, JSON.stringify(geometry));
      assert.ok(
        Math.abs(geometry.docs.width - geometry.viewport.width) < 1,
        JSON.stringify(geometry),
      );
      await expect(page.getByRole('textbox', { name: '业务筛选' })).toHaveValue('保留业务筛选');
    } else {
      await expect(page.getByText('探索未至之境')).toBeVisible();
      await expect(page.getByRole('textbox', { name: '首页草稿' })).toBeVisible();
    }
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
  const page = await fixture(t, 'darwin', true);
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
  await expect(page.locator('.agent-workbench-document-body.view-center:visible')).toHaveCount(1);
  await page.evaluate(() => window.selectHome());
  await expect(page.getByRole('textbox', { name: '首页草稿' })).toBeVisible();
  await expect(first).toBeHidden();
  await page.evaluate(() => window.selectSecond());
  // Returning to the official main seat releases the company presentation tree.
  // Author-owned filter persistence across that release is a separate contract.
  await expect(second).toBeVisible();
  assert.equal(
    await page.evaluate(() => window.sidebarProbe().main),
    null,
    'no business main key or invented Session is needed for static presentation',
  );
});

test('plugin welcome and workspace heading compose with the native browser', async (t) => {
  const page = await fixture(t);
  await expect(page.getByRole('heading', { name: 'AI不止于对话，更融入工作' })).toBeVisible();
  await expect(page.getByText('懂业务 · 会协同 · 能行动', { exact: true })).toBeVisible();
  await expect(page.getByText('预览版', { exact: true })).toHaveCount(0);
  const heading = page.getByRole('button', { name: '历史会话', exact: true });
  const business = page.getByRole('button', { name: '业务工作台', exact: true });
  assert.equal(
    await heading.evaluate((node) => getComputedStyle(node).fontSize),
    await business.evaluate((node) => getComputedStyle(node).fontSize),
  );
  await heading.click();
  await expect(heading).toHaveAttribute('aria-expanded', 'true');
  const row = page.getByText('保留的示例会话', { exact: true });
  await expect(row).toBeVisible();
  await row.evaluate((node) => (node.dataset.retainedProbe = 'original'));
  await heading.click();
  await expect(row).toBeHidden();
  const geometry = await heading.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const label = node.querySelector('.gea-drawer-title');
    const range = document.createRange();
    range.selectNodeContents(label);
    const text = range.getBoundingClientRect();
    const clipping = [];
    for (let parent = node.parentElement; parent; parent = parent.parentElement) {
      if (getComputedStyle(parent).overflowY === 'hidden') {
        const box = parent.getBoundingClientRect();
        clipping.push({ top: box.top, bottom: box.bottom });
      }
    }
    const business = document.querySelector('.gea-drawer-function .gea-drawer-title');
    return {
      top: rect.top,
      bottom: rect.bottom,
      textTop: text.top,
      textBottom: text.bottom,
      textLeft: text.left,
      businessLeft: business.getBoundingClientRect().left,
      clipping,
    };
  });
  assert.ok(
    Math.abs(geometry.textLeft - geometry.businessLeft) <= 1,
    'collapsed history aligns with business navigation',
  );
  for (const clip of geometry.clipping) {
    assert.ok(
      geometry.top >= clip.top && geometry.bottom <= clip.bottom,
      'the complete collapsed heading stays inside every clipping container',
    );
    assert.ok(
      geometry.textTop >= clip.top && geometry.textBottom <= clip.bottom,
      'the collapsed label is fully visible',
    );
  }
  const proof = process.env.SIDEBAR_VERIFY_EVIDENCE;
  if (proof) await page.screenshot({ path: resolve(proof, 'history-collapsed.png') });
  await heading.click();
  await expect(row).toBeVisible();
  await expect(row).toHaveAttribute('data-retained-probe', 'original');
  await heading.click();
  await page.evaluate(() => window.requestWorkspaceSearch());
  await expect(page.locator('.gea-drawer-recent .gea-sidebar-tab')).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  const searchInput = page.locator('input[type="text"]');
  await expect(searchInput).toBeVisible();
  await searchInput.press('Escape');
  await expect(row).toBeVisible();
  if (proof) await page.screenshot({ path: resolve(proof, 'welcome-workspace-desktop.png') });
  await page.setViewportSize({ width: 760, height: 720 });
  await expect(page.getByRole('heading', { name: 'AI不止于对话，更融入工作' })).toBeVisible();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  if (proof) await page.screenshot({ path: resolve(proof, 'welcome-workspace-narrow.png') });
});
