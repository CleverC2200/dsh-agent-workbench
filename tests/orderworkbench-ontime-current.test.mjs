import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  ontimeSql,
  ontimeSummarySql,
} from '../business/inventory-orderworkbench/document-queries.mjs';
import { computeWorkbenchMetrics } from '../prototypes/inventory-orderworkbench/metric-model.mjs';
import { workbenchPresentation } from '../prototypes/inventory-orderworkbench/live-presentation.mjs';

const translate = (sql) =>
  sql
    .replaceAll('CAST(t.expected_deliv_time AS DATETIME)', 't.expected_deliv_time')
    .replaceAll(
      "GREATEST(MAX(t.requireddeliverytimebak),MAX(t.requireddeliverytime)) + INTERVAL '12' HOUR",
      "datetime(GREATEST(MAX(t.requireddeliverytimebak),MAX(t.requireddeliverytime)), '+12 hours')",
    )
    .replace(
      /GREATEST\((MAX\(t\.requireddeliverytimebak\),MAX\(t\.requireddeliverytime\),MAX\(t\.expected_deliv_time\))\) \+ INTERVAL '12' HOUR/g,
      "datetime(GREATEST($1), '+12 hours')",
    );

test('execution arrival cohort, all exclusions, missing evidence and summary parity', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const fields =
      'executeorderno,cust_code,update_time,lastshipmenttime,gpsisinraildate_to,arriveconfirm_time,requireddeliverytimebak,requireddeliverytime,expected_deliv_time,is_dispatch,region_name,timeout_code,is_virtual_odo,vehicle_type,vehicle_type_name,deliver_wh,receive_wh'.split(
        ',',
      );
    db.exec(`CREATE TABLE agents_scm_order_trace_final_di(${fields.join(',')});
      CREATE TABLE agents_scm_execute_detail_hourly_d(cust_order_no,cust_code,material_code,executeorderno,belong_base,detailstatus,is_stat,product_item,is_virtual);
      CREATE TABLE agents_scm_execute_detail_d AS SELECT * FROM agents_scm_execute_detail_hourly_d;
      CREATE TABLE dim_bas_warehouse(warehouse_id,warehouse_classify,warehouse_classify_name);
      INSERT INTO dim_bas_warehouse VALUES ('EC','21','ecommerce'),('CONFLICT','01','factory');
      CREATE TABLE agents_scm_material_in_out_summary_d(warehouseid,pickup_point,warehouse_classify,material_code,product_categ_name);
      INSERT INTO agents_scm_material_in_out_summary_d VALUES ('F','P','01','S','food'),('R','P','02','S','food'),('X','Q','02','T','food'),('D','P','20','T','food'),('F','P','01','T','food'),('CONFLICT','P','20','T','food');`);
    db.function('GREATEST', { varargs: true }, (...v) => v.sort().at(-1));
    db.function('CONCAT', { varargs: true }, (...v) => v.join(''));
    db.aggregate('ARRAY_AGG', {
      start: '[]',
      step: (s, v) => JSON.stringify([...JSON.parse(s), v]),
    });
    const put = db.prepare(
      `INSERT INTO agents_scm_order_trace_final_di VALUES(${fields.map(() => '?').join(',')})`,
    );
    const product = db.prepare(
      'INSERT INTO agents_scm_execute_detail_hourly_d VALUES(?,?,?,?,?,?,?,?,?)',
    );
    const add = (id, overrides = {}, virtual = 0) => {
      const row = {
        executeorderno: id,
        cust_code: 'C',
        update_time: '2026-11-01',
        lastshipmenttime: '2026-09-20 12:00:00',
        gpsisinraildate_to: '2026-09-21 09:00:00',
        arriveconfirm_time: '2026-09-22 12:00:00',
        requireddeliverytimebak: '2026-09-20 19:00:00',
        requireddeliverytime: '2026-09-20 20:00:00',
        expected_deliv_time: '2026-09-20 21:00:00',
        is_dispatch: '是',
        region_name: '华东大区',
        timeout_code: '',
        is_virtual_odo: '否',
        vehicle_type: '11',
        vehicle_type_name: '15米',
        deliver_wh: 'F',
        receive_wh: '',
        ...overrides,
      };
      put.run(...fields.map((f) => row[f]));
      product.run('SHARED-ORIGINAL', 'C', 'S', id, '郑州', 10, '1', 'dumplings', virtual);
    };
    add('E-boundary');
    product.run('SHARED-ORIGINAL', 'C', 'T', 'E-boundary', '郑州', 10, '1', 'buns', 0);
    add('E-late', { gpsisinraildate_to: '2026-09-21 09:00:01' });
    add('E-confirm', { gpsisinraildate_to: null, arriveconfirm_time: '2026-09-21 08:59:59' });
    add('E-missing-promise', {
      expected_deliv_time: null,
      gpsisinraildate_to: '2026-09-21 08:00:00',
    });
    add('E-missing-late', { expected_deliv_time: null, gpsisinraildate_to: '2026-09-21 09:00:01' });
    add('E-warehouse-fallback', { receive_wh: 'EC' });
    add('E-class-conflict', { receive_wh: 'CONFLICT' });
    add('E-unmapped', { receive_wh: 'UNKNOWN' });
    add('E-nonfactory', { receive_wh: 'D' });
    add('E-different-point', { receive_wh: 'X' });
    add('short', { receive_wh: 'R' });
    add('no-dispatch', { is_dispatch: '否' });
    for (const region of ['海外大区', '港澳大区']) add(region, { region_name: region });
    for (const reason of ['14', '16', '安全库存', '调账订单'])
      add('reason-' + reason, { timeout_code: reason });
    for (const vehicle of ['铁柜40', '铁柜45', '无车型要求（常温）', '无车型要求（速冻）', '自提'])
      add(vehicle, { vehicle_type_name: vehicle });
    add('empty-vehicle', { vehicle_type: '' });
    add('null-vehicle', { vehicle_type: null });
    add('virtual-1', {}, 1);
    add('virtual-2', {}, 2);
    add('not-shipped', { lastshipmenttime: null });
    add('outside', { gpsisinraildate_to: '2026-09-22 00:00:00' });
    add('no-arrival', { gpsisinraildate_to: null, arriveconfirm_time: null });
    const params = { gea_p900: '', gea_p1: '2026-09-21', gea_p2: '2026-09-22' },
      result = db.prepare(translate(ontimeSql)).all(params);
    assert.deepEqual(result.map((r) => r.order_no).sort(), [
      'E-boundary',
      'E-class-conflict',
      'E-confirm',
      'E-different-point',
      'E-late',
      'E-missing-late',
      'E-missing-promise',
      'E-nonfactory',
      'E-unmapped',
      'E-warehouse-fallback',
    ]);
    assert.equal(
      result.find((r) => r.order_no === 'E-boundary').ontime,
      1,
      '12h inclusive; GPS overrides later confirmation',
    );
    assert.equal(result.find((r) => r.order_no === 'E-late').ontime, 0);
    assert.equal(result.find((r) => r.order_no === 'E-confirm').ontime, 1);
    assert.equal(result.find((r) => r.order_no === 'E-unmapped').invalid, 1);
    assert.equal(result.find((r) => r.order_no === 'E-missing-promise').ontime, 1);
    assert.equal(result.find((r) => r.order_no === 'E-missing-late').invalid, 1);
    assert.equal(result.find((r) => r.order_no === 'E-warehouse-fallback').ontime, 1);
    assert.equal(result.find((r) => r.order_no === 'E-class-conflict').invalid, 1);
    const packed = db.prepare(translate(ontimeSummarySql)).all(params);
    assert.equal(
      packed.reduce((n, r) => n + JSON.parse(r.packed_orders).length, 0),
      11,
      '10 executions and one extra SKU membership',
    );
    const metric = computeWorkbenchMetrics({
      sections: [{ id: 'ontime', status: 'ready', rows: result }],
    })['准交率'];
    assert.equal(metric.sample.total, 10);
    assert.equal(metric.sample.known, 7);
    assert.equal(metric.value, 60);
    assert.equal(metric.sample.value, 600 / 7);
  } finally {
    db.close();
  }
});

test('Pang Lijuan uses the Zhengzhou base for current and comparison on-time rates', () => {
  const period = (late) => {
    const rows = [
      {
        order_no: 'E1',
        customer: 'C',
        base: '郑州',
        sku: 'S',
        item: 'dumplings',
        ontime: 1,
        invalid: 0,
      },
      {
        order_no: 'E2',
        customer: 'C',
        base: '郑州',
        sku: 'T',
        item: 'buns',
        ontime: late ? 0 : 1,
        invalid: 0,
      },
    ];
    const p = {
      sections: [
        { id: 'ontime', status: 'ready', rows },
        {
          id: 'directors',
          status: 'ready',
          rows: [
            { base: '郑州', sku: 'S', director: '庞丽娟', names: 1 },
            { base: '郑州', sku: 'T', director: '其他总监', names: 1 },
          ],
        },
      ],
    };
    p.metrics = computeWorkbenchMetrics(p);
    return p;
  };
  const current = period(true),
    previous = period(false),
    view = workbenchPresentation({
      selected: 'month',
      periods: { month: current, week: current, previousMonth: previous, previousWeek: previous },
      directors: { rows: [] },
      customers: { rows: [] },
    });
  for (const key of ['month', 'week']) {
    const row = view.performance['director-performance'][key].find((r) => r[0] === '庞丽娟');
    assert.ok(row);
    assert.equal(row[5].raw, 50);
    assert.equal(row[6], '-50.00%');
  }
});
