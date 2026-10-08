import {fileURLToPath} from 'node:url';
import test from 'node:test';import assert from 'node:assert/strict';import {build} from './public-build.mjs';
const r=await build({entryPoints:[fileURLToPath(new URL('../../app/data/page-analysis.ts',import.meta.url))],bundle:true,platform:'node',format:'esm',write:false});
const {summarizePage,pageAnalysisPolicy}=await import('data:text/javascript;base64,'+Buffer.from(r.outputFiles[0].text).toString('base64'));
const data=sections=>({start:'2026-09-01',end:'2026-09-23',granularity:'month',sections});
test('partial failure analyzes available inventory without inventing order conclusions',()=>{
 const result=summarizePage(data([{id:'stock',status:'ready',rows:[{inventory:10000}]},{id:'orders',status:'error',rows:[{demand:100,shortage:10,invalid:0}]}]),true);
 assert.match(result.copy,/库存量1万件/);assert.match(result.title,/结合需求评估/);
 assert.doesNotMatch(result.title+result.copy,/90%|缺货明细|GEA_|SQL|暂不可用|仍在加载|不推断/);
});
test('available shortage produces a conclusion during loading',()=>{
 const result=summarizePage(data([{id:'stock',status:'ready',rows:[{inventory:3778300}]},{id:'orders',status:'ready',rows:[{demand:1000000,shortage:65100,invalid:0}]}]),true);
 assert.match(result.title,/订单仍有缺口/);assert.match(result.copy,/订单满足率93.49%/);assert.match(result.copy,/订单缺货量6.51万件/);assert.match(result.copy,/核对缺货品项/);
 assert.doesNotMatch(result.copy,/库存过高|库存充足|下降|上涨|仍在加载|不推断/);
});
test('zero shortage is valid data',()=>{
 const result=summarizePage(data([{id:'orders',status:'ready',rows:[{demand:100,shortage:0,invalid:0}]}]));
 assert.match(result.title,/当前订单无缺货/);assert.match(result.copy,/订单满足率100%/);assert.doesNotMatch(result.copy,/补产/);
});
test('no data never invents conclusions and analysis forbids extra reads',()=>{
 assert.match(summarizePage(null).title,/暂无/);assert.equal(pageAnalysisPolicy.allowAdditionalQueries,false);assert.equal(pageAnalysisPolicy.allowAutomaticRefresh,false);
});
test('销售页面只分析本页指标，不借用其他页面订单结论',()=>{
 const input=data([{id:'orders',status:'ready',rows:[{demand:100,shortage:20,invalid:0}]},{id:'finance',status:'ready',rows:[{month:'202609',actual:100000,invalid:0}]},{id:'sales-budget',status:'ready',rows:[{month:'202609',budget:200000,invalid:0}]}]);
 const result=summarizePage(input,true,['未税销售额','销售预算达成率']);
 assert.match(result.title,/销售预算已完成50%/);assert.match(result.copy,/未税销售额10万元/);assert.doesNotMatch(result.title+result.copy,/订单|缺货|库存/);
});
test('当前页面指标全部缺失时不借其他指标生成判断',()=>{
 const input=data([{id:'stock',status:'ready',rows:[{inventory:10000}]}]);
 assert.match(summarizePage(input,false,['销售预算达成率']).title,/暂无可分析/);
});
