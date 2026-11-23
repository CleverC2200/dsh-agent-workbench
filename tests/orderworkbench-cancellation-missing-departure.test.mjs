import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cancellationChangesSql,
  baseCancellationChangesSql,
} from '../business/inventory-orderworkbench/document-queries.mjs';
import {
  cancellationDb,
  cancellationLine,
  sqliteCancellationSql,
} from './helpers/cancellation-fixture.mjs';
import {
  computeWorkbenchMetrics,
  metricDelta,
} from '../prototypes/inventory-orderworkbench/metric-model.mjs';
import { metricSnapshot } from '../prototypes/inventory-orderworkbench/metric-components.mjs';

test('historical cancellation dates and confirmed shipments remain available without OMS latest departure', () => {
  const make = (id, extra) =>
    cancellationLine(id, {
      header_addtime: '2025-11-01 00:00:00',
      latestsendcardate: null,
      ...extra,
    });
  const db = cancellationDb({
    shipments: [],
    daily: [
      make('cancel', {
        orderstatus: 90,
        detailstatus: 20,
        canceltime: '2025-11-03 10:00:00',
        need_qty_origin: 10,
      }),
      make('shipped', {
        orderstatus: 100,
        qtyshipped: 90,
        wms_close_time: '2025-11-04 10:00:00',
        need_qty_origin: 90,
      }),
      make('unshipped', { need_qty_origin: 700 }),
      make('early', { orderstatus: 90, canceltime: '2025-11-01 12:00:00', need_qty_origin: 500 }),
    ],
  });
  const parameters = { gea_p900: '', gea_p1: '2025-11-01', gea_p2: '2025-11-24' };
  try {
    const read = (sql) =>
      db
        .prepare(sqliteCancellationSql(sql))
        .all(parameters)
        .map((row) => ({ ...row }));
    const rows = read(cancellationChangesSql);
    const period = {
      start: parameters.gea_p1,
      end: parameters.gea_p2,
      sections: [{ id: 'changes', status: 'ready', rows }],
    };
    period.metrics = computeWorkbenchMetrics(period);
    const card = metricSnapshot(period, '作废率');
    assert.equal(card.numerator, 10);
    assert.equal(card.denominator, 100);
    assert.equal(card.pending, 0);
    assert.equal(card.value, 10);
    const grouped = read(baseCancellationChangesSql);
    assert.equal(
      grouped.reduce((total, row) => total + row.numerator, 0),
      card.numerator,
    );
    assert.equal(
      grouped.reduce((total, row) => total + row.denominator, 0),
      card.denominator,
    );
    assert.equal(metricDelta({ 作废率: { value: 12 } }, period.metrics, '作废率'), '+2.00%');
    db.exec("UPDATE agents_scm_execute_detail_d SET latestsendcardate='2025-11-09 00:00:00'");
    assert.deepEqual(read(cancellationChangesSql), rows);
  } finally {
    db.close();
  }
});
