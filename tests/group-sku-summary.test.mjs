import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const { outputFiles } = await build({
  stdin: {
    resolveDir: process.cwd(),
    contents: `export { summarizeGroupSkus } from './src/workbench/original/workbenches/regionalApproval/models/salesPlanGroupSkuModel.ts';
export { allocateGroupSkuQuantity } from './src/workbench/original/workbenches/regionalApproval/models/salesPlanGroupAllocationModel.ts';`,
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { summarizeGroupSkus, allocateGroupSkuQuantity } = await import(
  'data:text/javascript;base64,' + Buffer.from(outputFiles[0].contents).toString('base64')
);

const plan = (planId, versionId, skuCount = 1) => ({
  planId,
  versionId,
  skuCount,
  status: 1,
  planTypeCode: 'Y',
});
const sku = (versionId, qty, price) => ({
  id: `id-${versionId}`,
  skuCode: '1001',
  versionId,
  productCategName: '汤圆',
  materialDescription: '黑芝麻汤圆',
  baseQty: '1',
  qty,
  amtBase: price,
  price,
});

test('同一 SKU 跨计划按各自单价精确汇总，待确认数量同步计入', () => {
  const sources = [
    { plan: plan('p1', 'v1'), skus: [sku('v1', '2', '10')] },
    { plan: plan('p2', 'v2'), skus: [sku('v2', '3', '12')] },
  ];
  assert.deepEqual(summarizeGroupSkus(sources), [
    {
      skuCode: '1001',
      categoryName: '汤圆',
      description: '黑芝麻汤圆',
      baseQty: '2',
      qty: '5',
      baseAmount: '22',
      amount: '56.00',
    },
  ]);
  assert.equal(summarizeGroupSkus(sources, undefined, { p1: { 1001: '4' } })[0].amount, '76.00');
});

test('任一版本 SKU 不完整或串入其他版本时拒绝显示部分合计', () => {
  assert.throws(() =>
    summarizeGroupSkus([{ plan: plan('p1', 'v1', 2), skus: [sku('v1', '2', '10')] }]),
  );
  assert.throws(() =>
    summarizeGroupSkus([{ plan: plan('p1', 'v1'), skus: [sku('v2', '2', '10')] }]),
  );
});

test('按原确认数量比例分摊，同 SKU 的金额按各计划自己的单价计算', () => {
  const sources = [
    { plan: plan('p1', 'v1'), skus: [sku('v1', '2', '10')] },
    { plan: plan('p2', 'v2'), skus: [sku('v2', '3', '12')] },
  ];
  const values = allocateGroupSkuQuantity(sources, '1001', '10');
  assert.deepEqual(values, { p1: { 1001: '4' }, p2: { 1001: '6' } });
  assert.equal(summarizeGroupSkus(sources, undefined, values)[0].amount, '112.00');
});

test('三位小数尾差确定分配且不受组织成员顺序影响', () => {
  const sources = ['p3', 'p1', 'p2'].map((id) => ({
    plan: plan(id, id),
    skus: [sku(id, '1', '10')],
  }));
  const expected = { p1: { 1001: '0.334' }, p2: { 1001: '0.333' }, p3: { 1001: '0.333' } };
  assert.deepEqual(allocateGroupSkuQuantity(sources, '1001', '1'), expected);
  assert.deepEqual(allocateGroupSkuQuantity(sources.toReversed(), '1001', '1'), expected);
});

test('使用本节点原确认量作为权重，只分摊包含目标 SKU 的计划', () => {
  const sources = [
    { plan: plan('p1', 'v1'), skus: [{ ...sku('v1', '10', '10'), regionConfirmedQty: '2' }] },
    { plan: plan('p2', 'v2'), skus: [{ ...sku('v2', '10', '12'), regionConfirmedQty: '3' }] },
    { plan: plan('p3', 'v3'), skus: [{ ...sku('v3', '10', '8'), skuCode: '1002' }] },
  ];
  assert.deepEqual(allocateGroupSkuQuantity(sources, '1001', '10', 'region'), {
    p1: { 1001: '4' },
    p2: { 1001: '6' },
  });
});

test('原数量全零时平均分摊，拒绝负数、超精度与无归属 SKU', () => {
  const sources = ['p1', 'p2'].map((id) => ({ plan: plan(id, id), skus: [sku(id, '0', '10')] }));
  assert.deepEqual(allocateGroupSkuQuantity(sources, '1001', '1.001'), {
    p1: { 1001: '0.501' },
    p2: { 1001: '0.5' },
  });
  for (const value of ['-1', '1.0001', '', 'NaN'])
    assert.throws(() => allocateGroupSkuQuantity(sources, '1001', value));
  assert.throws(() => allocateGroupSkuQuantity(sources, 'missing', '1'));
});
