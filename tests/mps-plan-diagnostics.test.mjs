import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mpsComputePlugin } from '../scripts/mps-compute-build.mjs';

const compiled = await build({
  entryPoints: ['static/mps/source/plan-diagnostics.js'],
  plugins: [await mpsComputePlugin()],
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'esm',
});
const { attachPlanReport } = await import(
  'data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64')
);

const diagnose = (tag, sourceMonth = '2026-11', demandMonth = '2026-11') => {
  const plan = {
    context: { month: '2026-11' },
    resourceSchedules: [],
    rows: [
      {
        month: demandMonth,
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
      transferRoutes: [{ from: '乙', to: '甲', code: 'A', sourceMonth: '2026-11' }],
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

test('旧计算结果从ODM标签基地调入时提示重新生成外部收货计划，不要求补内部产线', () => {
  const plan = diagnose('ODM代工品');
  assert.equal(plan.reportIssues.length, 1);
  assert.equal(plan.reportIssues[0].kind, '缺ODM收货关系');
  assert.match(plan.reportIssues[0].reason, /乙.*ODM代工品.*重新评估/);
  assert.match(plan.reportIssues[0].action, /收货基地.*调拨路径/);
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

test('最新调拨来源标签供后续需求月共用，导出仍保留来源月', () => {
  const plan = diagnose('ODM代工品', '2026-11', '2027-01');
  assert.match(plan.reportIssues[0].reason, /乙.*ODM代工品/);
  assert.equal(plan.reportIssues[0].month, '2027-01');
  assert.equal(plan.reportIssues[0].sourceMonth, '2026-11');
});

test('需求库存缺项逐行列明补数入口，零需求的占比缺项只提示且不改变其他结果', () => {
  const plan = {
    context: { month: '2026-11' },
    resourceSchedules: [],
    rows: [
      {
        month: '2026-11',
        base: '甲',
        code: 'A',
        demand: null,
        safetyDays: 10,
        nextMonth: '2026-12',
        nextMonthDemand: null,
        missing: {
          demand: ['历史发货缺基地，拆分占比不可用'],
          targetInventory: ['2026-12 缺下月有效需求'],
        },
        planMissing: ['缺有效需求', '缺前月实际结存', '缺目标库存'],
      },
      {
        month: '2026-12',
        base: '甲',
        code: 'A',
        demand: 0,
        historyShare: null,
        missing: { share: ['缺历史'] },
        planMissing: ['缺前月实际结存'],
      },
      { month: '2026-11', base: '乙', code: 'C', demand: 20, mainPlan: 20, planMissing: [] },
    ],
  };
  attachPlanReport(plan, { planCandidates: [], unitWeights: [], transferRoutes: [] }, null);
  const first = plan.reportIssues.filter((row) => row.month === '2026-11');
  assert.deepEqual(
    first.map((row) => row.kind),
    ['缺有效需求', '缺期初库存', '缺目标库存'],
  );
  assert.match(first[0].reason, /历史发货缺基地/);
  assert.match(first[0].action, /历史.*基地/);
  assert.match(first[2].action, /2026-12/);
  assert.ok(first.every((row) => row.sourceFields && row.action && row.blocking));
  const zero = plan.reportIssues.find((row) => row.kind === '拆分依据待补');
  assert.equal(zero.blocking, false);
  assert.match(zero.reason, /零需求/);
  assert.match(
    plan.reportIssues.find((row) => row.month === '2026-12' && row.kind === '缺期初库存').action,
    /上月/,
  );
  assert.equal(plan.rows[2].mainPlan, 20);
  assert.deepEqual(plan.rows[2].reportMissing, []);
});

test('库存来源未读与源行发运条件不足分别说明，不把未同步判作源表缺数', () => {
  const makePlan = () => ({
    context: { month: '2026-11' },
    resourceSchedules: [],
    rows: [{ month: '2026-11', base: '甲', code: 'A', planMissing: ['缺前月实际结存'] }],
  });
  const sources = { planCandidates: [], unitWeights: [], transferRoutes: [] };
  const unread = makePlan();
  attachPlanReport(unread, sources, null, { shipmentSnapshot: { status: 'loading', rows: [] } });
  assert.match(unread.reportIssues[0].reason, /来源状态：loading.*不能判定为源表缺数/);
  const pending = makePlan();
  attachPlanReport(pending, sources, null, {
    shipmentSnapshot: {
      status: 'partial',
      cutoff: '2026-10-22',
      rows: [
        {
          base: '甲',
          code: 'A',
          open: 10,
          inbound: 0,
          remaining: 0,
          fin: null,
          forecastIssue: '三种发运速度均为0，无法估算发运天数',
        },
      ],
    },
  });
  assert.match(pending.reportIssues[0].reason, /缺有效预估发货.*三种发运速度均为0/);
  assert.doesNotMatch(pending.reportIssues[0].reason, /缺截止日库存/);
});

test('补数问题清单列明替换系数和产品净重字段，零需求的系数缺项不阻断', () => {
  const plan = {
    context: { month: '2026-11' },
    resourceSchedules: [],
    rows: [null, 0].map((demand, index) => ({
      month: '2026-11',
      base: '甲',
      code: index ? 'ZERO' : 'A',
      historyCode: 'OLD',
      demand,
      missing: { historyQuantity: ['替换系数缺失、冲突或无效'] },
      planMissing: index ? [] : ['缺唯一有效件吨系数'],
    })),
  };
  attachPlanReport(
    plan,
    {
      planCandidates: [],
      unitWeights: [],
      transferRoutes: [],
      unitWeightIssues: [
        {
          base: '甲',
          code: 'A',
          reason: '缺计量单位',
          sourceTable: 'ai_db.agents_dim_product_list_mi',
        },
      ],
    },
    null,
  );
  const ratio = plan.reportIssues.find((row) => row.kind === '缺替换系数' && row.code === 'A');
  assert.match(ratio.sourceFields, /replace_num/);
  assert.match(ratio.action, /甲.*A.*OLD/);
  assert.equal(ratio.blocking, true);
  assert.equal(plan.reportIssues.find((row) => row.code === 'ZERO').blocking, false);
  const weight = plan.reportIssues.find((row) => row.kind === '缺件吨系数');
  assert.equal(weight.sourceTable, 'ai_db.agents_dim_product_list_mi');
  assert.match(weight.sourceFields, /net_weight.*weight_unit.*measure_unit/);
  assert.match(weight.reason, /缺计量单位/);
});
