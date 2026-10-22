import test from 'node:test';
import assert from 'node:assert/strict';
import {computeOrderMetrics,lineQuantities,deadlineStatus,shanghaiTime,nodeMetrics,comparisonMetrics} from '../prototypes/inventory-orderfulfillment/order-metrics.mjs';
const line={executeorderno:'E1',executeorderlineno:'1',fromorderno:'F1',fromorderlineno:'L1',cust_order_no:'O1',cust_code:'C1',material_code:'M1',belong_base:'郑州',detailstatus:10,is_stat:1,prapare_order_status:'备单中',packingunitmain:'CS',packingunitconvertrate:8,order_qty:100,adjust_order_qty:80,qtyallocated:400,pack_unitqty:50,qtyshipped:160,delivery_qty:20,originalqtybak:100,lastbillingdate:'2026-10-22 16:00:00'};
test('EA conversion, demand-based rates and distinct quantity formulas',()=>{
 const q=lineQuantities(line);
 assert.equal(q.allocated,50);assert.equal(q.shipped,20);
 assert.equal(q.currentShort,50);assert.equal(q.rawShort,30);
 assert.equal(q.skuRate,50);assert.equal(q.allocationRate,62.5);
 assert.equal(lineQuantities({...line,pack_unitqty:49}).allocated,null);
 assert.equal(lineQuantities({...line,packingunitmain:null}).skuRate,null);
 assert.equal(lineQuantities({...line,pack_unitqty:110,qtyallocated:880}).skuRate,100);
 assert.equal(lineQuantities({...line,order_qty:0}).skuRate,null);
});
test('whole-order allocation is quantity weighted, not an average of SKU percentages',()=>{
 const result=computeOrderMetrics([line,{...line,executeorderlineno:'2',material_code:'M2',order_qty:300,adjust_order_qty:300,pack_unitqty:300,qtyallocated:2400}]);
 assert.equal(result.quantities[0].order_allocation_rate,87.5);
 assert.equal(result.quantities[1].order_allocation_rate,87.5);
 assert.equal(result.pendingAllocationRate,100*(380-30)/380);
});
test('duplicate execution keys and ambiguous split demand do not become partial totals',()=>{
 assert.equal(computeOrderMetrics([line,line]).pendingAllocationRate,null);
 assert.equal(computeOrderMetrics([line,line]).duplicateExecutionKeys,1);
 const repeatedDemand=computeOrderMetrics([line,{...line,executeorderno:'E2'}]);
 assert.equal(repeatedDemand.quantities[0].original_qty,100);
 assert.equal(repeatedDemand.quantities[0].allocated_qty,100);
 assert.equal(repeatedDemand.pendingAllocationRate,100);
 assert.equal(computeOrderMetrics([line,{...line,executeorderno:'E2',fromorderlineno:'L2'}]).pendingAllocationRate,null);
 const split=computeOrderMetrics([line,{...line,executeorderno:'E2',order_qty:200,adjust_order_qty:160}]);
 assert.equal(split.quantities[0].original_qty,null);
 assert.equal(split.pendingAllocationRate,null);
 assert.equal(computeOrderMetrics([{...line,detailstatus:20}]).pendingAllocationRate,null);
});
test('documented two-hour/night windows, exact deadlines and unknown timestamps',()=>{
 const at=text=>shanghaiTime(text);
 assert.equal(deadlineStatus('2026-10-22 16:00:00',at('2026-10-22 13:59:59')),'normal');
 assert.equal(deadlineStatus('2026-10-22 16:00:00',at('2026-10-22 14:00:00')),'warning');
 assert.equal(deadlineStatus('2026-10-22 16:00:00',at('2026-10-22 16:00:00')),'warning');
 assert.equal(deadlineStatus('2026-10-22 16:00:00',at('2026-10-22 16:00:01')),'overdue');
 assert.equal(deadlineStatus('2026-10-23 08:00:00',at('2026-10-22 14:00:00')),'warning');
 assert.equal(deadlineStatus(null,Date.now()),'unknown');
 assert.equal(shanghaiTime('2026-02-30 12:00:00'),null);
});
test('node deadlines use the documented fields and latest stage per order',()=>{
 const now=shanghaiTime('2026-10-22 15:00:00');
 const complete={...line,latestarrivaldate:'2026-10-22 14:00:00',latestsendcardate:'2026-10-22 16:00:00',requireddeliverytime:'2026-10-22 17:30:00'};
 const result=nodeMetrics([complete,{...complete,prapare_order_status:'已派未到'},
 {...complete,cust_order_no:'O2',prapare_order_status:'装车中'},
 {...complete,cust_order_no:'O3',prapare_order_status:'运输中'},
 {...complete,cust_order_no:'O4',prapare_order_status:'运输中',requireddeliverytime:null},
 {...complete,cust_order_no:'O5',prapare_order_status:'已发货'}],now);
 assert.equal(result.states.length,5);
 assert.equal(result.stages.allocation.total,0);
 assert.equal(result.stages.dispatch.overdue,1);
 assert.equal(result.stages.loading.warning,1);
 assert.equal(result.states.find(row=>row.order==='O3').status,'normal');
 assert.equal(result.unknown,2);
 assert.equal(result.overdue,1);
});
test('base/province comparisons use complete quantities and disjoint order buckets, preserving missing shortage coverage',()=>{
 const rows=[{...line,province_region_name:'河南',sales_person:null},
 {...line,executeorderlineno:'2',material_code:'M2',order_qty:300,adjust_order_qty:300,pack_unitqty:300,qtyallocated:2400,province_region_name:'河南'},
 {...line,executeorderno:'E2',cust_order_no:'O2',province_region_name:'河南',order_qty:100,adjust_order_qty:null},
 {...line,executeorderno:'E3',cust_order_no:'VOID',detailstatus:20,province_region_name:'河南'}];
 const [base]=comparisonMetrics(rows,'belong_base',[{execution_order:'E1',sku:'M1',source_rows:1,after_inventory_short_qty:12}]);
 assert.equal(base.source_orders,2);assert.equal(base.source_order_count,3);
 assert.equal(base.preparing,2);assert.equal(base.rate_coverage,2);
 assert.deepEqual(base.buckets,[1,0,1,0,0]);
 assert.equal(base.allocation_rate,80);
 assert.equal(base.shortage_qty,12);assert.equal(base.shortage_coverage,1);assert.equal(base.shortage_total,3);
 assert.equal(comparisonMetrics(rows,'province_region_name',null)[0].shortage_qty,null);
 assert.equal(comparisonMetrics([{...line,packingunitmain:null}],'belong_base')[0].allocation_rate,null);
 const partial=comparisonMetrics([line,{...line,executeorderno:'E2',cust_order_no:'O2',order_qty:null}],'belong_base')[0];
 assert.equal(partial.rate_total,2);assert.equal(partial.rate_coverage,1);
 assert.equal(partial.buckets.reduce((sum,count)=>sum+count,0),1);
 assert.equal(partial.allocation_rate,null);
 const withVoidSku=comparisonMetrics([line,{...line,executeorderlineno:'VOID',material_code:'VOID',detailstatus:20,order_qty:null}],'belong_base')[0];
 assert.equal(withVoidSku.allocation_rate,50);
 assert.equal(withVoidSku.rate_coverage,1);
});
