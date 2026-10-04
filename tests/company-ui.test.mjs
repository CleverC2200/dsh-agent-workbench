import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {JSDOM} from 'jsdom';
import {zh} from '../src/company/locales.ts';
import {SlotCore} from '../../../official-latest-standard/packages/client/ui-slots/lib/index.js';
const require=createRequire(import.meta.url);
const bundle=await build({stdin:{contents:"export {mountCompanyUI} from './src/company/ui.tsx';export {WorkbenchController} from './src/workbench.ts';",resolveDir:process.cwd()},bundle:true,write:false,format:'cjs',platform:'node',external:['react','react/jsx-runtime','react-dom'],loader:{'.png':'dataurl','.css':'text'}});
const module={exports:{}};new Function('module','exports','require',bundle.outputFiles[0].text)(module,module.exports,require);
const {mountCompanyUI,WorkbenchController}=module.exports;
function fixture(account){
 const entries=[],calls=[];
 const ctx={layout:{selectPanel:id=>calls.push(['panel',id]),toggleSidebar:()=>calls.push(['toggle'])},uiWorkspace:{startSession:()=>calls.push(['new'])},locale:{getSnapshot:()=>({active:'zh'}),subscribe:()=>()=>{},bind:()=>key=>zh[key]??key},slots:{entries:name=>name==='sidebar.panellist'?[{options:{id:'plugins',label:()=> '插件管理'}}]:[{options:{key:'gea-proof'}},{options:{key:'inventory-fc'}},{options:{key:'plugins'}},...entries.filter(entry=>entry.options.name==='main')],subscribe:()=>()=>{},inject:(_name,fn)=>fn(),register:(options,component)=>{entries.push({options,component});return()=>{};}},inject:(_names,fn)=>{if(account)fn({...ctx,businessAccount:account});},effect:()=>{}};
 const workbench=new WorkbenchController({panel:id=>calls.push(['page',id]),hasPanel:id=>ctx.slots.entries('main').some(entry=>entry.options.key===id)});
 mountCompanyUI(ctx,workbench,()=>React.createElement('div',{'data-resource-selection':true},'resource-selection-fixture'));
 const renderSlot=(name,props={})=>{const entry=entries.find(entry=>entry.options.name===name);return React.createElement('div',{'data-slot':name},entry?React.createElement(entry.component,props):name);};
 return {ctx,entries,calls,workbench,renderSlot};
}
test('formal sidebar renders original button/icon hierarchy and the actual workspace/settings seats without details redesign',()=>{
 const {entries,renderSlot}=fixture();const entry=entries.find(e=>e.options.name==='sidebar');
 const markup=renderToStaticMarkup(React.createElement(entry.component,{collapsed:false,width:280,usePanelInfo:fn=>fn({activePanelId:'inventory-fc'}),renderSlot}));
 for(const text of ['Synear GEA','智能体工作台','业务工作台','历史会话','产销协同','计划管理','库存管理','订单管理','分仓库存','产能评估(待设计)'])assert.ok(markup.includes(text),text);
 assert.ok(markup.includes('sidebar.workspaces'));assert.ok(markup.includes('sidebar.settings'));
 assert.ok(markup.includes('gea-brand-copy'));assert.ok(markup.includes('gea-shell-nav-heading'));assert.ok(markup.includes('gea-shell-nav-icon'));
 assert.ok(!markup.includes('<details'));assert.ok(!markup.includes('<summary'));assert.ok(!markup.includes('workbench-sidebar'));
 assert.ok(markup.includes('disabled=""'),'unavailable registered-page entries remain disabled');
});
test('formal account contribution renders the GEA read-only avatar and signed-out label',()=>{
 const {entries}=fixture();const entry=entries.find(e=>e.options.name==='settings.launcher');
 const markup=renderToStaticMarkup(React.createElement(entry.component,{wide:true,settingsOpen:false,openSettings:()=>{}}));
 assert.ok(markup.includes('账户菜单'));assert.ok(markup.includes('未登录'));assert.ok(markup.includes('gea-user-avatar'));assert.ok(!markup.includes('workbench-avatar'));
});
test('only the two authorized extra modules enter formal navigation and Plugins consumes its registered localized label',()=>{
 const {entries,renderSlot}=fixture();const entry=entries.find(row=>row.options.name==='sidebar');
 const markup=renderToStaticMarkup(React.createElement(entry.component,{collapsed:false,width:280,usePanelInfo:fn=>fn({activePanelId:'gea-proof'}),renderSlot}));
 assert.ok(markup.includes('插件管理'));assert.ok(markup.includes('>工作台</span>'));assert.ok(!markup.includes('>plugins</span>'));
 assert.ok(!markup.includes('公共工具与原型'));
});
function nativeFactory(_name,options,extension,sessionId){
 const shares={sessionId,useWorkspaces:selector=>selector({items:[]}),selectWorkspace:()=>{},renderSlot:name=>React.createElement('article',{'data-native-seat':name})};
 const Views=extension.slots.views;
 return React.createElement('div',{'data-native-content':options.variant},React.createElement('div',{'data-native-flow':true},sessionId&&Views?React.createElement(Views,shares):null),React.createElement('div',{'data-root-controls':true},React.createElement(extension.slots.widthControls,shares)));
}
test('formal Home retains its original hero and native Workspace/Agent/composer contract without Home resource redesign',()=>{
 const {entries}=fixture();const entry=entries.find(e=>e.options.name==='main.conversation');
 const markup=renderToStaticMarkup(React.createElement(entry.component,{useSession:()=>undefined,useConversation:()=>undefined,useSessions:fn=>fn({byId:{}}),renderFactorySlot:(...args)=>nativeFactory(...args,undefined)}));
 for(const text of ['思念企业 AI 协作伙伴','让 AI 进入工作流程','gea-home-title','gea-home-logo','conversation.hero.workspace','conversation.hero.agentPreset','data-native-content="embedded"'])assert.ok(markup.includes(text),text);
 assert.ok(!markup.includes('data-resource-selection'),'resource selection belongs to the retained Workbench module');
});
test('selected native Session keeps formal welcome inside native views while preserving the official Session seat',t=>{
 const {entries}=fixture();const entry=entries.find(row=>row.options.name==='main.conversation');const session={blank:true,running:false,promptAttempted:false,openState:'open'};
 const markup=renderToStaticMarkup(React.createElement(entry.component,{sessionId:'selected-native-session',useSession:selector=>selector(session),useConversation:selector=>selector({activeTargets:new Set()}),useSessions:selector=>selector({byId:{'selected-native-session':{cwd:'/native/project'}}}),renderFactorySlot:(...args)=>nativeFactory(...args,'selected-native-session')}));
 const dom=new JSDOM(markup);t.after(()=>dom.window.close());const document=dom.window.document;
 assert.ok(document.querySelector('[data-native-flow] .gea-home-hero'));
 assert.equal(document.querySelector('[data-root-controls] .gea-home-hero'),null);
 assert.ok(document.querySelector('[data-native-flow] [data-native-seat="conversation.session"]'));
});
test('retained Workbench directory reads current official workspace facts and provides native Conversation plus resource selection',()=>{
 const {entries}=fixture();const entry=entries.find(row=>row.options.name==='agent-workbench.directory');
 const markup=renderToStaticMarkup(React.createElement(entry.component,{sessionId:'current',useSessions:selector=>selector({byId:{current:{cwd:'/native/project'}}})}));
 assert.ok(markup.includes('已接入页面'));assert.ok(markup.includes('原生对话'));assert.ok(markup.includes('data-resource-selection'));
});
test('formal registrations use the fixed public declaration ledger without taking Core-owned children',()=>{
 const core=new SlotCore();core.register({name:'root',children:{sidebar:{kind:'single',scope:'root'},main:{kind:'keyed',scope:'root'},'shell.leading':{kind:'single',scope:'root'}}},()=>null);
 core.register({name:'main',key:'conversation',children:{'main.conversation':{kind:'single',scope:'session-maybe'}}},()=>null);
 core.register({name:'main.conversation',children:{'conversation.header':{kind:'single',scope:'session-maybe'}}},()=>null);
 core.registerFactory({name:'conversation.content',scope:'session-maybe',children:{'conversation.hero.workspace':{kind:'single',scope:'root'},'conversation.hero.agentPreset':{kind:'single',scope:'session-maybe'}}},()=>null);
 core.register({name:'conversation.header',children:{'settings.launcher':{kind:'single',scope:'root'}}},()=>null);
 const {entries}=fixture();for(const entry of entries)assert.doesNotThrow(()=>core.register(entry.options,entry.component));
 assert.equal(core.entriesOfSlot('main.conversation')[0].options.priority,-20);assert.equal(core.entriesOfSlot('sidebar').length,1);
});
test('formal account menu preserves keyboard focus and dismissal while ignoring a late logout UI completion',async t=>{
 const dom=new JSDOM('<main id="root"></main>',{pretendToBeVisual:true});
 const saved=['window','document','Node','navigator','IS_REACT_ACT_ENVIRONMENT'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]);
 for(const [key,value]of [['window',dom.window],['document',dom.window.document],['Node',dom.window.Node],['navigator',dom.window.navigator],['IS_REACT_ACT_ENVIRONMENT',true]])Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
 const {createRoot}=await import('react-dom/client');const {act}=React;const snapshot={state:'confirmed',scope:'host-fixture',status:{authenticated:true,user:{name:'Fixture User'}}};
 const delayed=Promise.withResolvers();let logoutSignal;const authority={getSnapshot:()=>snapshot,subscribe:()=>()=>{},logout:signal=>{logoutSignal=signal;return delayed.promise;}};
 const {entries}=fixture(authority);const entry=entries.find(row=>row.options.name==='settings.launcher');const root=createRoot(document.getElementById('root'));
 t.after(async()=>{await act(async()=>root.unmount());dom.window.close();for(const [key,value]of saved){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}});
 await act(async()=>root.render(React.createElement(entry.component,{wide:true,settingsOpen:false,openSettings:()=>{}})));
 const trigger=document.querySelector('button[aria-label="账户菜单"]');await act(async()=>trigger.click());assert.equal(document.activeElement.textContent,'⚙设置');
 await act(async()=>document.activeElement.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true})));assert.equal(document.activeElement.textContent,'退出登录');
 await act(async()=>document.activeElement.click());await act(async()=>document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
 assert.equal(document.activeElement,trigger);assert.equal(trigger.getAttribute('aria-expanded'),'false');assert.equal(logoutSignal.aborted,true);
 await act(async()=>trigger.click());await act(async()=>delayed.resolve());assert.equal(trigger.getAttribute('aria-expanded'),'true','late completion cannot close a newer menu owner');
});
