import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const { outputFiles } = await build({
  stdin: {
    contents: [
      "export * from './src/workbench/original/workbenches/regionalApproval/models/salesPlanActionModel.ts';",
      "export { actionErrorText } from './src/workbench/original/workbenches/regionalApproval/RegionalApprovalLiveActionDialog.tsx';",
      "export { BackendHttpError } from './src/workbench/original/http-error.ts';",
    ].join('\n'),
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  outfile: '/tmp/sales-plan-error-copy.js',
  loader: { '.css': 'empty', '.module.css': 'empty' },
});
const m = await import(
  'data:text/javascript;base64,' + Buffer.from(outputFiles[0].contents).toString('base64')
);

/** V1.8 #12：给业务的文案里不能出现接口、字段名、参数名、错误码。 */
test('technical backend text never reaches business copy', () => {
  const technical = [
    'GEA_HTTP_409：payload.plan_month 为必填字段',
    'payload.plan_month 为必填字段',
    'NOTIFICATION_PAYLOAD_INVALID',
    'SALES_PLAN_CONFLICT',
    '{"code":"X","message":"y"}',
    'https://gea.synear.cn/gea-boot/sales-plan/plans',
    'currentVersion.status is null',
    ['过长报文', 'x'.repeat(120)].join(''),
    '',
    undefined,
  ];
  for (const text of technical)
    assert.equal(m.businessSafeErrorMessage(text), undefined, String(text));

  const business = [
    '多人节点尚未结束，调整量请由最后一位审批人提交',
    '退回原因不能为空',
    '当前角色不具备该版本的调整权限',
  ];
  for (const text of business) assert.equal(m.businessSafeErrorMessage(text), text);
});

/** 技术细节只进日志，并给出可口头转述的错误编号。 */
test('reported error id is human-transferable and detail stays in the log', () => {
  const logged = [];
  const original = console.warn;
  console.warn = (...args) => logged.push(args);
  try {
    const id = m.reportSalesPlanError('sales-plan-action', {
      backendMessage: 'payload.plan_month 为必填字段',
    });
    assert.match(id, /^[A-Z0-9]{6}$/);
    assert.equal(logged.length, 1);
    assert.match(String(logged[0][0]), /sales-plan-action/);
    assert.match(String(logged[0][0]), new RegExp(id));
    assert.deepEqual(logged[0][1], { backendMessage: 'payload.plan_month 为必填字段' });
  } finally {
    console.warn = original;
  }
});

test('an ended approval instance preserves the backend reason without advising resubmission', () => {
  const original = console.warn;
  console.warn = () => {};
  try {
    const cause = new m.BackendHttpError({
      method: 'POST',
      path: '/sales-plan/plans/versions/v1/actions',
      status: 409,
      body: {
        error: 'GEA_HTTP_409：该版本审批实例已经结束',
        details: { upstreamCode: 'SALES_PLAN_APPROVAL_STATE_INVALID', requestId: 'ended-instance' },
      },
    });
    const translate = (key) =>
      key.endsWith('SALES_PLAN_APPROVAL_STATE_INVALID')
        ? '该版本当前无法执行此审批动作；请联系管理员核对审批实例状态。'
        : '';
    const text = m.actionErrorText(translate, m.classifySalesPlanActionError(cause));
    assert.match(text, /该版本审批实例已经结束/);
    assert.doesNotMatch(text, /退回重提|重新提交/);
  } finally {
    console.warn = original;
  }
});

test('DMS明确拒绝展示业务原因且不进入结果待核实恢复', () => {
  const cause = new m.BackendHttpError({
    method: 'POST',
    path: '/actions',
    status: 502,
    body: {
      error:
        'GEA_HTTP_502：DMS回写失败: SKU 10003581 确认数量必须为整数，且数量及合计不能超出Integer范围',
      details: {
        upstreamCode: 'SALES_PLAN_DMS_WRITEBACK_FAILED',
        retryable: false,
        requestId: 'dms-rejected',
      },
    },
  });
  const failure = m.classifySalesPlanActionError(cause);
  assert.equal(failure.retrySameIntent, false);
  const text = m.actionErrorText((key) => key, failure);
  assert.match(text, /10003581/);
  assert.match(text, /整数/);
  assert.doesNotMatch(text, /GEA_HTTP|errors.reference|错误编号|dms-rejected/);
});
test('DMS失败原文包含字段名或较长说明时仍完整显示，其他服务故障不透出', () => {
  const message =
    'DMS回写失败: SKU 10003581 确认数量必须为整数，且数量及合计不能超出Integer范围。请核对 payload.confirmQty、当前销售计划的各 SKU 确认数量，以及汇总数量后重新提交。';
  assert.ok(message.length > 80);
  assert.equal(
    m.salesPlanRejectionMessage({
      status: 502,
      backendMessage: `GEA_HTTP_502：${message}`,
      details: { upstreamCode: 'SALES_PLAN_DMS_WRITEBACK_FAILED' },
    }),
    message,
  );
  assert.equal(
    m.salesPlanRejectionMessage({ status: 502, backendMessage: 'Internal server error' }),
    undefined,
  );
});
test('未收到业务结果的网关故障继续保留同一操作重试', () => {
  const failure = m.classifySalesPlanActionError(
    new m.BackendHttpError({
      method: 'POST',
      path: '/actions',
      status: 502,
      body: { error: 'Bad Gateway' },
    }),
  );
  assert.equal(failure.retrySameIntent, true);
});

test('真实退回失败直接展示服务端原因，不因字段名或未知原因码替换为通用提示', () => {
  const message = 'payload.plan_month 为必填字段，请核对当前审批实例中的计划月份后重试';
  const cause = new m.BackendHttpError({
    method: 'POST',
    path: '/actions',
    status: 409,
    body: {
      error: `GEA_HTTP_409：${message}`,
      details: { upstreamCode: 'RETURN_FAILURE_DETAIL', requestId: 'return-live-failure' },
    },
  });
  const original = console.warn;
  console.warn = () => {};
  try {
    const text = m.actionErrorText(
      (key, options) => (key.endsWith('.reference') ? ` 错误编号 ${options.id}` : '通用失败提示'),
      m.classifySalesPlanActionError(cause),
    );
    assert.equal(text, message);
  } finally {
    console.warn = original;
  }
});
