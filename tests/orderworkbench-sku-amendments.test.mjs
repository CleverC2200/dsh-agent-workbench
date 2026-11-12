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
    lastshipmenttime: '2026-10-01 00:00:00',
    orderstatus: 10,
    detailstatus: 10,
    is_stat: '1',
    dms_last_update_qty: 8,
    need_qty_origin: 10,
    change_order_qty: 10,
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
    row('O2', { dms_last_update_qty: 10 }),
  ]);
  assert.equal(r.events.length, 3);
  assert.equal(r.summary[0].numerator, 7);
  assert.equal(r.summary[0].denominator, 23);
  assert.equal(r.customers[0].numerator, 7);
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
  assert.equal(r.summary[0].numerator, 35);
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

test('only nonnegative requests contribute differences while negative and null requests retain the full denominator', () => {
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
  assert.equal(result.summary[0].numerator, 10);
  assert.equal(result.summary[0].denominator, 33);
  assert.equal(result.customers[0].numerator, 10);
  assert.equal(result.customers[0].denominator, 33);
  assert.equal(read(source, { base: '郑州', period: true }).period[0].numerator, 10);
  assert.equal(read(source, { base: '郑州', period: true }).period[0].denominator, 33);
});
test('short transfers require matching pickup and factory types on both ends; duplicate dimension rows do not multiply quantities', () => {
  const r = read(
    [
      row('short', { receive_wh: 'SAME' }),
      row('cross', { receive_wh: 'OTHER' }),
      row('branch-receiver', { receive_wh: 'BRANCH' }),
      row('branch-shipper', { warehouseid: 'BRANCH', receive_wh: 'SAME' }),
      row('unassigned', { warehouseid: '*', receive_wh: 'SAME' }),
    ],
    { dims: [...warehouses, ['SAME', '01', '02']] },
  );
  assert.equal(r.events.length, 4);
  assert.equal(r.summary[0].numerator, 8);
  assert.equal(r.summary[0].denominator, 32);
});
test('shipment and pickup select the cohort; partial cancellations preserve valid detail rows', () => {
  const r = read(
    [
      row('partial', { executeorderno: 'cancelled', orderstatus: 90, detailstatus: 20 }),
      row('partial'),
      row('not-stat', { is_stat: '0' }),
      row('outside', { header_addtime: '2026-10-20', lastshipmenttime: '2026-11-01' }),
      row('other-base', { belong_base: '华南', pickup_point: '02' }),
    ],
    { base: '郑州' },
  );
  assert.equal(r.events.length, 1);
  assert.equal(r.summary[0].numerator, 2);
  assert.equal(r.summary[0].denominator, 8);
});
test('multi-period reports use the same no-lock business scope', () => {
  const r = read(
    [
      row('oct'),
      row('sep', { header_addtime: '2026-09-20', lastshipmenttime: '2026-09-20' }),
      row('excluded', {
        header_addtime: '2026-09-20',
        lastshipmenttime: '2026-09-20',
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
  assert.equal(r.summary[0].numerator, 6);
  assert.equal(r.summary[0].denominator, 16);
  assert.equal(r.customers[0].numerator, 6);
  assert.equal(r.customers[0].denominator, 16);
  assert.equal(read(rows).events.length, 2);
  assert.equal(read(rows, { base: '其他' }).events.length, 1);
});

test('Zhengzhou period comparisons use the same pickup scope as current totals', () => {
  const r = read(
    [
      row('oct'),
      row('sep', { header_addtime: '2026-09-20', lastshipmenttime: '2026-09-20' }),
      row('oct-other', { pickup_point: '34', change_order_qty: 100 }),
      row('sep-other', {
        header_addtime: '2026-09-20',
        lastshipmenttime: '2026-09-20',
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

test('unallocated rows use the unique known warehouse of the same execution and receive route for short-transfer exclusion', () => {
  const source = [
    row('E2600249820', {
      receive_wh: 'SAME',
      change_order_qty: null,
      dms_last_update_qty: null,
      need_qty_origin: 504,
    }),
    row('E2600249820', {
      receive_wh: 'SAME',
      warehouseid: '*',
      change_order_qty: null,
      dms_last_update_qty: null,
      need_qty_origin: 608,
    }),
    row('E2600249820', {
      receive_wh: 'SAME',
      change_order_qty: 0,
      dms_last_update_qty: null,
      need_qty_origin: 10,
    }),
    row('E2600249820', {
      receive_wh: 'SAME',
      change_order_qty: null,
      dms_last_update_qty: null,
      need_qty_origin: 560,
    }),
  ];
  const beforeExclusion = read(
    source.map((r) => ({ ...r, receive_wh: 'OTHER' })),
    { base: '郑州' },
  );
  assert.equal(beforeExclusion.summary[0].numerator, 10);
  assert.equal(beforeExclusion.summary[0].denominator, 1682);
  assert.equal(read(source, { base: '郑州' }).events.length, 0);
  assert.equal(read(source, { base: '郑州', period: true }).period.length, 0);
});

test('warehouse fallback does not cross executions, receive routes, cancelled rows or conflicting warehouses', () => {
  const result = read([
    row('conflict', { receive_wh: 'SAME' }),
    row('conflict', { receive_wh: 'SAME', warehouseid: 'OTHER' }),
    row('conflict', { receive_wh: 'SAME', warehouseid: '*' }),
    row('unknown', { receive_wh: 'SAME', warehouseid: '*' }),
    row('cancelled-proof', { receive_wh: 'SAME', detailstatus: 20, orderstatus: 90 }),
    row('cancelled-proof', { receive_wh: 'SAME', warehouseid: '*' }),
    row('route', { receive_wh: 'OTHER' }),
    row('route', { receive_wh: 'SAME', warehouseid: '*' }),
  ]);
  assert.equal(result.events.length, 6);
  assert.equal(result.summary[0].denominator, 48);
});
test('amendment SQL requires exact warehouse mapping and no lock or event-time fields', () => {
  for (const sql of [amendmentEventsSql, amendmentChangesSql, customersSql]) {
    assert.match(sql, /shipping.pickup_point=receiving.pickup_point/);
    assert.match(sql, /requested_qty>=0/);
    assert.match(sql, /COALESCE\(s.dms_last_update_qty,s.need_qty_origin,0\)/);
    assert.doesNotMatch(
      sql,
      /custchangetime|requireddeliverytime|INTERVAL|is_short_transfer|order_qty_origin|agents_scm_execute_detail_hourly_d/,
    );
  }
});

test('shipment month includes earlier creations and never substitutes creation or WMS close for missing shipment', () => {
  const r = read([
    row('earlier', { header_addtime: '2026-09-20', lastshipmenttime: '2026-10-03' }),
    row('next', { lastshipmenttime: '2026-11-01' }),
    row('unknown', { lastshipmenttime: null }),
  ]);
  assert.equal(r.events.length, 1);
  assert.equal(r.summary[0].numerator, 2);
  assert.equal(r.summary[0].denominator, 8);
  assert.equal(r.lines[0].shipped_at, '2026-10-03');
});
test('latest shipment batch retains tied transports and uses the last load without multiplying SKU quantities', () => {
  const rows = [row('same'), row('same', { material_code: 'T' })];
  const shipments = [
    {
      executeorderno: 'E-same',
      cust_code: 'C',
      lastshipmenttime: '2026-10-10',
      update_time: '2026-11-08',
    },
    {
      executeorderno: 'E-same',
      cust_code: 'C',
      lastshipmenttime: '2026-10-11',
      update_time: '2026-11-09',
      load_time: '2026-11-09 10:00:00',
    },
    {
      executeorderno: 'E-same',
      cust_code: 'C',
      lastshipmenttime: '2026-10-12',
      update_time: '2026-11-09',
      load_time: '2026-11-09 11:00:00',
    },
    {
      executeorderno: 'E-same',
      cust_code: 'C',
      lastshipmenttime: '2026-10-13',
      update_time: '2026-11-09',
      load_time: '2026-11-09 11:00:00',
    },
    {
      executeorderno: 'E-same',
      cust_code: 'OTHER',
      lastshipmenttime: '2026-11-01',
      update_time: '2026-11-09',
    },
  ];
  const r = read(rows, { shipments });
  assert.equal(r.lines.length, 2);
  assert.equal(r.summary[0].numerator, 4);
  assert.equal(r.summary[0].denominator, 16);
  assert.ok(r.lines.every((x) => x.shipped_at === '2026-10-13'));
  shipments.push({
    ...shipments[2],
    lastshipmenttime: '2026-11-01',
    load_time: '2026-11-09 11:00:00',
  });
  assert.equal(read(rows, { shipments }).events.length, 0);
  assert.equal(read(rows, { shipments, period: true }).period.length, 0);
});
test('a current missing shipment cannot resurrect an older timestamp', () => {
  const shipments = [
    {
      executeorderno: 'E-latest',
      cust_code: 'C',
      lastshipmenttime: '2026-10-15',
      update_time: '2026-11-08',
    },
    {
      executeorderno: 'E-latest',
      cust_code: 'C',
      lastshipmenttime: null,
      update_time: '2026-11-09',
    },
  ];
  assert.equal(read([row('latest')], { shipments }).events.length, 0);
});
