import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const output = await build({
  entryPoints: ['business/shared/full-chain-display.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { fullChainCards, formatChainValue } = await import(
  'data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].text).toString('base64')
);
test('available base inventory and matched turnover are primary values with their distinct coverage', () => {
  const cards = fullChainCards(
    {
      row_count: 10,
      known_inventory: '120',
      known_inventory_count: 8,
      matched_stock_days: '3',
      matched_turnover_count: 4,
      matched_turnover_inventory: 90,
      matched_turnover_demand: 30,
    },
    null,
  );
  assert.equal(cards[0].value, 120);
  assert.equal(cards[0].scope, '基地 · 范围 8 / 10 个SKU');
  assert.equal(cards[1].value, 3);
  assert.equal(cards[1].scope, '基地 · 同范围 4 / 10 个SKU');
  assert.equal(cards[1].details[0][1], 90);
  assert.equal(cards[1].details[1][1], 30);
});
test('over-60 quantity and period orders never substitute for average age or current pending', () => {
  const cards = fullChainCards(
    { row_count: 10, known_over60: 100, known_over60_count: 8 },
    { ordered: 500, shipped: 400 },
  );
  assert.equal(cards[2].value, null);
  assert.equal(cards[2].details[0][1], 100);
  assert.equal(cards[4].value, null);
  assert.equal(cards[4].details[0][1], 500);
});
test('zero stays visible, absent or zero coverage stays unknown', () => {
  assert.equal(
    fullChainCards({ row_count: 1, known_inventory: 0, known_inventory_count: 1 }, null)[0].value,
    0,
  );
  assert.equal(
    fullChainCards({ row_count: 1, known_inventory: 0, known_inventory_count: 0 }, null)[0].value,
    null,
  );
  assert.ok(fullChainCards(null, null).every((c) => c.value === null));
  assert.equal(formatChainValue(0, '件'), '0件');
  assert.equal(formatChainValue(null, '件'), '-');
  assert.equal(formatChainValue(4698200, '件'), '469.82万件');
});

test('confirmed 1:1 quantities use boxes without changing values and compact counts consistently', () => {
  const cards = fullChainCards(
    {
      known_inventory: 4757283,
      known_inventory_count: 3367,
      row_count: 3527,
      matched_turnover_inventory: 4685600,
      matched_turnover_demand: 335548.42,
      matched_turnover_count: 2592,
    },
    { ordered: 100, shipped: 90 },
  );
  assert.equal(cards[0].value, 4757283);
  assert.equal(cards[0].unit, '箱');
  assert.equal(cards[1].details[1][2], '箱/天');
  assert.equal(formatChainValue(cards[0].value, cards[0].unit), '475.73万箱');
  assert.equal(formatChainValue(1608948.15, '箱'), '160.89万箱');
  assert.equal(formatChainValue(335548.42, '箱/天'), '33.55万箱/天');
  assert.equal(formatChainValue(79.05, '天'), '79.05天');
  assert.equal(formatChainValue(0, '箱'), '0箱');
  assert.equal(formatChainValue(null, '箱'), '-');
  assert.equal(formatChainValue(NaN, '箱'), '-');
});
test('missing branch snapshot is explained and never replaced with base or shipment quantities', () => {
  const cards = fullChainCards(
    { known_inventory: 100, known_inventory_count: 1, row_count: 1 },
    { shipped: 50 },
  );
  assert.deepEqual(cards[0].details[1], ['分仓库存', null, '箱', '缺分仓库存快照']);
});

test('execution card exposes dated base snapshot orders independently of monthly shipments', () => {
  const stock = {
    known_open_orders: 1049341,
    known_open_orders_count: 3500,
    known_allocated: 261249,
    known_allocated_count: 3500,
    order_snapshot_count: 3500,
  };
  const orders = { ordered: 5244000, shipped: 5108900 };
  const card = fullChainCards(stock, orders, '滚动', '2026-10-19')[4];
  assert.equal(card.value, 1049341);
  assert.match(card.scope, /基地未备单量.*2026-10-19.*3500\/3500/);
  assert.equal(formatChainValue(card.value, card.unit), '104.93万箱');
  assert.deepEqual(card.details[2], ['基地已备单占用', 261249, '箱']);
  assert.equal(card.details[0][1], 5244000);
  assert.equal(card.details[1][1], 5108900);
  assert.equal(fullChainCards(stock, orders)[4].value, null);
});

test('snapshot order zero is visible and incomplete quantity coverage is labelled', () => {
  const stock = {
    known_open_orders: 0,
    known_open_orders_count: 1,
    known_allocated: 5,
    known_allocated_count: 1,
    order_snapshot_count: 2,
  };
  const card = fullChainCards(stock, null, '', '2026-10-19')[4];
  assert.equal(card.value, 0);
  assert.match(card.scope, /范围 1\/2/);
  assert.match(card.details[2][0], /范围 1\/2/);
  assert.equal(
    fullChainCards({ ...stock, known_open_orders_count: 0 }, null, '', '2026-10-19')[4].value,
    null,
  );
});
