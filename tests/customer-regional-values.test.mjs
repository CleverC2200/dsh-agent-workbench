import test from 'node:test';
import assert from 'node:assert/strict';
import { customerRegionalValues } from '../prototypes/inventory-customer/regional-values.js';
import { compressForModel } from '../src/page-interaction/shared/payload-budget.ts';

test('regional partitions close to the known card value and preserve unknown coverage', () => {
  const rows = [
    {code:'a',region:'东',province:'甲',value:2},
    {code:'b',region:'东',province:'乙',value:null},
    {code:'c',region:'西',province:'丙',value:0},
    {code:'outside',region:'西',value:100},
  ];
  const result = customerRegionalValues(rows, ['a','b','c']);
  for (const partition of Object.values(result)) {
    assert.equal(partition.knownValueTotal,2);
    assert.equal(partition.customerCount,3);
    assert.equal(partition.missingCount,1);
    assert.equal(Object.values(partition.groupsByName).reduce((sum,g)=>sum+(g.knownValue??0),0),2);
  }
  assert.equal(result.province.groupsByName['乙'].knownValue,null);
  assert.equal(result.region.groupsByName['西'].knownValue,0);
  assert.deepEqual(customerRegionalValues(rows,[]).region.groupsByName,{});
});

test('more than three regional groups survive ordinary page context projection', () => {
  const rows = Array.from({length: 9},(_,i)=>({code:String(i),region:`大区${i}`,value:i}));
  const region = customerRegionalValues(rows, rows.map(r=>r.code)).region;
  const context = JSON.parse(compressForModel({regionalInventoryValues:region},{focus:'regionalInventoryValues'}).json);
  assert.equal(context.regionalInventoryValues.groupCount,9);
  assert.equal(Object.keys(context.regionalInventoryValues.groupsByName).length,9);
  assert.equal(context.regionalInventoryValues.knownValueTotal,36);
});
