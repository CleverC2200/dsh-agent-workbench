import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { cancellationChangesSql as changesSql } from '../business/inventory-orderworkbench/document-queries.mjs';
import { computeWorkbenchMetrics } from '../prototypes/inventory-orderworkbench/metric-model.mjs';

function calculate(rows) {
  const db = new DatabaseSync(':memory:');
  try {
    const columns =
      'cust_code,cust_order_no,executeorderno,belong_base,region_name,province_region_name,cust_name,header_addtime,requireddeliverytime,orderstatus,canceltime,custchangetime';
    for (const table of ['agents_scm_execute_detail_hourly_d', 'agents_scm_execute_detail_d'])
      db.exec(`CREATE TABLE ${table} (${columns})`);
    const insert = db.prepare(
      'INSERT INTO agents_scm_execute_detail_hourly_d VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    );
    for (const [id, cancelled, delivery = '2026-11-05 00:00:00', status = 90] of rows)
      insert.run(
        'C',
        id,
        'E-' + id,
        '郑州',
        '华中',
        '河南',
        '客户',
        '2026-11-01 00:00:00',
        delivery,
        status,
        cancelled,
        null,
      );
    const sql = changesSql
      .replaceAll("created + INTERVAL '12' HOUR", "datetime(created, '+12 hours')")
      .replaceAll("created + INTERVAL '7' DAY", "datetime(created, '+7 days')")
      .replaceAll("delivery - INTERVAL '7' DAY", "datetime(delivery, '-7 days')");
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

test('historical end cutoff and OMS-created cohort selection remain in force', () => {
  const row = calculate([
    ['later-period', '2026-11-04 01:00:00'],
    ['active', null, null, 10],
  ]);
  assert.equal(row.numerator, 0);
  assert.equal(row.denominator, 2);
});
