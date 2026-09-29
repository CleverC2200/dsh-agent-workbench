import test from 'node:test';
import assert from 'node:assert/strict';
import {forecastCoverage, parseActualQuantity, dmsWorkbookRows} from '../src/fc-feedback.ts';
const snapshot = rows => ({inventory:rows.map(r=>({sku:r.sku})),replenishments:rows});
test('forecast aggregates matched SKU inventory and demand, not average of ratios',()=>{
 const value=forecastCoverage(snapshot([{sku:'a',inventoryQty:100,forecastDailyShipment:10},{sku:'b',inventoryQty:900,forecastDailyShipment:30}]));
 assert.deepEqual(value,{value:25,known:2,total:2,partial:false});
});
test('missing forecast is excluded from both sums and remains explicitly partial',()=>{
 const value=forecastCoverage({...snapshot([{sku:'a',inventoryQty:100,forecastDailyShipment:10},{sku:'b',inventoryQty:900,forecastDailyShipment:null}]),inventory:[{sku:'a'},{sku:'b'},{sku:'c'}]});
 assert.deepEqual(value,{value:10,known:1,total:3,partial:true});
 assert.equal(forecastCoverage(snapshot([{sku:'a',inventoryQty:100,forecastDailyShipment:0}])).value,null);
 assert.equal(forecastCoverage(snapshot([])).value,null);
});
test('clearing input is not zero; invalid and fractional quantities are not committed',()=>{
 for(const text of ['', '-1', '1.5','NaN','Infinity','9007199254740992'])assert.equal(parseActualQuantity(text),null);
 assert.equal(parseActualQuantity('0'),0);assert.equal(parseActualQuantity('85'),85);assert.equal(parseActualQuantity('085'),85);
});
test('DMS workbook preserves product code text and quantity in second column',()=>{
 assert.deepEqual(dmsWorkbookRows([{sku:'0012',quantity:85,productName:'测试商品'}]),[['商品编码','数量','商品名称'],['0012',85,'测试商品']]);
});
