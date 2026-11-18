import test from 'node:test';
import assert from 'node:assert/strict';
import { reportPeriods } from '../prototypes/inventory-orderworkbench/metric-model.mjs';

test('order periods end at China midnight while all inventory comparison periods retain today', () => {
  const periods = reportPeriods('2026-11-01', '2026-12-01', new Date('2026-11-17T04:00:00Z'));
  assert.equal(periods.month.end, '2026-11-17');
  assert.equal(periods.month.inventoryEnd, '2026-11-18');
  assert.equal(periods.previousMonth.end, '2026-10-17');
  assert.equal(periods.previousMonth.inventoryEnd, '2026-10-18');
  assert.equal(periods.yearMonth.end, '2025-11-17');
  assert.equal(periods.yearMonth.inventoryEnd, '2025-11-18');
  assert.equal(periods.week.start, '2026-11-16');
  assert.equal(periods.week.end, '2026-11-17');
  assert.equal(periods.previousWeek.end, '2026-11-10');
  assert.equal(periods.previousWeek.inventoryEnd, '2026-11-11');
  assert.equal(periods.yearWeek.end, '2025-11-18');
  assert.equal(periods.yearWeek.inventoryEnd, '2025-11-19');
});

test('Monday keeps the current calendar week with no completed order dates', () => {
  const periods = reportPeriods('2026-11-01', '2026-12-01', new Date('2026-11-16T04:00:00Z'));
  assert.equal(periods.week.start, '2026-11-16');
  assert.equal(periods.week.end, '2026-11-16');
  assert.equal(periods.week.inventoryEnd, '2026-11-17');
});

test('historical periods retain their original boundaries for orders and inventory', () => {
  const periods = reportPeriods('2026-10-12', '2026-10-19', new Date('2026-11-17T04:00:00Z'));
  assert.equal(periods.month.end, '2026-10-19');
  assert.equal(periods.month.inventoryEnd, '2026-10-19');
  assert.equal(periods.week.start, '2026-10-12');
  assert.equal(periods.week.end, '2026-10-19');
});
