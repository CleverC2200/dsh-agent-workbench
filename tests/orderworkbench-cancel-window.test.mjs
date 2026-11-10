import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cancellationDb,
  cancellationLine,
  sqliteCancellationSql,
} from './helpers/cancellation-fixture.mjs';
import { cancellationChangesSql as changesSql } from '../business/inventory-orderworkbench/document-queries.mjs';
import { computeWorkbenchMetrics } from '../prototypes/inventory-orderworkbench/metric-model.mjs';

function calculate(rows) {
  const db = cancellationDb({
    hourly: rows.map(([id, cancelled, delivery = '2026-11-05 00:00:00', status = 90]) =>
      cancellationLine(id, {
        header_addtime: '2026-11-01 00:00:00',
        requireddeliverytime: delivery,
        latestsendcardate: '2026-11-01 12:00:00',
        orderstatus: status,
        canceltime: cancelled,
        need_qty_origin: 1,
      }),
    ),
  });
  try {
    const sql = sqliteCancellationSql(changesSql);
    return db
      .prepare(sql)
      .all({ gea_p900: '', gea_p1: '2026-11-01', gea_p2: '2026-11-04' })
      .find((row) => row.kind === '1');
  } finally {
    db.close();
  }
}

test('only cancellation strictly after twelve hours contributes; early cancellations leave both counts', () => {
  const row = calculate([
    ['early', '2026-11-01 11:59:59'],
    ['boundary', '2026-11-01 12:00:00'],
    ['late', '2026-11-01 12:00:01'],
    ['active', null, null, 10],
  ]);
  assert.equal(row.numerator, 1);
  assert.equal(row.denominator, 2);
  const metric = computeWorkbenchMetrics({
    start: '2026-11-01',
    end: '2026-11-04',
    sections: [{ id: 'changes', status: 'ready', rows: [row] }],
  })['作废率'];
  assert.equal(metric.value, 50);
  assert.match(metric.note, /超过12小时/);
});

test('unresolved cancellation timestamp remains unknown rather than zero', () => {
  const row = calculate([
    ['missing', null],
    ['late', '2026-11-01 13:00:00'],
  ]);
  assert.equal(row.invalid, 1);
  assert.equal(row.numerator, null);
  assert.equal(row.denominator, null);
  assert.equal(row.sample_numerator, 1);
});

test('cancellation outside the historical event cutoff leaves the selected period', () => {
  const row = calculate([
    ['later-period', '2026-11-04 01:00:00'],
    ['active', null, null, 10],
  ]);
  assert.equal(row.numerator, 0);
  assert.equal(row.denominator, 1);
});
