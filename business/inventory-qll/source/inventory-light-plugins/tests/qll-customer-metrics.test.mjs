import {fileURLToPath} from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const built=await build({entryPoints:[fileURLToPath(new URL('../src/qll-customer-metrics.ts',import.meta.url))],bundle:true,platform:'node',format:'esm',write:false});
const {customerMetrics}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
const fixture=(rows,planCustomerTotal=360)=>({structure:rows.map(row=>({layer:'customer',...row})),kpis:{inventoryLevel:{companyCurrent:640,observedTotal:1000,planCustomerTotal}},agingDetails:[{layer:'customer',values:{averageAgeDays:44}}],aging:{over30ByLayer:{customer:260}},customerObservationRisks:[{}]});
test('customer metrics aggregate demand instead of averaging turnover and use batch age summary',()=>{
 const result=customerMetrics(fixture([{currentQty:100,turnoverDemand30d:300},{currentQty:200,turnoverDemand30d:150}]));
 assert.equal(result.inventory,360);assert.equal(result.share,null);assert.equal(result.turnover,20);assert.equal(result.averageAge,44);assert.equal(result.over30,260);assert.equal(result.reviewCount,1);
});
test('partial demand cannot produce a customer-wide turnover; zero inventory remains zero',()=>{
 assert.equal(customerMetrics(fixture([{currentQty:100,turnoverDemand30d:300},{currentQty:200,turnoverDemand30d:null}])).turnover,null);
 const zero=customerMetrics(fixture([{currentQty:0,turnoverDemand30d:300}],0));assert.equal(zero.inventory,0);assert.equal(zero.turnover,0);
 assert.equal(customerMetrics(fixture([],null)).inventory,null);
});
