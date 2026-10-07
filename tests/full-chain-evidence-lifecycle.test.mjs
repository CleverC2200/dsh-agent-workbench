import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';

test('the rendered filtered view owns its aggregate evidence and withdraws it on unmount',async()=>{
 const require=createRequire(resolve('package.json')),React=require('react'),{createRoot}=require('react-dom/client'),{JSDOM}=require('jsdom');
 const dom=new JSDOM('<div id="app"></div>');
 const saved=new Map(['window','document','IS_REACT_ACT_ENVIRONMENT'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const ui=resolve('business/inventory-qll/source/inventory-light-plugins/src');
 const bundle=await build({stdin:{contents:`export {ReferenceStructure} from '${ui}/pages/qll/components/reference-structure.tsx';export {pageContext,clearContext} from '${ui}/native/context.ts';`,loader:'ts',resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'node',external:['react','react-dom','react/jsx-runtime'],plugins:[{name:'view-primitives',setup(api){
  api.onResolve({filter:/channel\.js$|\/dsh-ui\/controls$|\/viewport-table$|\/use-tree-pages$|\.module\.css$/},a=>({path:a.path,namespace:'fixture'}));
  api.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path.endsWith('channel.js')?'export const publish=async()=>{};export const reportElements=()=>()=>{};':a.path.endsWith('controls')?'export const Button=()=>null,Modal=()=>null,Tag=()=>null;':a.path.endsWith('viewport-table')?'export const Table=()=>null;':a.path.endsWith('use-tree-pages')?'const pages={attach:r=>r,retainVisible:()=>{},activate:()=>{},footer:()=>null};export const useTreePages=()=>pages;':'export default {};'}));
 }}]});
 await mkdir('.runtime',{recursive:true});const file=resolve('.runtime/chain-view-evidence.mjs');await writeFile(file,bundle.outputFiles[0].text);
 const api=await import(pathToFileURL(file)),root=createRoot(document.getElementById('app'));
 const row=(name,qty)=>({key:name,layer:'base',objectName:name,category:'饺子',sku:'全部SKU',currentQty:qty,availableQty:qty,targetQty:46238,sourceDate:'2026-09-30',confidence:'完整',averageAgeDays:null});
 const workspace={workspaceId:'fixed',scope:'company',filters:{month:'2026-10'},categoryStructure:[...Array.from({length:40},(_,i)=>row('other'+i,100)),row('华东',41268)]};
 const props={workspace,mode:'category',sku:'',onSku:()=>{},status:'',onStatus:()=>{},toolbar:null,onFilters:()=>{}};
 try {
  await React.act(async()=>root.render(React.createElement(api.ReferenceStructure,{...props,filters:{category:'饺子',org:'["base","华东"]'}})));
  let view=api.pageContext().parts.structureView;
  assert.equal(view.rowCount,1);assert.equal(view.companyInventoryQty,41268);assert.equal(view.rows[0].objectName,'华东');assert.match(view.scopeDescription,/不含客户渠道/);
  await React.act(async()=>root.render(React.createElement(api.ReferenceStructure,{...props,filters:{category:'',org:''}})));
  view=api.pageContext().parts.structureView;
  assert.equal(view.rowCount,41);assert.equal(view.companyInventoryQty,45268);assert.equal(view.rows.truncated,true);assert.equal(view.rows.totalRows,41);
  await React.act(async()=>root.unmount());assert.equal(api.pageContext().parts.structureView,undefined);
 } finally {
  api.clearContext();dom.window.close();
  for(const [k,v] of saved)if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k];
 }
});
