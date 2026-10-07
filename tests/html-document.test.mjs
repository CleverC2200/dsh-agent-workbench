import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
const code=(await build({entryPoints:['src/html-document.ts'],bundle:true,write:false,format:'esm',platform:'node'})).outputFiles[0].text;
const {presentHtml}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
for(const [name,html] of [
  ['explicit head','<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="connect-src none"></head><body><main>库存数据</main></body></html>'],
  ['implicit head','<!doctype html><html><meta charset="utf-8"><title>库存</title><body><main>库存数据</main></body></html>'],
  ['uppercase head','<!DOCTYPE html><HTML><HEAD><TITLE>库存</TITLE></HEAD><BODY><main>库存数据</main></BODY></HTML>'],
  ['uppercase body','<!DOCTYPE html><meta charset="utf-8"><BODY><main>库存数据</main></BODY>'],
  ['omitted closing tags','<!doctype html><title>库存</title><main>库存数据</main>'],
  ['body text in script','<!doctype html><title>库存</title><body><main>库存数据</main><script>window.authorLiteral="</body>";</script></body>'],
])test(`theme presentation preserves standard document parsing and current theme messages with ${name}`,async t=>{
  const dom=new JSDOM(presentHtml(html,'body { color: rgb(20, 30, 40); }'),{url:'https://host.example/page',runScripts:'dangerously'});
  t.after(()=>dom.window.close());
  await new Promise(done=>dom.window.document.addEventListener('DOMContentLoaded',done));
  assert.equal(dom.window.document.compatMode,'CSS1Compat');
  assert.equal(dom.window.document.doctype.name,'html');
  assert.equal(dom.window.document.querySelector('main').textContent,'库存数据');
  if(name==='body text in script')assert.equal(dom.window.authorLiteral,'</body>');
  assert.equal(dom.window.document.querySelector('title')?.textContent,html.includes('<title>')||html.includes('<TITLE>')?'库存':undefined);
  if(name==='explicit head')assert.equal(dom.window.document.querySelector('meta[http-equiv]').content,'connect-src none');
  const post=(source,data)=>dom.window.dispatchEvent(new dom.window.MessageEvent('message',{source,data}));
  post({}, {protocol:'agent-workbench-theme',dark:true,fontSize:17});
  assert.equal(dom.window.document.body.hasAttribute('data-ds-dark-theme'),false);
  post(dom.window.parent,{protocol:'agent-workbench-theme',dark:true,fontSize:17});
  assert.equal(dom.window.document.body.hasAttribute('data-ds-dark-theme'),true);
  assert.equal(dom.window.document.documentElement.style.getPropertyValue('--dsh-content-font-size'),'17px');
});
