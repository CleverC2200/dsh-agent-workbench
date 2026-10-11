import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from './public-build.mjs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const dir = await mkdtemp(join(tmpdir(), 'aps-finance-'));
await build({
  entryPoints: ['app/data/adapter.ts'],
  outfile: join(dir, 'adapter.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
});
const { metricValues } = await import(join(dir, 'adapter.mjs'));
const data = {
  start: '2026-09-01',
  end: '2026-09-22',
  granularity: 'month',
  sections: [
    {
      id: 'finance',
      status: 'ready',
      rows: [
        { month: '202609', region: 'A', actual: 110, invalid: 0 },
        { month: '202609', region: 'B', actual: 50, invalid: 0 },
      ],
    },
    {
      id: 'sales-budget',
      status: 'ready',
      rows: [
        { month: '202609', region: 'A', budget: 100, invalid: 0 },
        { month: '202609', region: 'B', budget: 100, invalid: 0 },
      ],
    },
  ],
};
test('未税实际与独立预算汇总、组织过滤、不平均比例', () => {
  assert.equal(metricValues(data)['销售预算达成率'], 80);
  assert.ok(Math.abs(metricValues(data, { region: 'A' })['销售预算达成率'] - 110) < 1e-9);
  assert.equal(metricValues(data).__sales, 0.016);
  assert.ok(Number.isNaN(metricValues(data, { base: '郑州' })['销售预算达成率']));
});
test('年度预算达成率按各月达成率平均，不用年度金额直接相除', () => {
  const annual = {
    start: '2026-08-01',
    end: '2026-09-30',
    granularity: 'year',
    sections: [
      {
        id: 'finance',
        status: 'ready',
        rows: [
          { month: '202608', actual: 100, invalid: 0 },
          { month: '202609', actual: 150, invalid: 0 },
        ],
      },
      {
        id: 'sales-budget',
        status: 'ready',
        rows: [
          { month: '202608', budget: 100, invalid: 0 },
          { month: '202609', budget: 300, invalid: 0 },
        ],
      },
    ],
  };
  assert.equal(metricValues(annual)['销售预算达成率'], 75);
});
test('缺失、失败、零预算、多月份不全不输出率', () => {
  for (const transform of [
    (d) => d.sections[1].rows.forEach((r) => (r.budget = 0)),
    (d) => (d.sections[0].rows[0].invalid = 1),
    (d) => (d.sections[0].status = 'error'),
    (d) => (d.start = '2026-08-01'),
  ]) {
    const d = structuredClone(data);
    transform(d);
    assert.ok(Number.isNaN(metricValues(d)['销售预算达成率']));
  }
});
await rm(dir, { recursive: true, force: true });
