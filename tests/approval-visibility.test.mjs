import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const { outputFiles } = await build({
  stdin: {
    contents:
      "export * from './src/workbench/original/workbenches/regionalApproval/regionalApprovalQueryModel.ts'; export * from './src/workbench/original/salesPlanWorkflow.ts';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const {
  approvalStageProgressForSalesPlanPeriods,
  approvalStageProgressForSalesPlanStatusTotals,
  salesPlanStagePercent,
  salesPlanStageTallies,
  salesPlanPeriodMonths,
  salesPlanPeriodsForMonth,
  salesPlanPeriodOptionLabel,
  salesPlanVisibleStatuses,
  salesPlanWorkflow,
} = await import(
  'data:text/javascript;base64,' + Buffer.from(outputFiles[0].contents).toString('base64')
);
test('period options expose one month while keeping all workflow periods in its query scope', () => {
  const periods = [
    { periodId: '20261001', periodMonth: '2026-10', planTypeCode: 'Y', status: 'OPEN' },
    { periodId: '20261002', periodMonth: '2026-10', planTypeCode: 'DC', status: 'OPEN' },
    { periodId: '20260901', periodMonth: '2026-09', planTypeCode: 'Y', status: 'CLOSED' },
  ];
  assert.deepEqual(salesPlanPeriodMonths(periods), ['2026-10', '2026-09']);
  assert.deepEqual(
    salesPlanPeriodsForMonth(periods, '2026-10').map((period) => period.periodId),
    ['20261001', '20261002'],
  );
  assert.equal(salesPlanPeriodOptionLabel('2026-10'), '2026-10');
});
test('month progress weights each workflow without inventing a missing DC region node', () => {
  const progress = approvalStageProgressForSalesPlanPeriods([
    { planTypeCode: 'Y', total: 2, statusTotals: { 2: 1, 10: 1 } },
    { planTypeCode: 'DC', total: 2, statusTotals: { 2: 2 } },
  ]);
  assert.equal(progress.region, 100);
  assert.equal(progress.province, 25);
});
test('品类节点把「品类已审批（待回写）」算作已完成', () => {
  const onlyPending = approvalStageProgressForSalesPlanPeriods([
    { planTypeCode: 'Y', total: 4, statusTotals: { 4: 3, 5: 1 } },
  ]);
  assert.equal(onlyPending.category, 25);
  assert.equal(onlyPending.area, 100);
  const half = approvalStageProgressForSalesPlanPeriods([
    { planTypeCode: 'Y', total: 4, statusTotals: { 4: 2, 5: 2 } },
  ]);
  assert.equal(half.category, 50);

  const allApproved = approvalStageProgressForSalesPlanPeriods([
    { planTypeCode: 'Y', total: 3, statusTotals: { 5: 3 } },
  ]);
  assert.equal(allApproved.category, 100);

  const returned = approvalStageProgressForSalesPlanPeriods([
    { planTypeCode: 'Y', total: 4, statusTotals: { 4: 1, 5: 1, 10: 1, 8: 1 } },
  ]);
  assert.equal(returned.province, 75);

  assert.equal(returned.category, 50);
});
test('每个状态算哪些节点已完成（进度分子口径）', () => {
  const done = {
    customer: [1, 2, 3, 4, 5, 7, 8, 9, 10],
    region: [2, 3, 4, 5, 8, 9, 10],
    province: [3, 4, 5, 9, 10],
    area: [4, 5, 10],
    category: [5, 10],
  };
  for (const [role, statuses] of Object.entries(done)) {
    for (let status = 0; status <= 10; status++) {
      const progress = approvalStageProgressForSalesPlanStatusTotals(1, { [status]: 1 }, 'Y');
      assert.equal(
        progress[role] === 100,
        statuses.includes(status),
        `${role} 在状态 ${status} 的判定不符合口径`,
      );
    }
  }
});
test('分子/分母：界面悬停展示的两个数就是这里算的', () => {
  const tallies = salesPlanStageTallies([
    {
      planTypeCode: 'Y',
      total: 28,
      statusTotals: { 1: 7, 2: 4, 3: 4, 4: 3, 5: 1, 6: 6, 7: 2, 8: 1 },
    },
    { planTypeCode: 'DC', total: 2, statusTotals: { 2: 2 } },
  ]);
  assert.deepEqual(tallies.customer, { completed: 24, total: 30 });

  assert.deepEqual(tallies.region, { completed: 13, total: 28 });
  assert.deepEqual(tallies.province, { completed: 8, total: 30 });
  assert.deepEqual(tallies.area, { completed: 4, total: 30 });
  assert.deepEqual(tallies.category, { completed: 1, total: 30 });

  const percent = approvalStageProgressForSalesPlanPeriods([
    {
      planTypeCode: 'Y',
      total: 28,
      statusTotals: { 1: 7, 2: 4, 3: 4, 4: 3, 5: 1, 6: 6, 7: 2, 8: 1 },
    },
    { planTypeCode: 'DC', total: 2, statusTotals: { 2: 2 } },
  ]);
  for (const role of ['customer', 'region', 'province', 'area', 'category'])
    assert.equal(percent[role], salesPlanStagePercent(tallies[role]));

  assert.deepEqual(salesPlanStageTallies([]).customer, { completed: 0, total: 0 });
  assert.equal(salesPlanStagePercent({ completed: 0, total: 0 }), 0);
});
test('Y visibility includes pending, own returns and read-only tracking, excludes other returns and earlier steps', () => {
  const expected = {
    customer: [0, 1, 2, 3, 4, 5, 6, 10],
    region: [1, 2, 3, 4, 5, 6, 7, 10],
    province: [2, 3, 4, 5, 7, 8, 10],
    area: [3, 4, 5, 8, 9, 10],
    category: [4, 5, 9, 10],
  };
  for (const [role, statuses] of Object.entries(expected))
    assert.deepEqual(salesPlanVisibleStatuses('Y', [role]), statuses);
  assert.deepEqual(
    salesPlanVisibleStatuses('Y', ['region', 'province']),
    [1, 2, 3, 4, 5, 6, 7, 8, 10],
  );
  assert.deepEqual(salesPlanVisibleStatuses('unknown', ['region']), []);
});
test('category queue includes approval and DMS completion states without expanding write permissions', () => {
  const flow = salesPlanWorkflow('Y');
  assert.deepEqual(flow.queueStatuses('category'), [4, 5, 10]);
  assert.deepEqual(flow.pendingStatuses('category'), [4]);
  assert.equal(flow.visibility(4, 'category'), 'writable');
  assert.equal(flow.visibility(5, 'category'), 'read-only');
  assert.equal(flow.visibility(10, 'category'), 'read-only');
});
test('XN visibility skips region while customer resubmission keeps the fixed request status', () => {
  assert.deepEqual(salesPlanVisibleStatuses('XN', ['region']), []);
  assert.deepEqual(salesPlanVisibleStatuses('XN', ['province']), [2, 3, 4, 5, 6, 8, 10]);
  const flow = salesPlanWorkflow('XN');
  assert.equal(flow.transition(2, 'REJECT'), 6);
  assert.equal(flow.resubmit(6), 1);
  assert.equal(flow.actor(2), 'province');
  assert.equal(flow.actor(1), undefined);
  assert.equal(flow.actor(7), undefined);
  for (const status of [5, 10])
    for (const action of ['APPROVE', 'REJECT'])
      assert.equal(flow.transition(status, action), undefined);
});
