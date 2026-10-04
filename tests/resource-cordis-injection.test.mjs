import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {Context} from '../../deepseek-harness/vendor/cordis/lib/index.js';
const {outputFiles}=await build({entryPoints:['src/resource-selection.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {mountNativeResourceSelection,selectResource}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));

test('actual Cordis client injection admits every native resource service and releases the adapter with its fiber',async()=>{
 const ctx=new Context();const operations=[];let native;
 const sessionScope=new Context();
 sessionScope.on('slash/input-insert-text',request=>{operations.push(['draft',request.text]);return true;});
 const presets={select:async(id,preset)=>{operations.push(['preset',id,preset]);return {ok:true,value:preset};}};
 const provider=await ctx.plugin({name:'native-client-dependencies',apply:ctx=>{ctx.provide('remote',{agentPresets:presets});ctx.provide('remote.agentPresets',presets);
 ctx.provide('sessions',{create:async options=>{operations.push(['create',options]);return 'new-session';},using:async(_id,_options,operation)=>operation({binding:{ctx:sessionScope}})});
 ctx.provide('conversation',{input:{for:()=>({state:{getSnapshot:()=>({draft:'',draftRev:0})}})}});
 ctx.provide('uiWorkspace',{openSession:id=>operations.push(['open',id])});}});
 const fiber=mountNativeResourceSelection(ctx,value=>{native=value;});await fiber;
 assert.ok(native);
 native.fetch=async path=>Response.json(path.endsWith('/config')?{cwd:'/isolated/workspace'}:{preset:'original',skill:'existing'});
 await selectResource(native,'skill:existing',new AbortController().signal);
 assert.deepEqual(operations,[['create',{cwd:'/isolated/workspace'}],['preset','new-session','original'],['draft','/existing '],['open','new-session']]);
 await fiber.dispose();assert.equal(native,undefined);
 await provider.dispose();await sessionScope.fiber.dispose();await ctx.fiber.dispose();
});
