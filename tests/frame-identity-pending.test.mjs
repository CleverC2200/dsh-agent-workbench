import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
const require=createRequire(import.meta.url);const {JSDOM}=require('jsdom');
const {outputFiles}=await build({stdin:{contents:`export {mountFramePresentation} from './src/frame-presenter.tsx';export {createElement,act} from 'react';export {createRoot} from ${JSON.stringify(require.resolve('react-dom/client'))};`,resolveDir:process.cwd()},bundle:true,write:false,format:'cjs',platform:'node',alias:{react:resolve('node_modules/react')},loader:{'.png':'dataurl','.css':'text'}});
const module={exports:{}};new Function('module','exports','require',outputFiles[0].text)(module,module.exports,require);
const {mountFramePresentation,createElement,createRoot,act}=module.exports;
async function fixture(t,{authenticated=true,enabled=true,delayFirstSelection=false,delayList=false,selectionFails=false}={}){
 const dom=new JSDOM('<main id="root"></main>',{url:'https://host.example/workbench',pretendToBeVisual:true});
 const keys=['window','document','navigator','IS_REACT_ACT_ENVIRONMENT','MessageChannel'];const saved=keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]);
 for(const [key,value]of [['window',dom.window],['document',dom.window.document],['navigator',dom.window.navigator],['IS_REACT_ACT_ENVIRONMENT',true],['MessageChannel',class{constructor(){this.port1={onmessage:null,close(){}};this.port2={postMessage:value=>setImmediate(()=>this.port1.onmessage?.({data:value})),close(){}};}}]])Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
 let Document;const effects=[],listeners=new Set();let snapshot={state:'confirmed',scope:authenticated?'principal-a':null,status:{authenticated}};
 const identity={getSnapshot:()=>snapshot,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);}};const locale={active:'zh'};
 const ctx={get:()=>undefined,provide(){},locale:{subscribe:()=>()=>{},getSnapshot:()=>locale},theme:{getTheme:()=>({active:{colorScheme:'light',tokens:{}},fontSize:14})},on:()=>()=>{},effect:fn=>{const off=fn();if(typeof off==='function')effects.push(off);},inputTriggers:{registerSource:()=>()=>{}},conversation:{input:{for:()=>({})}},slots:{registerFactory:(_meta,component)=>{Document=component;return()=>{};},inject:()=>()=>{}},inject:(names,fn)=>fn(names.includes('businessAccount')?{...ctx,businessAccount:identity,remote:{session:{}}}:ctx)};
 const calls=[],waiting=[];let sessions=0,listRequests=0,selectionRequests=0;
 const host={fetch:async(path,options)=>{
  calls.push([path,options]);
  if(path.endsWith('/config'))return Response.json({cwd:'/owned/workspace'});
  if(path.includes('/resources?')){listRequests++;if(delayList)return new Promise(resolve=>waiting.push({kind:'list',resolve,signal:options.signal}));return Response.json([{id:'original',installed:true,enabled}]);}
  selectionRequests++;if(delayFirstSelection&&selectionRequests===1)return new Promise(resolve=>waiting.push({kind:'select',resolve,signal:options.signal}));
  if(selectionFails)return Response.json({error:'ORIGINAL_RESOURCE_FAILURE'},{status:400});
  return enabled?Response.json({preset:'original'}):Response.json({error:'AGENT_RESOURCE_DISABLED_OR_MISSING'},{status:400});
 },workspace:async path=>{calls.push(['workspace',path]);return 'workspace';},create:async()=> 'session-'+(++sessions),select:async()=>{},open:async id=>({sessionId:id,binding:{ctx:{}},ready:Promise.resolve({}),release(){calls.push(['release',id]);}})};
 mountFramePresentation(ctx,()=>host,key=>key);const root=createRoot(dom.window.document.getElementById('root'));
 const page={id:'native',label:'Original page',src:'https://host.example/document',kind:'native',resourceId:'original'};
 const render=()=>root.render(createElement(Document,{page,SessionProvider:({session,children})=>createElement('div',{'data-retained-session':session.sessionId},children),renderSlot:()=>null}));
 t.after(async()=>{await act(async()=>root.unmount());effects.reverse().forEach(off=>off());dom.window.close();for(const [key,descriptor]of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}});
 await act(async()=>render());
 return {dom,calls,waiting,render,counts:()=>({sessions,listRequests,selectionRequests}),changeIdentity:async()=>act(async()=>{snapshot={...snapshot,scope:'principal-b'};for(const listener of listeners)listener();}),newConversation:async()=>act(async()=>dom.window.document.querySelector('[aria-label="新建对话"]').click()),resolve:async(item,value)=>act(async()=>item.resolve(Response.json(value)))};
}
test('formal page navigation auto-prepares one actual native Session only for an authenticated enabled resource',async t=>{
 const f=await fixture(t);assert.deepEqual(f.counts(),{sessions:1,listRequests:1,selectionRequests:1});
 assert.equal(f.dom.window.document.querySelector('[data-retained-session]').dataset.retainedSession,'session-1');
 assert.ok(!f.dom.window.document.body.textContent.includes('pageConnect'));
 await act(async()=>f.render());assert.deepEqual(f.counts(),{sessions:1,listRequests:1,selectionRequests:1});
 assert.deepEqual(JSON.parse(f.calls.find(([path])=>path.endsWith('/resources/select'))[1].body),{id:'original',cwd:'/owned/workspace'});
});
for(const options of [{authenticated:false},{enabled:false}])test(`auto preparation does not invent a binding for ${options.authenticated===false?'Guest':'disabled resource'}`,async t=>{
 const f=await fixture(t,options);assert.equal(f.counts().sessions,0);assert.equal(f.counts().selectionRequests,0);assert.equal(f.dom.window.document.querySelector('[data-retained-session]'),null);
 await act(async()=>f.render());assert.equal(f.counts().listRequests,options.authenticated===false?0:1);
});
test('identity changes cancel an old resource selection and its late result cannot replace the new binding',async t=>{
 const f=await fixture(t,{delayFirstSelection:true});assert.equal(f.counts().sessions,0);
 await f.changeIdentity();assert.equal(f.waiting[0].signal.aborted,true);assert.equal(f.counts().sessions,1);
 await f.resolve(f.waiting[0],{preset:'original'});assert.equal(f.counts().sessions,1);assert.equal(f.dom.window.document.querySelector('[data-retained-session]').dataset.retainedSession,'session-1');
});
test('failed automatic preparation is not retried by a render or a view change',async t=>{
 const f=await fixture(t,{selectionFails:true});assert.equal(f.counts().sessions,0);assert.equal(f.counts().selectionRequests,1);
 await act(async()=>f.render());await act(async()=>f.dom.window.document.querySelector('[aria-label="中间区域最大，隐藏会话区"]').click());
 assert.equal(f.counts().selectionRequests,1);assert.equal(f.counts().listRequests,1);
});
test('explicit new conversation supersedes pending automatic discovery without a late second preparation',async t=>{
 const f=await fixture(t,{delayList:true});assert.equal(f.counts().sessions,0);
 await f.newConversation();assert.equal(f.waiting[0].signal.aborted,true);assert.equal(f.counts().sessions,1);
 await f.resolve(f.waiting[0],[{id:'original',installed:true,enabled:true}]);assert.equal(f.counts().sessions,1);assert.equal(f.counts().selectionRequests,1);
});
