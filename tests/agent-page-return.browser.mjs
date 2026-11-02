import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium, _electron, expect } from '@playwright/test';
import { configuredPageHtml, configuredWire } from './fixtures/configured-page.mjs';

// Actual cached Document, sidebar creation action, HTML bridge and built business
// page. Only Core public services and the authorized external query are fixtures.
async function fixture(t, id, { dropDisconnect = false } = {}) {
  const output = await build({
    stdin: {
      resolveDir: process.cwd(),
      loader: 'tsx',
      contents: `
import React,{useSyncExternalStore} from 'react';
import {createRoot} from 'react-dom/client';
import {mountFramePresentation} from './src/frame-presenter.tsx';
import {WorkbenchController} from './src/workbench.ts';
import {createConversationStarter} from './src/company/new-conversation.ts';
import {mountCompanyUI} from './src/company/ui.tsx';
import {SlotCore} from '../../official-latest-standard/packages/client/ui-slots/src/index.ts';
import {createSlotRenderer} from '../../official-latest-standard/packages/client/ui-renderer/src/client/scoped-slots.tsx';
let Document,workbench,mainSession='original-session';
window.droppedDisconnects=0;
if (${dropDisconnect}) {
 const NativeChannel=window.MessageChannel;
 window.MessageChannel=class extends NativeChannel {
  constructor(){super();const send=this.port1.postMessage.bind(this.port1);this.port1.postMessage=(message,...args)=>{if(message?.type==='context'&&message.context===null){window.droppedDisconnects++;return}return send(message,...args)}}
 };
}
const listeners=new Set(),effects=[],locale={active:'zh'};
const identity={state:'confirmed',scope:'original-principal',subject:'original-user',status:{authenticated:true}};
window.calls=[];window.prompts=[];window.created=[];window.releases=[];
const notify=()=>listeners.forEach(fn=>fn());
const ctx={get:()=>undefined,provide(){},
 locale:{register:()=>()=>{},bind:()=>key=>key,subscribe:()=>()=>{},getSnapshot:()=>locale},
 theme:{getTheme:()=>({active:{colorScheme:'light',tokens:{}},fontSize:14})},
 on:()=>()=>{},effect:fn=>{const off=fn();if(typeof off==='function')effects.push(off)},
 slots:{registerFactory:(_meta,component)=>{Document=component;return()=>{}},register:()=>()=>{},inject:(_name,fn)=>fn()},
 businessAccount:{getSnapshot:()=>identity,subscribe:()=>()=>{}},
 remote:{session:{prompt:async input=>{window.prompts.push(input);window.setPrompted?.(input.sessionId);return{ok:true}}}},
 sessions:{
  list:{getSnapshot:()=>({phase:'ready',byId:{'original-session':{id:'original-session',cwd:'/workspace',updatedAt:1,retainedBy:{mainView:mainSession==='original-session'?1:0}}}})},
  create:async input=>{window.created.push(input);const id='new-session-'+window.created.length;window.registerCreatedSession(id);return id},
  retain:(id)=>({sessionId:id,ready:Promise.resolve(),release:()=>window.releases.push(id)}),
  retainInfo:()=>({getSnapshot:()=>({retainedBy:{mainView:true}})})},
 workspaces:{list:{getSnapshot:()=>({phase:'ready',items:[{workspaceId:'workspace',path:'/workspace',sessionIds:['original-session'],createdAt:'2026-10-30T00:00:00Z'}]})}},
 uiWorkspace:{openSession:id=>{mainSession=id;notify();window.bindRenderer?.(id)}},
 layout:{beginNavigation:()=>new AbortController().signal},
 inject:(names,fn)=>{if(names.includes('businessAccount'))fn(ctx)}
};

const observable=value=>{const subs=new Set();return {getSnapshot:()=>value,subscribe:fn=>{subs.add(fn);return()=>subs.delete(fn)},set:next=>{value=next;subs.forEach(fn=>fn())}}};
const slots=new SlotCore();window.slotErrors=[];
slots.register({name:'root',children:{'shell.overlay':{kind:'list',scope:'root'},'shell.leading':{kind:'single',scope:'root'},sidebar:{kind:'single',scope:'root'},main:{kind:'keyed',scope:'root'}}},Root);
slots.register({name:'main',key:'conversation',children:{'main.conversation':{kind:'single',scope:'session-maybe'}}},()=>null);
slots.register({name:'main.conversation',children:{'conversation.header':{kind:'single',scope:'session-maybe'}}},()=>null);
slots.register({name:'conversation.header',children:{'settings.launcher':{kind:'single',scope:'root'}}},()=>null);
slots.registerFactory({name:'conversation.content',scope:'session-maybe',slots:{views:{scope:'session-maybe'}},children:{'conversation.hero.content':{kind:'single',scope:'root'},'conversation.hero.workspace':{kind:'single',scope:'root'},'conversation.hero.agentPreset':{kind:'single',scope:'session-maybe'}}},()=>null);
ctx.slots={register:(...args)=>slots.register(...args),registerFactory:slots.registerFactory,inject:(_name,fn)=>fn(),entries:name=>slots.entries(name),entriesOfSlot:name=>slots.entriesOfSlot(name),subscribe:(name,fn)=>slots.subscribe(name,fn)};
const catalogue=observable({phase:'ready',ids:['original-session','new-session'],byId:{'original-session':{id:'original-session',cwd:'/workspace'},'new-session':{id:'new-session',cwd:'/workspace'}}});
const inputActions={captureInsertion:()=>({start:0,end:0,draftRev:0}),insertText:()=>true,persistDraft(){}};
const sources=new Map(['original-session','new-session'].map(id=>[id,observable({key:id,hooks:{session:observable({openState:'open',blank:true,promptAttempted:false,running:false})},keyedHooks:{projection:()=>observable('original')},props:{sessionId:id,inputActions}})]));
window.setPrompted=id=>sources.get(id).getSnapshot().hooks.session.set({openState:'open',blank:false,promptAttempted:true,running:true});
window.registerCreatedSession=id=>{const projection=observable('original');sources.set(id,observable({key:id,hooks:{session:observable({openState:'open',blank:true,promptAttempted:false,running:false})},keyedHooks:{projection:()=>projection},props:{sessionId:id,inputActions}}));const current=catalogue.getSnapshot();catalogue.set({...current,ids:[...current.ids,id],byId:{...current.byId,[id]:{id,cwd:'/workspace'}}})};
const binding=observable(sources.get(mainSession).getSnapshot());window.bindRenderer=id=>binding.set(sources.get(id).getSnapshot());
const rootBinding=observable({key:undefined,hooks:{sessions:catalogue,workspaces:observable(ctx.workspaces.list.getSnapshot())},keyedHooks:{},props:{}});
const adapter={current:binding,bindingSource:target=>sources.get(target.sessionId),renderArea:(_binding,{children})=>children};
const host={subscribe:(key,fn)=>slots.subscribe(key,fn),getVersion:key=>slots.getVersion(key),entriesOf:key=>slots.entries(key),entriesOfSlot:key=>slots.entriesOfSlot(key),specOf:key=>slots.specDynamic(key),isLive:entry=>slots.isLive(entry),storeOf:()=>undefined,factoryStoreOf:()=>undefined,retainFactoryOccurrence:()=>()=>{},subscribeFactory:(key,fn)=>slots.subscribeFactory(key,fn),getFactoryVersion:key=>slots.factoryVersion(key),factoryOf:key=>slots.factory(key),isFactoryLive:entry=>slots.isFactoryLive(entry),root:rootBinding,scopeRevision:observable(0),scope:()=>adapter,locale:{getSnapshot:()=>({revision:0}),bind:()=>key=>key,subscribe:()=>()=>{}},reportEntryError:(key,entry,error,info)=>{window.slotErrors.push({key,message:error.message,stack:error.stack});slots.reportEntryError(key,entry,error,info)},reportFactoryError:(key,entry,error)=>{window.slotErrors.push({key,message:error.message,stack:error.stack});slots.reportFactoryError(key,entry,error)}};
workbench=new WorkbenchController({panel:()=>{},document:id=>{if(id)ctx.uiWorkspace.openSession(id)}});
window.suspendBusinessPage=()=>workbench.leaveDocument();
window.resumeBusinessPage=()=>workbench.open('inventory-${id}');

const page={id:'inventory-${id}',kind:'html',src:'/business',label:'Agent业务页面',pluginId:'inventory-${id}',resourceId:'original'};
workbench.registerFrame(page);workbench.associateSession(page.id,{sessionId:mainSession,preset:'original',ownerScope:identity.scope,subject:identity.subject});void workbench.open(page.id);
const starter=createConversationStarter(ctx,()=>workbench.leaveDocument());
mountFramePresentation(ctx,()=>undefined,key=>key,workbench);
mountCompanyUI(ctx,workbench);
const nativeFetch=window.fetch;
window.fetch=async(url,options)=>{
 if(url!=='/api/agent-workbench/page')return nativeFetch(url,options);
 const input=JSON.parse(options.body);window.calls.push(input);
 return Response.json(await window.externalPageRequest(input));
};

function Root({renderSlot}){
 const sessionId=useSyncExternalStore(fn=>{listeners.add(fn);return()=>listeners.delete(fn)},()=>mainSession);
 const state=useSyncExternalStore(workbench.subscribe,workbench.getSnapshot);
 return <><nav><button onClick={()=>void starter.start()}>左侧新建对话</button><button onClick={()=>void workbench.open(page.id)}>返回Agent页面</button></nav>
 {renderSlot('shell.overlay',{},{only:'agent-workbench.documents'})}
 {!state.selectedDocument&&<form onSubmit={event=>{event.preventDefault();void ctx.remote.session.prompt({sessionId,content:[{type:'text',text:event.currentTarget.elements.question.value}]})}}><input name='question' aria-label='新对话问题'/><button>提问</button></form>}</>;
}
createRoot(document.getElementById('root')).render(createSlotRenderer().renderRoot(host,{}));

`,
    },
    bundle: true,
    write: false,
    platform: 'browser',
    loader: { '.png': 'dataurl', '.css': 'text' },
    alias: { react: process.cwd() + '/node_modules/react' },
  });

  const wire = await configuredWire(id),
    html = await configuredPageHtml(id);
  let owner = 0,
    loads = 0;
  const executablePath = process.env.D107_ELECTRON_EXECUTABLE;
  let page;
  if (executablePath) {
    const directory = await mkdtemp(join(tmpdir(), 'd107-electron-fixture-'));
    const server = createServer((request, response) => {
      const business = new URL(request.url, 'http://fixture').pathname === '/business';
      if (business) loads++;
      response.setHeader('content-type', 'text/html; charset=utf-8');
      response.setHeader('cache-control', 'no-store');
      if (business)
        response.setHeader(
          'Content-Security-Policy',
          "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'self'",
        );
      response.end(business ? html : '<div id="root"></div>');
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const main = join(directory, 'main.cjs');
    await build({
      stdin: {
        resolveDir: process.cwd(),
        contents: `
      import {app,BrowserWindow,protocol} from 'electron';
      import {forwardWebRequest} from '../../official-latest-standard/apps/desktop/src/web-document.ts';
      app.setPath('userData',${JSON.stringify(directory)});
      protocol.registerSchemesAsPrivileged([{scheme:'dsh-app',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true,stream:true,codeCache:true}}]);
      app.whenReady().then(()=>{protocol.handle('dsh-app',request=>forwardWebRequest(request,process.env.D107_FIXTURE_ORIGIN,'fixture-only-cookie'));const window=new BrowserWindow({show:false,width:1440,height:1000,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});window.loadURL('dsh-app://app/');});
    `,
      },
      bundle: true,
      platform: 'node',
      format: 'cjs',
      external: ['electron'],
      outfile: main,
    });
    const electronApp = await _electron.launch({
      executablePath,
      args: [main],
      env: { ...process.env, D107_FIXTURE_ORIGIN: 'http://127.0.0.1:' + server.address().port },
    });
    t.after(async () => {
      await electronApp.close();
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      await rm(directory, { recursive: true, force: true });
    });
    page = await electronApp.firstWindow();
  } else {
    const browser = await chromium.launch({ headless: true });
    t.after(() => browser.close());
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.route('http://127.0.0.1:19490/**', (route) => {
      const business = new URL(route.request().url()).pathname === '/business';
      if (business) loads++;
      return route.fulfill({
        contentType: 'text/html',
        body: business ? html : '<div id="root"></div>',
      });
    });
    await page.goto('http://127.0.0.1:19490/');
  }
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.stack));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.exposeFunction('externalPageRequest', (input) => {
    if (input.operation === 'open')
      return {
        owner: 'owner-' + ++owner,
        binding: { surface: 'gea-html-inventory-' + id, tool: 'gea_plugin_page_apply' },
      };
    if (input.operation === 'sql') return wire(input.parameters);
    if (input.operation === 'access') return { principalId: 'original-user', consumerCode: id };
    if (input.operation === 'events') return [];
    if (input.operation === 'catalog') return { events: [] };
    if (input.operation === 'insight') return { answer: '测试外部响应。' };
    return {};
  });
  await page.addScriptTag({ content: output.outputFiles[0].text });
  const frame = page.frameLocator('iframe');
  return { page, frame, errors, loads: () => loads };
}

for (const id of ['qll', 'fc', 'aqkc'])
  test(
    `${id}: Agent page → sidebar new conversation → ask → cached Agent page renders again`,
    { timeout: 30000 },
    async (t) => {
      const { page, frame, errors, loads } = await fixture(t, id);
      const cards = frame.locator(`[data-overview-cards="${id}"]`);
      await expect(cards)
        .toBeVisible()
        .catch(async (error) => {
          console.log(
            JSON.stringify({
              id,
              errors,
              calls: await page.evaluate(() => window.calls),
              slotErrors: await page.evaluate(() => window.slotErrors),
              parent: (await page.locator('body').innerText()).slice(0, 1000),
              frames: await Promise.all(
                page.frames().map(async (f) => ({
                  url: f.url(),
                  text: (await f.locator('body').innerText()).slice(0, 1000),
                })),
              ),
            }),
          );
          throw error;
        });
      for (let i = 0; i < 2; i++) {
        await page.getByRole('button', { name: '左侧新建对话', exact: true }).click();
        await page.getByRole('textbox', { name: '新对话问题' }).fill('帮我分析库存');
        await page.getByRole('button', { name: '提问', exact: true }).click();
        await expect.poll(() => page.evaluate(() => window.prompts.length)).toBe(i + 1);
        await page.getByRole('button', { name: '返回Agent页面', exact: true }).click();
        await expect(cards).toBeVisible();
        await expect(frame.locator('#app')).not.toBeEmpty();
      }
      assert.ok(loads() >= 1);
      assert.deepEqual(await page.evaluate(() => window.slotErrors), []);
      assert.deepEqual(errors, []);
      assert.ok(
        (await page.evaluate(() => window.calls)).filter((call) => call.operation === 'open')
          .length >= 3,
      );
      await mkdir('.scratch', { recursive: true });
      await page.screenshot({ path: `.scratch/${id}-agent-return.png` });
    },
  );

test(
  'FC cached page renews its own Session after a lost disconnect notice and reads through its new owner',
  { timeout: 30000 },
  async (t) => {
    const { page, frame, errors, loads } = await fixture(t, 'fc', { dropDisconnect: true });
    await expect(frame.locator('[data-overview-cards="fc"]')).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => window.calls.filter((call) => call.operation === 'sql').length),
      )
      .toBeGreaterThan(0);
    const originalOwner = await page.evaluate(
      () => window.calls.find((call) => call.operation === 'sql').owner,
    );
    await page.evaluate(() => window.suspendBusinessPage());
    await expect.poll(() => page.evaluate(() => window.droppedDisconnects)).toBeGreaterThan(0);
    await page.evaluate(() => window.resumeBusinessPage());
    await expect(frame.locator('[data-overview-cards="fc"]')).toBeVisible();
    await frame.getByRole('button', { name: '刷新', exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(
          (owner) => window.calls.some((call) => call.operation === 'sql' && call.owner !== owner),
          originalOwner,
        ),
      )
      .toBe(true);
    assert.equal(loads(), 1, 'the same Session restores its resident iframe');
    assert.deepEqual(errors, []);
  },
);
