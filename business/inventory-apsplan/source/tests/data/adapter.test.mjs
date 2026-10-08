import {fileURLToPath} from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from './public-build.mjs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const dir=await mkdtemp(join(tmpdir(),'aps-adapter-'));
await build({entryPoints:[fileURLToPath(new URL('../../app/data/adapter.ts',import.meta.url))],bundle:true,platform:'node',format:'esm',outfile:join(dir,'adapter.mjs')});
const {metricValues,comparisonValues,formatNumber,createMetricReader}=await import(join(dir,'adapter.mjs'));
const data={start:'2026-09-01',end:'2026-09-21',granularity:'month',sections:[{id:'stock',status:'ready',rows:[{base:'华东',category:'饼类',inventory:20000,demand:2000},{base:'郑州',category:'饼类',inventory:10000,demand:1000}]},{id:'orders',status:'ready',rows:[{base:'华东',category:'饼类',demand:100,shortage:10,invalid:0},{base:'郑州',category:'饼类',demand:900,shortage:0,invalid:0}]}]};
test('总览按数量加权，不平均比率',()=>{assert.equal(metricValues(data)['库存量'],3);assert.equal(metricValues(data)['订单满足率'],99)});
test('精确匹配基地/品类，缺少品项或物料不回填上级合计',()=>{assert.equal(metricValues(data,{base:'华东'})['订单满足率'],90);assert.equal(metricValues(data,{category:'饼类'})['库存量'],3);assert.ok(Number.isNaN(metricValues(data,{category:'水饺'})['库存量']));assert.ok(Number.isNaN(metricValues(data,{category:'饼类',item:'休闲'})['库存量']))});
test('失败结果、未知分母、缺失对比期保持缺失',()=>{const failed={...data,sections:data.sections.map(s=>({...s,status:'error'}))};assert.ok(Number.isNaN(metricValues(failed)['库存量']));assert.equal(formatNumber(NaN),'—');assert.equal(comparisonValues(data)['库存量'].same,null);assert.ok(Number.isNaN(comparisonValues(data)['库存量'].change));assert.ok(Number.isNaN(metricValues(data)['销售预算达成率']))});
test('产品替代视图不重复加总，并按同产品匹配对比期',()=>{
 const detailed={...data,sections:[...data.sections,{id:'orders-products',status:'ready',rows:[{base:'华东',category:'饼类',item:'休闲',material:'手抓饼',demand:100,shortage:10,invalid:0}]}]};
 assert.equal(metricValues(detailed)['订单满足率'],99);
 assert.equal(metricValues(detailed,{item:'休闲',material:'手抓饼'})['订单满足率'],90);
 assert.equal(comparisonValues(detailed,detailed,null,{item:'休闲'})['订单满足率'].change,0);
 detailed.sections.at(-1).status='error';
 assert.ok(Number.isNaN(metricValues(detailed,{item:'休闲'})['订单满足率']));
});
test('分类缺失时不把已匹配部分当作完整下钻数值',()=>{
 const partial={...data,sections:[{id:'stock',status:'ready',rows:[{base:'华东',category:'饼类',item:'休闲',inventory:100},{base:'华东',category:'饼类',item:null,inventory:20}]}]};
 assert.equal(metricValues(partial,{base:'华东'})['库存量'],0.012);
 assert.ok(Number.isNaN(metricValues(partial,{base:'华东',item:'休闲'})['库存量']));
});
test('同查询结果的重复渲染复用计算，刷新和身份清空重新计算',()=>{
 const read=createMetricReader(data,data,null);
 assert.strictEqual(read({base:'华东',category:'饼类'}),read({category:'饼类',base:'华东',item:undefined}));
 assert.deepEqual(read({base:'华东'}).__comparison,comparisonValues(data,data,null,{base:'华东'}));
 assert.equal(read({base:'华东'})['库存量'],2);
 const fresh={...data,sections:data.sections.map(s=>s.id==='stock'?{...s,rows:s.rows.map(r=>({...r,inventory:r.inventory*2}))}:s)};
 assert.equal(createMetricReader(fresh)({base:'华东'})['库存量'],4);
 assert.ok(Number.isNaN(createMetricReader(null)({base:'华东'})['库存量']));
});
await rm(dir,{recursive:true,force:true});

test('品类卡片使用品类汇总，不受失败的品项来源影响',()=>{
 const current={...data,sections:[{id:'orders',status:'ready',rows:[{category:'休闲',demand:1000,shortage:100,invalid:0}]},{id:'orders-products',status:'error',rows:[]}]};
 const values=createMetricReader(current)({category:'休闲'});
 assert.equal(values['订单满足率'],90);
 assert.equal(values['订单缺货量'],0.01);
 assert.ok(Number.isNaN(createMetricReader(current)({item:'休闲'})['订单满足率']));
});
test('品类卡片绑定与品类明细使用同一入口',async()=>{
 const {readFile}=await import('node:fs/promises');
 const source=await readFile(new URL('../../app/workbench-app.tsx',import.meta.url),'utf8');
 const card=source.slice(source.indexOf('<section id="category-operations"'),source.indexOf('<section id="base-dashboard"'));
 assert.match(card,/const values=categoryDrillMetrics\(item.name\)/);
 assert.doesNotMatch(card,/scopedLiveValues\(\{\.\.\.liveScope,item:item.name\}\)/);
});
