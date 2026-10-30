import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { orderEventRowsSql } from '../business/inventory-orderworkbench/document-queries.mjs';

test('missing hourly OMS events recover only unique exact daily header times', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`CREATE TABLE agents_scm_execute_detail_hourly_d(
      cust_code,cust_order_no,executeorderno,belong_base,region_name,province_region_name,
      cust_name,header_addtime,requireddeliverytime,orderstatus,canceltime,custchangetime
    );
    CREATE TABLE agents_scm_execute_detail_d(
      cust_code,cust_order_no,executeorderno,belong_base,canceltime,custchangetime
    );
    INSERT INTO agents_scm_execute_detail_hourly_d VALUES
      ('C','O1','E1','郑州','','','','2026-10-19','2026-10-25',90,NULL,NULL),
      ('C','O2','E2','郑州','','','','2026-10-19','2026-10-25',90,'2026-10-24',NULL),
      ('C','O3','E3','郑州','','','','2026-10-19','2026-10-25',90,NULL,NULL),
      ('C','O4','E4','郑州','','','','2026-10-19','2026-10-25',90,NULL,NULL),
      ('C','O5','E5','华南','','','','2026-10-19','2026-10-25',90,NULL,NULL);
    INSERT INTO agents_scm_execute_detail_d VALUES
      ('C','O1','E1','郑州','2026-10-23','2026-10-22'),
      ('C','O1','E1','郑州','2026-10-23','2026-10-22'),
      ('C','O2','E2','郑州','2026-10-21',NULL),
      ('C','O3','E3','郑州','2026-10-21',NULL),
      ('C','O3','E3','郑州','2026-10-23',NULL),
      ('OTHER','O4','E4','郑州','2026-10-23',NULL),
      ('C','OTHER','E4','郑州','2026-10-23',NULL),
      ('C','O4','OTHER','郑州','2026-10-23',NULL),
      ('C','O4','E4','华南','2026-10-23',NULL);`);
    for (const field of [
      'region_name',
      'province_region_name',
      'cust_name',
      'header_addtime',
      'requireddeliverytime',
      'orderstatus',
    ])
      db.exec(`ALTER TABLE agents_scm_execute_detail_d ADD COLUMN ${field}`);
    const rows = db
      .prepare(orderEventRowsSql.replaceAll('<=>', ' IS '))
      .all({ gea_p900: '郑州' })
      .filter((row) => row.header_addtime !== null);
    assert.equal(rows.length, 4, 'daily SKU rows must not multiply the hourly rows');
    assert.equal(rows.find((row) => row.cust_order_no === 'O1').canceltime, '2026-10-23');
    assert.equal(rows.find((row) => row.cust_order_no === 'O1').custchangetime, '2026-10-22');
    assert.equal(rows.find((row) => row.cust_order_no === 'O2').canceltime, '2026-10-24');
    assert.equal(rows.find((row) => row.cust_order_no === 'O3').canceltime, null);
    assert.equal(rows.find((row) => row.cust_order_no === 'O4').canceltime, null);
  } finally {
    db.close();
  }
});
