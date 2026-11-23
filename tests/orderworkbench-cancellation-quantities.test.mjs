import test from 'node:test';
import assert from 'node:assert/strict';
import { cancellationPartitionSql } from '../business/inventory-orderworkbench/cancellation-partitions.mjs';
import {
  cancellationEvents,
  cancellationChangesSql,
  periodChangesSql,
} from '../business/inventory-orderworkbench/document-queries.mjs';
import {
  computeWorkbenchMetrics,
  metricCalculationVersion,
  compatibleWorkbenchFacts,
} from '../prototypes/inventory-orderworkbench/metric-model.mjs';
import {
  cancellationDb,
  cancellationLine as line,
  sqliteCancellationSql as sql,
  octoberCancellationParameters as params,
} from './helpers/cancellation-fixture.mjs';

const cancelled = (id, values = {}) =>
  line(id, { orderstatus: 90, detailstatus: 20, canceltime: '2026-10-02 00:00:00', ...values });
const calculate = (t, source) => {
  const db = cancellationDb(source);
  t.after(() => db.close());
  return { db, read: () => db.prepare(sql(cancellationChangesSql)).all(params)[0] };
};

test('sums customer changes then DMS last quantities then backup quantities, retaining real zero at each priority', (t) => {
  const { read } = calculate(t, {
    hourly: [
      cancelled('O', { change_order_qty: 12, dms_last_update_qty: 90, need_qty_origin: 100 }),
      cancelled('O', { executeorderlineno: 2, dms_last_update_qty: 7, need_qty_origin: 100 }),
      line('active', { need_qty_origin: 33 }),
      cancelled('zero-client', {
        change_order_qty: 0,
        dms_last_update_qty: 90,
        need_qty_origin: 100,
      }),
      line('zero-dms', { dms_last_update_qty: 0, need_qty_origin: 100 }),
      cancelled('client-fallback', { change_order_qty: 12, need_qty_origin: 100 }),
      cancelled('client-zero-fallback', { change_order_qty: 0, need_qty_origin: 100 }),
    ],
  });
  const r = read();
  assert.equal(r.numerator, 31);
  assert.equal(r.denominator, 64);
  assert.equal(r.records, 7);
  const metric = computeWorkbenchMetrics({
    sections: [{ id: 'changes', status: 'ready', rows: [r] }],
  })['作废率'];
  assert.ok(Math.abs(metric.value - 3100 / 64) < 1e-10);
  assert.match(metric.note, /need_qty_origin/);
  assert.match(metric.note, /有作废时间取canceltime.*lastshipmenttime归属周期.*wms_close_time/);
});

test('cancelled products use cancellation month; other products use their actual last shipment month', (t) => {
  const { read } = calculate(t, {
    hourly: [
      cancelled('old-order', {
        header_addtime: '2026-09-01 00:00:00',
        requireddeliverytime: '2026-09-05',
        canceltime: '2026-10-02 00:00:00',
        need_qty_origin: 23,
      }),
      line('active', { need_qty_origin: 11 }),
      cancelled('next-month', { canceltime: '2026-11-01 00:00:00', need_qty_origin: 31 }),
      line('old-active', { header_addtime: '2026-09-01 00:00:00', need_qty_origin: 50 }),
      cancelled('early', { canceltime: '2026-10-01 11:59:59', need_qty_origin: 100 }),
      cancelled('boundary', { canceltime: '2026-10-01 12:00:00', need_qty_origin: 100 }),
      cancelled('before-lock', {
        requireddeliverytime: '2026-10-20',
        latestsendcardate: '2026-10-13 00:00:00',
        canceltime: '2026-10-10',
        need_qty_origin: 17,
      }),
    ],
  });
  const r = read();
  assert.equal(r.numerator, 40);
  assert.equal(r.denominator, 51);
  assert.equal(r.records, 3);
});

test('excludes factory short transfers using the confirmed warehouse factory pickup projection', (t) => {
  const { read } = calculate(t, {
    hourly: [
      line('keep', { need_qty_origin: 10 }),
      cancelled('non-api', { createsource: '10', need_qty_origin: 100 }),
      cancelled('missing-source', { createsource: null, need_qty_origin: 100 }),
      cancelled('virtual-one', { is_virtual: 1, need_qty_origin: 100 }),
      cancelled('virtual-two', { is_virtual: 2, need_qty_origin: 100 }),
      cancelled('adjust', { timeout_code: '16', need_qty_origin: 100 }),
      cancelled('safety', { timeout_code: '14', need_qty_origin: 100 }),
      cancelled('same-pickup', { receive_wh: 'R', need_qty_origin: 100 }),
      cancelled('other-pickup', { receive_wh: 'OTHER', need_qty_origin: 7 }),
      cancelled('oem', { receive_wh: 'OEM', need_qty_origin: 4 }),
    ],
  });
  const r = read();
  assert.equal(r.numerator, 11);
  assert.equal(r.denominator, 21);
  assert.equal(r.invalid, 0);
  assert.equal(r.records, 3);
});

const warehouseTrace = (id, overrides = {}) => ({
  executeorderno: 'E-' + id,
  cust_code: 'C',
  fromorderno: id,
  receive_wh: 'OTHER',
  deliver_wh: 'F',
  update_time: '2026-11-09 11:00:00',
  ...overrides,
});

test('recovers starred hourly and daily warehouses from exact latest trace headers and excludes recovered short transfers', (t) => {
  const cross = warehouseTrace('cross');
  const { read } = calculate(t, {
    hourly: [
      cancelled('cross', { warehouseid: '*', receive_wh: 'OTHER', need_qty_origin: 12 }),
      cancelled('short', { warehouseid: '*', receive_wh: 'R', need_qty_origin: 100 }),
      cancelled('known', { warehouseid: 'F', receive_wh: 'OTHER', need_qty_origin: 7 }),
    ],
    daily: [cancelled('daily', { warehouseid: '*', receive_wh: 'OTHER', need_qty_origin: 11 })],
    trace: [
      cross,
      cross,
      warehouseTrace('short', { receive_wh: 'R' }),
      warehouseTrace('known', { deliver_wh: 'OTHER' }),
      warehouseTrace('daily'),
    ],
  });
  const row = read();
  assert.equal(row.numerator, 30);
  assert.equal(row.denominator, 30);
  assert.equal(row.records, 3);
  assert.equal(row.invalid, 0);
});

test('warehouse recovery keeps missing, conflicting, stale or mismatched latest headers unknown', (t) => {
  const ids = [
    'missing',
    'latest-null',
    'conflict',
    'wrong-customer',
    'wrong-order',
    'wrong-receiver',
    'starred-trace',
    'partial-header',
  ];
  const { read } = calculate(t, {
    hourly: ids.map((id) =>
      cancelled(id, {
        warehouseid: '*',
        receive_wh: 'OTHER',
        pickup_point: '02',
        need_qty_origin: 10,
      }),
    ),
    trace: [
      warehouseTrace('latest-null', { update_time: '2026-11-08 11:00:00' }),
      warehouseTrace('latest-null', { deliver_wh: null }),
      warehouseTrace('conflict'),
      warehouseTrace('conflict', { deliver_wh: 'OTHER' }),
      warehouseTrace('wrong-customer', { cust_code: 'other' }),
      warehouseTrace('wrong-order', { fromorderno: 'other' }),
      warehouseTrace('wrong-receiver', { receive_wh: 'R' }),
      warehouseTrace('starred-trace', { deliver_wh: '*' }),
      warehouseTrace('partial-header'),
      warehouseTrace('partial-header', { fromorderno: null }),
    ],
  });
  const row = read();
  assert.equal(row.invalid, ids.length);
  assert.equal(row.numerator, null);
  assert.equal(row.denominator, null);
  assert.equal(row.unknown_quantity, 80);
});

test('warehouse recovery does not remove quantity-missing lines from the pending cohort', (t) => {
  const { read } = calculate(t, {
    hourly: [
      cancelled('missing-quantity-short', {
        warehouseid: '*',
        receive_wh: 'R',
        need_qty_origin: null,
      }),
    ],
    trace: [warehouseTrace('missing-quantity-short', { receive_wh: 'R' })],
  });
  assert.equal(read().records, 1);
  assert.equal(read().invalid, 1);
  assert.equal(read().denominator, null);
});

test('missing warehouses use the order pickup point while retaining factory-class and known-warehouse precedence', (t) => {
  const { read } = calculate(t, {
    hourly: [
      cancelled('short', {
        warehouseid: '*',
        pickup_point: '01',
        warehouse_classify: '01',
        receive_wh: 'R',
        need_qty_origin: 100,
      }),
      cancelled('daily-name', {
        warehouseid: null,
        pickup_point: '01',
        warehouse_classify: '工厂成品仓',
        receive_wh: 'OTHER',
        need_qty_origin: 20,
      }),
      cancelled('rented-name', {
        warehouseid: '',
        pickup_point: '01',
        warehouse_classify: '工厂外租库',
        receive_wh: 'OTHER',
        need_qty_origin: 30,
      }),
      cancelled('known-warehouse', {
        warehouseid: 'F',
        pickup_point: '02',
        warehouse_classify: '01',
        receive_wh: 'OTHER',
        need_qty_origin: 7,
      }),
      cancelled('different-points', {
        warehouseid: '*',
        pickup_point: '01',
        warehouse_classify: null,
        receive_wh: 'OTHER',
        need_qty_origin: 11,
      }),
      cancelled('nonfactory', {
        warehouseid: '*',
        pickup_point: '01',
        warehouse_classify: '电商仓',
        receive_wh: 'R',
        need_qty_origin: 4,
      }),
      cancelled('trace-priority', {
        warehouseid: '*',
        pickup_point: '02',
        warehouse_classify: '01',
        receive_wh: 'R',
        need_qty_origin: 100,
      }),
    ],
    trace: [warehouseTrace('trace-priority', { receive_wh: 'R' })],
  });
  const row = read();
  assert.equal(row.numerator, 72);
  assert.equal(row.denominator, 72);
  assert.equal(row.records, 5);
  assert.equal(row.invalid, 0);
});

test('matching pickup points require both factory classes; an absent order pickup is outside the confirmed scope', (t) => {
  const { read } = calculate(t, {
    hourly: [
      line('keep', { need_qty_origin: 5 }),
      cancelled('unknown-class', {
        warehouseid: '*',
        pickup_point: '01',
        warehouse_classify: null,
        receive_wh: 'R',
        need_qty_origin: 10,
      }),
      cancelled('unknown-pickup', {
        warehouseid: '*',
        pickup_point: null,
        warehouse_classify: '01',
        receive_wh: 'R',
        need_qty_origin: 20,
      }),
    ],
  });
  assert.equal(read().invalid, 1);
  assert.equal(read().sample_denominator, 5);
  assert.equal(read().unknown_quantity, 10);
});

test('reported order can include the 304 known boxes using pickup fallback without inventing the missing 280 quantity', (t) => {
  const { db, read } = calculate(t, {
    daily: [
      cancelled('E2600230622', { need_qty_origin: 2907 }),
      cancelled('E2600230622', {
        executeorderlineno: 17,
        material_code: '10004171',
        warehouseid: '*',
        pickup_point: '01',
        warehouse_classify: '工厂成品仓',
        receive_wh: 'Y401',
        need_qty_origin: 304,
      }),
      cancelled('E2600230622', {
        executeorderlineno: 21,
        material_code: '10004157',
        need_qty_origin: null,
      }),
    ],
  });
  db.exec(
    "INSERT INTO agents_scm_material_in_out_summary_d VALUES ('Y401','37','01'); INSERT INTO dim_bas_warehouse VALUES ('Y401','01')",
  );
  assert.equal(read().sample_numerator, 3211);
  assert.equal(read().sample_denominator, 3211);
  assert.equal(read().invalid, 1);
});

test('daily recovery retains hourly quantities and supplements missing cancelled product lines', (t) => {
  const { read } = calculate(t, {
    hourly: [cancelled('O', { canceltime: null, need_qty_origin: 5 })],
    daily: [
      cancelled('O', { need_qty_origin: 200 }),
      cancelled('O', { material_code: 'deleted', executeorderlineno: 2, need_qty_origin: 300 }),
      cancelled('history', { need_qty_origin: 9 }),
    ],
  });
  const r = read();
  assert.equal(r.numerator, 314);
  assert.equal(r.denominator, 314);
  assert.equal(r.records, 3);
});

test('recovers exact daily quantities using customer then DMS then backup after recovering individual missing hourly fields', (t) => {
  const missing = (id) => cancelled(id, { need_qty_origin: null });
  const { read } = calculate(t, {
    hourly: [
      missing('client'),
      missing('client-only'),
      missing('client-zero'),
      missing('dms'),
      missing('backup'),
      missing('zero'),
      cancelled('known-zero', { change_order_qty: 0, need_qty_origin: null }),
      cancelled('known-backup', { need_qty_origin: 9 }),
    ],
    daily: [
      cancelled('client', { change_order_qty: 30, dms_last_update_qty: 100 }),
      cancelled('client-only', { change_order_qty: 7, need_qty_origin: 100 }),
      cancelled('client-zero', { change_order_qty: 0, need_qty_origin: 999 }),
      cancelled('dms', { dms_last_update_qty: 20 }),
      cancelled('backup', { need_qty_origin: 10 }),
      cancelled('zero', { change_order_qty: 0, dms_last_update_qty: 300, need_qty_origin: 999 }),
      cancelled('zero', { change_order_qty: 0, dms_last_update_qty: 400, need_qty_origin: 999 }),
      cancelled('known-zero', { change_order_qty: 100 }),
      cancelled('known-backup', { change_order_qty: 100 }),
      cancelled('client', {
        executeorderlineno: 2,
        material_code: 'deleted',
        need_qty_origin: 300,
      }),
    ],
  });
  const row = read();
  assert.equal(row.numerator, 467);
  assert.equal(row.denominator, 467);
  assert.equal(row.records, 9);
  assert.equal(row.invalid, 0);
});

test('field recovery retains daily and hourly zero before lower priorities for all matching orders', (t) => {
  const { read, db } = calculate(t, {
    hourly: [
      cancelled('E2600241539', { need_qty_origin: 100 }),
      cancelled('other-zero', { need_qty_origin: 200 }),
      cancelled('known-dms-zero', { dms_last_update_qty: 0, change_order_qty: 50 }),
      cancelled('known-client-zero', { change_order_qty: 0 }),
      cancelled('known-client-first', { change_order_qty: 7, need_qty_origin: 100 }),
    ],
    daily: [
      cancelled('E2600241539', { change_order_qty: 0, need_qty_origin: 100 }),
      cancelled('other-zero', { change_order_qty: 0, need_qty_origin: 200 }),
      cancelled('known-dms-zero', { dms_last_update_qty: 100 }),
      cancelled('known-client-zero', { change_order_qty: 100 }),
      cancelled('known-client-first', { dms_last_update_qty: 20 }),
      cancelled('E2600241539', {
        executeorderlineno: 2,
        material_code: 'deleted',
        need_qty_origin: 999,
      }),
    ],
  });
  assert.equal(read().numerator, 1056);
  assert.equal(read().denominator, 1056);
  assert.equal(read().records, 6);
  const rows = db.prepare(sql(cancellationEvents)).all(params);
  for (const row of rows.filter(
    (r) =>
      r.executeorderlineno === 1 &&
      !['known-client-first', 'known-dms-zero'].includes(r.cust_order_no),
  ))
    assert.equal(row.cancel_denominator, 0);
  assert.equal(rows.find((r) => r.cust_order_no === 'known-dms-zero').cancel_denominator, 50);
  assert.equal(rows.find((r) => r.cust_order_no === 'known-client-first').cancel_denominator, 7);
});

test('conflicting higher-priority daily fields stay unknown instead of falling through to a known backup', (t) => {
  const { read } = calculate(t, {
    hourly: [
      cancelled('conflict', { need_qty_origin: 100 }),
      cancelled('known-client', { change_order_qty: 5, need_qty_origin: 100 }),
    ],
    daily: [
      cancelled('conflict', { change_order_qty: 0 }),
      cancelled('conflict', { change_order_qty: 20 }),
      cancelled('known-client', { dms_last_update_qty: 0 }),
      cancelled('known-client', { dms_last_update_qty: 20 }),
    ],
  });
  assert.equal(read().invalid, 1);
  assert.equal(read().sample_denominator, 5);
});

test('quantity recovery rejects conflicting daily tuples and never borrows another line, SKU, customer, execution or base', (t) => {
  const missing = (id) => cancelled(id, { need_qty_origin: null });
  const { db, read } = calculate(t, {
    hourly: [missing('conflict'), missing('partial'), missing('wrong-key')],
    daily: [
      cancelled('conflict', { need_qty_origin: 10 }),
      cancelled('conflict', { need_qty_origin: 20 }),
      missing('partial'),
      cancelled('partial', { need_qty_origin: 10 }),
      cancelled('wrong-key', { executeorderlineno: 2 }),
      cancelled('wrong-key', { material_code: 'other' }),
      cancelled('wrong-key', { cust_code: 'other' }),
      cancelled('wrong-key', { executeorderno: 'other' }),
      cancelled('wrong-key', { belong_base: '湖州' }),
    ],
  });
  const row = read();
  assert.equal(row.invalid, 3);
  assert.equal(row.denominator, null);
  const target = db
    .prepare(sql(cancellationEvents))
    .all({ ...params, gea_p900: '' })
    .filter((row) => row.cust_code === 'C' && row.executeorderno === 'E-wrong-key');
  assert.equal(target.length, 3);
  assert.equal(
    target.find((row) => row.executeorderlineno === 1 && row.material_code === 'S').invalid_cancel,
    1,
  );
  assert.equal(
    target
      .filter((row) => row.invalid_cancel === 0)
      .reduce((sum, row) => sum + row.cancel_denominator, 0),
    20,
  );
});

test('unpublished/missing short-transfer facts retain a nonzero line as unknown; known zero cannot affect the rate', (t) => {
  const { read } = calculate(t, {
    hourly: [
      line('known', { need_qty_origin: 10 }),
      cancelled('unknown', { receive_wh: 'missing', need_qty_origin: 20 }),
      cancelled('zero', { receive_wh: 'missing', need_qty_origin: 0 }),
    ],
  });
  const r = read();
  assert.equal(r.numerator, null);
  assert.equal(r.denominator, null);
  assert.equal(r.invalid, 1);
  assert.equal(r.sample_numerator, 0);
  assert.equal(r.sample_denominator, 10);
  assert.equal(r.sample_records, 2);
  const metric = computeWorkbenchMetrics({
    sections: [{ id: 'changes', status: 'ready', rows: [r] }],
  })['作废率'];
  assert.equal(metric.sample.unit, '条候选商品明细');
  assert.match(metric.coverageNote, /不是全量指标/);
});

test('all-null quantities stay unknown, whereas all real-zero quantities produce a zero-denominator explanation', (t) => {
  const a = calculate(t, {
    hourly: [line('known'), line('missing', { need_qty_origin: null })],
  }).read();
  assert.equal(a.invalid, 1);
  assert.equal(a.denominator, null);
  assert.equal(a.sample_denominator, 10);
  const b = calculate(t, { hourly: [line('zero', { need_qty_origin: 0 })] }).read();
  assert.equal(b.denominator, 0);
  assert.equal(b.invalid, 0);
  const metric = computeWorkbenchMetrics({
    sections: [{ id: 'changes', status: 'ready', rows: [b] }],
  })['作废率'];
  assert.equal(metric.value, null);
  assert.match(metric.missingReason, /有效商品数量分母为0/);
});

test('identical observations collapse only at the execution line and conflicting period observations stay unknown', (t) => {
  const duplicate = line('same');
  const { db, read } = calculate(t, {
    hourly: [
      duplicate,
      duplicate,
      cancelled('conflict', { canceltime: '2026-10-30' }),
      cancelled('conflict', { canceltime: '2026-11-03' }),
    ],
  });
  const r = read();
  assert.equal(r.records, 2);
  assert.equal(r.invalid, 1);
  assert.equal(r.sample_denominator, 10);
  const events = db.prepare(sql(cancellationEvents)).all(params);
  assert.equal(events.find((x) => x.cust_order_no === 'conflict').invalid_cancel, 1);
});

test('six-window combined queries use the same cancellation event period and quantity formula', (t) => {
  const { db } = calculate(t, {
    hourly: [
      cancelled('old', {
        header_addtime: '2026-09-01',
        requireddeliverytime: '2026-09-05',
        canceltime: '2026-10-02',
        need_qty_origin: 25,
      }),
      line('active', { need_qty_origin: 75 }),
    ],
  });
  for (const table of ['agents_scm_execute_detail_hourly_d', 'agents_scm_execute_detail_d'])
    for (const [field, type] of [
      ['is_stat', 'TEXT'],
      ['order_qty_origin', 'REAL'],
      ['order_close_time', 'TEXT'],
      ['is_short_transfer', 'TEXT'],
    ])
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${field} ${type}`);
  db.exec(`CREATE TABLE agents_dim_bas_warehouse_d(warehouseid,pickup_point,warehouse_classify);`);
  const q = periodChangesSql();
  const windows =
    "SELECT 0 AS period_index,'2026-10-01' AS start_date,'2026-11-01' AS end_date,TRUE AS enabled UNION ALL SELECT 1,'2026-09-01','2026-10-01',TRUE";
  const rows = db
    .prepare(sql(`WITH report_windows AS (${windows}),${q.ctes} ${q.sql}`))
    .all({ gea_p900: '' });
  const october = rows.find((r) => r.kind === '1' && r.period_index === 0);
  assert.equal(october.numerator, 25);
  assert.equal(october.denominator, 100);
  assert.equal(rows.filter((r) => r.kind === '1' && r.period_index === 1).length, 0);
});

test('cached metrics from the previous cancellation quantity definition are rejected', () => {
  assert.equal(metricCalculationVersion, 45);
  assert.equal(
    compatibleWorkbenchFacts({
      complete: true,
      attributionVersion: 2,
      metricCalculationVersion: 44,
      periods: { month: {} },
    }),
    false,
  );
});

test('shallow cancellation stages retain overlapping period and partition totals with pending lines', (t) => {
  const { db } = calculate(t, {
    hourly: [
      cancelled('cancel0', { need_qty_origin: 25 }),
      line('shipped1', { need_qty_origin: 75 }),
      cancelled('pending2', { need_qty_origin: null }),
      cancelled('zero3', { change_order_qty: 0 }),
    ],
    daily: [cancelled('daily4', { need_qty_origin: 10 })],
  });
  const period = periodChangesSql('1', { base: true });
  assert.match(period.ctes, /cancellation_lines AS/);
  assert.match(period.ctes, /FROM cancellation_lines s/);
  assert.match(period.ctes, /FROM cancellation_quantities q/);
  const windows =
    "SELECT 0 AS period_index,'2026-10-01' AS start_date,'2026-11-01' AS end_date,TRUE AS enabled UNION ALL SELECT 1,'2026-10-01','2026-10-03',TRUE UNION ALL SELECT 2,'2026-09-01','2026-10-01',TRUE";
  const totals = (rows) =>
    ['sample_numerator', 'sample_denominator', 'records', 'invalid'].map((key) =>
      rows.reduce((sum, row) => sum + Number(row[key] ?? 0), 0),
    );
  const single = db.prepare(sql(cancellationChangesSql)).all(params);
  assert.deepEqual(totals(single), [35, 110, 5, 1]);
  const read = (query) =>
    db
      .prepare(
        sql(query).replaceAll(
          "RIGHT(COALESCE(executeorderno,''),1)",
          "SUBSTR(COALESCE(executeorderno,''),-1)",
        ),
      )
      .all({ gea_p900: '' });
  const combined = `WITH report_windows AS (${windows}),${period.ctes} ${period.sql}`;
  const rows = read(combined);
  const partitioned = [0, 1].flatMap((partition) =>
    read(cancellationPartitionSql(combined, partition)),
  );
  for (const index of [0, 1]) {
    assert.deepEqual(totals(rows.filter((row) => row.period_index === index)), totals(single));
    assert.deepEqual(
      totals(partitioned.filter((row) => row.period_index === index)),
      totals(single),
    );
  }
  assert.equal(
    rows.some((row) => row.period_index === 2),
    false,
  );
});

test('reported interface cancellations use OMS latest departures recovered from daily headers', (t) => {
  const orders = [
    ['E2600246486', '2026-10-15 19:24:07', '2026-10-25 19:23:58', '2026-10-23 13:36:55'],
    ['E2600246487', '2026-10-15 19:24:29', '2026-10-25 19:24:15', '2026-10-23 13:38:35'],
    ['E2600246495', '2026-10-15 19:32:17', '2026-10-30 19:32:04', '2026-10-23 13:37:48'],
  ];
  const daily = orders.map(([id, created, delivery, cancelledAt]) =>
    cancelled(id, {
      executeorderno: id,
      header_addtime: created,
      requireddeliverytime: delivery,
      latestsendcardate: {
        E2600246486: '2026-10-25 02:17:58',
        E2600246487: '2026-10-25 02:18:15',
        E2600246495: '2026-10-30 02:26:04',
      }[id],
      canceltime: cancelledAt,
      need_qty_origin: 2900,
    }),
  );
  const { db, read } = calculate(t, {
    hourly: daily.map((row) => ({ ...row, canceltime: null, latestsendcardate: null })),
    daily,
  });
  const events = db.prepare(sql(cancellationEvents)).all(params);
  assert.equal(events.find((row) => row.executeorderno === 'E2600246486').cancel_numerator, 2900);
  assert.equal(events.find((row) => row.executeorderno === 'E2600246487').cancel_numerator, 2900);
  assert.equal(events.find((row) => row.executeorderno === 'E2600246495').cancel_numerator, 2900);
  assert.equal(read().numerator, 8700);
  assert.equal(read().denominator, 8700);
  assert.equal(read().invalid, 0);
});

test('cancellations before and at the former seven-day boundary both count after twelve hours', (t) => {
  const { read } = calculate(t, {
    hourly: [
      cancelled('before-lock', {
        requireddeliverytime: '2026-10-20 00:00:00',
        latestsendcardate: '2026-10-13 00:00:00',
        canceltime: '2026-10-05 23:59:59',
        need_qty_origin: 30,
      }),
      cancelled('at-lock', {
        requireddeliverytime: '2026-10-20 00:00:00',
        latestsendcardate: '2026-10-13 00:00:00',
        canceltime: '2026-10-06 00:00:00',
        need_qty_origin: 20,
      }),
    ],
  });
  const row = read();
  assert.equal(row.numerator, 50);
  assert.equal(row.denominator, 50);
  assert.equal(row.invalid, 0);
});

test('missing or conflicting OMS departure times do not exclude cancelled or shipped quantities', (t) => {
  const { read } = calculate(t, {
    hourly: [
      cancelled('before-departure', {
        need_qty_origin: 10,
        latestsendcardate: null,
        requireddeliverytime: null,
      }),
      cancelled('recovered', { need_qty_origin: 20, latestsendcardate: null }),
      cancelled('missing', { need_qty_origin: 30, latestsendcardate: null }),
      cancelled('conflict', { need_qty_origin: 50, latestsendcardate: null }),
      line('active', { need_qty_origin: 40, latestsendcardate: null }),
      line('active-recovered', { need_qty_origin: 40, latestsendcardate: null }),
      cancelled('hourly-known', { need_qty_origin: 100 }),
    ],
    daily: [
      cancelled('before-departure', { latestsendcardate: '2026-10-03 00:00:00' }),
      cancelled('recovered', { latestsendcardate: '2026-10-01 12:00:00' }),
      cancelled('conflict', { latestsendcardate: '2026-10-01 12:00:00' }),
      cancelled('conflict', { latestsendcardate: '2026-10-03 12:00:00' }),
      cancelled('hourly-known', { latestsendcardate: '2026-10-03 00:00:00' }),
      line('active-recovered'),
    ],
  });
  assert.equal(read().sample_numerator, 210);
  assert.equal(read().sample_denominator, 290);
  assert.equal(read().invalid, 0);
  assert.equal(read().records, 7);
});

test('Zhengzhou scope uses order pickup 01 across source bases, never warehouse pickup mappings', (t) => {
  const { db } = calculate(t, {
    daily: [
      cancelled('zhengzhou', { pickup_point: '01', need_qty_origin: 8 }),
      cancelled('other-base', { pickup_point: '01', belong_base: '湖州', need_qty_origin: 100 }),
      cancelled('wrong-source-base', {
        warehouseid: 'F',
        pickup_point: '09',
        need_qty_origin: 999,
      }),
      cancelled('unknown-pickup', { warehouseid: 'F', pickup_point: null, need_qty_origin: 20 }),
    ],
  });
  db.exec(
    "UPDATE agents_scm_material_in_out_summary_d SET pickup_point='01' WHERE warehouseid='F'",
  );
  const row = db.prepare(sql(cancellationChangesSql)).all({ ...params, gea_p900: '郑州' })[0];
  assert.equal(row.sample_numerator, 108);
  assert.equal(row.sample_denominator, 108);
  assert.equal(row.records, 2);
  assert.equal(row.invalid, 0);
});

test('order pickup scope retains both the 10 and 3 product lines when warehouse pickup differs', (t) => {
  const { db } = calculate(t, {
    hourly: [
      line('E2600235777', { pickup_point: '01', warehouseid: 'F', need_qty_origin: 10 }),
      line('E2600235777', {
        pickup_point: '01',
        warehouseid: '*',
        executeorderlineno: 2,
        material_code: 'S2',
        need_qty_origin: 3,
      }),
    ],
  });
  db.exec(
    "UPDATE agents_scm_material_in_out_summary_d SET pickup_point='34' WHERE warehouseid='F'",
  );
  const row = db.prepare(sql(cancellationChangesSql)).all({ ...params, gea_p900: '郑州' })[0];
  assert.equal(row.numerator, 0);
  assert.equal(row.denominator, 13);
  assert.equal(row.records, 2);
  assert.equal(row.invalid, 0);
});

test('missing hourly order pickup recovers only a unique exact daily header and keeps known hourly pickup', (t) => {
  const { db } = calculate(t, {
    hourly: [
      line('missing', { pickup_point: null, need_qty_origin: 10 }),
      line('blank', { pickup_point: ' ', need_qty_origin: 20 }),
      line('known-other', { pickup_point: '09', need_qty_origin: 100 }),
      line('conflict', { pickup_point: null, need_qty_origin: 30 }),
    ],
    daily: [
      line('missing', { pickup_point: '01' }),
      line('blank', { pickup_point: '01' }),
      line('known-other', { pickup_point: '01' }),
      line('conflict', { pickup_point: '01' }),
      line('conflict', { pickup_point: '09', executeorderlineno: 2, material_code: 'other' }),
    ],
  });
  const row = db.prepare(sql(cancellationChangesSql)).all({ ...params, gea_p900: '郑州' })[0];
  assert.equal(row.sample_denominator, 30);
  assert.equal(row.records, 2);
  assert.equal(row.invalid, 0);
});

test('supplements only missing valid daily product lines without replacing existing hourly lines or their zero', (t) => {
  const { db } = calculate(t, {
    hourly: [line('supplement', { pickup_point: '01', need_qty_origin: 2 })],
    daily: [
      line('supplement', { pickup_point: '01', need_qty_origin: 999 }),
      line('supplement', {
        pickup_point: '01',
        executeorderlineno: 2,
        material_code: 'valid',
        need_qty_origin: 3,
      }),
      line('supplement', {
        pickup_point: '01',
        executeorderlineno: 3,
        material_code: 'not-valid',
        detailstatus: 20,
        need_qty_origin: 40,
      }),
      line('supplement', {
        pickup_point: '01',
        executeorderlineno: 4,
        material_code: 'unknown-status',
        detailstatus: null,
        need_qty_origin: 50,
      }),
      line('supplement', {
        pickup_point: '01',
        executeorderlineno: 5,
        material_code: 'zero',
        change_order_qty: 0,
        need_qty_origin: 100,
      }),
    ],
  });
  const row = db.prepare(sql(cancellationChangesSql)).all({ ...params, gea_p900: '郑州' })[0];
  assert.equal(row.denominator, 5);
  assert.equal(row.records, 3);
  assert.equal(row.invalid, 0);
});

test('warehouse pickup mappings still govern short transfers independently of order scope', (t) => {
  const { db } = calculate(t, {
    hourly: [
      cancelled('short', { pickup_point: '01', receive_wh: 'R', need_qty_origin: 100 }),
      cancelled('keep', { pickup_point: '01', receive_wh: 'OTHER', need_qty_origin: 7 }),
    ],
  });
  const row = db.prepare(sql(cancellationChangesSql)).all({ ...params, gea_p900: '郑州' })[0];
  assert.equal(row.numerator, 7);
  assert.equal(row.denominator, 7);
  assert.equal(row.records, 1);
});

test('reported E2600228660 counts cancellation quantities without the former seven-day lock', (t) => {
  const { db, read } = calculate(t, {
    daily: [
      cancelled('E2600228660', {
        executeorderno: 'E2600228660',
        header_addtime: '2026-09-23 19:14:58',
        canceltime: '2026-10-01 15:34:00',
        latestsendcardate: '2026-10-13 07:57:00',
        need_qty_origin: 2000,
      }),
      line('active', { need_qty_origin: 1 }),
    ],
  });
  const events = db.prepare(sql(cancellationEvents)).all(params);
  assert.equal(
    events.some((row) => row.executeorderno === 'E2600228660'),
    true,
  );
  assert.equal(read().numerator, 2000);
  assert.equal(read().denominator, 2001);
});

test('reported E2600233296 recovers all cancelled daily lines without replacing the surviving unknown hourly line', (t) => {
  const base = {
    executeorderno: 'E2600233296',
    header_addtime: '2026-09-29 14:37:24',
    canceltime: '2026-11-02 09:48:33',
  };
  const values = [60, 50, 30, 50, 14, 50, 30, 0, 10, 0, 100, null];
  const { db } = calculate(t, {
    hourly: [cancelled('S00693316', { ...base, executeorderlineno: 14, need_qty_origin: null })],
    daily: [
      ...values.map((quantity, index) =>
        cancelled('S00693316', {
          ...base,
          executeorderlineno: index + 1,
          material_code: 'S' + index,
          need_qty_origin: quantity,
        }),
      ),
      cancelled('S00693316', { ...base, executeorderlineno: 14, need_qty_origin: null }),
    ],
  });
  const row = db
    .prepare(sql(cancellationChangesSql))
    .all({ ...params, gea_p1: '2026-11-01', gea_p2: '2026-11-16' })[0];
  assert.equal(row.sample_numerator, 394);
  assert.equal(row.sample_denominator, 394);
  assert.equal(row.records, 13);
  assert.equal(row.invalid, 2);
});

test('WMS shipment fallback requires completed orders and real shipment, retains all products, and never uses OMS creation', (t) => {
  const shipped = { orderstatus: 100, wms_close_time: '2026-11-15 07:52:23', qtyshipped: 1 };
  const { db } = calculate(t, {
    hourly: [
      line('daily-fallback', { orderstatus: 100, need_qty_origin: 20 }),
      line('whole-execution', { ...shipped, need_qty_origin: 10 }),
      line('whole-execution', {
        ...shipped,
        executeorderlineno: 2,
        material_code: 'unfilled-product',
        qtyshipped: 0,
        need_qty_origin: 30,
      }),
      line('not-shipped', { ...shipped, qtyshipped: 0, need_qty_origin: 100 }),
      line('not-complete', { ...shipped, orderstatus: 10, need_qty_origin: 100 }),
      line('created-only', { header_addtime: '2026-11-15', need_qty_origin: 100 }),
    ],
    daily: [
      line('daily-fallback', { ...shipped, need_qty_origin: 20 }),
      line('not-complete', { ...shipped, need_qty_origin: 100 }),
    ],
    shipments: [],
  });
  const row = db
    .prepare(sql(cancellationChangesSql))
    .all({ ...params, gea_p1: '2026-11-01', gea_p2: '2026-11-16' })[0];
  assert.equal(row.denominator, 60);
  assert.equal(row.records, 3);
  assert.equal(row.invalid, 0);
});

test('confirmed trace shipment wins over later WMS completion while unshipped trace timestamps are rejected', (t) => {
  const { db } = calculate(t, {
    hourly: [
      line('trace-priority', {
        orderstatus: 100,
        qtyshipped: 1,
        wms_close_time: '2026-11-16 09:03:42',
        need_qty_origin: 1821,
      }),
      line('dirty-trace', { orderstatus: 10, need_qty_origin: 100 }),
      line('prior-month', {
        orderstatus: 100,
        qtyshipped: 1,
        wms_close_time: '2026-11-01 10:00:50',
        need_qty_origin: 1372,
      }),
    ],
    shipments: [
      {
        executeorderno: 'E-trace-priority',
        cust_code: 'C',
        lastshipmenttime: '2026-11-15 07:52:10',
      },
      {
        executeorderno: 'E-dirty-trace',
        cust_code: 'C',
        lastshipmenttime: '2026-11-15',
        wms_ship_status: '10',
        load_status: '未装车',
      },
      {
        executeorderno: 'E-prior-month',
        cust_code: 'C',
        lastshipmenttime: '2026-10-31 11:34:56',
      },
    ],
  });
  const row = db
    .prepare(sql(cancellationChangesSql))
    .all({ ...params, gea_p1: '2026-11-01', gea_p2: '2026-11-16' })[0];
  assert.equal(row.denominator, 1821);
  assert.equal(row.records, 1);
});

test('upstream short-transfer labels cannot override distinct pickup points or a non-factory warehouse', (t) => {
  const { db, read } = calculate(t, {
    hourly: [
      line('N417-keep', { warehouseid: 'N417', receive_wh: 'R', need_qty_origin: 1015 }),
      line('N417-other', { warehouseid: 'N417', receive_wh: 'R', need_qty_origin: 514 }),
      line('same-factory', {
        warehouseid: '*',
        warehouse_classify: '02',
        receive_wh: 'R',
        need_qty_origin: 10,
      }),
    ],
  });
  db.exec(
    "INSERT INTO agents_scm_material_in_out_summary_d VALUES ('N417','34','20'); INSERT INTO dim_bas_warehouse VALUES ('N417','20'); ALTER TABLE agents_scm_execute_detail_hourly_d ADD COLUMN is_short_transfer; UPDATE agents_scm_execute_detail_hourly_d SET is_short_transfer='短拨'",
  );
  assert.equal(read().denominator, 1529);
  assert.equal(read().records, 2);
  assert.equal(read().invalid, 0);
});

test('partitioned card queries retain WMS shipment proof and reconcile with the unpartitioned Agent query', (t) => {
  const { db } = calculate(t, {
    daily: [
      line('W0', {
        orderstatus: 100,
        wms_close_time: '2026-10-02',
        qtyshipped: 1,
        need_qty_origin: 10,
      }),
      line('W1', {
        orderstatus: 100,
        wms_close_time: '2026-10-02',
        qtyshipped: 1,
        need_qty_origin: 20,
      }),
    ],
    shipments: [],
  });
  const partitions = [0, 1].map(
    (part) =>
      db
        .prepare(
          sql(cancellationPartitionSql(cancellationChangesSql, part)).replaceAll(
            "RIGHT(COALESCE(executeorderno,''),1)",
            "SUBSTR(COALESCE(executeorderno,''),-1)",
          ),
        )
        .all(params)[0],
  );
  assert.equal(
    partitions.reduce((sum, row) => sum + (row.denominator ?? 0), 0),
    30,
  );
  assert.equal(db.prepare(sql(cancellationChangesSql)).all(params)[0].denominator, 30);
});

test('reported zero-quantity executions retain confirmed dispatch evidence rather than being treated as unshipped', (t) => {
  const cases = [
    ['E2600262287', 860],
    ['E2600260837', 3],
    ['E2600259275', 10],
    ['E2600265875', 1],
  ];
  const { db } = calculate(t, {
    hourly: [
      ...cases.map(([id, quantity]) =>
        line(id, {
          executeorderno: id,
          orderstatus: 100,
          qtyshipped: 0,
          need_qty_origin: quantity,
        }),
      ),
      line('unconfirmed', {
        orderstatus: 100,
        qtyshipped: 0,
        wms_close_time: '2026-11-04',
        need_qty_origin: 500,
      }),
    ],
    shipments: [
      ...cases.map(([id]) => ({
        executeorderno: id,
        cust_code: 'C',
        lastshipmenttime: null,
        wms_order_close_time: '2026-11-04 12:20:32',
        wms_ship_status: '99',
        load_status: '装车完成',
      })),
      {
        executeorderno: 'E-unconfirmed',
        cust_code: 'C',
        lastshipmenttime: null,
        wms_order_close_time: '2026-11-04',
        wms_ship_status: '10',
        load_status: '未装车',
      },
    ],
  });
  const row = db
    .prepare(sql(cancellationChangesSql))
    .all({ ...params, gea_p1: '2026-11-01', gea_p2: '2026-11-16' })[0];
  assert.equal(row.denominator, 874);
  assert.equal(row.records, 4);
  assert.equal(row.invalid, 0);
});
