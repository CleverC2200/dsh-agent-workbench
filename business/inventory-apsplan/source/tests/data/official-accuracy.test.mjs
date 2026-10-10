import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from './public-build.mjs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const dir = await mkdtemp(join(tmpdir(), 'aps-official-'));
await build({
  entryPoints: ['app/data/metrics.ts'],
  outfile: join(dir, 'metrics.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
});
const { deriveMetrics } = await import(join(dir, 'metrics.mjs'));
const row = {
  month: '202609',
  initial_plan: 100,
  adjusted_plan: 141,
  initial_deviation: 41,
  adjusted_deviation: 0,
  actual: 120,
  missing_actual: 0,
  invalid: 0,
};
const data = {
  start: '2026-09-01',
  end: '2026-09-22',
  granularity: 'month',
  sections: [{ id: 'sales-accuracy', status: 'ready', rows: [row] }],
};
test('原表计划分母和两阶段均值，不使用实际量作分母', () =>
  assert.equal(deriveMetrics(data)['销售提报准确率'].value, 79.5));
test('偏差先累加再除计划，避免正负抵消或行百分比平均', () => {
  const d = structuredClone(data);
  d.sections[0].rows.push({
    ...row,
    initial_plan: 900,
    adjusted_plan: 900,
    initial_deviation: 900,
    adjusted_deviation: 900,
  });
  const expected = ((1 - 941 / 1000 + (1 - 900 / 1041)) / 2) * 100;
  assert.equal(deriveMetrics(d)['销售提报准确率'].value, expected);
});
test('需求准确率使用同字段口径，有数据自动生效、空表保持缺失', () => {
  const d = structuredClone(data);
  d.sections = [{ ...d.sections[0], id: 'demand-accuracy' }];
  assert.equal(deriveMetrics(d)['需求预测准确率'].value, 79.5);
  d.sections[0].rows = [];
  assert.equal(deriveMetrics(d)['需求预测准确率'].value, null);
});
test('两项达成率按月度实际发货量除以纠偏后计划量', () => {
  const metrics = deriveMetrics(data);
  assert.equal(metrics['销售提报达成率'].value, (120 / 141) * 100);
  const d = structuredClone(data);
  d.sections[0].id = 'demand-accuracy';
  assert.equal(deriveMetrics(d)['需求预测达成率'].value, (120 / 141) * 100);
});
test('达成率遇到实绩缺失或年度范围不推导', () => {
  const missing = structuredClone(data);
  missing.sections[0].rows[0].missing_actual = 1;
  assert.equal(deriveMetrics(missing)['销售提报达成率'].value, null);
  const annual = {
    ...structuredClone(data),
    start: '2026-01-01',
    end: '2026-09-22',
    granularity: 'year',
  };
  assert.equal(deriveMetrics(annual)['销售提报达成率'].value, null);
});
test('年度准确率先逐月计算再取月均', () => {
  const d = structuredClone(data);
  d.start = '2026-08-01';
  d.sections[0].rows = [
    {
      ...row,
      month: '202608',
      initial_plan: 100,
      adjusted_plan: 100,
      initial_deviation: 0,
      adjusted_deviation: 0,
    },
    {
      ...row,
      month: '202609',
      initial_plan: 100,
      adjusted_plan: 100,
      initial_deviation: 100,
      adjusted_deviation: 100,
    },
  ];
  assert.equal(deriveMetrics(d)['销售提报准确率'].value, 50);
});
test('空表、零分母、失败、期间缺失保持缺失', () => {
  for (const change of [
    (d) => (d.sections[0].rows = []),
    (d) => (d.sections[0].rows[0].initial_plan = 0),
    (d) => (d.sections[0].status = 'error'),
    (d) => (d.start = '2026-08-01'),
  ]) {
    const d = structuredClone(data);
    change(d);
    assert.equal(deriveMetrics(d)['销售提报准确率'].value, null);
  }
});
await rm(dir, { recursive: true, force: true });
