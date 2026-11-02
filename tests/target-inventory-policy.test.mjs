import test from 'node:test';
import assert from 'node:assert/strict';
import {
  selectDefaultPublishedTargetInventory,
  selectWholeBaseTargetVersion,
  targetVersionCandidates,
} from '../business/shared/target-inventory-policy.js';

const row = (base, sku, month, version, target) => ({
  'safety_stock.base_name': base,
  'safety_stock.material_code': sku,
  'safety_stock.target_month': month,
  'safety_stock.inventory_version': version,
  'safety_stock.final_target_inventory': target,
});

test('the 21st switches to next month month-start before rolling, even if correction exists', () => {
  const rows = ['纠偏', '月初', '滚动'].flatMap((v) => [
    row('A', 'one', '2026-10-01', v, 100),
    row('A', 'one', '2026-11-01', v, 200),
  ]);
  const early = selectDefaultPublishedTargetInventory(rows, new Date('2026-10-20T23:59:59+08:00'));
  assert.equal(early.targetMonth, '2026-10-01');
  assert.equal(early.inventoryVersion, '纠偏');
  const late = selectDefaultPublishedTargetInventory(rows, new Date('2026-10-21T00:00:00+08:00'));
  assert.equal(late.targetMonth, '2026-11-01');
  assert.equal(late.inventoryVersion, '月初');
  const rolling = selectDefaultPublishedTargetInventory(
    rows.filter((r) => r['safety_stock.inventory_version'] !== '月初'),
    new Date('2026-10-30T00:00:00+08:00'),
  );
  assert.equal(rolling.inventoryVersion, '滚动');
});

test('whole base/month selection preserves NULL, zero and missing SKUs without borrowing fields', () => {
  const rows = [
    row('A', 'one', '2026-10-01', '纠偏', null),
    row('A', 'one', '2026-10-01', '月初', 100),
    row('A', 'two', '2026-10-01', '月初', 200),
    row('B', 'one', '2026-10-01', '月初', 0),
    row('B', 'one', '2026-10-01', '滚动', 100),
    row('A', 'one', '2026-11-01', '滚动', 300),
  ];
  const selected = selectWholeBaseTargetVersion(rows);
  assert.deepEqual(selected, [rows[0], rows[3], rows[5]]);
  assert.deepEqual(targetVersionCandidates(['纠偏']), ['纠偏', '月初']);
  assert.deepEqual(targetVersionCandidates(['月初']), ['月初', '滚动']);
});

test('stock-only rows do not vote for a target version or hide a base using month-start fallback', () => {
  const monthStart = row('A', 'one', '2026-10-01', '月初', 80);
  const stockOnly = {
    ...row('A', 'two', '2026-10-01', '纠偏', null),
    'safety_stock.source': 'ai-db-stock-only',
  };
  assert.deepEqual(selectWholeBaseTargetVersion([monthStart, stockOnly]), [monthStart, stockOnly]);
});
