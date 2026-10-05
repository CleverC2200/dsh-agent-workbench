import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
const require=createRequire(import.meta.url);const {JSDOM}=require('jsdom');
const {outputFiles}=await build({stdin:{contents:`export {mountFramePresentation} from './src/frame-presenter.tsx';export {WorkbenchController} from './src/workbench.ts';export {createElement,act,useSyncExternalStore} from 'react';export {createRoot} from ${JSON.stringify(require.resolve('react-dom/client'))};`,resolveDir:process.cwd()},bundle:true,write:false,format:'cjs',platform:'node',alias:{react:resolve('node_modules/react')},loader:{'.png':'dataurl','.css':'text'}});
const module={exports:{}};new Function('module','exports','require',outputFiles[0].text)(module,module.exports,require);
const {mountFramePresentation,WorkbenchController,createElement,createRoot,act,useSyncExternalStore}=module.exports;
async function fixture(t,{authenticated=true,enabled=true,delayFirstSelection=false,delayList=false,selectionFails=false,localBody=false,available=true,nativeTools=false,staticDocument=false}={}){
 const dom=new JSDOM('<main id="root"></main>',{url:'https://host.example/workbench',pretendToBeVisual:true});
 const keys=['window','document','navigator','IS_REACT_ACT_ENVIRONMENT','MessageChannel'];const saved=keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]);
 for(const [key,value]of [['window',dom.window],['document',dom.window.document],['navigator',dom.window.navigator],['IS_REACT_ACT_ENVIRONMENT',true],['MessageChannel',class{constructor(){this.port1={onmessage:null,close(){}};this.port2={postMessage:value=>setImmediate(()=>this.port1.onmessage?.({data:value})),close(){}};}}]])Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
 let Document,Conversation;const effects=[],listeners=new Set();let snapshot={state:'confirmed',scope:authenticated?'principal-a':null,status:{authenticated}};
 const identity={getSnapshot:()=>snapshot,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);}};const locale={active:'zh'};
 const toolChanges=new Set();let expanded=false;let toolGuide=[{id:'upstream-files-entry',providerId:'external-provider',kind:'files',title:()=> '文件'}];
 const native={sidebarRight:{isExpanded:()=>expanded,openTab:kind=>{calls.push(['native-tool',kind,mainSession]);expanded=true;},toggleExpanded:()=>{expanded=!expanded;}},sidebarRightTabs:{get:kind=>toolGuide.find(tool=>tool.kind===kind),guide:()=>toolGuide,subscribe:listener=>{toolChanges.add(listener);return()=>toolChanges.delete(listener);}}};
 const ctx={get:()=>undefined,provide(){},locale:{subscribe:()=>()=>{},getSnapshot:()=>locale},theme:{getTheme:()=>({active:{colorScheme:'light',tokens:{}},fontSize:14})},on:()=>()=>{},effect:fn=>{const off=fn();if(typeof off==='function')effects.push(off);},inputTriggers:{registerSource:()=>()=>{}},conversation:{input:{for:()=>({})}},slots:{registerFactory:(_meta,component)=>{Document=component;return()=>{};},register:(_meta,component)=>{Conversation=component;return()=>{};},inject:(_name,fn)=>fn()},inject:(names,fn)=>{if(names.includes('sidebarRight')){if(nativeTools)fn({...ctx,...native});return;}return fn(names.includes('businessAccount')?{...ctx,businessAccount:identity,remote:{session:{}}}:ctx)}};
 const calls=[],waiting=[];let sessions=0,listRequests=0,selectionRequests=0;
 const host={fetch:async(path,options)=>{
  calls.push([path,options]);
  if(path.endsWith('/config'))return Response.json({cwd:'/owned/workspace'});
  if(path.includes('/resources?')){listRequests++;if(delayList)return new Promise(resolve=>waiting.push({kind:'list',resolve,signal:options.signal}));return Response.json([{id:'original',installed:true,enabled}]);}
  selectionRequests++;if(delayFirstSelection&&selectionRequests===1)return new Promise(resolve=>waiting.push({kind:'select',resolve,signal:options.signal}));
  if(selectionFails)return Response.json({error:'ORIGINAL_RESOURCE_FAILURE'},{status:400});
  return enabled?Response.json({preset:'original'}):Response.json({error:'AGENT_RESOURCE_DISABLED_OR_MISSING'},{status:400});
 },workspace:async path=>{calls.push(['workspace',path]);return 'workspace';},create:async()=> 'session-'+(++sessions),select:async()=>{},open:async(id,_skill,signal,beforeOpen)=>{signal.throwIfAborted();beforeOpen?.();ctx.uiWorkspace.openSession(id);}};
 const sessionListeners=new Set();let mainSession;ctx.uiWorkspace={openSession:id=>{mainSession=id;for(const listener of sessionListeners)listener();}};
 const workbench=new WorkbenchController({panel:()=>{},document:id=>{if(id)ctx.uiWorkspace.openSession(id);}});workbench.subscribeHistory(()=>calls.push(['history',workbench.getSnapshot().selectedDocument?.id]));
 mountFramePresentation(ctx,()=>available?host:undefined,key=>key,workbench);const root=createRoot(dom.window.document.getElementById('root'));
 const page=localBody?{id:'gea-inbox',label:'Original inbox',kind:'local',body:()=>createElement('article',{'data-original-inbox':true},'original body'),resourceId:'original'}:{id:'native',label:'Original page',src:'https://host.example/document',kind:'native',resourceId:'original'};
 if(staticDocument)delete page.resourceId;workbench.registerFrame(page);await workbench.open(page.id);
 function Main(){const sessionId=useSyncExternalStore(listener=>{sessionListeners.add(listener);return()=>sessionListeners.delete(listener);},()=>mainSession);return createElement(Document,{page,active:true,sessionId,useSession:selector=>sessionId?selector({blank:true,running:false,promptAttempted:false,openState:'open'}):undefined,renderSlot:()=>createElement('div',{'data-native-session':sessionId},createElement(Conversation,{page:page.id,useSession:selector=>selector({blank:true,running:false,promptAttempted:false}),inputActions:{setDraft:text=>calls.push(['draft',text])},renderFactorySlot:(name,_options,extension)=>createElement('div',{'data-official-factory':name},extension?.slots.views&&createElement(extension.slots.views,{useSession:selector=>selector({blank:true,running:false,promptAttempted:false}),inputActions:{setDraft:text=>calls.push(['draft',text])},renderSlot:name=>createElement('article',{'data-native-seat':name})}),createElement('textarea',{'aria-label':'SDK draft fixture',defaultValue:''}))}) )});}
 const render=()=>root.render(createElement(Main));
 t.after(async()=>{await act(async()=>root.unmount());effects.reverse().forEach(off=>off());dom.window.close();for(const [key,descriptor]of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}});
 await act(async()=>render());
 return {dom,calls,waiting,render,historyPage:()=>workbench.takeHistoryPage(),toolsExpanded:()=>expanded,removeTools:async()=>act(async()=>{toolGuide=[];for(const changed of toolChanges)changed();}),dispose:async()=>act(async()=>root.unmount()),counts:()=>({sessions,listRequests,selectionRequests}),changeIdentity:async()=>act(async()=>{snapshot={...snapshot,scope:'principal-b'};for(const listener of listeners)listener();}),newConversation:async()=>act(async()=>dom.window.document.querySelector('[aria-label="新建对话"]').click()),resolve:async(item,value)=>act(async()=>item.resolve(Response.json(value)))};
}
test('formal page navigation auto-prepares one actual native Session only for an authenticated enabled resource',async t=>{
 const f=await fixture(t);assert.deepEqual(f.counts(),{sessions:1,listRequests:1,selectionRequests:1});
 assert.equal(f.dom.window.document.querySelector('[data-native-session]').dataset.nativeSession,'session-1');
 assert.ok(!f.dom.window.document.body.textContent.includes('pageConnect'));
 await act(async()=>f.render());assert.deepEqual(f.counts(),{sessions:1,listRequests:1,selectionRequests:1});
 assert.deepEqual(JSON.parse(f.calls.find(([path])=>path.endsWith('/resources/select'))[1].body),{id:'original',cwd:'/owned/workspace'});
});
for(const options of [{authenticated:false},{enabled:false}])test(`auto preparation does not invent a binding for ${options.authenticated===false?'Guest':'disabled resource'}`,async t=>{
 const f=await fixture(t,options);assert.equal(f.counts().sessions,0);assert.equal(f.counts().selectionRequests,0);assert.equal(f.dom.window.document.querySelector('[data-native-session]'),null);
 await act(async()=>f.render());assert.equal(f.counts().listRequests,options.authenticated===false?0:1);
});
test('identity changes cancel an old resource selection and its late result cannot replace the new binding',async t=>{
 const f=await fixture(t,{delayFirstSelection:true});assert.equal(f.counts().sessions,0);
 await f.changeIdentity();assert.equal(f.waiting[0].signal.aborted,true);assert.equal(f.counts().sessions,1);
 await f.resolve(f.waiting[0],{preset:'original'});assert.equal(f.counts().sessions,1);assert.equal(f.dom.window.document.querySelector('[data-native-session]').dataset.nativeSession,'session-1');
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

test('local original Inbox body shares actual resource selection, toolbar and Session lifetime without an iframe or page grant',async t=>{
 const f=await fixture(t,{localBody:true});
 assert.ok(f.dom.window.document.querySelector('[data-original-inbox]'),'the original React body remains mounted');assert.equal(f.dom.window.document.querySelector('iframe'),null);
 assert.deepEqual(f.counts(),{sessions:1,listRequests:1,selectionRequests:1});assert.equal(f.dom.window.document.querySelector('[data-native-session]').dataset.nativeSession,'session-1');
 assert.equal(f.dom.window.document.querySelectorAll('.gea-conversation-view-switch button').length,3);
 const body=f.dom.window.document.querySelector('[data-original-inbox]');await act(async()=>f.dom.window.document.querySelector('[aria-label="中间区域最大，隐藏会话区"]').click());assert.ok(f.dom.window.document.querySelector('.view-center'));await act(async()=>f.dom.window.document.querySelector('[aria-label="会话区最大，隐藏中间区域"]').click());assert.ok(f.dom.window.document.querySelector('.view-chat'));await act(async()=>f.dom.window.document.querySelector('[aria-label="同时显示中间区域和会话区"]').click());assert.ok(f.dom.window.document.querySelector('.view-split'));assert.equal(f.dom.window.document.querySelector('[data-original-inbox]'),body,'view changes preserve the original list mount and local selections');
 assert.ok(f.dom.window.document.querySelector('[data-official-factory="conversation.content"]'));const recommendations=[...f.dom.window.document.querySelectorAll('.gea-agent-prompts button')];assert.equal(recommendations.length,4);await act(async()=>recommendations[0].click());assert.ok(f.calls.some(row=>row[0]==='draft'&&row[1]===recommendations[0].textContent),'original Inbox recommendation fills the real public input action');
 await act(async()=>f.dom.window.document.querySelector('[aria-label="历史对话"]').click());assert.ok(f.calls.some(row=>row[0]==='history'&&row[1]==='gea-inbox'));
 await f.newConversation();assert.equal(f.counts().sessions,2);assert.equal(f.dom.window.document.querySelector('[data-native-session]').dataset.nativeSession,'session-2');
 await f.dispose();assert.equal(f.dom.window.document.querySelector('[data-native-session]'),null,'unmount removes the presentation while native ownership belongs to Core');
});

for(const options of [{authenticated:false},{enabled:false}])test(`local Inbox preserves the original body without invented Session for ${options.authenticated===false?'Guest':'disabled resource'}`,async t=>{
 const f=await fixture(t,{localBody:true,...options});assert.ok(f.dom.window.document.querySelector('[data-original-inbox]'));assert.equal(f.dom.window.document.querySelector('iframe'),null);assert.equal(f.dom.window.document.querySelector('[data-native-session]'),null);assert.equal(f.counts().sessions,0);assert.equal(f.counts().selectionRequests,0);
});

for(const options of [{authenticated:false},{enabled:false},{selectionFails:true}])test(`unbound business Document preserves its AI region and reports ${options.authenticated===false?'login':options.enabled===false?'resource selection':'preparation failure'} without a Session or composer`,async t=>{
 const f=await fixture(t,options);
 const ai=f.dom.window.document.querySelector('[aria-label="AI对话"]');
 assert.ok(ai,'the split view retains a visible AI region before a Session is bound');
 assert.equal(ai.hidden,false);
 assert.match(ai.textContent,new RegExp(options.authenticated===false?'pageLogin':options.selectionFails?'ORIGINAL_RESOURCE_FAILURE':'pageHint'));
 assert.equal(ai.querySelector('[data-native-session]'),null);
 assert.equal(ai.querySelector('textarea,input,[contenteditable="true"]'),null);
 const business=f.dom.window.document.querySelector('iframe');
 await act(async()=>f.dom.window.document.querySelector('[aria-label="会话区最大，隐藏中间区域"]').click());
 assert.equal(business.parentElement.hidden,true);assert.equal(ai.hidden,false);
 await act(async()=>f.dom.window.document.querySelector('[aria-label="中间区域最大，隐藏会话区"]').click());
 assert.equal(business.parentElement.hidden,false);assert.equal(ai.hidden,true);
 await act(async()=>f.dom.window.document.querySelector('[aria-label="同时显示中间区域和会话区"]').click());
 assert.equal(business.parentElement.hidden,false);assert.equal(ai.hidden,false);
 assert.equal(f.dom.window.document.querySelector('iframe'),business,'switching modes keeps the business frame');
 assert.equal(f.counts().sessions,0);
});

test('mode changes retain the borrowed Session, public Conversation draft and business frame without resource preparation',async t=>{
 const f=await fixture(t);const document=f.dom.window.document;
 const session=document.querySelector('[data-native-session]'),draft=document.querySelector('[aria-label="SDK draft fixture"]'),business=document.querySelector('iframe');
 draft.value='尚未发送的分析问题';
 for(const label of ['中间区域最大，隐藏会话区','会话区最大，隐藏中间区域','同时显示中间区域和会话区']){
  await act(async()=>document.querySelector('[aria-label="'+label+'"]').click());
  assert.equal(document.querySelector('[data-native-session]'),session,'the same native Conversation remains mounted');
  assert.equal(document.querySelector('[aria-label="SDK draft fixture"]'),draft);assert.equal(draft.value,'尚未发送的分析问题');
  assert.equal(document.querySelector('iframe'),business);
 }
 assert.deepEqual(f.counts(),{sessions:1,listRequests:1,selectionRequests:1});
 assert.equal(f.calls.some(row=>row[0]==='release'),false,'mode changes do not release or rebind the current reference');
});

test('unavailable resource backend keeps the AI region and reports readiness without a fabricated Conversation',async t=>{
 const f=await fixture(t,{available:false});const ai=f.dom.window.document.querySelector('[aria-label="AI对话"]');
 assert.ok(ai);assert.equal(ai.hidden,false);assert.match(ai.textContent,/pageWait/);
 assert.equal(ai.querySelector('[data-official-factory]'),null);assert.equal(f.counts().sessions,0);
});


test('the Document consumes native tab kinds from public metadata, keeps its draft, and restores the original mode after its own close',async t=>{
 const f=await fixture(t,{localBody:true,nativeTools:true});const document=f.dom.window.document;
 const draft=document.querySelector('[aria-label="SDK draft fixture"]');draft.value='同一真实Session的未发送草稿';
 const open=async()=>act(async()=>{const menu=document.querySelector('[aria-label="原生工具"]');menu.value='files';menu.dispatchEvent(new f.dom.window.Event('change',{bubbles:true}));});
 await open();assert.ok(document.querySelector('.view-center'));assert.equal(f.toolsExpanded(),true);
 assert.deepEqual(f.calls.find(row=>row[0]==='native-tool'),['native-tool','files','session-1'],'the native kind belongs to the same currently presented Session');
 assert.equal(document.querySelector('[aria-label="SDK draft fixture"]'),draft);
 await act(async()=>document.querySelector('[aria-label="关闭原生工具并恢复视图"]').click());
 assert.ok(document.querySelector('.view-split'));assert.equal(f.toolsExpanded(),false);assert.equal(draft.value,'同一真实Session的未发送草稿');
 await open();await act(async()=>document.querySelector('[aria-label="会话区最大，隐藏中间区域"]').click());
 assert.ok(document.querySelector('.view-chat'));assert.equal(f.toolsExpanded(),false,'an explicit mode choice takes priority over temporary tool presentation');
 await f.removeTools();assert.equal(document.querySelector('[aria-label="原生工具"]'),null,'unloaded providers cease to be selectable');
});


test('a static Document can explicitly choose an existing native history without login, resource preparation or Session creation',async t=>{
 const f=await fixture(t,{localBody:true,staticDocument:true,authenticated:false});
 assert.ok(f.dom.window.document.querySelector('[data-original-inbox]'));assert.deepEqual(f.counts(),{sessions:0,listRequests:0,selectionRequests:0});
 await act(async()=>f.dom.window.document.querySelector('[aria-label="历史对话"]').click());
 assert.equal(f.historyPage(),'gea-inbox','the explicit history request preserves its actual static Document location');
 assert.deepEqual(f.counts(),{sessions:0,listRequests:0,selectionRequests:0});
});
