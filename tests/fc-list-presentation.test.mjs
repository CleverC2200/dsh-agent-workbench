import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const bundle = await build({
  entryPoints: [
    'business/inventory-fc/source/inventory-light-plugins/src/pages/fc-list-presentation.ts',
  ],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const { fcReplenishmentDisplay, fcAgingDisplay } = await import(
  'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64')
);
test('DSH display rounding never mutates source quantities or fabricates missing advice', () => {
  const row = {
    recommended_qty: 12.01,
    target_inventory_qty: 10.1,
    historical_turnover_days: 2,
    urgent: 1,
  };
  const before = JSON.stringify(row);
  assert.equal(fcReplenishmentDisplay(row, 'recommended_qty'), '13');
  assert.equal(fcReplenishmentDisplay(row, 'target_inventory_qty'), '11');
  assert.equal(fcReplenishmentDisplay(row, 'historical_turnover_days'), '2.0');
  assert.equal(fcReplenishmentDisplay(row, 'urgent'), '是');
  assert.equal(fcReplenishmentDisplay({ recommended_qty: null, urgent: 0 }, 'urgent'), '-');
  assert.equal(fcReplenishmentDisplay({ recommended_qty: null }, 'recommended_qty'), '-');
  assert.equal(JSON.stringify(row), before);
});
test('age shares include unaged positive stock and keep zero distinct from missing', () => {
  assert.equal(
    fcAgingDisplay({ age0_30: 10, age_weight_qty: 10, unknown_age_qty: 10 }, 'age0_30'),
    '10 / 50.0%',
  );
  assert.equal(
    fcAgingDisplay({ age0_30: 0, age_weight_qty: 0, unknown_age_qty: 0 }, 'age0_30'),
    '0 / 0.0%',
  );
  assert.equal(
    fcAgingDisplay({ age0_30: null, age_weight_qty: 0, unknown_age_qty: 0 }, 'age0_30'),
    '-',
  );
  assert.equal(
    fcAgingDisplay({ daily_movement: 0, historical_turnover: 12 }, 'historical_turnover'),
    '-',
  );
});

test('remaining transfer shows a confirmed zero without inventing unknown monthly movements', () => {
  assert.equal(
    fcReplenishmentDisplay({ warehouse_month_transfer_plan: 0 }, 'current_remaining_transfer_qty'),
    '0',
  );
  assert.equal(
    fcReplenishmentDisplay(
      { warehouse_month_transfer_plan: 50, transferred_qty: 12.2 },
      'current_remaining_transfer_qty',
    ),
    '38',
  );
  assert.equal(
    fcReplenishmentDisplay(
      { warehouse_month_transfer_plan: 50, transferred_qty: null },
      'current_remaining_transfer_qty',
    ),
    '-',
  );
});
