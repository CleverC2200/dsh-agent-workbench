import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';

test('tree details release on collapse/unmount without erasing another tree, and cancelled hidden results stay withdrawn',async()=>{
  const require=createRequire(resolve('package.json'));const React=require('react'),{createRoot}=require('react-dom/client'),{JSDOM}=require('jsdom');
  const dom=new JSDOM('<div id="app"></div>');
  const saved=new Map(['window','document','fetch','IS_REACT_ACT_ENVIRONMENT'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  const ui=resolve('business/inventory-qll/source/inventory-light-plugins/src');
  const result=await build({stdin:{contents:`export {useTreePages} from '${ui}/pages/qll/components/use-tree-pages.tsx';export {pageContext,clearContext} from '${ui}/native/context.ts';`,loader:'ts',resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'node',external:['react','react/jsx-runtime'],plugins:[{name:'primitives',setup(api){
    api.onResolve({filter:/\/dsh-ui\/controls$/},()=>({path:'controls',namespace:'fixture'}));
    api.onResolve({filter:/channel\.js$/},()=>({path:'channel',namespace:'fixture'}));
    api.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='channel'?'export const publish=async()=>{};':'export const Alert=()=>null,Button=()=>null,DataPagination=()=>null;'}));
  }}]});
  await mkdir('.runtime',{recursive:true});const path=resolve('.runtime/chain-detail-hooks.mjs');await writeFile(path,result.outputFiles[0].text);
  const api=await import(pathToFileURL(path)),hooks={};
  const workspace={workspaceId:'current',scope:'company',filters:{month:'2026-09'}};
  function Tree({name,kind}){hooks[name]=api.useTreePages(workspace,kind);return null;}
  const root=createRoot(document.getElementById('app'));
  const render=showA=>React.act(async()=>root.render(React.createElement(React.Fragment,null,...(showA?[React.createElement(Tree,{key:'A',name:'A',kind:'structure'})]:[]),React.createElement(Tree,{key:'B',name:'B',kind:'aging'}))));
  const a={key:'A',layer:'base',objectName:'华东',category:'汤圆',sku:'全部SKU'},b={key:'B',layer:'branch',label:'长沙',expandable:true,filters:{branch:'长沙'}};
  globalThis.fetch=async()=>Response.json({rows:[{sku:'S'}],total:1,pageNo:1,pageSize:10});
  try {
    await render(true);
    await React.act(async()=>hooks.A.load(a));assert.equal(api.pageContext().parts.detail.kind,'structure');
    await React.act(async()=>hooks.A.retainVisible([],[]));assert.equal(api.pageContext().parts.detail,undefined);
    await React.act(async()=>hooks.A.activate(a));assert.equal(api.pageContext().parts.detail.kind,'structure','opening a cached visible page republishes its facts');
    await React.act(async()=>hooks.B.load(b));assert.equal(api.pageContext().parts.detail.kind,'aging');
    await render(false);assert.equal(api.pageContext().parts.detail.kind,'aging','old tree unmount must preserve the later owner');
    await React.act(async()=>hooks.B.retainVisible([{key:'parent',children:[b]}],['B']));
    assert.equal(api.pageContext().parts.detail,undefined,'a retained child key is hidden beneath a collapsed parent');
    await React.act(async()=>hooks.B.activate(b));
    await React.act(async()=>hooks.B.retainVisible([{key:'parent',children:[b]}],['parent','B']));
    assert.equal(api.pageContext().parts.detail.kind,'aging');
    await React.act(async()=>hooks.B.retainVisible([{key:'parent',children:[{...b,key:'new-page-child'}]}],['parent','B']));
    assert.equal(api.pageContext().parts.detail,undefined,'a changed parent page does not retain its former child');
    let finish,signal;globalThis.fetch=async(_url,init)=>{signal=init.signal;return new Promise(r=>finish=r)};
    let pending;await React.act(async()=>{pending=hooks.B.load(b)});
    await React.act(async()=>hooks.B.retainVisible([{key:'parent',children:[b]}],['B']));assert.ok(signal.aborted);
    await React.act(async()=>{finish(Response.json({rows:[{sku:'late'}],total:1,pageNo:1,pageSize:10}));await pending});
    assert.equal(api.pageContext().parts.detail,undefined);
  } finally {
    await React.act(async()=>root.unmount());api.clearContext();dom.window.close();
    for(const [key,descriptor] of saved)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];
  }
});
