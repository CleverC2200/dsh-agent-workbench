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
test('monthly and correction category approval and return use integer final quantities', () => {
  const categoryRow = { ...row, status: 4 };
  const categoryDetail = {
    ...detail,
    currentVersion: { ...detail.currentVersion, status: 4, orderType: 'M' },
    skus: [{ ...sku, areaConfirmedQty: '110.000', categoryConfirmedQty: '120.600' }],
  };
  const approved = m.salesPlanApprovalDraftValues(categoryDetail, categoryRow, 'category', []);
  assert.equal(Number(approved['1001']), 0.4);
  const destination = m.salesPlanReturnDestination(categoryDetail, 'category');
  const returned = m.salesPlanReturnAdjustments(
    categoryDetail,
    categoryRow,
    'category',
    destination,
  );
  assert.equal(Number(returned[0].adjustQty), 11);
  assert.equal(
    Number(
      m.salesPlanReturnAdjustments(
        categoryDetail,
        { ...categoryRow, orderType: 'Z' },
        'category',
        destination,
      )[0].adjustQty,
    ),
    11,
  );
  assert.deepEqual(
    m.salesPlanApprovalDraftValues(
      categoryDetail,
      { ...categoryRow, orderType: 'Z' },
      'category',
      [],
    ),
    { 1001: '0.400' },
  );
});
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
test('a skipped province uses the actual frozen destination and M/Z both use whole quantities', () => {
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
    '11',
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

test('draft freshness compares exact decimal values while retaining strict version identity', () => {
  const selected = { ...row, status: 2 };
  const source = {
    ...detail,
    skus: [{ ...sku, price: '2.0000', qty: '90.000', regionConfirmedQty: '100.000' }],
  };
  const draft = {
    planId: 'p',
    versionId: 'v',
    status: 2,
    sourceSnapshot: m.salesPlanDraftSnapshot(selected, source),
    role: 'province',
    adjustments: [{ skuCode: '1001', adjustQty: '1' }],
    remark: '',
  };
  assert.equal(m.salesPlanDraftMatches(draft, selected, detail, 'province'), true);
  assert.equal(
    m.salesPlanDraftMatches(
      draft,
      selected,
      { ...detail, skus: [{ ...sku, price: '2.000000000000001' }] },
      'province',
    ),
    false,
  );
  assert.equal(
    m.salesPlanDraftMatches({ ...draft, versionId: 'other' }, selected, detail, 'province'),
    false,
  );
});

test('explicit Host business rejection is definitive even when upstream retryable is true', () => {
  const error = {
    name: 'BackendHttpError',
    status: 502,
    code: '',
    backendMessage: 'GEA_HTTP_502：产品 TEST-ITEM 已停用，请先维护产品资料',
    details: { retryable: true, retrySameIntent: false },
  };
  assert.equal(m.classifySalesPlanActionError(error).retrySameIntent, false);
  assert.equal(m.classifySalesPlanSubmitError(error).kind, 'failed');
  assert.equal(m.salesPlanRejectionMessage(error), '产品 TEST-ITEM 已停用，请先维护产品资料');
});

test('business rejection retains SKU and field guidance while removing response references', () => {
  assert.equal(
    m.salesPlanRejectionMessage({
      status: 502,
      backendMessage:
        'GEA_HTTP_502：DMS回写失败[ITEM_DISABLED]：SKU TEST-ITEM 的 payload.confirmQty 必须为整数。requestId=hidden-request traceId=hidden-trace auditId=hidden-audit 错误编号=hidden-code',
      details: { upstreamCode: 'SALES_PLAN_DMS_WRITEBACK_FAILED' },
    }),
    'DMS回写失败：SKU TEST-ITEM 的 payload.confirmQty 必须为整数。',
  );
});

test('Host retry intent survives HTTP 408 while validation and definitive failures keep their classification', () => {
  for (const classify of [m.classifySalesPlanActionError, m.classifySalesPlanSubmitError]) {
    for (const [status, retrySameIntent, kind, expectedRetry] of [
      [408, true, 'unavailable', true],
      [408, false, 'failed', false],
      [400, true, 'validation', false],
      [401, true, 'authentication', false],
      [403, true, 'permission', false],
      [409, true, 'conflict', false],
    ]) {
      const result = classify({
        name: 'BackendHttpError',
        status,
        code: `GEA_HTTP_${status}`,
        details: { retrySameIntent, retryable: true },
      });
      assert.equal(result.kind, kind);
      assert.equal(result.retrySameIntent, expectedRetry);
    }
    const rejected = classify({
      name: 'BackendHttpError',
      status: 408,
      code: 'GEA_HTTP_408',
      details: { retryable: false },
    });
    assert.equal(rejected.kind, 'failed');
    assert.equal(rejected.retrySameIntent, false);
  }
});

test('non-DMS transport rejection keeps technical notification fields out of business copy', () => {
  assert.equal(
    m.salesPlanRejectionMessage({
      status: 409,
      backendMessage: 'GEA_HTTP_409：payload.plan_month 为必填字段',
      details: { upstreamCode: 'NOTIFICATION_PAYLOAD_INVALID', retrySameIntent: false },
    }),
    undefined,
  );
});

test('invalid pending confirmed quantity keeps its preflight reason', () => {
  assert.throws(
    () =>
      m.salesPlanApprovalDraftValues(detail, { ...row, orderType: 'Z' }, 'province', [], {
        1001: '-1',
      }),
    (error) => error.key === 'quantityInvalid',
  );
});
