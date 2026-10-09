import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSync} from 'esbuild';
import {fileURLToPath} from 'node:url';
function load(path) {
  const code = buildSync({entryPoints:[fileURLToPath(new URL(path,import.meta.url))],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text;
  const module={exports:{}};new Function('module','exports',code)(module,module.exports);return module.exports;
}
const {buildInventoryInsight}=load('../business/inventory-aqkc/source/aqkc/web/src/lib/inventory-insight.ts');
const {normalizeWorkspaceState}=load('../business/inventory-aqkc/source/inventory-light-plugins/src/pages/aqkc/components/analytics/workspace-normalizer.ts');
const {skuDetailPage}=load('../business/inventory-aqkc/source/aqkc/web/src/lib/workbench-sku-filter.ts');
const sku=(base,code,current,target)=>({base,category:code,sku:code,current,target,dailyDemand:null,last30d:null});
const pending=(base,code,shortage)=>({'workbench.domain':code?'pending_sku':'pending_base','workbench.base':base,'workbench.material_code':code,'workbench.shortage_quantity':shortage});
const age=(base,code,qty,future7=0,future14=0)=>({'inventory_age.base_name':base,'inventory_age.material_code':code,'inventory_age.age_60_plus':qty,'inventory_age.future_7_overage':future7,'inventory_age.future_14_overage':future14});
test('same scoped engine facts drive shortage ranking and exact age metrics; future risk is separate',()=>{
  const insight=buildInventoryInsight({bases:['华东'],skus:[sku('华东','A',20,10),sku('华东','B',5,10),sku('华东','C',8,8),sku('华南','Z',999,1)],pending:[pending('华东',null,0),pending('华东','A',7),pending('华东','B',3),pending('华东','C',1),pending('华南','Z',999)],age:[age('华东','A',4,2,3),age('华东','B',0),age('华东','C',0),age('华南','Z',999)],shortage:11,fulfillment:null});
  assert.equal(insight.ranking,'当前订单缺口');assert.deepEqual(insight.top.map(r=>r.category),['A','B','C']);
  assert.equal(insight.completeRanking,true);assert.equal(insight.completeAge,true);
  assert.deepEqual(insight.metrics,{current:33,target:28,gap:5,shortage:11,age60:4,future7:2,future14:3,fulfillment:null,dailyDemand:null,last30d:null});
  assert.match(insight.text,/两者不相加/);assert.match(insight.text,/品类内原因未确认/);
});
test('missing targets/orders/age remain unknown and do not become healthy or a full ranking',()=>{
  const insight=buildInventoryInsight({bases:['华东'],skus:[sku('华东','A',20,null)],pending:null,age:null,shortage:null,fulfillment:null});
  for(const field of ['target','gap','shortage','age60','future7','future14','fulfillment'])assert.equal(insight.metrics[field],null,field);
  assert.equal(insight.completeRanking,false);assert.equal(insight.completeAge,false);
  assert.match(insight.text,/目标数据不完整/);assert.match(insight.text,/当前缺口缺少证据/);
  assert.ok(insight.missing.includes('货龄明细不全'));
});
test('an unmapped order cannot establish a complete top three; real zero stays zero',()=>{
  const insight=buildInventoryInsight({bases:['华东'],skus:[sku('华东','A',0,0)],pending:[pending('华东',null,0),pending('华东','Z',12)],age:[age('华东','A',0)],shortage:12,fulfillment:0});
  assert.equal(insight.completeRanking,false);assert.equal(insight.metrics.current,0);assert.equal(insight.metrics.target,0);assert.equal(insight.metrics.fulfillment,0);
  assert.match(insight.text,/缺口集中范围尚未完整核实/);
});
test('risk filtering accepts actual shortage on a high-stock SKU without replacing the stock classification',()=>{
  const result=skuDetailPage([{level:'A',risk:'库存偏高',shortageQuantity:'7'},{level:'B',risk:'库存偏低',shortageQuantity:'0'},{level:'C',risk:'缺失目标',shortageQuantity:'-'}],['缺货'],'',1,20);
  assert.equal(result.total,1);assert.equal(result.rows[0].risk,'库存偏高');
});
test('workspace normalization preserves exact risk evidence and business snapshots, keeping missing values null',()=>{
  const insight=buildInventoryInsight({bases:['华东'],skus:[sku('华东','A',20,null)],pending:null,age:null,shortage:null,fulfillment:null});
  const {groups,...facts}=insight;
  const evidence={...facts,sources:{consumerCode:'base-safety-stock',bases:['华东'],targetMonth:'2026-10-01',targetVersions:['滚动'],targetSnapshots:['2026-09-30 09:00'],inventorySnapshots:['2026-09-30 09:00'],orderSnapshots:['2026-09-30 07:25']}};
  const workspace=normalizeWorkspaceState({title:'risk',workbench:{status:'ready',overallAnalysis:evidence.text,inventoryInsight:evidence}});
  assert.deepEqual(workspace.workbench.inventoryInsight,evidence);
  const bad=normalizeWorkspaceState({title:'risk',workbench:{inventoryInsight:{...evidence,sources:{...evidence.sources,consumerCode:'other'}}}});
  assert.equal(bad.workbench.inventoryInsight,undefined);
});
