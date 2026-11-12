import { workbenchQueries } from '../business/inventory-orderworkbench/queries.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  amendmentEventsSql,
  amendmentChangesSql,
  customersSql,
} from '../business/inventory-orderworkbench/document-queries.mjs';
import {
  skuAmendmentEventsSql,
  aggregateAmendmentSql,
} from '../business/inventory-orderworkbench/sku-amendments.mjs';
const columns = [
  'cust_code',
  'cust_order_no',
  'executeorderno',
  'belong_base',
  'pickup_point',
  'material_code',
  'region_name',
  'province_region_name',
  'cust_name',
  'header_addtime',
  'orderstatus',
  'detailstatus',
  'is_stat',
  'dms_last_update_qty',
  'need_qty_origin',
  'change_order_qty',
  'warehouseid',
  'receive_wh',
  'createsource',
  'is_virtual',
  'timeout_code',
  'order_close_time',
  'is_short_transfer',
];
const warehouses = [
  ['FROM', '01', '01'],
  ['SAME', '01', '02'],
  ['OTHER', '02', '02'],
  ['BRANCH', '01', '20'],
];
function row(order, overrides = {}) {
  return {
    cust_code: 'C',
    cust_order_no: order,
    executeorderno: 'E-' + order,
    belong_base: '郑州',
    pickup_point: '01',
    material_code: 'S',
    region_name: '华中',
    province_region_name: '河南',
    cust_name: '客户',
    header_addtime: '2026-10-01 00:00:00',
    order_close_time: '2026-10-01 00:00:00',
    is_short_transfer: '非短拨',
    orderstatus: 10,
    detailstatus: 10,
    is_stat: '1',
    dms_last_update_qty: 8,
    need_qty_origin: 10,
    change_order_qty: 6,
    warehouseid: 'FROM',
    receive_wh: null,
    createsource: '20',
    is_virtual: null,
    timeout_code: null,
    ...overrides,
  };
}
function read(rows, { base = '', dims = warehouses, period = false, shipments } = {}) {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(
      `CREATE TABLE agents_scm_execute_detail_d(${columns.map((c) => c + (c === 'is_virtual' ? ' INTEGER' : ['createsource', 'timeout_code'].includes(c) ? ' TEXT' : '')).join(',')})`,
    );
    const insert = db.prepare(
      `INSERT INTO agents_scm_execute_detail_d VALUES(${columns.map(() => '?').join(',')})`,
    );
    for (const r of rows) insert.run(...columns.map((c) => r[c]));
    db.exec(
      'CREATE TABLE agents_scm_order_trace_final_di(executeorderno,cust_code,lastshipmenttime,update_time,load_time)',
    );
    const shipment = db.prepare('INSERT INTO agents_scm_order_trace_final_di VALUES(?,?,?,?,?)');
    for (const r of shipments ?? rows)
      shipment.run(
        r.executeorderno,
        r.cust_code,
        r.lastshipmenttime ?? null,
        r.update_time ?? '2026-11-09 12:00:00',
        r.load_time ?? '2026-11-09 13:00:00',
      );
    db.exec('CREATE TABLE agents_dim_bas_warehouse_d(warehouseid,pickup_point,warehouse_classify)');
    const w = db.prepare('INSERT INTO agents_dim_bas_warehouse_d VALUES(?,?,?)');
    for (const r of dims) w.run(...r);
    const params = { gea_p1: '2026-10-01', gea_p2: '2026-11-01', gea_p900: base };
    const sqls = period
      ? {
          period: `WITH report_windows(period_index,enabled,start_date,end_date) AS (VALUES(0,TRUE,'2026-10-01','2026-11-01'),(1,TRUE,'2026-09-01','2026-10-01')) ${aggregateAmendmentSql(skuAmendmentEventsSql({ periods: true }), false, true)}`,
        }
      : {
          events: amendmentEventsSql,
          summary: amendmentChangesSql,
          customers: customersSql,
          details: workbenchQueries['amendment.details'].sql,
          lines: skuAmendmentEventsSql({ stage: 'lines' }),
        };
    return Object.fromEntries(
      Object.entries(sqls).map(([name, sql]) => [
        name,
        db
          .prepare(sql)
          .all(
            Object.fromEntries(Object.entries(params).filter(([key]) => sql.includes(':' + key))),
          ),
      ]),
    );
  } finally {
    db.close();
  }
}
test('sums split detail quantities and shares the customer formula without event fields', () => {
  const r = read([
    row('O', { change_order_qty: 12 }),
    row('O', { executeorderno: 'split', change_order_qty: 2, dms_last_update_qty: 5 }),
    row('O2', { change_order_qty: 10, dms_last_update_qty: 10 }),
  ]);
  assert.equal(r.events.length, 3);
  assert.equal(r.summary[0].numerator, 3);
  assert.equal(r.summary[0].denominator, 23);
  assert.equal(r.customers[0].numerator, 3);
});
test('null requests keep the denominator, true zero counts, zero DMS precedes backup', () => {
  const r = read([
    row('null', { change_order_qty: null, dms_last_update_qty: null, need_qty_origin: 80 }),
    row('zero', { change_order_qty: 0, dms_last_update_qty: 20 }),
    row('dms-zero', { change_order_qty: 5, dms_last_update_qty: 0, need_qty_origin: 100 }),
    row('screenshot', { change_order_qty: 10, dms_last_update_qty: null, need_qty_origin: 20 }),
    row('all-null', { change_order_qty: null, dms_last_update_qty: null, need_qty_origin: null }),
  ]);
  assert.equal(r.events.length, 4);
  assert.equal(r.summary[0].numerator, 30);
  assert.equal(r.summary[0].denominator, 120);
  assert.equal(r.summary[0].invalid, 0);
});
test('interface source, virtual 1/2 and timeout 14/16 remove numerator and denominator', () => {
  const r = read([
    row('keep'),
    row('manual', { createsource: '10' }),
    row('missing-source', { createsource: null }),
    row('v1', { is_virtual: 1 }),
    row('v2', { is_virtual: 2 }),
    row('safe', { timeout_code: '14' }),
    row('account', { timeout_code: '16' }),
    row('v0', { is_virtual: 0 }),
    row('v3', { is_virtual: 3 }),
    row('other-reason', { timeout_code: '2' }),
  ]);
  assert.equal(r.events.length, 4);
  assert.equal(r.summary[0].numerator, 8);
  assert.equal(r.summary[0].denominator, 32);
});

test('only nonnegative reductions contribute while additions, negative and null requests retain the denominator', () => {
  const source = [
    row('positive', { change_order_qty: 5, dms_last_update_qty: 2 }),
    row('zero', { change_order_qty: 0, dms_last_update_qty: 7 }),
    row('null', { change_order_qty: null, dms_last_update_qty: 11 }),
    row('negative', { change_order_qty: -1, dms_last_update_qty: 13 }),
    row('negative-only', {
      change_order_qty: -2,
      dms_last_update_qty: null,
      need_qty_origin: null,
    }),
  ];
  const result = read(source, { base: '郑州' });
  assert.equal(result.events.length, 5);
  assert.equal(result.summary[0].numerator, 7);
  assert.equal(result.summary[0].denominator, 33);
  assert.equal(result.customers[0].numerator, 7);
  assert.equal(result.customers[0].denominator, 33);
  assert.equal(read(source, { base: '郑州', period: true }).period[0].numerator, 7);
  assert.equal(read(source, { base: '郑州', period: true }).period[0].denominator, 33);
});
test('BI short-transfer flag overrides warehouse remapping, including missing warehouses', () => {
  const r = read([
    row('flagged', { is_short_transfer: '短拨', warehouseid: '*', receive_wh: 'OTHER' }),
    row('same-warehouse', { receive_wh: 'SAME' }),
    row('unknown-flag', { is_short_transfer: null }),
    row('unassigned', { warehouseid: '*', receive_wh: 'SAME' }),
  ]);
  assert.equal(r.events.length, 2);
  assert.equal(r.summary[0].numerator, 4);
  assert.equal(r.summary[0].denominator, 16);
});

test('order close and pickup select the cohort; BI excludes cancelled details without extra statistical flags', () => {
  const r = read(
    [
      row('partial', { executeorderno: 'cancelled', orderstatus: 90, detailstatus: 20 }),
      row('partial'),
      row('not-stat', { is_stat: '0' }),
      row('outside', { header_addtime: '2026-10-20', order_close_time: '2026-11-01' }),
      row('other-base', { belong_base: '华南', pickup_point: '02' }),
    ],
    { base: '郑州' },
  );
  assert.equal(r.events.length, 2);
  assert.equal(r.summary[0].numerator, 4);
  assert.equal(r.summary[0].denominator, 16);
});
test('multi-period reports use the same no-lock business scope', () => {
  const r = read(
    [
      row('oct'),
      row('sep', { header_addtime: '2026-09-20', order_close_time: '2026-09-20' }),
      row('excluded', {
        is_short_transfer: '短拨',
        header_addtime: '2026-09-20',
        order_close_time: '2026-09-20',
        receive_wh: 'SAME',
      }),
    ],
    { period: true },
  );
  assert.deepEqual(r.period.map((x) => [x.period_index, x.numerator, x.denominator]).sort(), [
    [0, 2, 8],
    [1, 2, 8],
  ]);
});

test('Zhengzhou amendment totals and customers select pickup 01, not base ownership', () => {
  const rows = [
    row('pickup-01'),
    row('ownership-differs', { belong_base: '其他', change_order_qty: 12 }),
    row('distribution', { pickup_point: '34', change_order_qty: 100 }),
    row('beijing', { pickup_point: 'C9', change_order_qty: 200 }),
    row('missing-pickup', { pickup_point: null, change_order_qty: 300 }),
  ];
  const r = read(rows, { base: '郑州' });
  assert.equal(r.events.length, 2);
  assert.equal(r.summary[0].numerator, 2);
  assert.equal(r.summary[0].denominator, 16);
  assert.equal(r.customers[0].numerator, 2);
  assert.equal(r.customers[0].denominator, 16);
  assert.equal(read(rows).events.length, 2);
  assert.equal(read(rows, { base: '其他' }).events.length, 1);
});

test('Zhengzhou period comparisons use the same pickup scope as current totals', () => {
  const r = read(
    [
      row('oct'),
      row('sep', { header_addtime: '2026-09-20', order_close_time: '2026-09-20' }),
      row('oct-other', { pickup_point: '34', change_order_qty: 100 }),
      row('sep-other', {
        header_addtime: '2026-09-20',
        order_close_time: '2026-09-20',
        pickup_point: 'C9',
        change_order_qty: 200,
      }),
    ],
    { base: '郑州', period: true },
  );
  assert.deepEqual(r.period.map((x) => [x.period_index, x.numerator, x.denominator]).sort(), [
    [0, 2, 8],
    [1, 2, 8],
  ]);
});

test('BI non-short flag preserves all quantities of E2600249820 despite warehouse allocation', () => {
  const source = [504,608,10,560].map((qty, index) => row('E2600249820', {
    receive_wh: 'SAME', warehouseid: index === 1 ? '*' : 'FROM',
    change_order_qty: index === 2 ? 0 : null, dms_last_update_qty: null, need_qty_origin: qty,
  }));
  const result = read(source, { base: '郑州' });
  assert.equal(result.summary[0].numerator, 10);
  assert.equal(result.summary[0].denominator, 1682);
  assert.equal(read(source.map(r => ({ ...r, is_short_transfer: '短拨' }))).events.length, 0);
});

test('BI status scope excludes cancelled details without adding header status or is_stat predicates', () => {
  const result = read([
    row('cancelled-detail', { detailstatus: 20 }),
    row('not-stat', { is_stat: '0' }),
    row('header-cancelled', { orderstatus: 90 }),
  ]);
  assert.equal(result.events.length, 2);
  assert.equal(result.summary[0].denominator, 16);
});

test('amendment SQL uses BI daily date and short-transfer flag without trace or warehouse joins', () => {
  for (const sql of [amendmentEventsSql, amendmentChangesSql, customersSql]) {
    assert.match(sql, /s.is_short_transfer='非短拨'/);
    assert.match(sql, /d.order_close_time>=:gea_p1/);
    assert.match(sql, /requested_qty>=0/);
    assert.match(sql, /COALESCE\(s.dms_last_update_qty,s.need_qty_origin,0\)/);
    assert.doesNotMatch(sql, /custchangetime|requireddeliverytime|INTERVAL|agents_dim_bas_warehouse_d|agents_scm_order_trace_final_di|order_qty_origin/);
  }
});

test('order close month includes earlier creations and missing traces without falling back to shipment', () => {
  const r = read([
    row('earlier', { header_addtime: '2026-09-20', order_close_time: '2026-10-03' }),
    row('next', { order_close_time: '2026-11-01' }),
    row('unclosed', { order_close_time: null, lastshipmenttime: '2026-10-15' }),
  ], { shipments: [] });
  assert.equal(r.events.length, 1);
  assert.equal(r.summary[0].numerator, 2);
  assert.equal(r.summary[0].denominator, 8);
  assert.equal(r.lines[0].shipped_at, '2026-10-03');
});

test('duplicate and outdated transport records cannot multiply or change the BI daily cohort', () => {
  const rows = [row('same'), row('same', { material_code: 'T' })];
  const shipments = [row('same', { lastshipmenttime: '2026-11-01' }),row('same', { lastshipmenttime: null })];
  const r = read(rows, { shipments });
  assert.equal(r.lines.length, 2);
  assert.equal(r.summary[0].numerator, 4);
  assert.equal(r.summary[0].denominator, 16);
});

test('unclosed partial shipment stays outside the BI period even if a transport has shipped', () => {
  assert.equal(read([row('partial', { order_close_time: null, lastshipmenttime: '2026-10-15' })]).events.length, 0);
});

test('only reductions reach shared totals, customer drilldown, details and comparison periods', () => {
  const rows = [
    row('reduce', { change_order_qty: 60, dms_last_update_qty: 100 }),
    row('add', { change_order_qty: 90, dms_last_update_qty: 80 }),
    row('equal', { change_order_qty: 10, dms_last_update_qty: 10 }),
    row('zero', { change_order_qty: 0, dms_last_update_qty: 12 }),
    row('null', { change_order_qty: null, dms_last_update_qty: 20 }),
    row('negative', { change_order_qty: -1, dms_last_update_qty: 5 }),
    row('dms-zero', {
      change_order_qty: 3,
      dms_last_update_qty: 0,
      need_qty_origin: 900,
    }),
    row('backup', {
      change_order_qty: 20,
      dms_last_update_qty: null,
      need_qty_origin: 30,
    }),
    row('empty', {
      change_order_qty: null,
      dms_last_update_qty: null,
      need_qty_origin: null,
    }),
  ];
  for (const base of ['', '郑州']) {
    const result = read(rows, { base });
    assert.equal(result.events.length, 8);
    for (const values of [result.summary, result.customers]) {
      assert.equal(values[0].numerator, 62);
      assert.equal(values[0].denominator, 257);
    }
    assert.deepEqual(
      result.details.map((r) => [r.cust_order_no, r.changed_quantity]),
      [
        ['reduce', 40],
        ['add', 0],
        ['equal', 0],
        ['zero', 12],
        ['null', 0],
        ['negative', 0],
        ['dms-zero', 0],
        ['backup', 10],
      ],
    );
    assert.equal(
      result.details.reduce((sum, r) => sum + r.changed_quantity, 0),
      62,
    );
    const period = read(rows, { base, period: true }).period[0];
    assert.equal(period.numerator, 62);
    assert.equal(period.denominator, 257);
  }
});
