import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const result=await build({stdin:{contents:"export * from 'dsh-agent-manage/inventory-compute/dealer-order'",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'cjs',platform:'node'});
const mod={exports:{}};Function('module','exports',result.outputFiles[0].text)(mod,mod.exports);
test('public Manage policy calculator retains customer SKU pickup and date constraints',()=>{
const policies=[{id:'yes',customerCode:'C',start:'2026-10-07',end:'2026-10-07',verifiedPickupCodes:['P'],scopes:[{productCode:'S',pickupCode:'P'}]},
{id:'bad-customer',customerCode:'D',verifiedPickupCodes:['P'],scopes:[{productCode:'S',pickupCode:'P'}]}];
assert.deepEqual(mod.exports.applicablePolicies(policies,'C','S','P',new Date('2026-10-07T00:00:00Z')).map(p=>p.id),['yes']);
assert.deepEqual(mod.exports.applicablePolicies(policies,'C','S','',new Date('2026-10-07T00:00:00Z')),[]);
assert.deepEqual(mod.exports.orderTotals([{quantity:2,unitPrice:0},{quantity:3,unitPrice:4}]),{count:2,quantity:5,amount:12});
assert.equal(mod.exports.orderTotals([{quantity:2,unitPrice:null}]).amount,null);
});
