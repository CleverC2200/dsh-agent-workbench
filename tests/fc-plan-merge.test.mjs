import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const built = await build({
  entryPoints: ['business/shared/fc-plan-merge.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
const { mergeFcPlans } = await import(
  'data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64')
);
const row = {
  warehouseCode: '001',
  warehouseName: '分仓',
  sku: 'SKU1',
  productName: '产品',
  month: '2026-10',
  outboundQty: 10,
  transferQty: 2,
};
test('partial imports preserve other SKUs, months and warehouses; explicit zero replaces existing plan', () => {
  const old = [
    row,
    { ...row, sku: 'SKU2' },
    { ...row, month: '2026-11' },
    { ...row, warehouseCode: '002' },
  ];
  const copy = structuredClone(old);
  const merged = mergeFcPlans(old, [{ ...row, outboundQty: 0, transferQty: 0 }]);
  assert.equal(merged.length, 4);
  assert.equal(
    merged.find((x) => x.warehouseCode === '001' && x.month === '2026-10' && x.sku === 'SKU1')
      .outboundQty,
    0,
  );
  assert.deepEqual(
    merged
      .filter((x) => !(x.warehouseCode === '001' && x.month === '2026-10' && x.sku === 'SKU1'))
      .map((x) => x.outboundQty),
    [10, 10, 10],
  );
  assert.deepEqual(old, copy);
  assert.deepEqual(mergeFcPlans(merged, [{ ...row, outboundQty: 0, transferQty: 0 }]), merged);
});
test('warehouse leading zeros remain distinct and empty import does not clear plans', () => {
  const old = [row, { ...row, warehouseCode: '1' }];
  assert.equal(mergeFcPlans(old, []).length, 2);
  assert.equal(
    mergeFcPlans(old, [{ ...row, warehouseCode: '1', outboundQty: 30 }]).find(
      (x) => x.warehouseCode === '001',
    ).outboundQty,
    10,
  );
});
