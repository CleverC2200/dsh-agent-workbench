import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const out = await build({
  stdin: { resolveDir: process.cwd(), contents: "export * from './src/sales-plan.ts'" },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const m = await import(
  'data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].contents).toString('base64')
);
const row = { planId: 'p', versionId: 'v', status: 2, planTypeCode: 'Y', orderType: 'M' };
const sku = {
  skuCode: '1001',
  versionId: 'v',
  qty: '90',
  amt: '180',
  price: '2',
  regionConfirmedQty: '100',
  regionConfirmedAmount: '200',
  provinceConfirmedQty: '120',
  provinceConfirmedAmount: '240',
};
const detail = {
  currentVersion: { id: 'v', planId: 'p', status: 2, effective: true },
  skus: [sku],
};
const context = { versionId: 'v', status: 2, currentStage: 3, targetStage: 2, targetStatus: 7 };
test('pending approval derives the receiving stage from existing detail', () => {
  for (const [status, role] of [
    [1, 'region'],
    [2, 'province'],
    [2, 'area'],
    [4, 'category'],
  ]) {
    const result = m.salesPlanReturnDestination(
      { ...detail, currentVersion: { ...detail.currentVersion, status } },
      role,
    );
    assert.equal(result.targetStage, status);
    assert.equal(result.targetStatus, status + 5);
  }
});
const returnedDetail = (status, logs = []) => ({
  ...detail,
  currentVersion: { ...detail.currentVersion, status },
  logs: logs.map((log) => ({ planId: 'p', versionId: 'v', ...log })),
});
test('continued returns use the same version history, including skipped approval stages', () => {
  for (const [status, role, previous] of [
    [7, 'region', 1],
    [8, 'province', 2],
    [8, 'province', 1],
    [9, 'area', 3],
    [9, 'area', 2],
    [9, 'area', 1],
  ]) {
    const d = returnedDetail(status, [
      { actionCode: 'APPROVE', fromStatus: previous, toStatus: status - 5 },
    ]);
    assert.equal(m.salesPlanReturnDestination(d, role).targetStage, previous);
    assert.equal(m.salesPlanReturnDestination(d, role).targetStatus, previous + 5);
  }
  assert.equal(m.salesPlanReturnDestination(returnedDetail(7), 'region').targetStage, 1);
  const priorReturn = returnedDetail(9, [{ actionCode: 'REJECT', fromStatus: 9, toStatus: 7 }]);
  assert.equal(m.salesPlanReturnDestination(priorReturn, 'area').targetStage, 2);
});
test('only the same plan and version history can determine the destination', () => {
  const oldVersion = returnedDetail(9, [
    { versionId: 'old', actionCode: 'APPROVE', fromStatus: 3, toStatus: 4 },
    { planId: 'other', actionCode: 'APPROVE', fromStatus: 3, toStatus: 4 },
    { actionCode: 'APPROVE', fromStatus: 2, toStatus: 4 },
  ]);
  assert.equal(m.salesPlanReturnDestination(oldVersion, 'area').targetStage, 2);
});
test('missing, inconsistent or malformed destinations never guess from current configuration', () => {
  for (const d of [
    returnedDetail(9),
    returnedDetail(9, [
      { actionCode: 'APPROVE', fromStatus: 2, toStatus: 4 },
      { actionCode: 'APPROVE', fromStatus: 3, toStatus: 4 },
    ]),
    ...[0, 4, 2.5, '2'].map((fromStatus) =>
      returnedDetail(9, [{ actionCode: 'APPROVE', fromStatus, toStatus: 4 }]),
    ),
  ])
    assert.throws(() => m.salesPlanReturnDestination(d, 'area'), /实际退回节点/);
  for (const status of [0, 5, 6, 8, 10])
    assert.throws(() => m.salesPlanReturnDestination(returnedDetail(status), 'area'));
});
test('return transfers the visible final quantity using the receiving node baseline', () => {
  assert.deepEqual(
    m.salesPlanReturnAdjustments(
      detail,
      row,
      'province',
      context,
      [{ skuCode: '1001', adjustQty: '-5' }],
      { 1001: '110' },
    ),
    [{ skuCode: '1001', adjustQty: '10' }],
  );
  assert.deepEqual(
    m.salesPlanReturnAdjustments(detail, row, 'province', context, [
      { skuCode: '1001', adjustQty: '-5' },
    ]),
    [{ skuCode: '1001', adjustQty: '15' }],
  );
  assert.deepEqual(m.salesPlanReturnAdjustments(detail, row, 'province', context), [
    { skuCode: '1001', adjustQty: '20' },
  ]);
});
test('zero is explicit and an empty receiving node falls back to the nearest earlier quantity', () => {
  assert.deepEqual(
    m.salesPlanReturnAdjustments(detail, row, 'province', context, [], { 1001: '100' }),
    [{ skuCode: '1001', adjustQty: '0' }],
  );
  const missing = { ...detail, skus: [{ ...sku, regionConfirmedQty: null }] };
  assert.equal(
    m.salesPlanReturnAdjustments(missing, row, 'province', context, [], { 1001: '110' })[0]
      .adjustQty,
    '20',
  );
});
test('a skipped province uses the actual frozen destination and M/Z preserve their quantity policies', () => {
  const r = { ...row, status: 9 };
  const d = {
    ...detail,
    currentVersion: { ...detail.currentVersion, status: 9 },
    skus: [{ ...sku, areaConfirmedQty: '140' }],
  };
  const c = { ...context, status: 9, currentStage: 4 };
  assert.equal(
    m.salesPlanReturnAdjustments(d, r, 'area', c, [], { 1001: '110.600' })[0].adjustQty,
    '11',
  );
  assert.equal(
    m.salesPlanReturnAdjustments(d, { ...r, orderType: 'Z' }, 'area', c, [], { 1001: '110.600' })[0]
      .adjustQty,
    '10.600',
  );
});
test('stale destination, wrong role, SKU version and invalid edits fail before submission', () => {
  for (const c of [
    { ...context, versionId: 'other' },
    { ...context, status: 3 },
    { ...context, targetStage: 3 },
    { ...context, targetStatus: 8 },
  ])
    assert.throws(() => m.salesPlanReturnAdjustments(detail, row, 'province', c));
  assert.throws(() => m.salesPlanReturnAdjustments(detail, row, 'area', context));
  assert.throws(() =>
    m.salesPlanReturnAdjustments(detail, row, 'province', context, [], { 1001: '-1' }),
  );
  assert.throws(() =>
    m.salesPlanReturnAdjustments(detail, row, 'province', context, [], { 999: '10' }),
  );
});
test('readback checks receiving quantities, rounded money and cleared originating fields', () => {
  const request = {
    action: 'REJECT',
    expectedStatus: 2,
    approvalRole: 'province',
    expectedReturnTargetStage: 2,
    adjustments: [{ skuCode: '1001', adjustQty: '10' }],
  };
  const receipt = { planId: 'p', versionId: 'v', fromStatus: 2, toStatus: 7 };
  const after = {
    currentVersion: { ...detail.currentVersion, status: 7 },
    skus: [
      {
        ...sku,
        regionConfirmedQty: '110',
        regionConfirmedAmount: '220.00',
        provinceConfirmedQty: null,
        provinceConfirmedAmount: null,
      },
    ],
  };
  assert.equal(m.verifyReturnedSalesPlan(detail, after, request, receipt), true);
  assert.equal(
    m.verifyReturnedSalesPlan(
      detail,
      { ...after, skus: [{ ...after.skus[0], regionConfirmedQty: '90' }] },
      request,
      receipt,
    ),
    false,
  );
  assert.equal(
    m.verifyReturnedSalesPlan(
      detail,
      { ...after, skus: [{ ...after.skus[0], provinceConfirmedQty: '120' }] },
      request,
      receipt,
    ),
    false,
  );
  assert.equal(
    m.verifyReturnedSalesPlan(
      detail,
      { ...after, skus: [{ ...after.skus[0], regionConfirmedAmount: '219.99' }] },
      request,
      receipt,
    ),
    false,
  );
});
test('zero adjustments and the actual return destination survive the action attempt and retries', async () => {
  const calls = [];
  let first = true;
  const client = {
    action: {
      invoke: async (command) => {
        calls.push(structuredClone(command));
        if (first) {
          first = false;
          throw new TypeError('network');
        }
        return {
          planId: 'p',
          versionId: 'v',
          fromStatus: 9,
          toStatus: 7,
          requestId: command.requestId,
          traceId: 'trace',
          replayed: true,
        };
      },
    },
  };
  const attempt = new m.SalesPlanActionAttempt(client, () => 'fixed-id');
  const input = {
    planId: 'p',
    versionId: 'v',
    planTypeCode: 'Y',
    request: {
      action: 'REJECT',
      approvalRole: 'area',
      expectedStatus: 9,
      expectedReturnTargetStage: 2,
      remark: '核对',
      adjustments: [{ skuCode: '1001', adjustQty: '0.000' }],
    },
  };
  await assert.rejects(attempt.submit(input));
  await attempt.retry();
  assert.deepEqual(calls[0], calls[1]);
  assert.equal(calls[1].request.adjustments[0].adjustQty, '0.000');
});
