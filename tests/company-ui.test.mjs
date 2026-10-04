import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {SlotCore} from '../../../official-core/packages/client/ui-slots/lib/index.js';
const require=createRequire(import.meta.url);
const bundle=await build({entryPoints:['src/company/ui.tsx'],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react/jsx-runtime'],loader:{'.png':'dataurl'}});
const module={exports:{}};runInNewContext(bundle.outputFiles[0].text,{module,exports:module.exports,require,console,AbortController,AbortSignal,Response,setTimeout,clearTimeout});
const {mountCompanyUI}=module.exports;
function fixture(){
 const entries=[];const effects=[];const calls=[];
 const ctx={layout:{selectPanel:id=>calls.push(['panel',id]),toggleSidebar:()=>calls.push(['toggle'])},uiWorkspace:{startSession:()=>calls.push(['new'])},locale:{getSnapshot:()=>({active:'zh'}),subscribe:()=>()=>{}},slots:{entries:()=>[{options:{key:'gea-proof'}},{options:{key:'inventory-fc'}}],subscribe:()=>()=>{},inject:(_name,fn)=>fn(),register:(options,component)=>{entries.push({options,component});return()=>{};}},inject:()=>{},effect:fn=>{effects.push(fn);}};
 const workbench={label:id=>id,subscribe:()=>()=>{},subscribeHistory:()=>()=>{},takeHistoryPage:()=>undefined,open:async id=>calls.push(['page',id])};
 mountCompanyUI(ctx,workbench,()=>React.createElement('div',null,'resources'));
 return{entries,calls};
}
test('company public sidebar declares and renders the original workspace and settings seats beside grouped business navigation',()=>{
 const {entries}=fixture();const entry=entries.find(e=>e.options.name==='sidebar');assert.ok(entry);
 assert.equal(entry.options.children['sidebar.workspaces'].scope,'root');
 const markup=renderToStaticMarkup(React.createElement(entry.component,{collapsed:false,width:280,usePanelInfo:fn=>fn({activePanelId:'inventory-fc'}),renderSlot:(name)=>React.createElement('div',{'data-official-seat':name},name)}));
 for(const text of ['Synear GEA','智能体工作台','业务工作台','历史会话','产销协同','计划管理','库存管理','订单管理','分仓库存','产能评估(待设计)'])assert.ok(markup.includes(text),text);
 assert.ok(markup.includes('sidebar.workspaces'));assert.ok(markup.includes('sidebar.settings'));
 assert.ok(markup.includes('disabled=""'),'unconnected entries remain explicit disabled placeholders');
});
test('the account contribution retains settings and renders the GEA read-only signed-out state',()=>{
 const {entries}=fixture();const entry=entries.find(e=>e.options.name==='settings.launcher');assert.ok(entry);
 const markup=renderToStaticMarkup(React.createElement(entry.component,{wide:true,settingsOpen:false,openSettings:()=>{}}));
 assert.ok(markup.includes('账户菜单'));assert.ok(markup.includes('未登录'));
});
test('company Conversation composes its welcome and the native content with original workspace selection seats',()=>{
 const {entries}=fixture();const entry=entries.find(e=>e.options.name==='main.conversation');assert.ok(entry);
 const markup=renderToStaticMarkup(React.createElement(entry.component,{useSession:()=>undefined,useConversation:()=>undefined,useSessions:fn=>fn({byId:{}}),renderFactorySlot:(_name,options,extension)=>React.createElement('div',{'data-native-content':options.variant},React.createElement(extension.slots.widthControls,{useWorkspaces:fn=>fn({items:[]}),renderSlot:name=>React.createElement('div',{'data-seat':name}),selectWorkspace:()=>{}}))}));
 assert.ok(markup.includes('思念企业 AI 协作伙伴'));assert.ok(markup.includes('让 AI 进入工作流程'));
 assert.ok(markup.includes('conversation.hero.workspace'));assert.ok(markup.includes('conversation.hero.agentPreset'));assert.ok(markup.includes('data-native-content="main"'));
});
test('company registrations obey the fixed official public declaration ledger with the default Sidebar disabled',()=>{
 const core=new SlotCore();
 core.register({name:'root',children:{sidebar:{kind:'single',scope:'root'},main:{kind:'keyed',scope:'root'},'shell.leading':{kind:'single',scope:'root'}}},()=>null);
 core.register({name:'main',key:'conversation',children:{'main.conversation':{kind:'single',scope:'session-maybe'}}},()=>null);
 core.register({name:'main.conversation',children:{'conversation.header':{kind:'single',scope:'session-maybe'}}},()=>null);
 core.registerFactory({name:'conversation.content',scope:'session-maybe',children:{'conversation.hero.workspace':{kind:'single',scope:'root'},'conversation.hero.agentPreset':{kind:'single',scope:'session-maybe'}}},()=>null);
 const {entries}=fixture();
 // Settings owns its launcher declaration independently of the Sidebar occupant.
 core.register({name:'conversation.header',children:{'settings.launcher':{kind:'single',scope:'root'}}},()=>null);
 for(const entry of entries)assert.doesNotThrow(()=>core.register(entry.options,entry.component));
 assert.equal(core.entriesOfSlot('main.conversation')[0].options.priority,-20);
 assert.equal(core.entriesOfSlot('sidebar').length,1);
});
