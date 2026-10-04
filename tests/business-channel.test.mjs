import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';

test('the visible business page refuses disconnected reads immediately and reconnects with its new owned Session',async t=>{
  const previousWindow=globalThis.window;
  const listener=new Map();const parent={postMessage:()=>{}};
  globalThis.window={parent,addEventListener:(name,callback)=>listener.set(name,callback),dispatchEvent:()=>{}};
  globalThis.document={referrer:'https://host.example/workbench'};
  t.after(()=>{globalThis.window=previousWindow;delete globalThis.document;});
  const {outputFiles}=await build({entryPoints:['business/shared/channel.js'],bundle:true,write:false,format:'esm',platform:'browser'});
  const channel=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
  await assert.rejects(channel.call('sql',{query:'read'}),/请先登录并连接/);
  const messages=[];
  const port=()=>({onmessage:null,start(){},close(){},postMessage:value=>messages.push(value)});
  const first=port();
  listener.get('message')({source:parent,origin:'https://host.example',data:{protocol:'gea-html-v2',type:'connect',context:{plugin:'inventory-fc',session:'first-owned-session'}},ports:[first]});
  const pending=channel.call('workspace');
  const second=port();
  listener.get('message')({source:parent,origin:'https://host.example',data:{protocol:'gea-html-v2',type:'connect',context:{plugin:'inventory-fc',session:'second-owned-session'}},ports:[second]});
  await assert.rejects(pending,/会话已切换/);
  const current=channel.call('workspace');
  const request=messages.findLast(message=>message.type==='request');
  assert.equal(request.session,'second-owned-session');
  second.onmessage({data:{type:'response',id:request.id,result:{verified:'current'}}});
  assert.deepEqual(await current,{verified:'current'});
});
