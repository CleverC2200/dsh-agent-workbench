import test from 'node:test';
import assert from 'node:assert/strict';
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
  line(id, { orderstatus: 90, canceltime: '2026-10-02 00:00:00', ...values });
const calculate = (t, source) => {
  const db = cancellationDb(source);
  t.after(() => db.close());
  return { db, read: () => db.prepare(sql(cancellationChangesSql)).all(params)[0] };
};

test('sums DMS last quantities then backup quantities, ignoring customer changes and retaining real zero', (t) => {
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
    ],
  });
  const r = read();
  assert.equal(r.numerator, 187);
  assert.equal(r.denominator, 220);
  assert.equal(r.records, 5);
  const metric = computeWorkbenchMetrics({
    sections: [{ id: 'changes', status: 'ready', rows: [r] }],
  })['作废率'];
  assert.ok(Math.abs(metric.value - 18700 / 220) < 1e-10);
  assert.match(metric.note, /need_qty_origin/);
  assert.match(metric.note, /作废时间canceltime归月/);
});

test('cancelled products use cancellation month; other products use their own OMS creation month', (t) => {
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
        canceltime: '2026-10-10',
        need_qty_origin: 17,
      }),
    ],
  });
  const r = read();
  assert.equal(r.numerator, 23);
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
      cancelled(id, { warehouseid: '*', receive_wh: 'OTHER', need_qty_origin: 10 }),
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
        pickup_point: 'P',
        warehouse_classify: '01',
        receive_wh: 'R',
        need_qty_origin: 100,
      }),
      cancelled('daily-name', {
        warehouseid: null,
        pickup_point: 'P',
        warehouse_classify: '工厂成品仓',
        receive_wh: 'OTHER',
        need_qty_origin: 20,
      }),
      cancelled('rented-name', {
        warehouseid: '',
        pickup_point: 'P',
        warehouse_classify: '工厂外租库',
        receive_wh: 'OTHER',
        need_qty_origin: 30,
      }),
      cancelled('known-warehouse', {
        warehouseid: 'F',
        pickup_point: 'Q',
        warehouse_classify: '01',
        receive_wh: 'OTHER',
        need_qty_origin: 7,
      }),
      cancelled('different-points', {
        warehouseid: '*',
        pickup_point: 'P',
        warehouse_classify: null,
        receive_wh: 'OTHER',
        need_qty_origin: 11,
      }),
      cancelled('nonfactory', {
        warehouseid: '*',
        pickup_point: 'P',
        warehouse_classify: '电商仓',
        receive_wh: 'R',
        need_qty_origin: 4,
      }),
      cancelled('trace-priority', {
        warehouseid: '*',
        pickup_point: 'Q',
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

test('matching pickup points still require both factory classes, and absent source pickup stays unknown', (t) => {
  const { read } = calculate(t, {
    hourly: [
      line('keep', { need_qty_origin: 5 }),
      cancelled('unknown-class', {
        warehouseid: '*',
        pickup_point: 'P',
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
  assert.equal(read().invalid, 2);
  assert.equal(read().sample_denominator, 5);
  assert.equal(read().unknown_quantity, 30);
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

test('daily recovery supplies only the exact unique event and cannot restore stale hourly products or quantities', (t) => {
  const { read } = calculate(t, {
    hourly: [cancelled('O', { canceltime: null, need_qty_origin: 5 })],
    daily: [
      cancelled('O', { need_qty_origin: 200 }),
      cancelled('O', { material_code: 'deleted', executeorderlineno: 2, need_qty_origin: 300 }),
      cancelled('history', { need_qty_origin: 9 }),
    ],
  });
  const r = read();
  assert.equal(r.numerator, 14);
  assert.equal(r.denominator, 14);
  assert.equal(r.records, 2);
});

test('recovers exact daily DMS or backup quantities when both hourly fields are null, ignoring customer changes', (t) => {
  const missing = (id) => cancelled(id, { need_qty_origin: null });
  const { read } = calculate(t, {
    hourly: [
      cancelled('client', { change_order_qty: 999, need_qty_origin: null }),
      missing('dms'),
      missing('backup'),
      missing('zero'),
      cancelled('known-zero', { dms_last_update_qty: 0, need_qty_origin: null }),
      cancelled('known-backup', { need_qty_origin: 9 }),
    ],
    daily: [
      cancelled('client', { change_order_qty: 30, dms_last_update_qty: 100 }),
      cancelled('dms', { dms_last_update_qty: 20 }),
      cancelled('backup', { need_qty_origin: 10 }),
      cancelled('zero', { change_order_qty: 300, dms_last_update_qty: 0, need_qty_origin: 999 }),
      cancelled('zero', { change_order_qty: 400, dms_last_update_qty: 0, need_qty_origin: 999 }),
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
  assert.equal(row.numerator, 139);
  assert.equal(row.denominator, 139);
  assert.equal(row.records, 6);
  assert.equal(row.invalid, 0);
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
    .all({ ...params, gea_p900: '郑州' })
    .filter((row) => row.cust_code === 'C' && row.executeorderno === 'E-wrong-key');
  assert.equal(target.length, 1);
  assert.equal(target[0].invalid_cancel, 1);
  assert.equal(target[0].cancel_denominator, null);
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
    hourly: [line('known'), line('missing', { change_order_qty: 999, need_qty_origin: null })],
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
      ['detailstatus', 'INTEGER'],
      ['is_stat', 'TEXT'],
      ['order_qty_origin', 'REAL'],
    ])
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${field} ${type}`);
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
  assert.equal(metricCalculationVersion, 31);
  assert.equal(
    compatibleWorkbenchFacts({
      complete: true,
      attributionVersion: 2,
      metricCalculationVersion: 30,
      periods: { month: {} },
    }),
    false,
  );
});

test('interface cancellations respect the confirmed locks for the three reported execution orders', (t) => {
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
      canceltime: cancelledAt,
      need_qty_origin: 2900,
    }),
  );
  const { db, read } = calculate(t, {
    hourly: daily.map((row) => ({ ...row, canceltime: null })),
    daily,
  });
  const events = db.prepare(sql(cancellationEvents)).all(params);
  assert.equal(events.find((row) => row.executeorderno === 'E2600246486').cancel_numerator, 2900);
  assert.equal(events.find((row) => row.executeorderno === 'E2600246487').cancel_numerator, 2900);
  assert.equal(events.find((row) => row.executeorderno === 'E2600246495').cancel_numerator, 0);
  assert.equal(read().numerator, 5800);
  assert.equal(read().denominator, 8700);
  assert.equal(read().invalid, 0);
});

test('long-lead deliveries use delivery minus seven days and include the lock boundary', (t) => {
  const { read } = calculate(t, {
    hourly: [
      cancelled('before-lock', {
        requireddeliverytime: '2026-10-20 00:00:00',
        canceltime: '2026-10-12 23:59:59',
        need_qty_origin: 30,
      }),
      cancelled('at-lock', {
        requireddeliverytime: '2026-10-20 00:00:00',
        canceltime: '2026-10-13 00:00:00',
        need_qty_origin: 20,
      }),
    ],
  });
  const row = read();
  assert.equal(row.numerator, 20);
  assert.equal(row.denominator, 50);
  assert.equal(row.invalid, 0);
});

test('daily history remains available when hourly is empty and respects the selected base', (t) => {
  const { db } = calculate(t, {
    daily: [
      cancelled('zhengzhou', { need_qty_origin: 8 }),
      cancelled('other-base', { belong_base: '湖州', need_qty_origin: 100 }),
    ],
  });
  const row = db.prepare(sql(cancellationChangesSql)).all({ ...params, gea_p900: '郑州' })[0];
  assert.equal(row.numerator, 8);
  assert.equal(row.denominator, 8);
  assert.equal(row.records, 1);
});
