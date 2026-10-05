import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {JSDOM} from 'jsdom';
import React from 'react';
const require=createRequire(import.meta.url);
const {outputFiles}=await build({stdin:{contents:"export {InlineSkuDetails} from './src/workbench/original/workbenches/regionalApproval/InlineSkuDetails.tsx';export {default as RegionalApprovalWorkbench} from './src/workbench/original/workbenches/regionalApproval/RegionalApprovalWorkbench.tsx';export * from './src/workbench/original/storage.ts';export {WorkbenchHostProvider} from './src/workbench/original/bridge.ts';",resolveDir:process.cwd()},bundle:true,write:false,format:'cjs',platform:'node',external:['react','react/jsx-runtime','react-dom'],loader:{'.module.css':'text','.css':'text'}});
const module={exports:{}};new Function('module','exports','require',outputFiles[0].text)(module,module.exports,require);const {InlineSkuDetails,WorkbenchHostProvider,RegionalApprovalWorkbench,writeAssistantSurfaceState,getAssistantSurfaceWorkbenchScope}=module.exports;

test('restored unsent SKU input stays exact without replaying the original draft writer',async t=>{
 const dom=new JSDOM('<main id="root"></main>',{pretendToBeVisual:true});
 const saved=['window','document','navigator','Node','HTMLElement','getComputedStyle','IS_REACT_ACT_ENVIRONMENT'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]);
 for(const [key,value]of [['window',dom.window],['document',dom.window.document],['navigator',dom.window.navigator],['Node',dom.window.Node],['HTMLElement',dom.window.HTMLElement],['getComputedStyle',dom.window.getComputedStyle],['IS_REACT_ACT_ENVIRONMENT',true]])Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
 const writes=[];const sku={skuCode:'10001',skuName:'synthetic SKU',productCategName:'Synthetic category',versionId:'v1',qty:'10',baseQty:'8',price:'2',amt:'20',amtBase:'16',areaConfirmedQty:'10'};
 const row={planId:'p1',versionId:'v1',status:4,planTypeCode:'Y'};const detail={currentVersion:{id:'v1',planId:'p1',status:4,effective:true},skus:[sku]};
 const host={salesPlan:{versionSkus:{invoke:async()=>[sku]},draft:{invoke:async request=>{if(request.draft)writes.push(request);return{draft:null};}}}};
 const {createRoot}=await import('react-dom/client');const root=createRoot(document.getElementById('root'));const {act}=React;
 t.after(async()=>{await act(async()=>root.unmount());dom.window.close();for(const [key,descriptor]of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}});
 await act(async()=>root.render(React.createElement(WorkbenchHostProvider,{value:host},React.createElement(InlineSkuDetails,{row,detail,canEdit:true,approvalRole:'area',t:key=>key,initialInputValues:{'10001':'1111.125'}}))));
 assert.equal(document.querySelector('input').value,'1111.125');
 await act(async()=>new Promise(resolve=>setTimeout(resolve,550)));assert.equal(writes.length,0,'rehydrating the UI cannot automatically replay an unsent draft save');
});


test('RegionalApproval restores scoped live filter intent through its actual query interface without granting or replaying actions',async t=>{
 const dom=new JSDOM('<main id="root"></main>',{url:'https://host.example/api/agent-workbench/native',pretendToBeVisual:true});
 const names=['window','document','navigator','Node','Element','SVGElement','HTMLElement','getComputedStyle','ResizeObserver','IS_REACT_ACT_ENVIRONMENT'];const saved=names.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]);
 dom.window.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
 const observer=class{observe(){}unobserve(){}disconnect(){}};dom.window.ResizeObserver=observer;
 for(const [key,value]of [['window',dom.window],['document',dom.window.document],['navigator',dom.window.navigator],['Node',dom.window.Node],['Element',dom.window.Element],['SVGElement',dom.window.SVGElement],['HTMLElement',dom.window.HTMLElement],['getComputedStyle',dom.window.getComputedStyle],['ResizeObserver',observer],['IS_REACT_ACT_ENVIRONMENT',true]])Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
 const scope=getAssistantSurfaceWorkbenchScope('own-tenant-account');const filters={areaCode:'A-1',provinceCode:'all',orgCode:'all',dealerCode:'all',status:'4'};
 writeAssistantSurfaceState('forecast',scope+':regional-approval-state',{draftLiveFilters:filters,appliedLiveFilters:filters});
 const reads=[],writes=[];const page=records=>({records,total:records.length,size:20,current:1,pages:1});
 const host={salesPlan:{periods:{invoke:async()=>page([{periodId:'period-1',tenantId:'tenant-1',periodMonth:'2026-10',planType:'Y',planTypeCode:'Y'}])},list:{invoke:async query=>{reads.push(query);return page([]);}},versions:{invoke:async()=>[]},detail:{invoke:async()=>{throw Error('no actual rows');}},action:{invoke:async value=>{writes.push(value);throw Error('actions forbidden');}},submit:{invoke:async value=>{writes.push(value);throw Error('submit forbidden');}}}};
 const {createRoot}=await import('react-dom/client');const {act}=React;const root=createRoot(document.getElementById('root'));
 t.after(async()=>{await act(async()=>root.unmount());dom.window.close();for(const [key,descriptor]of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}});
 const render=()=>act(async()=>root.render(React.createElement(WorkbenchHostProvider,{value:host},React.createElement(RegionalApprovalWorkbench,{stateScope:'own-tenant-account',approvalStages:['area'],queryClient:host.salesPlan,t:key=>key,onContextChange:()=>{},liveActionsEnabled:false}))));
 await render();await act(async()=>new Promise(resolve=>setTimeout(resolve,30)));
 assert.ok(reads.some(query=>query.areaCode==='A-1'&&query.status===4),'restored UI filters reach the original public query DTO, not an invented result cache');
 await act(async()=>root.render(null));reads.length=0;await render();await act(async()=>new Promise(resolve=>setTimeout(resolve,30)));
 assert.ok(reads.some(query=>query.areaCode==='A-1'&&query.status===4));assert.equal(writes.length,0);
});
