import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const out = await build({
  entryPoints: ['business/shared/qll-dashboard-insight.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { chainDashboardEvidence, chainStockMetrics, chainFulfillmentMetrics } = await import(
  'data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64')
);
test('company insight uses physical stock and retains channel signal with switch off', () => {
  const parts = {
    health: {
      summary: { total_qty: 100, weighted_age_sum: 200, age_weight_qty: 100 },
      snapshotDate: '2026-10-30',
    },
    'branch-stock': {
      summary: { total_qty: 50, available_qty: 10, weighted_age_sum: 200, age_weight_qty: 50 },
      snapshotDate: '2026-10-30',
    },
    'channel-overview': {
      summary: { inventory: 20, total_inventory: 70, in_transit: 50 },
      snapshotDate: '2026-10-29',
    },
  };
  const off = chainDashboardEvidence(parts, '2026-10-30', false);
  const on = chainDashboardEvidence(parts, '2026-10-30', true);
  assert.equal(off.totals.companyInventory, 150);
  assert.equal(on.totals.companyInventory, 150);
  assert.equal(off.totals.displayedInventory, 150);
  assert.equal(on.totals.displayedInventory, 170);
  assert.match(on.channel.usage, /计入主值/);
  assert.equal(off.channel.inventory, 20);
  assert.match(off.channel.usage, /未计入主值/);
  assert.equal(off.rankings, null);
  assert.equal(off.totals.currentOrderShortage, null);
  assert.equal(
    chainDashboardEvidence({ ...parts, 'branch-stock': undefined }, '2026-10-30', false).totals
      .companyInventory,
    null,
  );
});
test('different inventory dates do not become one company total', () => {
  const evidence = chainDashboardEvidence(
    {
      health: { summary: { total_qty: 100 }, snapshotDate: '2026-10-30' },
      'branch-stock': { summary: { total_qty: 50 }, snapshotDate: '2026-10-29' },
    },
    '2026-10-30',
    false,
  );
  assert.equal(evidence.totals.companyInventory, null);
  assert.match(evidence.coverage.missing.join(' '), /快照不同日/);
});

test('chain turnover divides summed stock by summed daily movement and includes matched channel rows', () => {
  const parts = {
    health: { summary: { total_qty: 100 }, snapshotDate: '2026-11-02' },
    'branch-stock': { summary: { total_qty: 50 }, snapshotDate: '2026-11-02' },
    base: { summary: { matched_turnover_inventory: 100, matched_turnover_demand: 10 } },
    'base-shipments': { summary: { rolling_ship_positive: 300, rolling_missing_qty: 0 } },
    'branch-replenishment': {
      summary: {
        rolling_ship_daily: 20,
        historical_turnover_days: 2.5,
        matched_turnover_inventory: 50,
        matched_turnover_daily: 20,
      },
    },
    'channel-overview': {
      summary: {
        inventory: 120,
        total_inventory: 170,
        in_transit: 50,
        onhand_cover_inventory: 90,
        onhand_cover_sales30: 900,
        valid_onhand_cover: 2,
      },
      snapshotDate: '2026-11-01',
    },
  };
  const off = chainStockMetrics(parts, false);
  const on = chainStockMetrics(parts, true);
  assert.equal(off.inventory, 150);
  assert.equal(off.baseTurnover, 10);
  assert.equal(off.branchTurnover, 2.5);
  assert.equal(off.turnover, 5);
  assert.equal(on.inventory, 270);
  assert.equal(on.turnoverInventory, 240);
  assert.equal(on.turnoverDaily, 60);
  assert.equal(on.turnover, 4);
  assert.equal(
    chainStockMetrics({ ...parts, 'channel-overview': undefined }, true).inventory,
    null,
  );
  assert.equal(chainStockMetrics({ ...parts, 'channel-overview': undefined }, true).turnover, null);
  const zero = {
    ...parts,
    'channel-overview': {
      summary: {
        inventory: 0,
        total_inventory: 50,
        in_transit: 50,
        onhand_cover_inventory: 0,
        onhand_cover_sales30: 0,
        valid_onhand_cover: 1,
      },
    },
  };
  assert.equal(chainStockMetrics(zero, true).inventory, 150);
  assert.equal(chainStockMetrics(zero, true).turnover, 5);
  assert.equal(
    chainStockMetrics(
      { ...parts, 'branch-stock': { ...parts['branch-stock'], snapshotDate: '2026-11-01' } },
      true,
    ).turnover,
    null,
  );
});

test('company fulfillment adds shipped-pool quantities and never averages rates', () => {
  const parts = {
    'factory-overview': {
      summary: {
        fulfillment_shipped_quantity: 90,
        fulfillment_order_quantity: 100,
        fulfillment_rate: 0.9,
      },
    },
    'branch-overview': {
      summary: {
        fulfillment_shipped_quantity: 1,
        fulfillment_order_quantity: 10,
        fulfillment_rate: 0.1,
      },
    },
  };
  assert.equal(chainFulfillmentMetrics(parts).rate, (91 / 110) * 100);
  assert.equal(chainFulfillmentMetrics({ ...parts, 'branch-overview': undefined }).rate, null);
  assert.equal(
    chainFulfillmentMetrics({
      'factory-overview': {
        summary: { fulfillment_shipped_quantity: 0, fulfillment_order_quantity: 0 },
      },
      'branch-overview': {
        summary: { fulfillment_shipped_quantity: 0, fulfillment_order_quantity: 0 },
      },
    }).rate,
    null,
  );
});

test('branch turnover uses the same available-stock movement scope as the branch workbench', () => {
  const parts = {
    health: { summary: { total_qty: 300 }, snapshotDate: '2026-11-06' },
    'branch-stock': { summary: { total_qty: 100 }, snapshotDate: '2026-11-06' },
    base: { summary: { matched_turnover_inventory: 300, matched_turnover_demand: 30 } },
    'base-shipments': { summary: { rolling_ship_positive: 900, rolling_missing_qty: 0 } },
    'branch-replenishment': {
      summary: {
        rolling_ship_daily: 10,
        historical_turnover_days: 6,
        turnover_count: 2,
        matched_turnover_inventory: 60,
        matched_turnover_daily: 10,
      },
    },
  };
  assert.equal(chainStockMetrics(parts, false).branchTurnover, 6);
  assert.equal(chainStockMetrics(parts, false).turnover, 9);
  assert.equal(
    chainStockMetrics(
      { ...parts, 'branch-replenishment': { summary: { rolling_ship_daily: 10 } } },
      false,
    ).branchTurnover,
    null,
  );
  assert.equal(
    chainStockMetrics(
      {
        ...parts,
        'branch-replenishment': {
          summary: { rolling_ship_daily: 10, historical_turnover_days: 0 },
        },
      },
      false,
    ).branchTurnover,
    0,
  );
});
