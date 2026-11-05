import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  ontimeSql,
  ontimeTraceHeadersSql,
  traceHeadersSql,
} from '../business/inventory-orderworkbench/document-queries.mjs';

test('on-time exclusions and shipment evidence do not alter fulfillment traces', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(
      'CREATE TABLE agents_scm_order_trace_final_di(executeorderno,cust_code,update_time,lastshipmenttime,wms_order_close_time,gpsisinraildate_to,arriveconfirm_time,requireddeliverytimebak,requireddeliverytime,expected_deliv_time,is_dispatch,region_name,timeout_code)',
    );
    const put = db.prepare(
      'INSERT INTO agents_scm_order_trace_final_di VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
    );
    const date = '2026-10-20 00:00:00';
    for (const [id, dispatch, region, reason, ship] of [
      ['valid', '是', '华东', '', date],
      ['overseas', '是', '国外大区', '', date],
      ['hk', '是', '港澳大区', '', date],
      ['no-dispatch', '否', '华东', '', date],
      ['safety', '是', '华东', '14', date],
      ['adjust', '是', '华东', '16', date],
      ['only-close', '是', '华东', '', null],
    ])
      put.run(id, 'C', date, ship, date, date, null, date, date, date, dispatch, region, reason);
    db.exec(`CREATE TABLE dim_bas_warehouse(warehouse_id,warehouse_classify);
      CREATE TABLE agents_scm_material_in_out_summary_d(material_code,product_categ_name,warehouseid,pickup_point,warehouse_classify);
      ALTER TABLE agents_scm_order_trace_final_di ADD COLUMN is_virtual_odo;
      ALTER TABLE agents_scm_order_trace_final_di ADD COLUMN vehicle_type;
      ALTER TABLE agents_scm_order_trace_final_di ADD COLUMN vehicle_type_name;
      ALTER TABLE agents_scm_order_trace_final_di ADD COLUMN deliver_wh;
      ALTER TABLE agents_scm_order_trace_final_di ADD COLUMN receive_wh;
      UPDATE agents_scm_order_trace_final_di SET vehicle_type='11',vehicle_type_name='15米';`);
    db.function('GREATEST', { varargs: true }, (...v) => v.sort().at(-1));
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
    const rows = db.prepare(translate(ontimeTraceHeadersSql)).all();
    assert.deepEqual(rows.map((r) => r.executeorderno).sort(), ['only-close', 'valid']);
    assert.equal(rows.find((r) => r.executeorderno === 'only-close').shipped, null);
    assert.equal(db.prepare(translate(traceHeadersSql)).all().length, 7);
    db.exec(`CREATE TABLE agents_scm_execute_detail_hourly_d(cust_order_no,cust_code,material_code,executeorderno,belong_base,detailstatus,is_stat,product_item);
      CREATE TABLE agents_scm_execute_detail_d AS SELECT * FROM agents_scm_execute_detail_hourly_d;

      INSERT INTO agents_scm_execute_detail_hourly_d SELECT executeorderno,'C','S',executeorderno,'华东',10,'1','水饺' FROM agents_scm_order_trace_final_di;
      ALTER TABLE agents_scm_execute_detail_hourly_d ADD COLUMN is_virtual;
      ALTER TABLE agents_scm_execute_detail_d ADD COLUMN is_virtual;`);
    db.function('CONCAT', { varargs: true }, (...v) => v.join(''));
    db.aggregate('ARRAY_AGG', { start: '', step: (s, v) => s + v });
    const orders = db
      .prepare(translate(ontimeSql))
      .all({ gea_p900: '', gea_p1: '2026-10-01', gea_p2: '2026-11-01' });
    assert.equal(orders.length, 1);
    assert.equal(orders.find((r) => r.order_no === 'valid').ontime, 1);
    assert.equal(
      orders.some((r) => r.order_no === 'only-close'),
      false,
    );
  } finally {
    db.close();
  }
});
