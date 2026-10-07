import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const ui='business/inventory-qll/source/inventory-light-plugins/src/';
test('native full-chain transport rejects unsupported writes and refresh/identity invalidates late responses',async()=>{
  const previousWindow=globalThis.window;
  globalThis.window=new EventTarget();
  globalThis.chainApi={reads:[],load:async()=>{throw Error('AGENT_ACCESS_DENIED')}};
  const result=await build({entryPoints:[ui+'native/api.ts'],bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'fetch-fixture',setup(api){
    api.onResolve({filter:/\/qll-engine$|channel\.js$/},a=>({path:a.path,namespace:'fixture'}));
    api.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path.endsWith('channel.js')?'export const ready=Promise.resolve();':'export const load=(a)=>{globalThis.chainApi.reads.push(a);return globalThis.chainApi.load(a)};export const loadDetails=load,loadTrend=load,loadHistory=load;export const clearFacts=()=>{};'}));
  }}]});
  const api=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
  try {
    await api.mountBusinessFetch();
    const denied=await window.fetch('/api/workspace?part=current');assert.equal(denied.status,503);assert.equal((await denied.json()).sampleFallback,false);
    const before=chainApi.reads.length;assert.equal((await window.fetch('/api/workspace',{method:'POST',body:'{}'})).status,503);assert.equal(chainApi.reads.length,before);
    let complete,signal;chainApi.load=o=>{signal=o.signal;return new Promise(r=>complete=r)};
    const old=window.fetch('/api/workspace?part=current');await Promise.resolve();window.dispatchEvent(new Event('light-refresh'));assert.ok(signal.aborted);complete({workspaceId:'old'});await assert.rejects(old,/abort/i);
    chainApi.load=async()=>({workspaceId:'fresh'});assert.equal((await (await window.fetch('/api/workspace?part=current')).json()).workspaceId,'fresh');
    window.dispatchEvent(new Event('gea-identity-changed'));await assert.rejects(window.fetch('/api/workspace?part=current'),/abort/i);
  } finally {globalThis.window=previousWindow;delete globalThis.chainApi;}
});
test('the actual Qll filter hook mounts with Qll fields and applies scope/month/SKU/tab changes',async()=>{
  const {createRequire}=await import('node:module');const {resolve}=await import('node:path');
  const require=createRequire(resolve('package.json'));
  const React=require('react'),{createRoot}=require('react-dom/client'),{JSDOM}=require('jsdom');
  const dom=new JSDOM('<div id="app"></div>');
  const previous=new Map(['window','document','IS_REACT_ACT_ENVIRONMENT'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  globalThis.chainFilter={updates:[],removed:[],applied:[],handlers:{},parts:{fullChainWorkspace:{scope:"company"},structureView:{companyQty:41268}},host:{queryState:{state:"ready"},fullChainWorkspace:{scope:"company"},structureView:{companyQty:41268}}};
  const bundled=await build({entryPoints:[ui+'native/page-filter.tsx'],bundle:true,write:false,format:'esm',platform:'node',external:['react'],plugins:[{name:'filter-fixture',setup(api){
    api.onResolve({filter:/channel\.js$|\/context$/},a=>({path:a.path,namespace:'fixture'}));
    api.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path.endsWith('channel.js')?'export const action=(name,_description,handler)=>{globalThis.chainFilter.handlers[name]=handler;return()=>{delete globalThis.chainFilter.handlers[name];}};export const publish=async value=>{if(globalThis.chainFilter.wait)await globalThis.chainFilter.wait;globalThis.chainFilter.host=structuredClone(value.parts);};':'export const updateContext=(k,v)=>{globalThis.chainFilter.updates.push([k,v]);globalThis.chainFilter.parts[k]=v;};export const removeContextPart=k=>{globalThis.chainFilter.removed.push(k);delete globalThis.chainFilter.parts[k];};export const pageContext=()=>({parts:globalThis.chainFilter.parts});'}));
  }}]});
  // A file import lets the real hook share the same React instance as its caller.
  const {mkdir,writeFile}=await import('node:fs/promises');const {pathToFileURL}=await import('node:url');await mkdir('.runtime',{recursive:true});
  const file=resolve('.runtime/qll-filter-hook.mjs');await writeFile(file,bundled.outputFiles[0].text);
  const {usePageFilter}=await import(pathToFileURL(file));
  const root=createRoot(document.getElementById('app'));
  function Page(){usePageFilter({allowedFields:['scope','month','search','tab'],tabs:['category','structure','aging','shortage'],scope:'company',month:'2026-09',search:'',tab:'category'},args=>chainFilter.applied.push(args));return null;}
  try {
    await React.act(async()=>root.render(React.createElement(Page)));
    const filter=chainFilter.handlers.filter;
    assert.ok(filter);assert.deepEqual(await filter({scope:'company',month:'2026-09',search:'',tab:'category'}),{unchanged:true});
    let confirm;chainFilter.wait=new Promise(resolve=>confirm=resolve);
    const change=filter({scope:'all-channel'});await Promise.resolve();assert.equal(chainFilter.applied.length,0);
    confirm();await change;delete chainFilter.wait;
    assert.equal(chainFilter.host.queryState.state,'loading');assert.equal(chainFilter.host.fullChainWorkspace,undefined);assert.equal(chainFilter.host.structureView,undefined);
    for(const args of [{month:'2026-10'},{search:' A '},{tab:'aging'}])await filter(args);
    assert.deepEqual(chainFilter.applied,[{scope:'all-channel'},{month:'2026-10'},{search:'A'},{tab:'aging'}]);
    assert.equal(chainFilter.updates.filter(([key])=>key==='queryState').length,3);
    let finish;chainFilter.wait=new Promise(resolve=>finish=resolve);const controller=new AbortController();
    const cancelled=filter({scope:'all-channel'},{signal:controller.signal});await Promise.resolve();controller.abort(Error('page switched'));finish();await assert.rejects(cancelled,/page switched/);delete chainFilter.wait;assert.equal(chainFilter.applied.length,4);
    await assert.rejects(filter({scope:'untrusted'}),/范围/);await assert.rejects(filter({month:'2026-13'}),/月份/);await assert.rejects(filter({bases:['hidden']}),/字段/);
  } finally {
    await React.act(async()=>root.unmount());dom.window.close();delete globalThis.chainFilter;
    for(const [key,descriptor] of previous)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];
  }
});
