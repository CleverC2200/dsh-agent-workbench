import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const load=async(file,key)=>{const {outputFiles}=await build({entryPoints:[file],bundle:true,write:false,format:'esm',platform:'node'});return import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64')+'#'+key);};
const tick=()=>new Promise(resolve=>setImmediate(resolve));

for(const cause of ['abort','timeout'])test(`real business channel ${cause} cancels its bound bridge request`,async t=>{
  const saved={window:globalThis.window,document:globalThis.document,setTimeout:globalThis.setTimeout};
  const hostListeners=new Set(),pageListeners=new Set();
  const host={parent:null,addEventListener:(name,fn)=>{if(name==='message')hostListeners.add(fn)},removeEventListener:(_name,fn)=>hostListeners.delete(fn),dispatchEvent:()=>{}};host.parent=host;
  const page={parent:host,addEventListener:(name,fn)=>{if(name==='message')pageListeners.add(fn)},dispatchEvent:()=>{}};
  host.postMessage=data=>{for(const fn of hostListeners)fn({source:page,origin:'null',data});};
  page.postMessage=(data,_origin,ports=[])=>{for(const fn of pageListeners)fn({source:host,origin:'https://host.example',data,ports});};
  globalThis.window=page;globalThis.document={referrer:'https://host.example/workbench',body:{style:{setProperty(){},removeProperty(){}},toggleAttribute(){}},documentElement:{style:{}},getElementById:()=>({textContent:''})};
  const channel=await load('business/shared/channel.js',cause);
  globalThis.window=host;
  if(cause==='timeout')globalThis.setTimeout=(fn,ms,...args)=>saved.setTimeout(fn,ms===120000?25:ms,...args);
  const {connectHtmlFrame}=await load('src/html-bridge.ts',cause);
  let requestSignal;
  const execution={call:async(_connection,method,_parameters,signal)=>{
    if(method!=='workspace')return [];
    requestSignal=signal;return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
  }};
  const controller=new AbortController();
  const dispose=connectHtmlFrame({contentWindow:page},{page:{kind:'html',pluginId:'inventory-fc'},sessionId:'owned',resourceId:'original',scope:'principal',lease:'owned-lease'},execution,()=>({active:{colorScheme:'light',tokens:{}},fontSize:14}),controller.signal,()=>{});
  t.after(()=>{dispose();for(const [key,value] of Object.entries(saved)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}});
  const abort=new AbortController();
  const pending=channel.call('workspace',{},cause==='abort'?{signal:abort.signal}:{});
  const rejected=assert.rejects(pending);
  for(let index=0;index<20&&!requestSignal;index++)await tick();
  assert.ok(requestSignal,'the request reached the existing authorized call interface');
  if(cause==='abort')abort.abort();
  await rejected;
  for(let index=0;index<20&&!requestSignal.aborted;index++)await tick();
  assert.equal(requestSignal.aborted,true,'the real cancel envelope must reach the pending owned bridge task');
});

test('a page feedback draft uses the owned Core input interface and never submits a prompt', async t => {
  const saved = {window:globalThis.window,document:globalThis.document};
  const hostListeners=new Set(), pageListeners=new Set();
  const host={parent:null,addEventListener:(name,fn)=>{if(name==='message')hostListeners.add(fn)},removeEventListener:(_name,fn)=>hostListeners.delete(fn),dispatchEvent(){}}; host.parent=host;
  const page={parent:host,addEventListener:(name,fn)=>{if(name==='message')pageListeners.add(fn)},dispatchEvent(){}};
  host.postMessage=data=>{for(const fn of hostListeners)fn({source:page,origin:'null',data});};
  page.postMessage=(data,_origin,ports=[])=>{for(const fn of pageListeners)fn({source:host,origin:'https://host.example',data,ports});};
  globalThis.window=page; globalThis.document={referrer:'https://host.example/workbench',body:{style:{setProperty(){},removeProperty(){}},toggleAttribute(){}},documentElement:{style:{}},getElementById:()=>({textContent:''})};
  const channel=await load('business/shared/channel.js','feedback-draft'); globalThis.window=host;
  const {connectHtmlFrame}=await load('src/html-bridge.ts','feedback-draft');
  let prompted=0; const drafts=[];
  const execution={call:async()=>[],prompt:async()=>{prompted++},draft:async(connection,text,signal)=>{signal.throwIfAborted();drafts.push({session:connection.sessionId,text});}};
  const stop=connectHtmlFrame({contentWindow:page},{page:{kind:'html',pluginId:'inventory-personal'},sessionId:'owned',resourceId:'personal'},execution,()=>({active:{colorScheme:'light',tokens:{}},fontSize:14}),new AbortController().signal,()=>{});
  t.after(async()=>{stop();await new Promise(done=>setTimeout(done,10));for(const [key,value] of Object.entries(saved))globalThis[key]=value;});
  assert.deepEqual(await channel.call('draft',{text:'请继续核对本事项。未发送。'}),{drafted:true});
  assert.deepEqual(drafts,[{session:'owned',text:'请继续核对本事项。未发送。'}]);
  assert.equal(prompted,0);
  await assert.rejects(channel.call('draft',{text:'',rpc:'submit'}),/INVALID_PAGE_DRAFT/);
  assert.equal(drafts.length,1);
});
