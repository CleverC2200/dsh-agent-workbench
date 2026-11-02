import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFile } from './helpers/prepared-assets.mjs';
import { chromium, expect } from '@playwright/test';

// Workbench owns the presentation; the fixture supplies only public Core and fetch contracts.
const { outputFiles } = await build({
  stdin: {
    contents: `
import React,{useSyncExternalStore} from 'react';
import {createRoot} from 'react-dom/client';
import {mountFramePresentation} from './src/frame-presenter.tsx';
import {WorkbenchController} from './src/workbench.ts';
const effects=[],themeListeners=new Set(),sessionListeners=new Set(),locale={active:'zh'};
let Document,Conversation,mainSession='session-1';
let snapshot={active:{colorScheme:'light',tokens:{}},fontSize:14};
const identitySnapshot={state:'confirmed',scope:'principal-a',subject:'fixture-user-a',status:{authenticated:true}};
window.calls=[];window.opens=[];window.releases=[];window.prompts=[];window.gates={};
const gate=id=>window.gates[id]??=Promise.withResolvers();
window.finishOpen=id=>gate(id).resolve();
window.failOpen=id=>{gate(id).resolve({error:'无权访问此页面'});delete window.gates[id];};
window.fetch=async(url,options)=>{
  if(url!=='/api/agent-workbench/page')throw Error('unexpected fetch '+url);
  const input=JSON.parse(options.body);window.calls.push(input);
  if(input.operation==='open'){
    window.opens.push(input.sessionId);const denial=await gate(input.sessionId).promise;
    if(denial)return Response.json(denial,{status:403});
    return Response.json({owner:'owner-'+input.sessionId,binding:{surface:'gea-html-inventory-fixture',tool:'gea_plugin_page_apply'}});
  }
  if(input.operation==='events'&&window.failEvents)return Response.json({error:'页面连接已断开'},{status:503});
  return Response.json(input.operation==='events'?[]:input.operation==='catalog'?{events:[]}:{});
};
const ctx={
  get:()=>undefined,provide(){},
  locale:{subscribe:()=>()=>{},getSnapshot:()=>locale},
  theme:{getTheme:()=>snapshot},on:(event,listener)=>{if(event==='theme/change'){themeListeners.add(listener);return()=>themeListeners.delete(listener);}return()=>{};},
  effect:fn=>{const off=fn();if(typeof off==='function')effects.push(off);},
  slots:{registerFactory:(_meta,component)=>{Document=component;return()=>{};},register:(_meta,component)=>{Conversation=component;return()=>{};},inject:(_name,fn)=>fn()},
  remote:{session:{prompt:async input=>{window.prompts.push(input);return{ok:true};}}},
  businessAccount:{getSnapshot:()=>identitySnapshot,subscribe:()=>()=>{}},
  sessions:{retain:(id,{signal})=>({sessionId:id,ready:Promise.resolve(),release:()=>window.releases.push(id)}),retainInfo:()=>({getSnapshot:()=>({retainedBy:{mainView:true}})})},
  inject:(names,fn)=>{if(names.includes('businessAccount'))fn(ctx);},
};
const workbench=new WorkbenchController({panel:()=>{},document:()=>{}});
const page={id:window.testFramePageId??'inventory-fixture',kind:'html',src:'/html',label:'Fixture',pluginId:'inventory-fixture',resourceId:'original'};
workbench.registerFrame(page);void workbench.open(page.id);
window.bind=id=>{mainSession=id;workbench.associateSession(page.id,{sessionId:id,preset:'original',ownerScope:'principal-a',subject:'fixture-user-a'});for(const notify of sessionListeners)notify();};
window.suspend=()=>workbench.forgetSession(page.id);
window.publishTheme=next=>{snapshot=next;for(const listener of themeListeners)listener();};
window.themeListenerCount=()=>themeListeners.size;
mountFramePresentation(ctx,()=>undefined,key=>key,workbench);
const root=createRoot(document.getElementById('app'));
const inputActions={captureInsertion:()=>({start:0,end:0,draftRev:0}),insertText:()=>true,persistDraft:()=>{}};
function Main(){
 const sessionId=useSyncExternalStore(listener=>{sessionListeners.add(listener);return()=>sessionListeners.delete(listener);},()=>mainSession);
 const state=useSyncExternalStore(workbench.subscribe,workbench.getSnapshot);
 return <Document page={page} active={true} useSessions={select=>select({byId:{}})} sessionId={sessionId} inputActions={inputActions} useProjection={()=>'original'} useSession={select=>select({openState:'open'})} renderSlot={()=> <textarea aria-label="public draft fixture" defaultValue=""/>}/>;
}
window.unmount=()=>{root.unmount();effects.reverse().forEach(off=>off());};
root.render(<Main/>);window.bind('session-1');
`,
    resolveDir: process.cwd(),
    loader: 'tsx',
  },
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  loader: { '.png': 'dataurl', '.css': 'text' },
});

const html = `<input id="filter"><div style="height:2000px">Original table</div><script>
window.connects=[];window.messages=[];window.timeline=[];window.ports=[];window.readyCount=0;
function ready(){readyCount++;parent.postMessage({protocol:'gea-html-v2',type:'ready'},'*');}
addEventListener('message',event=>{
 if(event.source!==parent)return;
 if(event.data?.type==='request-ready'){ready();return;}
 if(event.data?.type!=='connect')return;
 timeline.push({type:'connect',context:event.data.context});connects.push(event.data.context);window.context=event.data.context;window.port=event.ports[0];ports.push(port);
 port.onmessage=event=>{messages.push(event.data);timeline.push(event.data);if(event.data.type==='context')window.context=event.data.context;};port.start();
 if(window.autoSubscribeTheme)port.postMessage({type:'theme:subscribe',session:context.session});
 port.postMessage({type:'register',session:context.session,name:'filter',description:'Filter rows'});
});ready();
window.request=(id,method,parameters={},session=context.session)=>port.postMessage({type:'request',id,method,parameters,session});
</script>`;

async function fixture(t, pageId = 'inventory-fixture', frameHtml) {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  const errors = [];
  let loads = 0;
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('http://127.0.0.1:19481/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/html') loads++;
    return route.fulfill({
      contentType: 'text/html',
      body:
        path === '/html'
          ? (frameHtml ??
            `<script>window.autoSubscribeTheme=${pageId === 'plan-category-production'}</script>${html}`)
          : '<div id="app"></div>',
    });
  });
  await page.goto('http://127.0.0.1:19481/');
  await page.evaluate((id) => {
    window.testFramePageId = id;
  }, pageId);
  await page.addScriptTag({ content: outputFiles[0].text });
  await expect.poll(() => page.evaluate(() => opens)).toEqual(['session-1']);
  const child = page.frames().find((frame) => frame !== page.mainFrame());
  if (!frameHtml) await child.waitForFunction(() => readyCount > 0);
  return { page, child, errors, loads: () => loads };
}

test('MPS reconnect replaces the owned frame, releases the old connection and preserves the Conversation draft', async (t) => {
  const { page, errors, loads } = await fixture(t, 'plan-category-production');
  await page.evaluate(() => window.finishOpen('session-1'));
  const retry = page.getByRole('button', { name: 'pageReconnect', exact: true });
  await expect(retry).toBeEnabled();
  await page.getByLabel('public draft fixture').fill('重连保留的会话草稿');
  const before = loads();
  await retry.click();
  await expect(page.getByRole('status')).toContainText('pageReconnected');
  await expect.poll(() => loads()).toBe(before + 1);
  await expect.poll(() => page.evaluate(() => opens.length)).toBe(2);
  await expect
    .poll(() => page.evaluate(() => calls.filter((call) => call.operation === 'close').length))
    .toBe(1);
  await expect(page.getByLabel('public draft fixture')).toHaveValue('重连保留的会话草稿');
  assert.deepEqual(errors, []);
});

test('MPS reconnect exposes an opening denial and retries through the same owned Session', async (t) => {
  const { page, errors } = await fixture(t, 'plan-category-production');
  await page.evaluate(() => window.failOpen('session-1'));
  await expect(page.getByText('无权访问此页面', { exact: true })).toBeVisible();
  const retry = page.getByRole('button', { name: 'pageReconnect', exact: true });
  await expect(retry).toBeEnabled();
  await retry.click();
  await expect(retry).toBeDisabled();
  await expect.poll(() => page.evaluate(() => opens)).toEqual(['session-1', 'session-1']);
  await page.evaluate(() => window.finishOpen('session-1'));
  await expect(page.getByRole('status')).toContainText('pageReconnected');
  await expect(page.getByText('无权访问此页面', { exact: true })).toHaveCount(0);
  assert.deepEqual(errors, []);
});

test('MPS reconnect reopens the owned Session after a lost channel', async (t) => {
  const { page, errors } = await fixture(t, 'plan-category-production');
  await page.evaluate(() => window.finishOpen('session-1'));
  const retry = page.getByRole('button', { name: 'pageReconnect', exact: true });
  await expect(retry).toBeEnabled();
  await page.evaluate(() => {
    window.failEvents = true;
  });
  await expect(page.getByRole('alert')).toContainText('页面连接已断开');
  await page.evaluate(() => {
    window.failEvents = false;
  });
  await retry.click();
  await expect(page.getByRole('status')).toContainText('pageReconnected');
  await expect.poll(() => page.evaluate(() => opens.length)).toBe(2);
  assert.deepEqual(errors, []);
});

test('MPS reconnect restores the actual product input and the unsent Conversation draft', async (t) => {
  const { page, errors } = await fixture(
    t,
    'plan-category-production',
    await readFile('lib/static/mps/index.html', 'utf8'),
  );
  await page.evaluate(() => window.finishOpen('session-1'));
  const retry = page.getByRole('button', { name: 'pageReconnect', exact: true });
  await expect(retry).toBeEnabled();
  const frame = page.frameLocator('iframe');
  await frame.getByLabel('选择产品关系CSV或Excel', { exact: true }).setInputFiles({
    name: 'reconnect-products.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '基地,产品编码,产品名称,大类,系列,物料组,老品编码,老品名称\n,00123,重连保留产品,汤圆,系列,组,,',
    ),
  });
  const products = frame.getByRole('region', { name: '产品明细', exact: true });
  await expect(products.locator('tbody tr')).toHaveCount(1);
  await page.getByLabel('public draft fixture').fill('实际MPS重连前未发送的草稿');
  await retry.click();
  await expect(page.getByRole('status')).toContainText('pageReconnected');
  await expect(products.locator('tbody tr')).toHaveCount(1);
  await expect(products).toContainText('00123');
  await expect(products).toContainText('重连保留产品');
  await expect(page.getByLabel('public draft fixture')).toHaveValue('实际MPS重连前未发送的草稿');
  assert.deepEqual(errors, []);
});

test('ready before the current opening finishes connects once to the latest Session', async (t) => {
  const { page, child, errors } = await fixture(t);
  await page.evaluate(() => window.bind('session-2'));
  await child.evaluate(() => {
    for (let i = 0; i < 3; i++) parent.postMessage({ protocol: 'gea-html-v2', type: 'ready' }, '*');
  });
  assert.deepEqual(await child.evaluate(() => connects), []);
  await page.evaluate(() => window.finishOpen('session-1'));
  await expect.poll(() => page.evaluate(() => opens)).toEqual(['session-1', 'session-2']);
  await page.evaluate(() => window.finishOpen('session-2'));
  await expect
    .poll(() => child.evaluate(() => connects))
    .toEqual([{ plugin: 'inventory-fixture', session: 'session-2' }]);
  assert.deepEqual(errors, []);
});

test('two superseded openings and repeated ready connect only the latest Session', async (t) => {
  const { page, child, errors } = await fixture(t);
  await page.evaluate(() => window.bind('session-2'));
  await page.evaluate(() => window.finishOpen('session-1'));
  await expect.poll(() => page.evaluate(() => opens)).toEqual(['session-1', 'session-2']);
  await page.evaluate(() => window.bind('session-3'));
  await child.evaluate(() => {
    for (let i = 0; i < 3; i++) parent.postMessage({ protocol: 'gea-html-v2', type: 'ready' }, '*');
  });
  assert.deepEqual(await child.evaluate(() => connects), []);
  await page.evaluate(() => window.finishOpen('session-2'));
  await expect
    .poll(() => page.evaluate(() => opens))
    .toEqual(['session-1', 'session-2', 'session-3']);
  await page.evaluate(() => window.finishOpen('session-3'));
  await expect
    .poll(() => child.evaluate(() => connects))
    .toEqual([{ plugin: 'inventory-fixture', session: 'session-3' }]);
  const calls = await page.evaluate(() => window.calls);
  for (const id of ['session-1', 'session-2'])
    assert.ok(calls.some((call) => call.operation === 'close' && call.owner === 'owner-' + id));
  assert.deepEqual(errors, []);
});

test('an absent page association keeps ready available for a later valid Session', async (t) => {
  const { page, child, errors } = await fixture(t);
  await page.evaluate(() => window.suspend());
  await page.evaluate(() => window.finishOpen('session-1'));
  await child.evaluate(() => parent.postMessage({ protocol: 'gea-html-v2', type: 'ready' }, '*'));
  assert.deepEqual(await child.evaluate(() => connects), []);
  await page.evaluate(() => window.bind('session-3'));
  await expect.poll(() => page.evaluate(() => opens.includes('session-3'))).toBe(true);
  await page.evaluate(() => window.finishOpen('session-3'));
  await expect
    .poll(() => child.evaluate(() => connects))
    .toEqual([{ plugin: 'inventory-fixture', session: 'session-3' }]);
  assert.deepEqual(errors, []);
});

test('unmount cancels a pending first opening without transferring a port', async (t) => {
  const { page, child, errors } = await fixture(t);
  assert.deepEqual(await child.evaluate(() => connects), []);
  await page.evaluate(() => window.unmount());
  await page.evaluate(() => window.finishOpen('session-1'));
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => releases)).toEqual(['session-1']);
  assert.equal(await page.evaluate(() => calls.some((call) => call.operation === 'events')), false);
  assert.deepEqual(errors, []);
});

test('Session replacement keeps the same page values and scroll but refuses old port and Session requests', async (t) => {
  const { page, child, errors, loads } = await fixture(t);
  await page.evaluate(() => window.finishOpen('session-1'));
  await child.waitForFunction(() => !!window.port);
  await child.locator('#filter').fill('华东');
  await child.evaluate(() => {
    window.marker = 'retained';
    window.scrollTo(0, 300);
  });
  await page.getByRole('textbox', { name: 'public draft fixture' }).fill('尚未发送的公开草稿');
  await page.evaluate(() => window.bind('session-2'));
  await expect.poll(() => page.evaluate(() => opens.includes('session-2'))).toBe(true);
  await page.evaluate(() => window.finishOpen('session-2'));
  await child.waitForFunction(() => context?.session === 'session-2');
  await child.evaluate(() => {
    ports[0].postMessage({
      type: 'request',
      id: 'old-port',
      method: 'workspace',
      session: 'session-1',
      parameters: { marker: 'old-port' },
    });
    request('wrong-session', 'workspace', { marker: 'old-session' }, 'session-1');
    request('current', 'workspace', { marker: 'new' });
    request('ask', 'conversation', {
      text: 'hello',
      context: { filter: document.querySelector('input').value },
    });
  });
  await expect.poll(() => page.evaluate(() => window.prompts.at(-1)?.sessionId)).toBe('session-2');
  const calls = await page.evaluate(() => window.calls);
  assert.equal(
    calls.some((call) => call.parameters?.marker?.startsWith('old')),
    false,
  );
  assert.equal(calls.find((call) => call.parameters?.marker === 'new').owner, 'owner-session-2');
  assert.ok(
    calls.some((call) => call.operation === 'register' && call.owner === 'owner-session-2'),
  );
  assert.ok(calls.some((call) => call.operation === 'close' && call.owner === 'owner-session-1'));
  assert.equal(loads(), 1);
  assert.equal(await child.locator('#filter').inputValue(), '华东');
  assert.equal(await child.evaluate(() => marker), 'retained');
  assert.equal(await child.evaluate(() => scrollY), 300);
  await expect(page.getByRole('textbox', { name: 'public draft fixture' })).toHaveValue(
    '尚未发送的公开草稿',
  );
  assert.deepEqual(errors, []);
});

test('theme subscription uses the current owned port and releases listeners with the frame', async (t) => {
  const { page, child, errors } = await fixture(t);
  await page.evaluate(() => window.finishOpen('session-1'));
  await child.waitForFunction(() => !!window.port);
  await page.evaluate(() => window.postMessage({ protocol: 'gea-html-v2', type: 'ready' }, '*'));
  await child.evaluate(() => port.postMessage({ type: 'theme:subscribe', session: 'obsolete' }));
  await child.waitForFunction(() =>
    messages.some((message) => message.error === 'PAGE_SESSION_CHANGED'),
  );
  assert.equal(
    await child.evaluate(() => messages.some((message) => message.type === 'theme')),
    false,
  );
  await child.evaluate(() => port.postMessage({ type: 'theme:subscribe', session: 'session-1' }));
  await child.waitForFunction(() => messages.some((message) => message.type === 'theme'));
  const first = await child.evaluate(() => messages.find((message) => message.type === 'theme'));
  assert.equal(first.context.session, 'session-1');
  assert.equal(first.version, '1.1.1');
  assert.equal(first.fontSize, 14);
  await page.evaluate(() => document.body.style.setProperty('--workbench-font-size', '17px'));
  assert.equal(
    await child.evaluate(() => messages.filter((message) => message.type === 'theme').length),
    1,
  );
  await page.evaluate(() =>
    window.publishTheme({
      fontSize: 17,
      active: { colorScheme: 'dark', tokens: { '--dsw-alias-label-primary': '#112233' } },
    }),
  );
  await child.waitForFunction(() =>
    messages.some((message) => message.type === 'theme' && message.fontSize === 17),
  );
  const changed = await child.evaluate(() =>
    messages.filter((message) => message.type === 'theme').at(-1),
  );
  assert.equal(changed.colorScheme, 'dark');
  assert.equal(changed.tokens['--dsw-alias-label-primary'], '#112233');
  await page.evaluate(() => window.bind('session-2'));
  await expect.poll(() => page.evaluate(() => opens.includes('session-2'))).toBe(true);
  await page.evaluate(() => window.finishOpen('session-2'));
  await child.waitForFunction(() => context?.session === 'session-2');
  await child.evaluate(() => port.postMessage({ type: 'theme:subscribe', session: 'session-2' }));
  await child.waitForFunction(() =>
    messages.some((message) => message.type === 'theme' && message.context.session === 'session-2'),
  );
  const timeline = await child.evaluate(() => window.timeline);
  const suspended = timeline.findIndex(
    (message) => message.type === 'context' && message.context === null,
  );
  const rebound = timeline.findIndex(
    (message) => message.type === 'connect' && message.context?.session === 'session-2',
  );
  assert.ok(suspended >= 0 && rebound > suspended);
  await page.evaluate(() => window.unmount());
  await expect(page.locator('iframe')).toHaveCount(0);
  assert.equal(await page.evaluate(() => window.themeListenerCount()), 0);
  assert.deepEqual(errors, []);
});

test('the shipped standalone sample renders its four rows without an invented business lease or Session', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const sample = await readFile('lib/samples/index.html', 'utf8');
  const requests = [];
  await page.route('http://127.0.0.1:19482/**', (route) => {
    requests.push(new URL(route.request().url()).pathname);
    return route.fulfill({ contentType: 'text/html', body: sample });
  });
  await page.goto('http://127.0.0.1:19482/sample');
  await expect(page.locator('#query')).toBeEnabled();
  await expect(page.locator('#rows tr')).toHaveCount(4);
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(247, 248, 250)');
  await expect(page.locator('body')).toHaveCSS('font-size', '14px');
  await page.evaluate(() =>
    postMessage({ protocol: 'agent-workbench-theme', dark: true, fontSize: 17 }, location.origin),
  );
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(27, 29, 33)');
  await expect(page.locator('body')).toHaveCSS('font-size', '17px');
  await expect(page.locator('#rows tr')).toHaveCount(4);
  assert.deepEqual(requests, ['/sample']);
  assert.deepEqual(errors, []);
});
