import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {JSDOM} from 'jsdom';
import {zh} from '../src/company/locales.ts';
import {readFileSync} from 'node:fs';
import {SlotCore} from '../../../official-latest-standard/packages/client/ui-slots/lib/index.js';
const require=createRequire(import.meta.url);
const bundle=await build({stdin:{contents:"export {mountCompanyUI} from './src/company/ui.tsx';export {WorkbenchController} from './src/workbench.ts';",resolveDir:process.cwd()},bundle:true,write:false,format:'cjs',platform:'node',external:['react','react/jsx-runtime','react-dom'],loader:{'.png':'dataurl','.css':'text'}});
const module={exports:{}};new Function('module','exports','require',bundle.outputFiles[0].text)(module,module.exports,require);
const {mountCompanyUI,WorkbenchController}=module.exports;
function fixture(account){
 const entries=[],calls=[];
 const ctx={layout:{selectPanel:id=>calls.push(['panel',id]),toggleSidebar:()=>calls.push(['toggle'])},uiWorkspace:{startSession:()=>calls.push(['new'])},locale:{getSnapshot:()=>({active:'zh'}),subscribe:()=>()=>{},bind:()=>key=>zh[key]??key},slots:{entries:name=>name==='sidebar.panellist'?[{options:{id:'plugins',label:()=> '插件管理'}}]:[{options:{key:'gea-proof'}},{options:{key:'inventory-fc'}},{options:{key:'plugins'}},...entries.filter(entry=>entry.options.name==='main')],subscribe:()=>()=>{},inject:(_name,fn)=>fn(),register:(options,component)=>{entries.push({options,component});return()=>{};}},inject:(_names,fn)=>{if(account)fn({...ctx,businessAccount:account});},effect:()=>{}};
 const workbench=new WorkbenchController({panel:id=>calls.push(['page',id]),document:id=>calls.push(['document',id]),hasPanel:id=>ctx.slots.entries('main').some(entry=>entry.options.key===id)});
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
test('formal static controls restore original card and SVG structure without old host selectors',()=>{
 const {entries,renderSlot}=fixture();const sidebar=entries.find(row=>row.options.name==='sidebar');
 const markup=renderToStaticMarkup(React.createElement(sidebar.component,{collapsed:false,width:280,usePanelInfo:selector=>selector({activePanelId:null}),renderSlot}));
 const dom=new JSDOM(markup);const button=dom.window.document.querySelector('.gea-formal-new-session');
 assert.ok(button,'AI workbench uses the original card class rather than drawer-tab styling');assert.equal(button.querySelector('svg').getAttribute('viewBox'),'0 0 16 16');
 assert.ok(button.querySelector('.gea-formal-new-session-label'));assert.equal(dom.window.document.querySelector('.gea-owned-sidebar-toggle svg').getAttribute('viewBox'),'0 0 16 16');dom.window.close();
});
test('formal account contribution renders the GEA read-only avatar and signed-out label',()=>{
 const {entries}=fixture();const entry=entries.find(e=>e.options.name==='settings.launcher');
 const markup=renderToStaticMarkup(React.createElement(entry.component,{wide:true,settingsOpen:false,openSettings:()=>{}}));
 assert.ok(markup.includes('账户菜单'));assert.ok(markup.includes('未登录'));assert.ok(markup.includes('gea-user-avatar'));assert.ok(!markup.includes('workbench-avatar'));
});
test('actual owned anchors constrain the bell and put the browser after both drawer headers',t=>{
 const {entries,renderSlot}=fixture();const entry=entries.find(row=>row.options.name==='sidebar');
 const markup=renderToStaticMarkup(React.createElement(entry.component,{collapsed:false,width:280,usePanelInfo:selector=>selector({activePanelId:null}),renderSlot}));
 const dom=new JSDOM('<style>'+readFileSync('src/company/layout.css','utf8')+'</style>'+markup);t.after(()=>dom.window.close());
 const document=dom.window.document,row=document.querySelector('.gea-sidebar-brand-row'),bell=document.querySelector('[aria-label="消息待办"]'),browser=document.querySelector('.gea-workspace-owned');
 assert.equal(bell.parentElement,row);assert.equal(dom.window.getComputedStyle(row).position,'relative','the original absolute bell anchors to the brand row');
 assert.equal(dom.window.getComputedStyle(browser).order,'4','the owned wrapper receives the original browser order rather than the unmatched native-slot selector');
 const siblings=[...browser.parentElement.children];assert.ok(siblings.indexOf(document.querySelector('.gea-drawer-function'))<siblings.indexOf(browser));assert.ok(siblings.indexOf(document.querySelector('.gea-drawer-workspace'))<siblings.indexOf(browser));
});
test('only the two authorized extra modules enter formal navigation and Plugins consumes its registered localized label',()=>{
 const {entries,renderSlot}=fixture();const entry=entries.find(row=>row.options.name==='sidebar');
 const markup=renderToStaticMarkup(React.createElement(entry.component,{collapsed:false,width:280,usePanelInfo:fn=>fn({activePanelId:'gea-proof'}),renderSlot}));
 assert.ok(markup.includes('插件管理'));assert.ok(markup.includes('>工作台</span>'));assert.ok(!markup.includes('>plugins</span>'));
 const dom=new JSDOM(markup);const entryButton=dom.window.document.querySelector('.gea-plugin-entry');assert.equal(entryButton.textContent,'插件管理');assert.equal(dom.window.document.querySelectorAll('.gea-plugin-entry').length,1);assert.ok(!dom.window.document.querySelector('.gea-shell-plugin-group').textContent.includes('插件管理'));assert.equal(entryButton.previousElementSibling.classList.contains('gea-new-session'),true);assert.equal(entryButton.nextElementSibling.classList.contains('gea-sidebar-region'),true);dom.window.close();
 assert.ok(!markup.includes('公共工具与原型'));
});
function nativeFactory(_name,options,extension,sessionId){
 const shares={t:key=>key==='hero.chooseWorkspace'?'选择工作区':key,sessionId,useWorkspaces:selector=>selector({items:[]}),selectWorkspace:()=>{},renderSlot:name=>React.createElement('article',{'data-native-seat':name})};
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
 assert.ok(document.querySelector('[data-native-flow] .gea-native-selectors'),'Workspace and Agent controls share the content position before the native composer');
 assert.equal(document.querySelector('[data-root-controls] .gea-native-selectors'),null,'selected-session controls do not sit after the composer in root width controls');
 assert.ok(document.querySelector('.gea-native-history[hidden]'),'only the proven blank transcript is hidden; its actual Session seat remains mounted');
 assert.ok(document.querySelector('[data-native-flow] [data-native-seat="conversation.session"]'));
});
test('blank-session controls inherit the official composer width and pass their actual picker anchor',t=>{
 const {entries}=fixture();const entry=entries.find(row=>row.options.name==='main.conversation');let pickerProps;
 const shares={t:key=>key,sessionId:'blank',useWorkspaces:selector=>selector({items:[]}),selectWorkspace:()=>{},renderSlot:(name,props)=>{if(name==='conversation.hero.workspace')pickerProps=props;return React.createElement('article',{'data-native-seat':name});}};
 const markup=renderToStaticMarkup(React.createElement(entry.component,{sessionId:'blank',useSession:selector=>selector({blank:true}),useConversation:selector=>selector({activeTargets:new Set()}),renderFactorySlot:(_name,_options,extension)=>React.createElement(extension.slots.views,shares)}));
 const dom=new JSDOM('<style>'+readFileSync('src/company/layout.css','utf8')+'</style>'+markup);t.after(()=>dom.window.close());
 const style=dom.window.getComputedStyle(dom.window.document.querySelector('.gea-native-selectors'));
 assert.ok(style.width.includes('--dsh-composer-side-clearance'),'same inherited side clearance as the resident native card');
 assert.ok(style.maxWidth.includes('--dsh-composer-card-max-width'),'same inherited width cap as the resident native card');
 assert.equal(style.marginLeft,'auto');assert.equal(style.marginRight,'auto');
 assert.ok(pickerProps.anchorRef,'the public picker receives the actual owned trigger ref');
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
test('formal Workspace trigger anchors the public menu and delegates selection through the official action',async t=>{
 const dom=new JSDOM('<main id="root"></main>',{pretendToBeVisual:true});
 const saved=['window','document','Node','navigator','IS_REACT_ACT_ENVIRONMENT'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]);
 for(const [key,value]of [['window',dom.window],['document',dom.window.document],['Node',dom.window.Node],['navigator',dom.window.navigator],['IS_REACT_ACT_ENVIRONMENT',true]])Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
 const {createRoot}=await import('react-dom/client');const {act}=React;const {entries}=fixture();const entry=entries.find(row=>row.options.name==='main.conversation');const root=createRoot(document.getElementById('root'));let menu;const picks=[];
 t.after(async()=>{await act(async()=>root.unmount());dom.window.close();for(const [key,value]of saved){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}});
 const shares={t:key=>key==='hero.chooseWorkspace'?'选择工作区':key,sessionId:'blank',useWorkspaces:selector=>selector({items:[]}),selectWorkspace:id=>{picks.push(id);return Promise.resolve();},renderSlot:(name,props)=>{if(name==='conversation.hero.workspace')menu=props;return React.createElement('article',{'data-native-seat':name});}};
 await act(async()=>root.render(React.createElement(entry.component,{sessionId:'blank',useSession:selector=>selector({blank:true}),useConversation:selector=>selector({activeTargets:new Set()}),renderFactorySlot:(_name,_options,extension)=>React.createElement(extension.slots.views,shares)})));
 const trigger=document.querySelector('.gea-formal-workspace');assert.equal(menu.anchorRef.current,trigger);assert.equal(trigger.querySelector('svg').getAttribute('viewBox'),'0 0 16 16');assert.equal(trigger.getAttribute('aria-expanded'),'false');
 await act(async()=>trigger.click());assert.equal(menu.open,true);assert.equal(trigger.getAttribute('aria-expanded'),'true');await act(async()=>menu.onPick('actual-workspace'));assert.deepEqual(picks,['actual-workspace']);assert.equal(menu.open,false);
});
test('entering a business page opens its functional drawer once and preserves manual History selection within business',async t=>{
 const dom=new JSDOM('<main id="root"></main>',{pretendToBeVisual:true});
 const saved=['window','document','Node','navigator','IS_REACT_ACT_ENVIRONMENT'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]);
 for(const [key,value]of [['window',dom.window],['document',dom.window.document],['Node',dom.window.Node],['navigator',dom.window.navigator],['IS_REACT_ACT_ENVIRONMENT',true]])Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
 const {createRoot}=await import('react-dom/client');const {act}=React;const {entries,renderSlot}=fixture();const entry=entries.find(row=>row.options.name==='sidebar');const root=createRoot(document.getElementById('root'));
 t.after(async()=>{await act(async()=>root.unmount());dom.window.close();for(const [key,value]of saved){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}});
 const render=async activePanelId=>act(async()=>root.render(React.createElement(entry.component,{collapsed:false,width:280,usePanelInfo:selector=>selector({activePanelId}),renderSlot})));
 const drawer=()=>document.querySelector('.gea-sidebar-region').dataset.geaDrawer;
 await render('agent-workbench');assert.equal(drawer(),'workspace');
 await render('gea-inbox');assert.equal(drawer(),'function','a directory/notification arrival opens the business navigation');
 await act(async()=>document.querySelector('[aria-controls="gea-panel-workspace"]').click());assert.equal(drawer(),'workspace');
 await render('inventory-fc');assert.equal(drawer(),'workspace','business-to-business rerenders do not seize the user drawer');
 await render(null);assert.equal(drawer(),'workspace');await render('gea-proof');assert.equal(drawer(),'function','a later new business entry restores the original transition');
});


test('opening real history from a static Document returns to native Conversation without clearing the initial static presentation',async t=>{
 const dom=new JSDOM('<main id="root"></main>',{pretendToBeVisual:true});
 const saved=['window','document','Node','navigator','IS_REACT_ACT_ENVIRONMENT'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]);
 for(const [key,value]of [['window',dom.window],['document',dom.window.document],['Node',dom.window.Node],['navigator',dom.window.navigator],['IS_REACT_ACT_ENVIRONMENT',true]])Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
 const {createRoot}=await import('react-dom/client');const {act}=React;const {entries,workbench}=fixture();const entry=entries.find(row=>row.options.name==='main.conversation');const root=createRoot(document.getElementById('root'));
 t.after(async()=>{await act(async()=>root.unmount());dom.window.close();for(const [key,value]of saved){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}});
 workbench.registerFrame({id:'static-document',kind:'local',body:()=>null});await workbench.open('static-document');
 const render=async sessionId=>act(async()=>root.render(React.createElement(entry.component,{sessionId,useSession:selector=>selector({blank:false,running:false,promptAttempted:true,openState:'open'}),useConversation:selector=>selector({activeTargets:new Set(['chat'])}),renderFactorySlot:(name,...args)=>name==='agent-workbench.document'?React.createElement('article',{'data-static-document':true}):nativeFactory(name,...args,sessionId)})));
 await render('existing-native-session');assert.equal(workbench.getSnapshot().selectedDocument.id,'static-document');
 await render('chosen-history-session');assert.equal(workbench.getSnapshot().selectedDocument,undefined,'the changed real main Session belongs to the native history view');
 assert.ok(document.querySelector('.gea-company-main'));
});
