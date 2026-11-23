import test from 'node:test';
import assert from 'node:assert/strict';
import { inventoryTurnoverReport } from '../static/mps/source/inventory-target-view.js';

test('正天数和回退采用同一周转报告，显示来源和下月需求计算输入', () => {
  const row = {
    month: '2026-11',
    base: '甲',
    code: 'A',
    name: '产品甲',
    safetyDays: 15,
    safetyDaysSource: 'target-turnover-days',
    targetInventory: 150,
    projectedClosing: null,
    nextMonth: '2026-12',
    nextMonthDemand: 310,
    nextMonthDays: 31,
    turnoverPolicy: {
      sourceDays: 15,
      sourceMonths: ['2026-12'],
      sourceVersion: '滚动',
      missing: [],
      fallbackReason: '2026-12 月初缺目标记录',
      attempts: [],
    },
  };
  const report = inventoryTurnoverReport(row);
  assert.equal(report.异常类别, '周转天数版本回退');
  assert.equal(report.来源月, '2026-12');
  assert.equal(report.来源版本, '滚动');
  assert.equal(report.下月有效需求, 310);
  assert.equal(report.回退原因, '2026-12 月初缺目标记录');
  assert.equal(report.计算依据, '15天×2026-12有效需求310÷31个自然日');
  const missing = inventoryTurnoverReport({ ...row, targetInventory: null, nextMonthDemand: null });
  assert.match(missing.实际处理, /目标库存仍待补/);
  assert.match(missing.计算依据, /2026-12有效需求待补/);
});
