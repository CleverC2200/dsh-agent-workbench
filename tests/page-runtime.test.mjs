import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const core=resolve('../../official-core'), official=path=>pathToFileURL(resolve(core,path)).href;
const {Context}=await import(official('vendor/cordis/lib/index.js'));
const {default:Tools}=await import(official('packages/core/tools/lib/index.js'));
const {default:SystemPrompt}=await import(official('packages/core/system-prompt/lib/index.js'));
const {default:Agents}=await import(official('packages/core/agent/lib/index.js'));
const {createScope}=await import(official('packages/core/scope/lib/index.js'));
const {Session,SessionId}=await import(official('packages/core/session/lib/index.js'));
await mkdir('.scratch',{recursive:true});
const result=await build({entryPoints:['src/html-pages.ts'],bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'official-tools',setup(builder){builder.onResolve({filter:/^@deepseek-ai\/dsh-tools$/},()=>({path:official('packages/core/tools/lib/index.js'),external:true}));}}]});
await writeFile('.scratch/page-runtime.mjs',result.outputFiles[0].text);
const {HtmlPages}=await import(pathToFileURL(resolve('.scratch/page-runtime.mjs')).href);
async function mount(t,kind='html'){
 const ctx=new Context(),routes=new Map();
 ctx.provide('connection',{fetch:{register(route){routes.set(route.path,route);return()=>routes.delete(route.path);}}});
 await ctx.plugin(SystemPrompt,{});await ctx.plugin(Tools);await ctx.plugin(Agents);
 const id=SessionId('session-11111111-1111-4111-8111-111111111111'),agent={id,session:Session.create(id)};
 await ctx.plugin(Object.assign(inner=>{agent.ctx=createScope(inner,agent).ctx;},{inject:['tools','systemPrompt']}));
 await ctx.agents.register(agent);
 let pages;await ctx.plugin(Object.assign(inner=>{pages=new HtmlPages(inner,'');},{inject:['connection','tools','agents']}));
 const identity=new AbortController();let releases=0;
 const grant={signal:identity.signal,access:{mode:'test'},allowsEffect:effect=>effect==='draft'||effect==='view',release:()=>{releases++;},readSql:async()=>({rows:[[7]]})};
 pages.registerBusinessPage({id:kind==='html'?'inventory-test':'gea-proof',pluginId:'inventory-test',label:'Test',kind,resourceId:'test-resource',catalog:{surface:kind==='html'?'gea-html-inventory-test':'gea-workbench',tool:kind==='html'?'gea_plugin_page_apply':'gea_workbench_apply'}},async()=>grant);
 const call=async(operation,input={})=>{const response=await routes.get('/api/agent-workbench/page').fetch(new Request('https://local/api/agent-workbench/page',{method:'POST',body:JSON.stringify({operation,...input})}));return {status:response.status,value:await response.json()};};
 t.after(()=>ctx.fiber.dispose());
 const open=()=>call('open',{pageId:kind==='html'?'inventory-test':'gea-proof',sessionId:id,resourceId:'test-resource'});
 const execute=(name,args)=>ctx.tools.execute({callId:crypto.randomUUID(),name,arguments:args,agent,signal:new AbortController().signal});
 const reference=async input=>{
  const binding=await routes.get('/api/page-interaction/binding').fetch();const {generation}=await binding.json();
  const response=await routes.get('/api/page-interaction/reference').fetch(new Request('https://local/api/page-interaction/reference',{method:'POST',body:JSON.stringify({sessionId:id,page:'Original page',label:'Chosen',text:'chosen original content',targets:[],capturedAt:'fixture',generation,...input})}));return {status:response.status,value:await response.json()};
 };
 return {call,open,identity,releases:()=>releases,execute,reference};
}
test('HTML keeps self-reported actions and AG-UI as two real channels on one exact owner',async t=>{
 const h=await mount(t);const {value:{owner}}=await h.open();
 assert.equal((await h.call('access',{owner})).value.mode,'test');
 await h.call('context',{owner,parameters:{rows:[{id:'A'}]}});
 assert.match((await h.execute('gea_page',{action:'context'})).value,/"id":"A"/);
 await h.call('register',{owner,parameters:{name:'refresh',description:'Refresh'}});
 const invoked=h.execute('gea_page',{action:'refresh'});await new Promise(r=>setTimeout(r,10));
 const events=(await h.call('events',{owner})).value;assert.equal(events[0].name,'refresh');
 await h.call('reply',{owner,parameters:{id:events[0].id,result:{refreshed:true}}});assert.match((await invoked).value,/refreshed/);
 const catalog={elements:[{id:'filters',role:'control',label:'Filters',actions:['reset']}]};
 await h.call('catalog',{owner,parameters:{catalog,pageSource:'self-report',toolMessages:[]}});
 const action=h.execute('gea_plugin_page_apply',{kind:'invoke',target:'filters',action:'reset',reason:'reset'});await new Promise(r=>setTimeout(r,10));
 const queued=(await h.call('catalog',{owner,parameters:{catalog,pageSource:'self-report',toolMessages:[]}})).value.events;
 assert.ok(queued.length>0);const toolCallId=queued[0].toolCallId;
 await h.call('catalog',{owner,parameters:{catalog,pageSource:'self-report',toolMessages:[{id:'result',role:'tool',toolCallId,content:JSON.stringify({toolCallId,applied:true})}]}});
 assert.match((await action).value,/"applied":true/);
});
test('replacement releases old owner and delayed close cannot revoke the new page',async t=>{
 const h=await mount(t,'native');const old=(await h.open()).value.owner;const current=(await h.open()).value.owner;
 assert.equal(h.releases(),1);await h.call('close',{owner:old});assert.equal((await h.call('access',{owner:current})).status,200);
 h.identity.abort();assert.equal((await h.call('access',{owner:current})).value.error,'PAGE_OWNER_RELEASED');assert.equal(h.releases(),2);
});
test('identity revocation cancels a page action and prevents late replies from reviving its owner',async t=>{
 const h=await mount(t);const owner=(await h.open()).value.owner;
 await h.call('register',{owner,parameters:{name:'filter',description:'Filter'}});
 const pending=h.execute('gea_page',{action:'filter'});await new Promise(r=>setTimeout(r,10));const events=(await h.call('events',{owner})).value;
 h.identity.abort();assert.equal((await pending).isError,true);assert.equal((await h.call('reply',{owner,parameters:{id:events[0].id,result:'late'}})).status,400);
});
test('a legacy text success or mismatched JSON receipt never proves a page action applied',async t=>{
 const h=await mount(t);const owner=(await h.open()).value.owner;
 const catalog={elements:[{id:'filters',role:'control',label:'Filters',actions:['reset']}]};
 await h.call('catalog',{owner,parameters:{catalog,pageSource:'self-report',toolMessages:[]}});
 for(const content of ['success',JSON.stringify({toolCallId:'forged',applied:true})]){
   const pending=h.execute('gea_plugin_page_apply',{kind:'invoke',target:'filters',action:'reset',reason:'reset'});await new Promise(r=>setTimeout(r,10));
   const events=(await h.call('catalog',{owner,parameters:{catalog,pageSource:'self-report',toolMessages:[]}})).value.events;const toolCallId=events[0].toolCallId;
   await h.call('catalog',{owner,parameters:{catalog,pageSource:'self-report',toolMessages:[{id:'receipt',role:'tool',toolCallId,content}]}});
   assert.equal(JSON.parse((await pending).value).applied,false);
 }
});
test('references are bound to their exact owner and cannot claim a Native surface or another Session',async t=>{
 const h=await mount(t);const owner=(await h.open()).value.owner;
 const wrong=await h.reference({owner,surface:'gea-workbench'});assert.equal(wrong.status,400);
 const valid=await h.reference({owner,surface:'gea-html-inventory-test'});assert.equal(valid.status,200);
 assert.match((await h.execute('page_reference_read',{id:valid.value.id})).value,/chosen original content/);
 await h.call('close',{owner});assert.match((await h.execute('page_reference_read',{id:valid.value.id})).value,/REFERENCE_UNAVAILABLE/);
 assert.equal((await h.reference({owner,surface:'gea-html-inventory-test'})).status,400);
});
