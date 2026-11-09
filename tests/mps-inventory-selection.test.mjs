import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultInventoryMonth,
  inventoryVersionOrder,
} from '../static/mps/source/inventory-selection.js';

test('库存默认月份与版本优先级在20日和21日切换，跨年进入次年一月', () => {
  const early = new Date(2026, 10, 20);
  const late = new Date(2026, 10, 21);
  assert.equal(defaultInventoryMonth(early), '2026-11');
  assert.deepEqual(inventoryVersionOrder('2026-11', early), ['纠偏', '月初']);
  assert.equal(defaultInventoryMonth(late), '2026-12');
  assert.deepEqual(inventoryVersionOrder('2026-12', late), ['月初', '滚动']);
  assert.equal(defaultInventoryMonth(new Date(2026, 11, 31)), '2027-01');
});
