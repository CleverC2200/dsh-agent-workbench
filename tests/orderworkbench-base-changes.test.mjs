import test from 'node:test';
import assert from 'node:assert/strict';
import { workbenchPresentation } from '../prototypes/inventory-orderworkbench/live-presentation.mjs';
import { computeWorkbenchMetrics } from '../prototypes/inventory-orderworkbench/metric-model.mjs';
import { changesSection } from '../prototypes/inventory-orderworkbench/metric-sections.mjs';
import { mergeCancellationPartitions } from '../prototypes/inventory-orderworkbench/change-partitions.mjs';
import { aggregateCancellationSql } from '../business/inventory-orderworkbench/sku-cancellations.mjs';
import {
  cancellationEvents,
  periodChangesSql,
} from '../business/inventory-orderworkbench/document-queries.mjs';
import {
  aggregateAmendmentSql,
  skuAmendmentEventsSql,
} from '../business/inventory-orderworkbench/sku-amendments.mjs';
import {
  cancellationDb,
  cancellationLine,
  sqliteCancellationSql,
  octoberCancellationParameters,
} from './helpers/cancellation-fixture.mjs';

const change = (base, kind, numerator, denominator) => ({
  base,
  kind,
  numerator,
  denominator,
  records: 1,
  invalid: 0,
  sample_numerator: numerator,
  sample_denominator: denominator,
  sample_records: 1,
  unknown_quantity: 0,
});
const period = (rows) => {
  const value = {
    sections: [
      changesSection(
        ['1', '2'].map((kind) => ({
          id: kind,
          status: 'ready',
          rows: rows.filter((row) => row.kind === kind),
        })),
      ),
    ],
  };
  value.metrics = computeWorkbenchMetrics(value);
  return value;
};

test('base change columns use scoped quantities, weighted totals, and independent month/week comparisons', () => {
  const current = period([
    change('华东', '2', 1, 100),
    change('华南', '2', 30, 300),
    change('濮阳', '2', 500, 500),
    change('华东', '1', 5, 100),
    change('华南', '1', 60, 300),
    change('濮阳', '1', 500, 500),
  ]);
  const previous = period([change('华东', '2', 2, 100), change('华东', '1', 6, 100)]);
  const year = period([change('华东', '2', 3, 100), change('华东', '1', 7, 100)]);
  const week = period([change('华东', '2', 4, 100), change('华东', '1', 8, 100)]);
  const facts = {
    selected: 'month',
    periods: {
      month: current,
      previousMonth: previous,
      yearMonth: year,
      week,
      previousWeek: previous,
      yearWeek: year,
    },
  };
  const view = workbenchPresentation(facts).performance['base-performance'];
  assert.deepEqual(
    view.month.map((row) => row[0]),
    ['华东', '华南', '合计'],
  );
  const east = view.month.find((row) => row[0] === '华东');
  assert.equal(east[1].text, '1.00%');
  assert.equal(east[1].state, 'good');
  assert.equal(view.month.find((row) => row[0] === '华南')[1].state, 'bad');
  assert.equal(east[2], '-1.00%');
  assert.equal(east[3], '-2.00%');
  assert.equal(east[4].text, '5.00%');
  assert.equal(east[5], '-1.00%');
  assert.equal(east[6], '-2.00%');
  const total = view.month.find((row) => row[0] === '合计');
  assert.equal(total[1].raw, 7.75);
  assert.equal(total[4].raw, 16.25);
  assert.equal(view.week[0][1].text, '4.00%');
  assert.equal(view.week[0][2], '+2.00%');
  assert.equal(view.week[0][3], '+1.00%');
  assert.equal(view.week[0][4].text, '8.00%');
  assert.equal(view.week[0][5], '+2.00%');
  assert.equal(view.week[0][6], '+1.00%');
});

test('one failed change metric leaves the other base metric visible without replacing missing data with zero', () => {
  const current = period([change('华东', '2', 1, 100)]);
  current.sections[0] = changesSection([
    { id: '1', status: 'error', code: 'SOURCE_UNAVAILABLE', rows: [] },
    { id: '2', status: 'ready', rows: [change('华东', '2', 1, 100)] },
  ]);
  current.metrics = computeWorkbenchMetrics(current);
  const row = workbenchPresentation({ selected: 'month', periods: { month: current } }).performance[
    'base-performance'
  ].month[0];
  assert.equal(row[1].text, '1.00%');
  assert.equal(row[4].text, '—');
  assert.match(row[4].title, /SOURCE_UNAVAILABLE|查询/);
  assert.equal(row[2].text, '—');
});

test('SQL base grouping retains distinct bases within one sales region and sums back to the existing national quantities', () => {
  const rows = [
    cancellationLine('east0', {
      belong_base: '华东',
      pickup_point: '02',
      need_qty_origin: 100,
      change_order_qty: 90,
    }),
    cancellationLine('south1', {
      belong_base: '华南',
      pickup_point: '04',
      need_qty_origin: 300,
      change_order_qty: 240,
    }),
    cancellationLine('cancel2', {
      belong_base: '华东',
      pickup_point: '02',
      orderstatus: 90,
      canceltime: '2026-10-02',
      need_qty_origin: 10,
    }),
  ];
  const db = cancellationDb({ daily: rows });
  try {
    db.exec(
      "ALTER TABLE agents_scm_execute_detail_d ADD COLUMN order_close_time DEFAULT '2026-10-02'; ALTER TABLE agents_scm_execute_detail_d ADD COLUMN is_short_transfer DEFAULT '非短拨'; ALTER TABLE agents_scm_execute_detail_d ADD COLUMN is_stat DEFAULT '1'",
    );
    const read = (sql) =>
      db
        .prepare(sqliteCancellationSql(sql))
        .all(
          Object.fromEntries(
            Object.entries(octoberCancellationParameters).filter(([key]) =>
              sql.includes(':' + key),
            ),
          ),
        )
        .map((r) => ({ ...r }));
    for (const [nationalSql, baseSql] of [
      [
        aggregateCancellationSql(cancellationEvents),
        aggregateCancellationSql(cancellationEvents, { base: true }),
      ],
      [
        aggregateAmendmentSql(skuAmendmentEventsSql()),
        aggregateAmendmentSql(skuAmendmentEventsSql(), false, false, true),
      ],
    ]) {
      const national = read(nationalSql),
        bases = read(baseSql);
      assert.deepEqual(bases.map((r) => r.base).sort(), ['华东', '华南']);
      for (const field of ['numerator', 'denominator', 'records'])
        assert.equal(
          bases.reduce((sum, r) => sum + r[field], 0),
          national.reduce((sum, r) => sum + r[field], 0),
        );
    }
    const a = change('华东', '1', 1, 10),
      b = change('华南', '1', 2, 20);
    const merged = mergeCancellationPartitions([
      [a, b],
      [a, b],
    ]);
    assert.equal(merged.length, 2);
    assert.deepEqual(
      merged.map((r) => r.denominator),
      [20, 40],
    );
    for (const kind of ['1', '2']) {
      const query = periodChangesSql(kind, { base: true });
      const rows = read(`WITH report_windows(period_index,enabled,start_date,end_date) AS
        (VALUES(0,TRUE,'2026-10-01','2026-11-01'),(1,TRUE,'2026-09-01','2026-10-01'))
        ${query.ctes ? ',' + query.ctes : ''} ${query.sql}`);
      assert.deepEqual(rows.map((row) => row.base).sort(), ['华东', '华南']);
      assert.ok(rows.every((row) => row.period_index === 0));
    }
  } finally {
    db.close();
  }
});
