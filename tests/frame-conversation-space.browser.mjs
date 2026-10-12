import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from './helpers/prepared-assets.mjs';
import { build } from 'esbuild';
import { resolve } from 'node:path';
import { chromium, expect } from '@playwright/test';

// Exercise the owned Document and the unmodified official Conversation content.
// Public Session and composer-bar slots are recording fixtures, not live authorization.
const bundle = await build({
  stdin: {
    contents: `
 import React from 'react';import{createRoot}from'react-dom/client';import{mountFramePresentation}from'./src/frame-presenter.tsx';import{WorkbenchController as DocumentWorkbench}from'./src/workbench.ts';
 import{ConversationContent}from'../../official-latest-standard/packages/client/ui-conversation/src/client/skeleton/ConversationContent.tsx';
 import{DefaultConversationViews}from'../../official-latest-standard/packages/client/ui-conversation/src/client/skeleton/DefaultConversationViews.tsx';
 import{TrajectoryView}from'../../official-latest-standard/packages/client/ui-trajectory/src/client/TrajectoryView.tsx';
 let Document,Conversation;const locale={active:'zh'};const identity={state:'confirmed',scope:'recording-principal',subject:'recording-subject',status:{authenticated:true}};
 const reference={sessionId:'recorded-session',ready:Promise.resolve(),release(){window.releases++}};window.releases=0;
 const ctx={get:()=>undefined,provide(){},locale:{subscribe:()=>()=>{},getSnapshot:()=>locale},theme:{getTheme:()=>({active:{colorScheme:'light',tokens:{}},fontSize:14})},on:()=>()=>{},effect:fn=>fn(),inputTriggers:{registerSource:()=>()=>{}},conversation:{input:{for:()=>({})}},sessions:{retain:()=>reference},slots:{registerFactory:(_meta,component)=>{Document=component;return()=>{}},register:(_meta,component)=>{Conversation=component;return()=>{}},inject:(_name,fn)=>fn()},inject:(names,fn)=>{if(names.includes('sidebarRight'))return;return fn({...ctx,businessAccount:{getSnapshot:()=>identity,subscribe:()=>()=>{}},remote:{session:{}}})}};
 const documents=new DocumentWorkbench({panel:()=>{},document:()=>{}});mountFramePresentation(ctx,()=>undefined,key=>key,documents);
 const root=createRoot(document.getElementById('root'));const page={id:'gea-inbox',resourceId:'original',kind:'local',label:'业务页面',body:()=>React.createElement('input',{'aria-label':'业务筛选',defaultValue:''})};
 const inputActions={setDraft:text=>{document.querySelector('textarea').value=text},persistDraft(){}};
 const session={blank:true,running:false,promptAttempted:false,openState:'open'};documents.registerFrame(page);documents.associateSession(page.id,{sessionId:reference.sessionId,preset:'original',ownerScope:identity.scope,subject:identity.subject});documents.open(page.id);
 let selectedView='chat';window.persistenceBindings=0;window.persistenceReleases=0;const bindDraft=()=>{window.persistenceBindings++;return()=>window.persistenceReleases++};
 const trajectory={eventNodes:Array.from({length:40},(_,i)=>({kind:'user',seq:i+1,time:1000+i,content:[{type:'text',text:'真实轨迹公开快照 '+i}],source:null})),eventLocations:new Map(),requests:[],callSchemas:new Map(),partial:null,runningCalls:[]};
 const shares={sessionId:reference.sessionId,useSession:fn=>fn(session),inputActions,useSessions:fn=>fn({byId:{}}),useSessionStatus:fn=>fn(new Map()),useWorkspaces:fn=>fn({items:[],phase:'ready'}),useInput:fn=>fn({draft:''}),useComposerBlock:fn=>fn(undefined),selectWorkspace:()=>Promise.resolve(),t:key=>key,
 useConversation:fn=>fn({activeTargets:new Set(session.blank?[]:[selectedView])}),useConversationViews:fn=>fn([{id:'chat'},{id:'trajectory'}]),useInspectCall:fn=>fn(undefined),useStore:fn=>fn({view:selectedView,viewRequest:null,draft:''}),actions:{setDraft(){},completeViewRequest(){}},bindDraftPersistence:bindDraft,bindDraftMirror:bindDraft,openView(){},useTrajectory:fn=>fn(trajectory),useDuration:fn=>fn(false),loadOlder:async()=>false,loadImage:async()=>undefined,setActualDuration(){},
 renderSlot:(name,props)=>name==='conversation.composer.bar'?React.createElement('textarea',{'aria-label':'公开composer草稿',defaultValue:'',rows:5,style:{boxSizing:'border-box',height:132,width:'100%',resize:'none'}}):name==='conversation.session'?React.createElement('div',{'data-slot':name,style:{display:'contents'}},React.createElement(DefaultConversationViews,shares)):name==='conversation.view'?selectedView==='trajectory'?React.createElement(TrajectoryView,{...shares,...props}):React.createElement('article',{style:{flex:'1 0 auto'}},Array.from({length:40},(_,i)=>React.createElement('p',{key:i},'历史长消息 '+i+'：现有对话内容继续由公开Session槽呈现。'))):null,
 renderSlotChain:(_name,_props,options)=>options.fallback};
 function renderFactorySlot(_name,options,extension){const positions=extension?.slots;return React.createElement(ConversationContent,{...shares,...options,useFactorySlot:(name,fallback)=>{const Slot=positions?.[name]??fallback;return React.useMemo(()=>props=>React.createElement(Slot,{...shares,...props}),[Slot])}})}
 // Keep selected local slot identities stable just as the public Renderer does.
 function BoundConversation(){return React.createElement(Conversation,{page:page.id,...shares,renderFactorySlot})}
 const render=()=>root.render(React.createElement(Document,{page,active:true,sessionId:reference.sessionId,useSession:selector=>selector(session),useProjection:()=>"original",renderSlot:()=>React.createElement(BoundConversation)}));
 window.showHistoryMessages=()=>{session.blank=false;render()};
 window.showTrajectory=()=>{session.blank=false;selectedView='trajectory';render()};
 render();
 `,
    resolveDir: process.cwd(),
    loader: 'tsx',
  },
  bundle: true,
  write: false,
  outfile: 'fixture.js',
  platform: 'browser',
  jsx: 'automatic',
  alias: { react: resolve('node_modules/react') },
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
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 460 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  t.after(() =>
    assert.deepEqual(
      errors,
      [],
      'the official Conversation callbacks must execute without runtime errors',
    ),
  );
  const css = (
    await Promise.all(
      ['theme/tokens.css', 'src/company/shell.css', 'src/company/layout.css'].map((file) =>
        readFile(file, 'utf8'),
      ),
    )
  ).join('\n');
  await page.setContent(
    '<style>' +
      css +
      '\n' +
      bundle.outputFiles.find((file) => file.path.endsWith('.css')).text +
      '\nhtml,body{margin:0;height:100%}#root{height:100%;margin-left:280px}</style><div id="root"></div>',
  );
  await page.addScriptTag({
    content: bundle.outputFiles.find((file) => file.path.endsWith('.js')).text,
  });
  await expect(page.getByRole('textbox', { name: '公开composer草稿' })).toBeVisible();
  return page;
}

test('blank business Conversation keeps welcome and five-line draft inside its native scroll space below the formal toolbar', async (t) => {
  const page = await fixture(t);
  const draft = page.getByRole('textbox', { name: '公开composer草稿' });
  await draft.fill('规格43草稿\n第二行\n第三行\n第四行\n第五行');
  const bounds = await draft.boundingBox();
  assert.ok(
    bounds.y >= 58 && bounds.y + bounds.height <= 460,
    'a five-line draft remains inside the low-height Document',
  );
  const welcome = page.getByRole('region', { name: '业务待办Agent' });
  await expect(welcome).toHaveCount(1);
  assert.equal(
    await welcome.evaluate((node) => !!node.closest('[data-conversation-scroll]')),
    true,
    'welcome participates in the official message scroll',
  );
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollHeight),
    460,
    'the Document has no second whole-page scroll',
  );
  await page.getByRole('button', { name: '中间区域最大，隐藏会话区' }).click();
  await expect(draft).toBeHidden();
  const business = await page.getByRole('textbox', { name: '业务筛选' }).boundingBox();
  assert.ok(business.y >= 58, 'business content clears its toolbar in expanded mode');
  await page.getByRole('button', { name: '会话区最大，隐藏中间区域' }).click();
  await expect(draft).toHaveValue('规格43草稿\n第二行\n第三行\n第四行\n第五行');
  await page.getByRole('button', { name: '同时显示中间区域和会话区' }).click();
  await expect(draft).toHaveValue('规格43草稿\n第二行\n第三行\n第四行\n第五行');
  assert.equal(await page.evaluate(() => window.releases), 0);
});

test('the official trajectory overlay owns its ledger scroll and preserves the resident draft across blank and mode transitions', async (t) => {
  const page = await fixture(t);
  const draft = page.getByRole('textbox', { name: '公开composer草稿' });
  await draft.fill('轨迹下保留\n第二行\n第三行\n第四行\n第五行');
  const blankBindings = await page.evaluate(() => window.persistenceBindings);
  assert.equal(blankBindings, 1, 'blank Session mounts its native draft persistence');
  await page.evaluate(() => window.showTrajectory());
  await expect(page.locator('[data-conversation-composer-overlay]')).toBeVisible();
  const ledger = page.locator('[data-trajectory-scroll]');
  await expect(ledger).toBeVisible();
  for (const height of [460, 340]) {
    await page.setViewportSize({ width: 1280, height });
    for (const mode of ['会话区最大，隐藏中间区域', '同时显示中间区域和会话区']) {
      await page.getByRole('button', { name: mode }).click();
      const scroll = page.locator('[data-conversation-scroll]');
      const view = await page.locator('[data-conversation-composer-overlay]').boundingBox();
      assert.ok(
        view.height > 100 && view.y + view.height <= height,
        'the real trajectory fills the available space without expanding its native scrollport: ' +
          JSON.stringify({ height, mode, view }),
      );
      assert.equal(
        await scroll.evaluate((node) => node.scrollHeight - node.clientHeight),
        0,
        'the overlay leaves scrolling to the trajectory ledger',
      );
      const input = await draft.boundingBox();
      assert.ok(
        input.y >= 58 && input.y + input.height <= height,
        'native overlay clears the existing five-line composer',
      );
      const box = await ledger.boundingBox();
      await page.mouse.move(box.x + 40, box.y + 30);
      await page.mouse.wheel(0, 200);
      await expect.poll(() => ledger.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
      assert.equal(await scroll.evaluate((node) => node.scrollTop), 0);
      await expect(draft).toHaveValue('轨迹下保留\n第二行\n第三行\n第四行\n第五行');
    }
  }
  await page.getByRole('button', { name: '中间区域最大，隐藏会话区' }).click();
  await expect(draft).toBeHidden();
  await page.getByRole('button', { name: '同时显示中间区域和会话区' }).click();
  await expect(draft).toHaveValue('轨迹下保留\n第二行\n第三行\n第四行\n第五行');
  assert.deepEqual(
    await page.evaluate(() => ({
      bound: window.persistenceBindings,
      released: window.persistenceReleases,
      referenceReleased: window.releases,
    })),
    { bound: blankBindings, released: 0, referenceReleased: 0 },
  );
});

test('long public Session content scrolls under the resident composer at low heights without scrolling the Document', async (t) => {
  const page = await fixture(t);
  const draft = page.getByRole('textbox', { name: '公开composer草稿' });
  await draft.fill('第一行\n第二行\n第三行\n第四行\n第五行');
  await page.evaluate(() => window.showHistoryMessages());
  await expect(page.getByRole('region', { name: '业务待办Agent' })).toHaveCount(0);
  await expect(page.getByText('历史长消息 39：现有对话内容继续由公开Session槽呈现。')).toHaveCount(
    1,
  );
  for (const height of [820, 460, 340]) {
    await page.setViewportSize({ width: 1280, height });
    for (const mode of ['会话区最大，隐藏中间区域', '同时显示中间区域和会话区']) {
      await page.getByRole('button', { name: mode }).click();
      const input = await draft.boundingBox();
      assert.ok(
        input.y >= 58 && input.y + input.height <= height,
        'the existing native composer remains operable below the toolbar',
      );
      await expect(draft).toHaveValue('第一行\n第二行\n第三行\n第四行\n第五行');
      const scroller = page.locator('[data-conversation-scroll]');
      const bounds = await scroller.boundingBox();
      await page.mouse.move(bounds.x + 40, bounds.y + 35);
      await page.mouse.wheel(0, 300);
      await expect.poll(() => scroller.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollHeight), height);
      assert.equal(
        await page
          .getByRole('complementary', { name: 'AI对话' })
          .evaluate((node) => node.scrollTop),
        0,
        'the outer AI pane does not own a second message scroll',
      );
      const toolbar = await page
        .getByRole('toolbar', { name: '对话区视图与会话操作' })
        .boundingBox();
      assert.equal(toolbar.y, 0);
      assert.equal(toolbar.height, 58);
    }
  }
  assert.equal(await page.evaluate(() => window.releases), 0);
});
