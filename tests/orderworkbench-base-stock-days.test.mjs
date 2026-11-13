import test from 'node:test';
import assert from 'node:assert/strict';
import { computeWorkbenchMetrics } from '../prototypes/inventory-orderworkbench/metric-model.mjs';
import { workbenchPresentation } from '../prototypes/inventory-orderworkbench/live-presentation.mjs';

const row = (values = {}) => ({
  base: '郑州',
  category: '食品',
  item: '水饺',
  director: '总监甲',
  names: 1,
  summary: 1,
  stock_date: '2026-10-25',
  national_stock_records: 1,
  national_plan_records: 1,
  national_stock_invalid: 0,
  national_plan_invalid: 0,
  base_plan_invalid: 0,
  national_inventory: 50,
  national_sales_plan: 310,
  base_transfer_plan: 0,
  inventory: 50,
  sales_plan: 310,
  transfer_plan: 0,
  source_rows: 1,
  invalid: 0,
  ...values,
});
const unmatched = () => [
  row({
    national_inventory: 100,
    inventory: 100,
    national_plan_records: 0,
    national_sales_plan: null,
    sales_plan: null,
    transfer_plan: null,
    base_transfer_plan: null,
    source_rows: null,
    invalid: 1,
  }),
  row({
    national_inventory: null,
    inventory: null,
    national_stock_records: 0,
    base_transfer_plan: 62,
    transfer_plan: 62,
    invalid: 1,
  }),
  row(),
];
const period = (rows) => ({
  start: '2026-10-19',
  end: '2026-10-26',
  sections: [
    { id: 'stock', status: 'ready', rows },
    {
      id: 'orders',
      status: 'ready',
      rows: rows.map(({ base, director, names, summary }) => ({
        base,
        director,
        names,
        summary,
        demand: 1,
        shortage: 0,
        invalid: 0,
      })),
    },
  ],
});
const days = (rows, scope = 'base') =>
  computeWorkbenchMetrics(period(rows), undefined, { turnoverScope: scope })['周转天数'];

test('base stock and plans sum independently, with the base transfer coefficient', () => {
  const rows = unmatched();
  assert.ok(Math.abs(days(rows).value - (150 * 31) / (620 + 62 * 0.5)) < 1e-12);
  assert.equal(days(rows, 'national').value, 7.5);
  assert.equal(days(rows, 'item').value, 7.5);
});

test('base and director tables retain valid days when source SKUs do not overlap', () => {
  const p = period(unmatched());
  p.metrics = computeWorkbenchMetrics(p);
  const facts = { selected: 'week', complete: true, periods: { month: p, week: p } };
  for (const dimension of ['base-performance', 'director-performance']) {
    const tables = workbenchPresentation(facts, { dimension }).performance[dimension];
    assert.equal(tables.month[0].at(-3).text, '7.14');
    assert.equal(tables.week[0].at(-2).text, '7.14');
  }
});

test('real missing transfer, sales or inventory stays unknown; nationwide ignores transfer only', () => {
  const transfer = [row({ base_transfer_plan: null, base_plan_invalid: 1 })];
  assert.equal(days(transfer).value, null);
  assert.equal(days(transfer, 'national').value, 5);
  assert.match(days(transfer).missingReason, /来源内.*调拨计划缺失/);
  assert.equal(
    days([row({ national_sales_plan: null, national_plan_invalid: 1, base_plan_invalid: 1 })])
      .value,
    null,
  );
  assert.equal(days([row({ national_inventory: null, national_stock_invalid: 1 })]).value, null);
  assert.equal(days([row({ base_plan_invalid: undefined })]).value, null);
});

test('missing whole source, zero demand and duplicate plans are not replaced by zero', () => {
  assert.equal(days([unmatched()[0]]).value, null);
  assert.match(days([unmatched()[0]]).missingReason, /没有对应版本的月度计划/);
  assert.equal(days([unmatched()[1]]).value, null);
  assert.equal(days([row({ national_sales_plan: 0 })]).value, null);
  assert.equal(
    days([row({ national_plan_invalid: 1, base_plan_invalid: 1, source_rows: 2 })]).value,
    null,
  );
  assert.equal(days([row({ national_inventory: 0 })]).value, 0);
});

test('one invalid base does not suppress another base or director', () => {
  const p = period([
    ...unmatched(),
    row({ base: '华东', director: '总监乙', base_plan_invalid: 1 }),
  ]);
  p.metrics = computeWorkbenchMetrics(p);
  const facts = { selected: 'month', complete: true, periods: { month: p } };
  const base = workbenchPresentation(facts, { dimension: 'base-performance' }).performance[
    'base-performance'
  ].month;
  assert.equal(base.find((r) => r[0] === '郑州').at(-3).text, '7.14');
  assert.equal(base.find((r) => r[0] === '华东').at(-3).text, '—');
  const directors = workbenchPresentation(facts, { dimension: 'director-performance' }).performance[
    'director-performance'
  ].month;
  assert.equal(directors.find((r) => r[0] === '总监甲').at(-3).text, '7.14');
  assert.equal(directors.find((r) => r[0] === '总监乙').at(-3).text, '—');
});
