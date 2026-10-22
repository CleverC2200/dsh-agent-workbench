import assert from 'node:assert/strict';
import { readFile } from './prepared-assets.mjs';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
const compile = async (contents, loader = 'tsx') =>
  (
    await build({
      stdin: { contents, resolveDir: process.cwd(), loader },
      bundle: true,
      write: false,
      platform: 'browser',
      format: 'iife',
      loader: { '.png': 'dataurl', '.css': 'text' },
    })
  ).outputFiles[0].text;
const injector = (
  await build({
    entryPoints: ['src/page-interaction/inject.ts'],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
  })
).outputFiles[0].text;
const { injectPicker } = await import(
  'data:text/javascript;base64,' + Buffer.from(injector).toString('base64')
);
const picker = await compile(
  `import{mountPicker}from'./src/page-interaction/picker.ts';mountPicker();`,
  'ts',
);
const parent = await compile(`
 import React from'react';import{createRoot}from'react-dom/client';import{flushSync}from'react-dom';import{mountFramePresentation}from'./src/frame-presenter.tsx';import{WorkbenchController}from'./src/workbench.ts';
 let Document;const services={};const binding={ctx:{},sessionId:'session-33333333-3333-4333-8333-333333333333'};const id=binding.sessionId;const locale={active:'zh'};const subject='fixture-author-user';const viewScope=JSON.stringify([subject,id]);const identity={state:'confirmed',scope:'fixture-author-scope',subject,status:{authenticated:true}};
 const ctx={businessAccount:{getSnapshot:()=>identity,subscribe:()=>()=>{}},remote:{session:{prompt:()=>{throw Error('UNEXPECTED_MODEL_REQUEST');}}},get:name=>services[name],provide:(name,value)=>{services[name]=value;},locale:{subscribe:()=>()=>{},getSnapshot:()=>locale},theme:{getTheme:()=>({active:{colorScheme:'light',tokens:{}},fontSize:14})},on:()=>()=>{},effect:fn=>fn(),sessions:{retain:()=>({sessionId:id,ready:Promise.resolve(binding),binding,release(){}}),retainInfo:()=>({getSnapshot:()=>({retainedBy:{mainView:true}})})},inputTriggers:{registerSource:()=>()=>{}},conversation:{input:{for:()=>({notify(){}})}},slots:{registerFactory:(_meta,component)=>{Document=component;return()=>{};},register:()=>()=>{},inject:()=>{}},inject:(names,fn)=>{if(names.includes('sidebarRight')||names.includes('slots'))return;return fn(ctx)}};
 const owner=new WorkbenchController({panel:()=>{},document:()=>{}});mountFramePresentation(ctx,()=>undefined,key=>key,owner);
 window.peerDraft='历史草稿，请保留。';window.persisted=0;
 const inputActions={captureInsertion:()=>({start:window.peerDraft.length,end:window.peerDraft.length,draftRev:7}),insertText:(text,span)=>{if(window.conflict)return false;window.peerDraft=window.peerDraft.slice(0,span.start)+text+window.peerDraft.slice(span.end);const input=document.querySelector('textarea[aria-label="Core草稿接口fixture"]');if(input)input.value=window.peerDraft;return true;},persistDraft:()=>{window.persisted++;}};
 function ComposerPeer(){const trigger=React.useRef();React.useEffect(()=>services.pageInteraction.mountTrigger(trigger.current,id),[]);return React.createElement('section',{'aria-label':'Core草稿接口fixture'},React.createElement('div',{ref:trigger}),React.createElement('textarea',{'aria-label':'Core草稿接口fixture',defaultValue:window.peerDraft,onChange:event=>{window.peerDraft=event.target.value;}}));}
 const root=createRoot(document.getElementById('root'));let page,associated=true,unregister;
 const render=()=>root.render(React.createElement(Document,{page,active:true,sessionId:associated?id:undefined,useSessions:select=>select({byId:{[id]:{id,cwd:'/fixture-author-workspace'}}}),useSession:()=>associated?{openState:'open',blank:false}:undefined,useProjection:()=>null,inputActions,renderSlot:()=>React.createElement(ComposerPeer)}));
 window.openAuthor=async(name,width,seed)=>{flushSync(()=>root.render(null));unregister?.();page={id:name==='category'?'plan-region-category':'plan-category-production',kind:'html',src:'/author/'+name,label:name};unregister=owner.registerFrame(page);await owner.open(page.id);owner.associateSession(page.id,{sessionId:id,preset:null,ownerScope:'fixture-author-scope',subject});if(seed)owner.saveHtmlViewState(page.id,viewScope,seed);associated=true;document.getElementById('root').style.width=(width+520)+'px';render();};
 window.unassociate=()=>{associated=false;owner.forgetSession(page.id);render();};window.readView=()=>owner.readHtmlViewState(page.id,viewScope);
`);
export async function authorPage(t, options = {}) {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1920, height: 720 } });
  const css = (
    await Promise.all(
      ['theme/tokens.css', 'src/company/shell.css', 'src/company/layout.css'].map((file) =>
        readFile(file, 'utf8'),
      ),
    )
  ).join('\n');
  const assets = {};
  for (const name of ['category', 'mps']) {
    const html =
      process.env.HTML_LAYOUT_BASELINE === '1'
        ? execFileSync(
            'git',
            ['show', '31fec062d584618efbff07d47d7c1de158a0d9e0:static/' + name + '/index.html'],
            { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
          )
        : await readFile('lib/static/' + name + '/index.html', 'utf8');
    const configured =
      name === 'mps' && options.mpsConfig
        ? html.replace(
            '</head>',
            `<script id="agent-sql-config" type="application/json">${JSON.stringify(options.mpsConfig).replaceAll('<', '\\u003c')}</script></head>`,
          )
        : html;
    assets[name] = injectPicker(configured, picker);
  }
  await page.route('http://127.0.0.1:19480/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body:
        assets[new URL(route.request().url()).pathname.split('/').at(-1)] ??
        `<style>${css}html,body{margin:0;height:100%}#root{height:100%;margin-left:280px}textarea{width:95%;min-height:110px}</style><div id="root"></div>`,
    }),
  );
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  t.after(() =>
    assert.deepEqual(
      errors,
      [],
      'the exact production picker bootstrap and author scripts parse without error',
    ),
  );
  await page.goto('http://127.0.0.1:19480/');
  await page.addScriptTag({ content: parent });
  return page;
}
