import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  executionProductsSql,
  orderEventRowsSql,
  traceHeadersSql,
  fulfillmentShippingSql,
} from '../business/inventory-orderworkbench/document-queries.mjs';

test('daily history survives an empty hourly refresh and hourly exclusions suppress the entire stale execution', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`CREATE TABLE agents_scm_execute_detail_d(
      cust_code,cust_order_no,executeorderno,belong_base,material_code,detailstatus,is_stat,
      product_item,region_name,province_region_name,cust_name,header_addtime,
      requireddeliverytime,orderstatus,canceltime,custchangetime
    );
    CREATE TABLE agents_scm_execute_detail_hourly_d AS SELECT * FROM agents_scm_execute_detail_d;
    INSERT INTO agents_scm_execute_detail_d VALUES
      ('C','O','E','郑州','S1',10,'1','水饺','','','','2025-10-20','2025-10-25',10,NULL,NULL),
      ('C','O','E','郑州','S2',10,'1','水饺','','','','2025-10-20','2025-10-25',10,NULL,NULL),
      ('C','O','E2','郑州','S3',10,'1','水饺','','','','2025-10-20','2025-10-25',10,NULL,NULL),
      ('OTHER','O','E','郑州','S1',10,'1','汤圆','','','','2025-10-20','2025-10-25',10,NULL,NULL),
      ('C','O','E','华南','S1',10,'1','水饺','','','','2025-10-20','2025-10-25',10,NULL,NULL);`);
    const products = (base = '') =>
      db.prepare(executionProductsSql.replaceAll('<=>', ' IS ')).all({ gea_p900: base });
    assert.equal(
      products().length,
      5,
      'all daily execution/SKU members survive an empty hourly table',
    );
    assert.equal(products('郑州').length, 4);
    assert.equal(
      db.prepare(orderEventRowsSql.replaceAll('<=>', ' IS ')).all({ gea_p900: '郑州' }).length,
      4,
    );

    // A new cancelled execution has removed S2. Do not restore either daily SKU.
    db.exec(`INSERT INTO agents_scm_execute_detail_hourly_d VALUES
      ('C','O','E','郑州','S1',20,'1','水饺','','','','2025-10-20','2025-10-25',90,'2025-10-24',NULL);`);
    const remaining = products('郑州');
    assert.equal(remaining.length, 2);
    assert.ok(remaining.some((row) => row.executeorderno === 'E2'));
    assert.ok(remaining.some((row) => row.cust_code === 'OTHER'));
    const events = db
      .prepare(orderEventRowsSql.replaceAll('<=>', ' IS '))
      .all({ gea_p900: '郑州' });
    assert.equal(events.length, 3);
    assert.equal(events.filter((row) => row.cust_code === 'C' && row.orderstatus === 90).length, 1);
    assert.equal(products('华南').length, 1, 'base is part of precedence key');
  } finally {
    db.close();
  }
});

test('fulfillment execution lists require every distinct customer-bound child and retain missing tokens', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`CREATE TABLE agents_order_execute_isontime_mi(
      fromorderno,cust_code,new_material_code,executeorderno,exp_flag,order_qty_origin,need_qty_origin,belong_base
    );
    CREATE TABLE agents_scm_order_trace_final_di(
      executeorderno,cust_code,lastshipmenttime,wms_order_close_time,gpsisinraildate_to,
      arriveconfirm_time,requireddeliverytimebak,requireddeliverytime,expected_deliv_time,update_time
    );
    INSERT INTO agents_order_execute_isontime_mi VALUES
      ('complete','C','S','E1, E2,E1','否',10,10,'郑州'),
      ('complete','C','S','E1, E2,E1','否',10,10,'郑州'),
      ('partial','C','S','E1,missing','否',10,10,'郑州'),
      ('blank','C','S','E1,','否',10,10,'郑州'),
      ('other','OTHER','S','E1','否',10,10,'郑州'),
      ('excluded','C','S','E1','是',10,10,'郑州'),
      ('base','C','S','E1','否',10,10,'华南');
    INSERT INTO agents_scm_order_trace_final_di VALUES
      ('E1','C','2026-10-23',NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-26'),
      ('E2','C',NULL,'2026-10-25',NULL,NULL,NULL,NULL,NULL,'2026-10-26');`);
    db.function('GREATEST', { varargs: true }, () => null);
    db.function('split_json', (value) => JSON.stringify(value.split(',')));
    const query = fulfillmentShippingSql
      .replaceAll(" + INTERVAL '12' HOUR", '')
      .replace(
        "LATERAL VIEW explode_split(COALESCE(m.executeorderno,''),',') children AS child_execution",
        "JOIN json_each(split_json(COALESCE(m.executeorderno,''))) children",
      )
      .replace('TRIM(child_execution)', 'TRIM(children.value)');
    const rows = db.prepare(query).all({ gea_p900: '郑州' });
    assert.equal(rows.length, 4);
    assert.equal(rows.find((row) => row.fromorderno === 'complete').shipped, '2026-10-25');
    for (const id of ['partial', 'blank', 'other']) {
      const row = rows.find((entry) => entry.fromorderno === id);
      assert.equal(row.shipped, null);
      assert.equal(row.missing_trace, 1);
    }
  } finally {
    db.close();
  }
});

test('shipment cohort uses WMS close only when shipment is absent and keeps incomplete or conflicting splits unknown', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`CREATE TABLE agents_scm_order_trace_final_di(
      executeorderno,cust_code,lastshipmenttime,wms_order_close_time,gpsisinraildate_to,
      arriveconfirm_time,requireddeliverytimebak,requireddeliverytime,expected_deliv_time,update_time
    );
    INSERT INTO agents_scm_order_trace_final_di VALUES
      ('shipped','C','2026-10-24','2026-10-25',NULL,NULL,NULL,NULL,NULL,'2026-10-26'),
      ('closed','C',NULL,'2026-10-25',NULL,NULL,NULL,NULL,NULL,'2026-10-26'),
      ('open','C',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-26'),
      ('conflict','C',NULL,'2026-10-24',NULL,NULL,NULL,NULL,NULL,'2026-10-26'),
      ('conflict','C',NULL,'2026-10-25',NULL,NULL,NULL,NULL,NULL,'2026-10-26'),
      ('partial','C',NULL,'2026-10-25',NULL,NULL,NULL,NULL,NULL,'2026-10-26'),
      ('partial','C',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-26'),
      ('shipped','C','2026-10-20',NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-21');`);
    const query = traceHeadersSql.replaceAll(" + INTERVAL '12' HOUR", '');
    db.function('GREATEST', { varargs: true }, (...values) =>
      values.includes(null) ? null : values.sort().at(-1),
    );
    const rows = db.prepare(query).all();
    const shipped = (id) => rows.find((row) => row.executeorderno === id).shipped;
    assert.equal(shipped('shipped'), '2026-10-24');
    assert.equal(shipped('closed'), '2026-10-25');
    for (const id of ['open', 'conflict', 'partial']) assert.equal(shipped(id), null);
  } finally {
    db.close();
  }
});
