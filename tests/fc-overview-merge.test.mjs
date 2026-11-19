import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const built = await build({
  entryPoints: ['business/shared/fc-overview-merge.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { mergeFcOverviews, mergeFcSummaries } = await import(
  'data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64')
);
test('weighted metrics use quantities rather than warehouse averages', () => {
  const value = mergeFcSummaries([
    {
      total_qty: 100,
      age_weight_qty: 100,
      weighted_age: 10,
      fulfillment_order_quantity: 100,
      fulfillment_shipped_quantity: 100,
      fulfillment_rate: 1,
      historical_turnover_days: 5,
      review_turn_inventory: 50,
      review_turn_daily: 10,
      forecast_supply_qty: 150,
      forecast_outbound_daily: 30,
    },
    {
      total_qty: 300,
      age_weight_qty: 300,
      weighted_age: 30,
      fulfillment_order_quantity: 300,
      fulfillment_shipped_quantity: 150,
      fulfillment_rate: 0.5,
      historical_turnover_days: 20,
      review_turn_inventory: 60,
      review_turn_daily: 3,
      forecast_supply_qty: 400,
      forecast_outbound_daily: 20,
    },
  ]);
  assert.equal(value.total_qty, 400);
  assert.equal(value.weighted_age, 25);
  assert.equal(value.fulfillment_rate, 0.625);
  assert.equal(value.historical_turnover_days, (50 + 60) / (10 + 3));
  assert.equal(value.forecast_turnover_days, 11);
});
test('missing measures and failed or mixed snapshot branches cannot become complete totals', () => {
  assert.equal(mergeFcSummaries([{ total_qty: 100 }, { total_qty: null }]).total_qty, null);
  for (const other of [
    { error: 'denied' },
    { snapshotDate: '2026-11-02', summary: { total_qty: 200 } },
  ]) {
    const value = mergeFcOverviews([
      { 'branch-stock': { snapshotDate: '2026-11-01', summary: { total_qty: 100 } } },
      { 'branch-stock': other },
    ]);
    assert.ok(value['branch-stock'].error);
    assert.equal(value['branch-stock'].summary, undefined);
  }
});
test('order rows retain missing values and scope while a single warehouse stays unchanged', () => {
  const one = { 'current-shortage': { rows: [{ warehouse_code: 'A', shortage: 10 }] } };
  const two = {
    'current-shortage': { rows: [{ warehouse_code: 'B', shortage: null }], partial: true },
  };
  assert.equal(mergeFcOverviews([one]), one);
  const merged = mergeFcOverviews([one, two]);
  assert.equal(merged['current-shortage'].rows.length, 2);
  assert.equal(merged['current-shortage'].partial, true);
});
