import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  amendmentEventsSql,
  amendmentChangesSql,
  customersSql,
  changesSql,
} from '../business/inventory-orderworkbench/document-queries.mjs';
import { computeWorkbenchMetrics } from '../prototypes/inventory-orderworkbench/metric-model.mjs';
import { workbenchQueries } from '../business/inventory-orderworkbench/queries.mjs';

const columns = [
  'cust_code',
  'cust_order_no',
  'executeorderno',
  'belong_base',
  'material_code',
  'region_name',
  'province_region_name',
  'cust_name',
  'header_addtime',
  'requireddeliverytime',
  'orderstatus',
  'detailstatus',
  'is_stat',
  'order_qty',
  'dms_last_update_qty',
  'order_qty_origin',
  'change_order_qty',
  'need_qty_origin',
  'custchangetime',
  'canceltime',
  'executeorderlineno',
  'createsource',
  'is_virtual',
  'timeout_code',
  'warehouseid',
  'receive_wh',
  'pickup_point',
  'warehouse_classify',
];
function row(order, sku, overrides = {}) {
  return {
    cust_code: 'C',
    cust_order_no: order,
    executeorderno: 'E-' + order,
    belong_base: '郑州',
    material_code: sku,
    region_name: '华中',
    province_region_name: '河南',
    cust_name: '客户',
    header_addtime: '2026-10-01 00:00:00',
    requireddeliverytime: '2026-10-05 00:00:00',
    orderstatus: 10,
    detailstatus: 10,
    is_stat: '1',
    order_qty: 10,
    dms_last_update_qty: 8,
    order_qty_origin: 10,
    change_order_qty: 10,
    need_qty_origin: 10,
    custchangetime: '2026-10-01 12:00:00',
    canceltime: null,
    executeorderlineno: 1,
    createsource: '20',
    is_virtual: null,
    timeout_code: null,
    warehouseid: null,
    receive_wh: null,
    ...overrides,
  };
}
function read(daily, hourly = [], base = '') {
  const db = new DatabaseSync(':memory:');
  try {
    for (const [table, rows] of [
      ['agents_scm_execute_detail_hourly_d', hourly],
      ['agents_scm_execute_detail_d', daily],
    ]) {
      db.exec(`CREATE TABLE ${table}(${columns.join(',')})`);
      const insert = db.prepare(`INSERT INTO ${table} VALUES(${columns.map(() => '?').join(',')})`);
      for (const value of rows) insert.run(...columns.map((key) => value[key] ?? null));
    }
    db.function('CONCAT', { varargs: true }, (...v) => v.join(''));
    db.exec(`CREATE TABLE dim_bas_warehouse(warehouse_id,warehouse_classify);
      CREATE TABLE agents_scm_order_trace_final_di(executeorderno,cust_code,fromorderno,receive_wh,deliver_wh,update_time);
      CREATE TABLE agents_scm_material_in_out_summary_d(warehouseid,pickup_point,warehouse_classify);`);
    const translate = (sql) =>
      sql
        .replaceAll(/([a-z_.]+) \+ INTERVAL '12' HOUR/gi, "datetime($1, '+12 hours')")
        .replaceAll(/([a-z_.]+) \+ INTERVAL '7' DAY/gi, "datetime($1, '+7 days')")
        .replaceAll(/([a-z_.]+) - INTERVAL '7' DAY/gi, "datetime($1, '-7 days')");
    const params = { gea_p1: '2026-10-01', gea_p2: '2026-11-01', gea_p900: base };
    return Object.fromEntries(
      Object.entries({
        events: amendmentEventsSql,
        summary: amendmentChangesSql,
        customers: customersSql,
        combined: changesSql,
      }).map(([name, sql]) => [name, db.prepare(translate(sql)).all(params)]),
    );
  } finally {
    db.close();
  }
}

test('sums detail quantities including split SKUs and shares the customer formula', () => {
  const result = read(
    [
      row('O', 'S', { change_order_qty: 12, dms_last_update_qty: 8 }),
      row('O', 'S', { executeorderno: 'split', change_order_qty: 2, dms_last_update_qty: 5 }),
      row('O2', 'S', { change_order_qty: 10, dms_last_update_qty: 10 }),
    ],
    [row('O', 'stale')],
  );
  assert.equal(result.events.length, 3);
  assert.equal(result.summary[0].numerator, 7);
  assert.equal(result.summary[0].denominator, 23);
  assert.equal(result.customers[0].numerator, 7);
  assert.equal(result.customers[0].denominator, 23);
  assert.equal(result.combined.find((r) => r.kind === '2').denominator, 23);
  assert.equal(result.combined.find((r) => r.kind === '1').unknown_quantity, 0);
  const metric = computeWorkbenchMetrics({
    sections: [{ id: 'changes', status: 'ready', rows: result.summary }],
  })['改单率'];
  assert.ok(Math.abs(metric.value - 700 / 23) < 1e-10);
  assert.match(metric.note, /数量合计/);
});

test('three null quantities are excluded, other nulls become zero, real DMS zero wins over backup', () => {
  const result = read([
    row('zero-DMS', 'S', { change_order_qty: 5, dms_last_update_qty: 0, order_qty_origin: 100 }),
    row('backup', 'S', {
      change_order_qty: 3,
      dms_last_update_qty: null,
      order_qty_origin: 8,
      need_qty_origin: 200,
    }),
    row('null-request', 'S', {
      change_order_qty: null,
      dms_last_update_qty: null,
      order_qty_origin: 7,
    }),
    row('request-only', 'S', {
      change_order_qty: 2,
      dms_last_update_qty: null,
      order_qty_origin: null,
    }),
    row('all-null', 'S', {
      change_order_qty: null,
      dms_last_update_qty: null,
      order_qty_origin: null,
    }),
    row('known-zero', 'S', {
      change_order_qty: null,
      dms_last_update_qty: 0,
      order_qty_origin: null,
      custchangetime: null,
    }),
  ]);
  assert.equal(result.events.length, 5);
  assert.equal(result.summary[0].numerator, 19);
  assert.equal(result.summary[0].denominator, 15);
  assert.equal(result.summary[0].invalid, 0);
  const metric = computeWorkbenchMetrics({
    sections: [{ id: 'changes', status: 'ready', rows: result.summary }],
  })['改单率'];
  assert.ok(Math.abs(metric.value - 1900 / 15) < 1e-10);
});

test('missing event time preserves the full quantity denominator and quantity uncertainty', () => {
  const result = read([
    row('known', 'S', { change_order_qty: 5, dms_last_update_qty: 20 }),
    row('unknown', 'S', {
      change_order_qty: null,
      dms_last_update_qty: null,
      order_qty_origin: 80,
      custchangetime: null,
    }),
    row('unchanged', 'S', { change_order_qty: 5, dms_last_update_qty: 5, custchangetime: null }),
  ]);
  const r = result.summary[0];
  assert.deepEqual(
    Object.keys(result.combined[0]).sort(),
    [...workbenchQueries.changes.columns].sort(),
    'published amendment columns must include the calculated unknown quantity',
  );
  assert.equal(r.numerator, null);
  assert.equal(r.denominator, 105);
  assert.equal(r.sample_numerator, 15);
  assert.equal(r.sample_denominator, 25);
  assert.equal(r.unknown_quantity, 80);
  assert.equal(r.invalid, 1);
  assert.equal(result.customers[0].numerator, null);
  const metric = computeWorkbenchMetrics({
    sections: [{ id: 'changes', status: 'ready', rows: result.summary }],
  })['改单率'];
  assert.ok(Math.abs(metric.value - 1500 / 105) < 1e-10);
  assert.equal(metric.sample, undefined);
  assert.equal(metric.provisional, true);
  assert.equal(metric.population.denominator, 105);
  assert.equal(metric.population.knownNumerator, 15);
  assert.equal(metric.population.unknown, 1);
  assert.equal(metric.population.unknownQuantity, 80);
  assert.ok(Math.abs(metric.population.maximumPercent - 9500 / 105) < 1e-10);
  assert.match(metric.coverageNote, /全量有效商品数量105/);
});

test('twelve-hour and seven-day boundaries use creation and confirmed arrival', () => {
  const result = read([
    row('before12', 'S', { custchangetime: '2026-10-01 11:59:59' }),
    row('exact12', 'S'),
    row('exact7', 'S', {
      requireddeliverytime: '2026-10-08 00:00:00',
      custchangetime: '2026-10-01 01:00:00',
    }),
    row('over7', 'S', {
      requireddeliverytime: '2026-10-08 00:00:01',
      custchangetime: '2026-10-01 01:00:00',
    }),
    row('before-long', 'S', {
      requireddeliverytime: '2026-10-20 00:00:00',
      custchangetime: '2026-10-12 23:59:59',
    }),
    row('exact-long', 'S', {
      requireddeliverytime: '2026-10-20 00:00:00',
      custchangetime: '2026-10-13 00:00:00',
    }),
  ]);
  assert.equal(result.summary[0].numerator, 6);
  assert.equal(result.summary[0].denominator, 48);
});

test('creation selects the cohort, future changes count, cancelled and nonstat details do not', () => {
  const result = read([
    row('cancelled', 'S', { orderstatus: 90, canceltime: '2026-11-02' }),
    row('partial', 'void', { orderstatus: 90, detailstatus: 20 }),
    row('partial', 'active'),
    row('not-stat', 'S', { is_stat: '0' }),
    row('unknown-status', 'S', { detailstatus: null }),
    row('unknown-stat', 'S', { is_stat: null }),
    row('future-change', 'S', { custchangetime: '2026-11-05' }),
    row('outside', 'S', { header_addtime: '2026-11-01 00:00:00' }),
  ]);
  assert.equal(result.events.length, 2);
  assert.equal(result.summary[0].numerator, 4);
  assert.equal(result.summary[0].denominator, 16);
});

test('daily evidence never borrows an hourly event; invalid arrival stays unknown', () => {
  const result = read(
    [
      row('missing-time', 'S', { custchangetime: null }),
      row('missing-arrival', 'S', { requireddeliverytime: null }),
      row('early-arrival', 'S', { requireddeliverytime: '2026-09-30' }),
      row('early-event', 'S', { custchangetime: '2026-09-30' }),
    ],
    [row('missing-time', 'S')],
  );
  assert.equal(result.summary[0].invalid, 4);
  assert.equal(result.summary[0].denominator, 32);
  assert.equal(result.summary[0].unknown_quantity, 8);
});

test('filters each execution creation before summing; retains separate customer/base scope', () => {
  const result = read(
    [
      row('O', 'S'),
      row('O', 'S', { cust_code: 'C2' }),
      row('O', 'S', { executeorderno: 'later', header_addtime: '2026-11-01 00:00:00' }),
      row('other-base', 'S', { belong_base: '华南' }),
    ],
    [],
    '郑州',
  );
  assert.equal(result.events.length, 2);
  assert.equal(result.summary[0].numerator, 4);
  assert.equal(result.summary[0].denominator, 16);
});

test('daily quantity SQL does not add an event-date cutoff or count grouped SKUs', () => {
  for (const sql of [amendmentEventsSql, amendmentChangesSql, customersSql]) {
    assert.match(sql, /agents_scm_execute_detail_d/);
    assert.match(sql, /COALESCE\(s.change_order_qty,0\)/);
    assert.match(sql, /COALESCE\(s.dms_last_update_qty,s.order_qty_origin,0\)/);
    assert.doesNotMatch(
      sql,
      /agents_scm_execute_detail_hourly_d|changed<:gea_p2|changed>=:gea_p2|1 AS change_denominator|GROUP BY cust_code,cust_order_no,material_code/,
    );
  }
});
