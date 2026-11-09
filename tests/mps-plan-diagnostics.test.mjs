import test from 'node:test';
import assert from 'node:assert/strict';
import { attachPlanReport } from '../static/mps/source/plan-diagnostics.js';

const diagnose = (tag, sourceMonth = '2026-11') => {
  const plan = {
    context: { month: '2026-11' },
    resourceSchedules: [],
    rows: [
      {
        month: '2026-11',
        base: '甲',
        code: 'A',
        name: '产品A',
        category: '点心',
        group: '组',
        demand: 10,
        planMissing: ['无有效产线承接关系或生产日历'],
      },
    ],
  };
  attachPlanReport(
    plan,
    {
      planCandidates: [],
      unitWeights: [],
      transferRoutes: [{ month: '2026-11', from: '乙', to: '甲', code: 'A' }],
    },
    {
      sources: {
        sku_capacity: [],
        transfers: [
          {
            stat_period: '2026-11',
            target_base: '甲',
            material_code: 'A',
            transfer_tag: '调拨品',
            transfer_direction: '从乙调拨',
          },
          {
            stat_period: sourceMonth,
            target_base: '乙',
            material_code: 'A',
            transfer_tag: tag,
            transfer_direction: '从丙调拨',
          },
        ],
      },
    },
  );
  return plan;
};

test('从ODM标签基地调入时保留代工能力待核，不要求补内部产线', () => {
  const plan = diagnose('ODM代工品');
  assert.equal(plan.reportIssues.length, 1);
  assert.match(plan.reportIssues[0].reason, /乙.*ODM代工品.*代工能力/);
  assert.match(plan.reportIssues[0].action, /代工供应能力/);
  assert.doesNotMatch(plan.reportIssues[0].action, /补充发出基地的产线/);
  assert.deepEqual(plan.rows[0].planMissing, ['无有效产线承接关系或生产日历']);
});

test('发出基地仍是调拨品时提示多级关系待确认，不报成内部产线漏登或闭环', () => {
  const plan = diagnose('调拨品');
  assert.equal(plan.reportIssues[0].kind, '缺调拨关系');
  assert.match(plan.reportIssues[0].reason, /乙.*调拨品.*多级/);
  assert.doesNotMatch(plan.reportIssues[0].reason, /成环|闭环/);
  assert.match(plan.reportIssues[0].action, /直接生产基地|中转/);
});

test('发出基地旧月标签不作为当前月ODM判断依据', () => {
  const plan = diagnose('ODM代工品', '2026-10');
  assert.doesNotMatch(plan.reportIssues[0].reason, /ODM代工品/);
  assert.match(plan.reportIssues[0].action, /产线归属/);
});
