import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {chromium,expect} from '@playwright/test';
await mkdir('.scratch',{recursive:true});
const htmlModule=await build({entryPoints:['src/html-pages.ts'],bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'official-tools',setup(b){b.onResolve({filter:/^@deepseek-ai\/dsh-tools$/},()=>({path:pathToFileURL(resolve('../../official-latest-standard/packages/core/tools/lib/index.js')).href,external:true}));}}]});
const compiled=resolve('.scratch/static-picker-html.mjs');await writeFile(compiled,htmlModule.outputFiles[0].text);const {HtmlPages}=await import(pathToFileURL(compiled).href);
const picker=await build({entryPoints:['src/page-interaction/page.ts'],bundle:true,write:false,format:'iife',platform:'browser'});
const parent=await build({stdin:{contents:`
 import {installPageInteraction}from'./src/page-interaction/client.ts';
 const effects=[];const ctx={get:()=>undefined,provide(){},effect:f=>{const off=f();if(off)effects.push(off);},inject:(names,fn)=>{if(!names.includes('slots'))fn({...ctx,inputTriggers:{registerSource:()=>()=>{}},conversation:{input:{for:()=>{throw Error('no business input');}}}});}};
 const api=installPageInteraction(ctx);const id='session-33333333-3333-4333-8333-333333333333';const binding={ctx:{},sessionId:id};const reference={sessionId:id,ready:Promise.resolve(binding),binding,release(){}};
 const frame=document.querySelector('iframe');api.mountTrigger(document.getElementById('trigger'),id);
 frame.addEventListener('load',()=>{api.bindFrame({mode:'quote',frame,reference,page:'Static author HTML',isCurrentSession:()=>true,inputActions:{captureInsertion:()=>({start:5,end:5,draftRev:1}),insertText:(text,span)=>{window.inserted={text,span,id};return true;},persistDraft:()=>{window.persisted=true;}}});});
 `,resolveDir:process.cwd()},bundle:true,write:false,format:'iife',platform:'browser'});

test('registered static HTML bootstraps the original picker and enables the actual paired quote trigger without a GEA declaration',async t=>{
 const directory=await mkdtemp(resolve('.scratch/static-picker-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 await writeFile(join(directory,'plugin.json'),JSON.stringify({schemaVersion:1,id:'static-author',name:'Static author HTML',html:'index.html'}));
 await writeFile(join(directory,'index.html'),'<html><head></head><body><article data-page-block><h2>静态作者页面</h2><p>源级 picker 引用证据</p></article></body></html>');
 const cleanups=[];const context={effect:fn=>{cleanups.push(fn());},on:()=>()=>{},inject(){},connection:{fetch:{register:()=>()=>{}}}};
 const pages=new HtmlPages(context,'',async()=>picker.outputFiles[0].text);await pages.registerHtml([directory]);
 const html=await(await pages.fetch(new Request('https://host.example/api/agent-workbench/html?id=static-author'))).text();
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());const page=await browser.newPage();
 await page.route('https://host.example/**',async route=>route.fulfill({contentType:'text/html; charset=utf-8',body:route.request().url().includes('/api/')?html:'<html><body><div id="trigger"></div><iframe sandbox="allow-scripts" src="/api/agent-workbench/html?id=static-author"></iframe></body></html>'}));
 await page.goto('https://host.example/');await page.addScriptTag({content:parent.outputFiles[0].text});await page.locator('iframe').evaluate(frame=>{frame.src=frame.src;});
 const trigger=page.getByRole('button',{name:'选择内容',exact:true});await expect(trigger).toBeEnabled();await trigger.click();
 await expect(page.getByRole('button',{name:'退出选择',exact:true})).toBeEnabled();
 await page.frameLocator('iframe').getByRole('heading',{name:'静态作者页面'}).click();
 await expect.poll(()=>page.evaluate(()=>window.inserted?.text)).toContain('源级 picker 引用证据');
 assert.deepEqual(await page.evaluate(()=>window.inserted.span),{start:5,end:5,draftRev:1});assert.equal(await page.evaluate(()=>window.persisted),true);
 assert.equal(pages.list()[0].resourceId,undefined,'picker injection grants neither a Managed resource nor GEA permission');
 cleanups.forEach(off=>off?.());
});
