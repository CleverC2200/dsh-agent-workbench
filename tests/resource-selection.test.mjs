import test from 'node:test'; import assert from 'node:assert/strict'; import {build} from 'esbuild';
const {outputFiles}=await build({entryPoints:['src/resource-selection.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {selectResource}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
test('resource selection creates a new native session in the explicit workspace and stages a Skill without sending or replacing another session',async()=>{
 const calls=[];const host={fetch:async path=>Response.json(path.endsWith('/config')?{cwd:'/isolated/runtime/workspace'}:{id:'skill:existing',preset:'agent-resource-skill',skill:'existing'}),workspace:async path=>{calls.push(['workspace',path]);return 'workspace-owned'},create:async options=>{calls.push(['create',options]);return 'new-session'},select:async(...args)=>{calls.push(['select',...args])},open:async(id,skill)=>{if(skill)calls.push(['stage',id,skill]);calls.push(['open',id])}};
 await selectResource(host,'skill:existing',new AbortController().signal);
 assert.deepEqual(calls,[['workspace','/isolated/runtime/workspace'],['create',{workspaceId:'workspace-owned'}],['select','new-session','agent-resource-skill'],['stage','new-session','existing'],['open','new-session']]);
});
test('cancelled resource loading never creates or opens a native session',async()=>{
 const controller=new AbortController();let created=false;
 const host={fetch:async path=>{if(path.endsWith('/config'))return Response.json({cwd:'/isolated/workspace'});controller.abort();return Response.json({preset:'original'});},workspace:async()=>{throw Error('Cancelled before workspace registration')},create:async()=>{created=true;return 'new'},select:async()=>{},open:async()=>{throw Error('Unexpected navigation')}};
 await assert.rejects(selectResource(host,'original',controller.signal));assert.equal(created,false);
});
test('a user edit made while the new Session is preparing remains intact and prevents navigation',async()=>{
 const host={fetch:async path=>Response.json(path.endsWith('/config')?{cwd:'/isolated/workspace'}:{preset:'original',skill:'existing'}),workspace:async()=> 'workspace-owned',create:async()=> 'new',select:async()=>{},open:async()=>{throw Error('RESOURCE_DRAFT_CHANGED')}};
 await assert.rejects(selectResource(host,'skill:existing',new AbortController().signal),/RESOURCE_DRAFT_CHANGED/);
});
test('a page resource action returns its own real host reference for embedded Conversation without native main navigation',async()=>{
 const reference={sessionId:'page-session',release(){},ready:Promise.resolve({})};let embedded;
 const host={fetch:async path=>Response.json(path.endsWith('/config')?{cwd:'/isolated/workspace'}:{preset:'gea-readonly'}),workspace:async()=> 'workspace-owned',create:async()=> 'page-session',select:async()=>{},open:async(_id,_skill,_signal,insidePage)=>{embedded=insidePage;return reference;}};
 const selected=await selectResource(host,'gea-readonly',new AbortController().signal,true);
 assert.equal(embedded,true);assert.equal(selected.sessionId,'page-session');assert.equal(selected.reference,reference);assert.equal(selected.preset,'gea-readonly');
});
