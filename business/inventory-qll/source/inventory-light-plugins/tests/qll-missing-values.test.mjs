import {fileURLToPath} from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
test('public workspace uses batch facts for object big-date inventory and real target fallback',async()=>{
 const output=await build({stdin:{contents:"export * from 'dsh-agent-manage/inventory-compute/full-chain-workspace-service'",resolveDir:fileURLToPath(new URL('../../../../../',import.meta.url)),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false});
 const {buildFullChainWorkspace:computeWorkspace}=await import('data:text/javascript;base64,'+Buffer.from(output.outputFiles[0].text).toString('base64'));
 const buildFullChainWorkspace=async request=>computeWorkspace(await request.adapter.load(request),request);
 const base={snapshotDate:'2026-09-20',base:'华东',category:'食品',currentQty:100,targetQty:null,plannedDailyQty:null,externalDemand30d:null,confirmedTransferOut30d:null,sourceTargetTurnoverDays:12};
 const batch={snapshotDate:'2026-09-20',layer:'base',objectName:'华东',category:'食品',sku:'A',batch:'one',qty:20,ageDays:61,dailyVelocity:null};
 const data={baseInventory:[{...base,sku:'A'},{...base,sku:'B'}],branchInventory:[],customerInventory:[],agingBatches:[batch],orders:[],pendingOrders:[],activeCustomerIds30d:[],inventoryTrend:[]};
 const request={access:{trusted:true,principalId:'test'},scope:'company',filters:{},now:new Date('2026-09-20'),adapter:{load:async()=>data}};
 const result=await buildFullChainWorkspace(request);assert.equal(result.structure[0].bigDateQty,20);assert.equal(result.structure[0].targetQty,null);
 const sku=await buildFullChainWorkspace({...request,filters:{sku:'A'}});assert.equal(sku.structure[0].targetTurnoverDays,12);assert.equal(sku.structure[0].projectedTurnoverDays,null);
 batch.ageDays=null;assert.equal((await buildFullChainWorkspace(request)).structure[0].bigDateQty,null);
});
