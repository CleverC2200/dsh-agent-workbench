import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundle = await build({
  stdin: {
    contents:
      "export * from './src/workbench/original/workbenches/regionalApproval/models/salesPlanSkuReviewModel.ts';export * from './src/workbench/original/workbenches/regionalApproval/models/salesPlanQuantityModel.ts';export * from './src/workbench/original/workbenches/regionalApproval/models/salesPlanLocalDraftModel.ts';export * from './src/workbench/original/workbenches/regionalApproval/models/salesPlanGroupAllocationModel.ts';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const m = await import(
  'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].contents).toString('base64')
);
const source = (customer, version, quantity, budget, shipment) => {
  const skus = [
    {
      skuCode: '1001',
      versionId: version,
      productCategName: '水饺',
      materialDescription: '测试水饺',
      qty: quantity,
      baseQty: '10',
      amtBase: '12.30',
      amt: budget,
      price: '2.5',
    },
  ];
  return {
    plan: {
      planId: version,
      versionId: version,
      dealerCode: customer,
      skuCount: 1,
      status: 2,
      planTypeCode: 'Y',
      orderType: 'M',
    },
    skus,
    metrics: {
      versionId: version,
      months: ['2025-11', '2026-09', '2026-10'],
      rows: [{ skuCode: '1001', shipments: [shipment, '0', '7'] }],
    },
  };
};

test('monthly quantities round exactly without floating point loss and months roll across years', () => {
  assert.equal(m.roundPlanQuantity('501.000'), '501');
  assert.equal(m.roundPlanQuantity('501.600'), '502');
  assert.equal(m.roundPlanQuantity('501.499'), '501');
  assert.equal(m.roundPlanQuantity('999999999999999.999'), '1000000000000000');
  assert.deepEqual(m.skuReviewMonths('2026-11'), ['2025-11', '2026-09', '2026-10']);
  assert.deepEqual(m.skuReviewMonths('2027-01'), ['2026-01', '2026-11', '2026-12']);
});

test('summary combines customer SKU budgets, computes confirmed amounts from rounded pieces and retains unknowns', () => {
  const rows = m.summarizeSkuReview(
    [source('a', 'v1', '501.600', '100.10', '20'), source('b', 'v2', '10.400', '200.20', '30')],
    'region',
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].budgetAmount, '300.30');
  assert.equal(Number(rows[0].confirmedQty), 512);
  assert.equal(Number(rows[0].confirmedAmount), 1280);
  assert.deepEqual(rows[0].shipments.map(Number), [50, 0, 14]);
  const unknown = m.summarizeSkuReview([
    source('a', 'v1', '1', '100', null),
    source('b', 'v2', '2', '0', '0'),
  ]);
  assert.equal(Number(unknown[0].budgetAmount), 100);
  assert.equal(unknown[0].shipments[0], null);
  assert.equal(Number(unknown[0].shipments[1]), 0);
});

test('multiple plans for one customer sum plans but count historical facts once', () => {
  const rows = m.summarizeSkuReview([
    source('a', 'v1', '1', '100', '20'),
    source('a', 'v2', '2', '100', '20'),
  ]);
  assert.equal(Number(rows[0].confirmedQty), 3);
  assert.equal(Number(rows[0].budgetAmount), 200);
  assert.equal(Number(rows[0].shipments[0]), 20);
  assert.throws(
    () =>
      m.summarizeSkuReview([
        source('a', 'v1', '1', '100', '20'),
        source('a', 'v1', '2', '100', '20'),
      ]),
    /INCOMPLETE/,
  );
});

test('whole piece group allocation preserves its rounded total without changing correction allocation', () => {
  const sources = [
    source('a', 'v1', '1', '0', '0'),
    source('b', 'v2', '1', '0', '0'),
    source('c', 'v3', '1', '0', '0'),
  ];
  const result = m.allocateGroupSkuQuantity(sources, '1001', '10.600', 'region');
  assert.equal(
    Object.values(result).reduce((total, value) => total + Number(value['1001']), 0),
    11,
  );
  assert.ok(Object.values(result).every((value) => /^\d+$/.test(value['1001'])));
  for (const item of sources) item.plan.orderType = 'Z';
  const correction = m.allocateGroupSkuQuantity(sources, '1001', '1', 'region');
  assert.deepEqual(
    Object.values(correction).map((value) => value['1001']),
    ['0', '0', '0'],
  );
});

test('approval rounds stored and untouched monthly quantities before creating exact deltas', () => {
  const row = { status: 2, planTypeCode: 'Y', orderType: 'M' };
  const detail = {
    currentVersion: { orderType: 'M' },
    skus: [
      { skuCode: '1001', qty: '501.600' },
      { skuCode: '1002', qty: '2.400' },
    ],
  };
  const values = m.salesPlanApprovalDraftValues(detail, row, 'region', [], {});
  assert.equal(Number(values['1001']), 0.4);
  assert.equal(Number(values['1002']), -0.4);
  const restored = m.salesPlanApprovalDraftValues(
    detail,
    row,
    'region',
    [{ skuCode: '1001', adjustQty: '1' }],
    {},
  );
  assert.equal(Number(restored['1001']), 1.4);
  assert.deepEqual(
    m.salesPlanApprovalDraftValues(detail, { ...row, orderType: 'Z' }, 'region', [], {}),
    {},
  );
});
