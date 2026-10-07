import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const result=await build({entryPoints:['business/inventory-qll/source/inventory-light-plugins/src/qll-engine.ts'],bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'session',setup(api){
 api.onResolve({filter:/channel\.js$/},()=>({path:'session',namespace:'fixture'}));
 api.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const currentSessionId=()=>globalThis.mockSession; export const call=()=>{throw Error("REAL_HOST_CALL_FORBIDDEN")};'}));
}}]});
await mkdir('.runtime',{recursive:true});const bundle=resolve('.runtime/qll-mock-test.mjs');await writeFile(bundle,result.outputFiles[0].text);
const engine=await import(pathToFileURL(bundle));
test('default fixed input preserves company/customer units, zero/null, complete pages and current Session',async()=>{
 globalThis.mockSession='session-A';
 const company=await engine.load({scope:'company',part:'current',filters:{month:'2026-09'}});
 assert.equal(company.dataMode,'MOCK_DATA_ONLY');
 assert.equal(company.kpis.inventoryLevel.companyCurrent,5580);
 assert.equal(company.structure.some(row=>row.layer==='customer'),false);
 const channel=await engine.load({scope:'all-channel',part:'current',filters:{month:'2026-09'}});
 assert.equal(channel.kpis.inventoryLevel.companyCurrent,5580);
 assert.equal(channel.kpis.inventoryLevel.planCustomerTotal,0);
 assert.equal(channel.structure.find(row=>row.layer==='customer').targetQty,null);
 const rows=[];
 for(let pageNo=1;pageNo<=3;pageNo++){
  const page=await engine.loadDetails({workspaceId:channel.workspaceId,kind:'structure',layer:'base',filters:{base:'华东',category:'饺子'},pageNo,pageSize:50});
  assert.equal(page.total,105);rows.push(...page.rows);
 }
 assert.equal(rows.length,105);assert.equal(new Set(rows.map(row=>row.sku)).size,105);
 assert.equal(rows.reduce((sum,row)=>sum+row.currentQty,0),5565);
 const filtered=await engine.load({scope:'company',part:'current',filters:{month:'2026-09',sku:'MOCK-001'}});
 assert.equal(filtered.kpis.inventoryLevel.companyCurrent,16);
 assert.equal(filtered.structure.filter(row=>row.layer==='branch')[0].availableQty,15);
 const zero=await engine.load({scope:'company',part:'current',filters:{month:'2026-09',sku:'MOCK-002'}});
 assert.equal(zero.structure.find(row=>row.layer==='branch').availableQty,0);
 await assert.rejects(engine.loadDetails({workspaceId:filtered.workspaceId,kind:'structure',layer:'customer',pageNo:1,pageSize:10}),/范围/);
 const controller=new AbortController();controller.abort(Error('cancelled'));
 await assert.rejects(engine.load({signal:controller.signal}),/cancelled/);
 globalThis.mockSession='session-B';
 await assert.rejects(engine.loadHistory(channel.workspaceId),/会话|快照/);
 engine.clearFacts();delete globalThis.mockSession;
});
