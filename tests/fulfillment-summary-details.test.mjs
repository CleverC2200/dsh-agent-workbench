import test from 'node:test';
import assert from 'node:assert/strict';
import { summaryDetails } from '../prototypes/inventory-orderfulfillment/summary-details.mjs';
const row=(order,qty,short,stage)=>({order_no:order,customer_code:'C',sku:'S',base:'B',valid_rows:1,original_qty:qty,source_short_qty:short,business_stage:stage});
const facts=rows=>rows.map((row,index)=>({cust_order_no:row.order_no,cust_code:'C',material_code:'S',belong_base:'B',executeorderno:'E'+index,executeorderlineno:1,adjust_order_qty:row.original_qty,detailstatus:10,is_stat:'1',packingunitconvertrate:12}));
test('summary quantities convert units and rates weight demand across opened and pending orders',()=>{
 const rows=[row('A',10,2,'备单中'),row('B',90,9,'已开未派')];const result=summaryDetails({quantities:rows,duplicateExecutionKeys:0,pendingAllocationRate:80,nodes:{states:[{order:'A',status:'overdue',stage:'allocation'}]}},facts(rows));
 assert.equal(result.pending,120);assert.equal(result.opened,1080);assert.equal(result.total,1200);assert.equal(result.totalRate,89);assert.equal(result.openedRate,90);assert.equal(result.stateQuantity('overdue','allocation'),120);
});
test('summary preserves missing quantity conversion, duplicate and missing demand as unknown',()=>{
 const rows=[row('A',null,null,'备单中')],computed={quantities:rows,duplicateExecutionKeys:0,nodes:{states:[]}};
 assert.equal(summaryDetails(computed,facts(rows)).total,null);assert.equal(summaryDetails(computed,facts(rows)).totalRate,null);
 const complete=[row('A',10,1,'备单中')];assert.equal(summaryDetails({...computed,quantities:complete},[]).total,null);
 assert.equal(summaryDetails({...computed,quantities:complete,duplicateExecutionKeys:1},facts(complete)).total,null);
});

test('current quantities remain available when original demand is absent',()=>{
 const rows=[row('A',null,null,'备单中')];const lines=facts(rows);lines[0].adjust_order_qty=25;
 const result=summaryDetails({quantities:rows,duplicateExecutionKeys:0,nodes:{states:[]}},lines);assert.equal(result.pending,300);assert.equal(result.totalRate,null);
});

test('partial satisfaction uses covered demand only and reports separate coverage',()=>{
 const rows=[row('A',10,2,'备单中'),row('B',null,null,'备单中'),row('C',90,9,'已开未派'),row('D',0,0,'已开未派')];
 const result=summaryDetails({quantities:rows,duplicateExecutionKeys:0,nodes:{states:[]}},facts(rows));
 assert.equal(result.pendingRate,80);assert.equal(result.openedRate,90);assert.equal(result.totalRate,89);
 assert.deepEqual(result.rateCoverage.pending,{value:80,covered:1,total:2});
 assert.equal(result.rateCoverage.opened.covered,1);assert.equal(result.rateCoverage.opened.total,2);
 assert.equal(result.rateCoverage.total.covered,2);assert.equal(result.rateCoverage.total.total,4);
});
