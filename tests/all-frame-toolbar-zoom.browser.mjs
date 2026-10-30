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
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.DSH_TEST_BROWSER_CHANNEL,
  });
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
    `<html data-platform="darwin"><style>${css} html,body{margin:0;height:100%} #root{height:100%;margin-left:280px}</style><div id="root"></div>`,
  );
  await page.evaluate((id) => {
    window.testPageId = id;
  }, pageId);
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await expect(page.getByRole('complementary', { name: 'AI对话' })).toBeVisible();
  return page;
}
for (const [id,threshold] of [['inventory-qll',800],['inventory-fc',800],['inventory-aqkc',800],['inventory-dealer',920],['gea-proof',960]]) {
 test(`${id} changes rows only below safe width`, async t=>{
  const page=await documentFixture(t,id); await page.getByRole('button',{name:'中间区域最大，隐藏会话区'}).click();
  for(const width of [threshold,threshold-1,1000]){
   await page.setViewportSize({width:width+280,height:700});
   const chrome=page.locator('.agent-workbench-document-chrome');
   if(width>=threshold) await expect(chrome).toHaveClass(/agent-workbench-document-chrome-shared/);
   else await expect(chrome).not.toHaveClass(/agent-workbench-document-chrome-shared/);
  }
 });
}
