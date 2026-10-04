import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import * as cordis from '../../deepseek-harness/vendor/cordis/lib/index.js';
import * as store from '../../deepseek-harness/packages/client/store/lib/index.js';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
const {Context}=cordis;
// Execute existing official client artifacts through their public module-loader entry, without changing/rebuilding Core.
const modules=new Map([['@deepseek-ai/cordis',cordis],['@deepseek-ai/dsh-client-store',store]]);
const loader={load:({id,factory})=>modules.set(id,factory(name=>{const found=modules.get(name.replace(/\/client$/,''));if(!found)throw Error(`Missing official client fixture dependency: ${name}`);return found;}))};
for(const packageName of ['gateway','workspace-controller']){
 runInNewContext(await readFile(new URL(`../../deepseek-harness/packages/api/${packageName}/lib/client.js`,import.meta.url),'utf8'),{window:{__ModuleLoader__:loader},AbortController,AbortSignal,console,setTimeout,clearTimeout,queueMicrotask,URL,TextEncoder,TextDecoder});
}
const {ClientWorkspaceModel,WorkspaceController}=modules.get('@deepseek-ai/dsh-api-workspace-controller');
const {outputFiles}=await build({entryPoints:['src/resource-selection.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {mountNativeResourceSelection,selectResource}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));

test('actual Cordis client injection admits every native resource service and releases the adapter with its fiber',async()=>{
 const ctx=new Context();const operations=[];let native;let workspaces;
 const sessionScope=new Context();
 sessionScope.on('slash/input-insert-text',request=>{operations.push(['draft',request.text]);return true;});
 const presets={select:async(id,preset)=>{operations.push(['preset',id,preset]);return {ok:true,value:preset};}};
 const provider=await ctx.plugin({name:'native-client-dependencies',apply:ctx=>{ctx.provide('remote',{agentPresets:presets});ctx.provide('remote.agentPresets',presets);
 workspaces=new WorkspaceController(ctx,new ClientWorkspaceModel({create:async({path})=>{operations.push(['workspace',path]);return {ok:true,value:{workspace:{workspaceId:'workspace-owned',path,title:'Owned',sessionIds:[],createdAt:'2026-10-04T00:00:00Z',updatedAt:'2026-10-04T00:00:00Z'}}};}}));
 ctx.provide('sessions',{create:async options=>{assert.equal(workspaces.list.getSnapshot().items[0].workspaceId,options.workspaceId);operations.push(['create',options]);return 'new-session';},using:async(_id,_options,operation)=>operation({binding:{ctx:sessionScope}})});
 ctx.provide('conversation',{input:{for:()=>({state:{getSnapshot:()=>({draft:'',draftRev:0})}})}});
 ctx.provide('uiWorkspace',{openSession:id=>operations.push(['open',id])});}});
 const fiber=mountNativeResourceSelection(ctx,value=>{native=value;});await fiber;
 assert.ok(native);
 native.fetch=async path=>Response.json(path.endsWith('/config')?{cwd:'/isolated/workspace'}:{preset:'original',skill:'existing'});
 await selectResource(native,'skill:existing',new AbortController().signal);
 assert.deepEqual(operations,[['workspace','/isolated/workspace'],['create',{workspaceId:'workspace-owned'}],['preset','new-session','original'],['draft','/existing '],['open','new-session']]);
 await fiber.dispose();assert.equal(native,undefined);
 await provider.dispose();await sessionScope.fiber.dispose();await ctx.fiber.dispose();
});
