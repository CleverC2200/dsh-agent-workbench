import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const { outputFiles } = await build({
  stdin: {
    contents:
      "export * from './src/workbench/original/workbenches/regionalApproval/models/salesPlanSubmitModel.ts'; export * from './src/workbench/original/salesPlanWorkflow.ts';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const {
  classifySalesPlanSubmitError,
  prepareSalesPlanResubmit,
  salesPlanCanResubmit,
  salesPlanResubmitReadbackMatches,
  salesPlanSubmitReceiptMatches,
  SalesPlanSubmitAttempt,
  replaceSalesPlanWorkflowRows,
} = await import(
  'data:text/javascript;base64,' + Buffer.from(outputFiles[0].contents).toString('base64')
);
const source = (status = 6, periodStatus = 'OPEN') => ({
  period: {
    periodId: '123',
    periodMonth: '2026-10',
    planTypeCode: 'Y',
    status: periodStatus,
  },
  planId: 'p-jxs-2026-10-00001',
  versionId: 'v1',
  detail: {
    currentVersion: {
      id: 'v1',
      planId: 'p-jxs-2026-10-00001',
      periodId: '123',
      planTypeCode: 'Y',
      orderType: 'M',
      status,
      effective: true,
      seq: 1,
      dealerCode: '456',
      targetQty: '1.000',
      targetAmount: '12.34',
    },
  },
  currentUser: { id: 'user', username: 'User' },
  skus: [
    {
      versionId: 'v1',
      skuCode: '789',
      productCategName: 'Category',
      baseQty: '1.000',
      qty: '2.000',
      price: '12.3400',
    },
  ],
});
test('resubmission retains order type, sends the configured next status and validates quantities', () => {
  for (const [from, to] of [
    [6, 1],
    [7, 2],
    [8, 3],
    [9, 4],
  ]) {
    const input = prepareSalesPlanResubmit(source(from));
    assert.equal(input.request.status, to);
    assert.equal(input.request.orderType, 'M');
    assert.equal(input.expected.nextSeq, 2);
    assert.equal(input.sourceSummary.submittedAmount, '24.68');
  }
  const missing = source();
  delete missing.detail.currentVersion.orderType;
  assert.throws(() => prepareSalesPlanResubmit(missing));
  const negative = source();
  negative.skus[0].qty = '-1';
  assert.throws(() => prepareSalesPlanResubmit(negative));
  const withoutRemovedPeriodStatus = source(6);
  delete withoutRemovedPeriodStatus.period.status;
  assert.equal(prepareSalesPlanResubmit(withoutRemovedPeriodStatus).request.status, 1);
  assert.equal(prepareSalesPlanResubmit(source(6, 'CLOSED')).request.status, 1);
  assert.equal(prepareSalesPlanResubmit(source(7, 'CLOSED')).request.status, 2);
});
test('resubmission status stays fixed when a workflow omits an approval node', () => {
  replaceSalesPlanWorkflowRows([
    { typeCode: 'Y', examineLevel: 0, nodeNum: '0' },
    { typeCode: 'Y', examineLevel: 2, nodeNum: '2' },
    { typeCode: 'Y', examineLevel: 4, nodeNum: '4' },
    { typeCode: 'Y', examineLevel: 5, nodeNum: 'Y' },
  ]);
  assert.equal(prepareSalesPlanResubmit(source()).request.status, 1);
  assert.equal(prepareSalesPlanResubmit(source(8, 'CLOSED')).request.status, 3);
  assert.equal(prepareSalesPlanResubmit(source(7)).request.status, 2);
});
test('unknown outcomes retry exactly one intent and a completed attempt cannot duplicate a version', async () => {
  const input = prepareSalesPlanResubmit(source());
  let calls = [];
  let serial = 0;
  const attempt = new SalesPlanSubmitAttempt(
    {
      submit: {
        invoke: async (cmd) => {
          calls.push(cmd);
          if (calls.length === 1) throw new TypeError('transport');
          return {
            planId: input.expected.planId,
            versionId: 'v2',
            seq: 2,
            status: input.expected.nextStatus,
            requestId: cmd.requestId,
            traceId: 'trace',
            auditId: null,
          };
        },
      },
    },
    () => String(++serial),
  );
  await assert.rejects(attempt.submit(input));
  const receipt = await attempt.retry();
  assert.deepEqual(calls[0], calls[1]);
  assert.equal((await attempt.submit(input)).versionId, receipt.versionId);
  assert.equal(calls.length, 2);
});

test('readback requires the effective successor, retired source and matching resubmit log', () => {
  const receipt = {
    planId: 'p',
    versionId: 'new',
    seq: 2,
    status: 1,
    requestId: 'r',
  };
  const detail = {
    currentVersion: {
      planId: 'p',
      id: 'new',
      seq: 2,
      status: 1,
      effective: true,
    },
    versions: [{ id: 'old', planId: 'p', effective: false }],
    logs: [{ planId: 'p', versionId: 'new', requestId: 'r', actionCode: 'RESUBMIT' }],
  };
  assert.equal(salesPlanResubmitReadbackMatches('old', receipt, detail), true);
  for (const patch of [
    { currentVersion: { ...detail.currentVersion, id: 'other' } },
    { versions: [{ id: 'old', planId: 'p', effective: true }] },
    { logs: [] },
    { logs: [{ ...detail.logs[0], requestId: 'other' }] },
  ])
    assert.equal(salesPlanResubmitReadbackMatches('old', receipt, { ...detail, ...patch }), false);
});

test('Z resubmit keeps the fixed baseline and carries submission corrections rather than stale node confirmations', () => {
  const z = source(6);
  z.detail.currentVersion.orderType = 'Z';
  z.detail.correctionContext = {
    contract: 'absolute-net-v1',
    monthlyApproved: true,
    approvalOpen: true,
  };
  z.skus[0] = {
    ...z.skus[0],
    qty: '30',
    adjAddQty: '2',
    adjCutQty: '0',
    regionAdjAddQty: '8',
    regionAdjCutQty: '0',
  };
  const input = prepareSalesPlanResubmit(z);
  assert.equal(input.request.items[0].qty, '30.000');
  assert.equal(input.request.items[0].adjAddQty, '2');
  assert.equal(input.request.items[0].adjCutQty, '0');
  assert.equal(input.request.items[0].regionAdjAddQty, undefined);
  assert.equal(input.sourceSummary.submittedQty, '32.000');
});

test('returned submission requires its responsible role or original submitter and current source', () => {
  const v = { ...source(7).detail.currentVersion, submitter: 'dealer' };
  assert.equal(salesPlanCanResubmit(v, ['region'], 'region-user'), true);
  assert.equal(salesPlanCanResubmit(v, ['province'], 'province-user'), false);
  assert.equal(salesPlanCanResubmit({ ...v, status: 8 }, ['province'], 'province-user'), true);
  assert.equal(salesPlanCanResubmit({ ...v, status: 9 }, ['area'], 'area-user'), true);
  assert.equal(salesPlanCanResubmit({ ...v, status: 6 }, [], 'dealer'), true);
  assert.equal(salesPlanCanResubmit({ ...v, status: 6 }, ['region'], 'other'), false);
  assert.equal(salesPlanCanResubmit({ ...v, effective: false }, ['region'], 'region-user'), false);
});

test('monthly readback checks every submitted SKU, amount and inherited confirmation without recalculating it', () => {
  const original = source(7);
  original.skus[0].regionConfirmedQty = '1.250';
  original.skus[0].regionConfirmedAmount = '15.43';
  const edited = { ...original, skus: [{ ...original.skus[0], qty: '3.000' }] };
  const input = prepareSalesPlanResubmit(edited);
  const receipt = { planId: original.planId, versionId: 'v2', seq: 2, status: 2, requestId: 'r' };
  const detail = {
    currentVersion: { ...original.detail.currentVersion, id: 'v2', status: 2, seq: 2 },
    versions: [{ ...original.detail.currentVersion, effective: false }],
    logs: [{ ...receipt, actionCode: 'RESUBMIT' }],
    skus: [{ ...original.skus[0], versionId: 'v2', qty: '3.000', amt: '37.02' }],
  };
  const matches = (value) =>
    salesPlanResubmitReadbackMatches('v1', receipt, value, input.request, original.skus);
  assert.equal(matches(detail), true);
  assert.equal(matches({ ...detail, skus: [] }), false);
  for (const patch of [
    { qty: '2.000' },
    { price: '12.3500' },
    { amt: '37.01' },
    { regionConfirmedQty: '3.000' },
    { regionConfirmedAmount: '37.02' },
    { provinceConfirmedQty: '1.000' },
  ])
    assert.equal(matches({ ...detail, skus: [{ ...detail.skus[0], ...patch }] }), false);
});

test('a valid successful receipt with an unexpected sequence is retained for readback without another write', async () => {
  const input = prepareSalesPlanResubmit(source(7));
  let writes = 0;
  const attempt = new SalesPlanSubmitAttempt(
    {
      submit: {
        invoke: async (command) => {
          writes++;
          return {
            planId: input.expected.planId,
            versionId: 'v3',
            seq: 3,
            status: 3,
            replayed: false,
            requestId: command.requestId,
            traceId: 'trace',
            auditId: null,
          };
        },
      },
    },
    () => 'unexpected',
  );
  const actual = await attempt.submit(input);
  assert.equal(actual.seq, 3);
  assert.equal(actual.status, 3);
  assert.equal(salesPlanSubmitReceiptMatches(input, actual.requestId, actual), false);
  assert.equal((await attempt.retry()).versionId, 'v3');
  assert.equal(writes, 1);
});

test('configuration conflicts and service authentication failures keep their own non-retryable meaning', () => {
  const failure = (status, details) => ({
    name: 'BackendHttpError',
    status,
    code: 'GEA_HTTP_' + status,
    details,
  });
  assert.equal(
    classifySalesPlanSubmitError(failure(409, { upstreamCode: 'NOTIFICATION_PAYLOAD_INVALID' }))
      .kind,
    'configuration',
  );
  assert.equal(
    classifySalesPlanSubmitError(failure(409, { upstreamCode: 'SALES_PLAN_CONFLICT' })).kind,
    'conflict',
  );
  assert.equal(
    classifySalesPlanSubmitError(failure(401, { authentication: 'service' })).kind,
    'serviceAuthentication',
  );
  assert.equal(classifySalesPlanSubmitError(failure(401, {})).kind, 'authentication');
  assert.equal(
    classifySalesPlanSubmitError(failure(409, { upstreamCode: 'APPROVAL_CANDIDATE_MISSING' }))
      .retrySameIntent,
    false,
  );
});
