import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
await mkdir('.scratch', { recursive: true });
for (const [name, path] of [
  ['workflow', 'business/inventory-fc/source/inventory-light-plugins/src/pages/fc-workflow.ts'],
  ['cycles', 'business/shared/fc-cycle-rules.ts'],
]) {
  await build({
    entryPoints: [path],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: `.scratch/fc-${name}-real.mjs`,
    external: ['zod'],
  });
}
const { applyFcPlan, rowKey, validateFcSubmission, summarizeFcRows } = await import(
  pathToFileURL(resolve('.scratch/fc-workflow-real.mjs'))
);
const { validateFcCycleRules, fcCycleParameters } = await import(
  pathToFileURL(resolve('.scratch/fc-cycles-real.mjs'))
);
const row = {
  warehouse_code: 'W1',
  sku: 'S1',
  available_qty: 25,
  inventory_qty: 50,
  open_transfer_reported_qty: 40,
  current_order_remaining: 80,
  month_ship_positive: 30,
  period_next_out: 300,
  cycle_days: 7,
};
const plans = [
  { warehouseCode: 'W1', sku: 'S1', month: '2026-10', outboundQty: 310, transferQty: 20 },
];
test('net demand subtracts remaining demand once and transfer once; derived columns follow imported plan', () => {
  const r = applyFcPlan(row, plans, '2026-10-26', 7);
  assert.equal(r.recommended_qty, 115);
  assert.equal(r.target_inventory_qty, 100);
  assert.equal(r.order_adjusted_available_qty, -55);
  assert.equal(r.daily_plan, 10);
  assert.equal(r.forecast_turnover_days, 5);
  assert.equal(r.period_current_daily, 10);
  assert.equal(r.period_remaining_out, 280);
  assert.equal(r.expected_month_end_qty, -265);
});
test('whole-month override excludes missing SKU, preserves other warehouse, and propagates unknown totals', () => {
  const missing = applyFcPlan({ ...row, sku: 'S2', month_out_plan: 310 }, plans, '2026-10-26', 7);
  assert.equal(missing.recommended_qty, null);
  assert.equal(missing.period_current_out, null);
  const other = { ...row, warehouse_code: 'W2' };
  assert.equal(applyFcPlan(other, plans, '2026-10-26', 7), other);
  assert.equal(summarizeFcRows([missing, { recommended_qty: 5 }]).recommended, null);
});
test('natural-month ceil and tomorrow-start horizon cover month-end, leap year and year boundary', () => {
  for (const [date, month, out, next, forecast] of [
    ['2026-10-31', '2026-10', 32, 300, 10],
    ['2024-02-28', '2024-02', 30, 31, 2],
    ['2026-12-31', '2026-12', 31, 62, 2],
  ]) {
    const r = applyFcPlan(
      { ...row, period_next_out: next },
      [{ ...plans[0], month, outboundQty: out }],
      date,
      7,
    );
    assert.equal(r.daily_plan, forecast);
    assert.equal(r.period_current_daily, Math.ceil(out / (month === '2024-02' ? 29 : 31)));
  }
});
test('zero remains known; absent order or transfer blocks recommendation', () => {
  assert.equal(
    applyFcPlan(
      { ...row, current_order_remaining: 0 },
      [{ ...plans[0], outboundQty: 0 }],
      '2026-10-26',
      7,
    ).recommended_qty,
    0,
  );
  for (const field of ['current_order_remaining', 'open_transfer_reported_qty', 'available_qty'])
    assert.equal(
      applyFcPlan({ ...row, [field]: null }, plans, '2026-10-26', 7).recommended_qty,
      null,
    );
});
test('zero reduction requires a reason and unknown recommendation cannot submit', () => {
  const r = { ...row, recommended_qty: 10 },
    key = rowKey(r);
  assert.throws(() => validateFcSubmission([r], { [key]: 0 }, {}), /理由/);
  assert.doesNotThrow(() => validateFcSubmission([r], { [key]: 0 }, { [key]: '本次不补货' }));
  assert.throws(
    () => validateFcSubmission([{ ...r, recommended_qty: null }], { [key]: 1 }, {}),
    /待核实/,
  );
});
test('cycle specificity sorted before serialization; dates and duplicate objects validated', () => {
  const rule = { level: 'warehouse', object: 'W1', days: 7, from: '', to: '' };
  const params = fcCycleParameters([rule, { ...rule, level: 'sku', object: 'S1', days: 14 }]);
  assert.equal(params.fc_cycle_0_level, 'sku');
  assert.equal(params.fc_cycle_0_days, 14);
  assert.throws(() => validateFcCycleRules([rule, rule]));
  assert.throws(() => validateFcCycleRules([{ ...rule, from: '2026-02-30' }]));
});

test('local import cannot bypass the server snapshot eligibility gate', () => {
  assert.equal(
    applyFcPlan({ ...row, calculation_order_remaining: null }, plans, '2026-10-26', 7)
      .recommended_qty,
    null,
  );
});
