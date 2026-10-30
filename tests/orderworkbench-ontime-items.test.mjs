import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  executionProductsSql,
  ontimeSql,
} from '../business/inventory-orderworkbench/document-queries.mjs';

test('execution membership preserves one business item per execution/SKU and does not multiply split rows', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`CREATE TABLE agents_scm_execute_detail_hourly_d(
      cust_order_no,cust_code,material_code,executeorderno,belong_base,detailstatus,is_stat,product_item
    );
    CREATE TABLE agents_scm_execute_detail_d AS SELECT * FROM agents_scm_execute_detail_hourly_d;
    INSERT INTO agents_scm_execute_detail_hourly_d VALUES
      ('O1','C1','SKU1','E1','郑州',10,'1','水饺'),
      ('O1','C1','SKU1','E1','郑州',10,'1',' 水饺 '),
      ('O1','C1','SKU1','E2','郑州',10,'1','水饺'),
      ('O2','C1','SKU2','E3','郑州',10,'1','汤圆'),
      ('O2','C1','SKU2','E3','郑州',10,'1','面点'),
      ('O3','C1','SKU3','E4','郑州',10,'1',''),
      ('O4','C2','SKU1','E5','华南',10,'1','水饺'),
      ('cancelled','C1','SKU1','E6','郑州',20,'1','水饺'),
      ('excluded','C1','SKU1','E7','郑州',10,'0','水饺');`);
    const read = (base) =>
      db.prepare(executionProductsSql.replaceAll('<=>', ' IS ')).all({ gea_p900: base });
    const selected = read('郑州');
    assert.equal(selected.length, 4);
    assert.deepEqual(
      selected.filter((row) => row.cust_order_no === 'O1').map((row) => row.product_item),
      ['水饺', '水饺'],
    );
    assert.equal(selected.find((row) => row.cust_order_no === 'O2').product_item, null);
    assert.equal(selected.find((row) => row.cust_order_no === 'O3').product_item, null);
    assert.equal(read('').length, 5);
    assert.match(ontimeSql, /LENGTH\(COALESCE\(h\.product_item/);
    assert.doesNotMatch(ontimeSql, /material_group_name/);
  } finally {
    db.close();
  }
});
