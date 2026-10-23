import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const { outputFiles } = await build({
  stdin: {
    contents: [
      "export * from './src/workbench/original/workbenches/regionalApproval/regionalApprovalQueryModel.ts';",
      "export * from './src/workbench/original/workbenches/regionalApproval/models/salesPlanAdjustmentModel.ts';",
    ].join('\n'),
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const m = await import(
  'data:text/javascript;base64,' + Buffer.from(outputFiles[0].contents).toString('base64')
);
test('V1.6 organization totals include targets and derived monthly plans from every child', () => {
  const row = {
    planId: 'p',
    versionId: 'v',
    orgCode: 'org',
    dealerCode: 'd',
    status: 1,
    skuCount: 1,
    mPlanQty: '1.5',
    mPlanAmount: '10.25',
    currentQty: '2',
    currentAmount: '20',
    targetQty: '4',
    targetAmount: '40',
  };
  const [{ summary }] = m.groupRegionalApprovalLiveRows(
    [
      m.toRegionalApprovalLiveRow(row),
      m.toRegionalApprovalLiveRow({ ...row, planId: 'p2', versionId: 'v2' }),
    ],
    'region',
  );
  assert.equal(summary.targetQty, '8');
  assert.equal(summary.mPlanQty, '3.0');
  assert.equal(summary.mPlanAmount, '20.50');
  assert.deepEqual(m.regionalApprovalLiveProgress(summary), { amount: 50, quantity: 50 });
});

test('V1.6 derives monthly plan totals from SKU base values without rounding', () => {
  const categories = m.aggregateRegionalApprovalLiveCategories([
    {
      versionId: 'v',
      skuCode: '1',
      productCategName: '汤圆',
      baseQty: '10.125',
      amtBase: '100.01',
      qty: '20',
      amt: '200',
    },
    {
      versionId: 'v',
      skuCode: '2',
      productCategName: '汤圆',
      baseQty: '0.875',
      amtBase: '0.99',
      qty: '1',
      amt: '10',
    },
  ]);
  assert.deepEqual(
    { quantity: categories[0].baseQuantity, amount: categories[0].baseAmount },
    { quantity: '11.000', amount: '101.00' },
  );
});

test('nullable customer reads retain unknown identity and keep separate plans out of the same customer group', () => {
  const row = {
    planId: 'p1',
    versionId: 'v1',
    periodId: 'period',
    dealerCode: null,
    dealerName: null,
    status: 1,
    skuCount: 1,
    currentQty: '2',
    currentAmount: '20',
    targetQty: '4',
    targetAmount: '40',
    shipQty: '1',
    shipAmount: '10',
    orgCode: 'org',
  };
  const first = m.toRegionalApprovalLiveRow(row);
  const second = m.toRegionalApprovalLiveRow({ ...row, planId: 'p2', versionId: 'v2' });
  assert.deepEqual(m.projectRegionalApprovalLiveDimension(first, 'customer'), {
    name: undefined,
    context: [],
  });
  assert.equal(first.dealerCode, null);
  const groups = m.groupRegionalApprovalLiveRows(
    [
      { ...first, dealerName: 'same display name' },
      { ...second, dealerName: 'same display name' },
    ],
    'customer',
  );
  assert.deepEqual(
    groups.map((group) => group.members.map((item) => item.planId)),
    [['p1'], ['p2']],
  );
  const [{ summary }] = m.groupRegionalApprovalLiveRows([first, second], 'region');
  assert.equal(summary.shipAmount, '20');
  assert.equal(summary.shipQty, '2');
  const [{ summary: missingShipment }] = m.groupRegionalApprovalLiveRows(
    [first, { ...second, shipQty: null, shipAmount: null }],
    'region',
  );
  assert.equal(missingShipment.shipQty, undefined);
  assert.equal(missingShipment.shipAmount, undefined);
});

test('customer adjustments scope missing customer identifiers by plan and never distribute one plan into another', () => {
  const first = m.toRegionalApprovalLiveRow({
    planId: 'p1',
    versionId: 'v1',
    dealerCode: null,
    status: 1,
  });
  const second = m.toRegionalApprovalLiveRow({
    planId: 'p2',
    versionId: 'v2',
    dealerCode: undefined,
    status: 1,
  });
  assert.deepEqual(m.adjustmentScopeRows([first, second], first, 'customer'), [first]);
  const records = m.createSalesPlanAdjustmentRecords(
    [first, second].map((plan) => ({
      plan,
      skus: [
        {
          versionId: plan.versionId,
          skuCode: '789',
          productCategName: 'category',
          baseQty: '1',
          qty: '2',
          price: '10',
          amtBase: '10',
          amt: '20',
        },
      ],
    })),
  );
  const groups = m.groupSalesPlanAdjustmentRecords(records, 'customer');
  assert.equal(groups.length, 2);
  assert.deepEqual(
    groups.map((group) => group.records.map((record) => record.plan.planId)),
    [['p1'], ['p2']],
  );
  const changed = m.updateCustomerQuantity(records, groups[0], 5);
  assert.deepEqual(
    changed.map((record) => record.qty),
    ['5', '2'],
  );
  assert.equal(changed[0].plan.dealerCode, null);
  assert.equal(changed[1].plan.dealerCode, undefined);
  const identified = records.map((record) => ({
    ...record,
    plan: { ...record.plan, dealerCode: '456' },
  }));
  assert.equal(
    m.adjustmentScopeRows(
      identified.map((record) => record.plan),
      identified[0].plan,
      'customer',
    ).length,
    2,
  );
  assert.equal(m.groupSalesPlanAdjustmentRecords(identified, 'customer')[0].records.length, 2);
});
