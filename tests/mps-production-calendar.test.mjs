import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlanSources } from '../static/mps/source/plan-inputs.js';

const calendar = (month, overrides = []) =>
  buildPlanSources(
    {
      month,
      resources: [{ id: 'line', base: '华东', kind: 'tunnel', dailyTons: 10 }],
      productionDays: overrides,
    },
    null,
    null,
  ).productionDays;
const days = (rows, month) => rows.find((row) => row.month === month).days;

test('春节前后各五天按自然日期跨月分摊，普通月默认25天', () => {
  const rows = calendar('2025-01');
  assert.equal(days(rows, '2025-01'), 18);
  assert.equal(days(rows, '2025-02'), 22);
  assert.equal(days(rows, '2025-03'), 25);
  const boundary = calendar('2022-01');
  assert.equal(days(boundary, '2022-01'), 20);
  assert.equal(days(boundary, '2022-02'), 20);
});

test('十个停产日同月只扣该月，春节不固定在二月', () => {
  const current = calendar('2027-01');
  assert.equal(days(current, '2027-01'), 25);
  assert.equal(days(current, '2027-02'), 15);
  const january = calendar('2023-01');
  assert.equal(days(january, '2023-01'), 15);
  assert.equal(days(january, '2023-02'), 25);
});

test('人工生产天数是最终覆盖值，零、留空和重复记录不再套默认扣减', () => {
  const rows = calendar('2025-01', [
    { base: '华东', month: '2025-01', days: 15 },
    { base: '华东', month: '2025-02', days: 0 },
    { base: '华东', month: '2025-03', days: null },
  ]);
  assert.equal(days(rows, '2025-01'), 15);
  assert.equal(days(rows, '2025-02'), 0);
  assert.equal(days(rows, '2025-03'), null);
  assert.equal(
    days(
      calendar('2025-01', [
        { base: '华东', month: '2025-01', days: 15 },
        { base: '华东', month: '2025-01', days: 20 },
      ]),
      '2025-01',
    ),
    null,
  );
});
