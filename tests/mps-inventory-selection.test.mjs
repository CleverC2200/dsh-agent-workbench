import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultInventoryMonth,
  inventoryVersionOrder,
  selectedInventoryMonth,
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

test('来源月沿真实读取起月，旧版显式评估月份不随今日日期重写', () => {
  assert.equal(selectedInventoryMonth({ month: '2026-04' }), '2026-04');
  assert.equal(
    selectedInventoryMonth({
      month: '2026-04',
      inventoryTargetsRead: {
        status: 'ready',
        metadata: { start_month: '2026-03', end_month: '2026-05' },
      },
    }),
    '2026-03',
  );
  assert.equal(defaultInventoryMonth(new Date(2026, 11, 20)), '2026-12');
  assert.equal(defaultInventoryMonth(new Date(2026, 11, 21)), '2027-01');
  assert.deepEqual(inventoryVersionOrder('2027-01', new Date(2026, 11, 21)), ['月初', '滚动']);
});
