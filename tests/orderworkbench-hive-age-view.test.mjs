import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const ddl = readFileSync(
  new URL('../business/inventory-orderworkbench/hive-age-read-view.sql', import.meta.url),
  'utf8',
);

test('Hive read view removes identical source copies without collapsing separate stock batches', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`CREATE TABLE raw_age (
      warehouseid,age_status,age_type,age_days,material_code,prod_date,
      quality_batch,sap_warehouseid,plant,material_name,inv_qty,grossweight,
      cube,addtime,bak_date,warehouse_name,qtyeach,freeze_qty,
      is_good_prod,lotnum,stat_date,belong_base,warehouse_type,dt
    );`);
    const insert = db.prepare(`INSERT INTO raw_age VALUES (${Array(24).fill('?').join(',')})`);
    const row = [
      'N433',
      null,
      '61-90天',
      60,
      'sku',
      '2026-08-27',
      'batch1',
      'N433',
      '1001',
      '商品',
      10,
      100,
      1,
      '2026-10-26 00:02:22',
      '2026-10-26',
      '外租库',
      20,
      0,
      'Y',
      'lot1',
      '2026-10-25',
      '郑州',
      '基地仓',
      '20261025',
    ];
    insert.run(...row);
    insert.run(...row);
    const differentBatch = [...row];
    differentBatch[6] = 'batch2';
    differentBatch[19] = 'lot2';
    insert.run(...differentBatch);
    const differentPlant = [...row];
    differentPlant[8] = '1002';
    insert.run(...differentPlant);
    const differentDate = [...row];
    differentDate[23] = '20261026';
    insert.run(...differentDate);
    const differentQuantity = [...row];
    differentQuantity[10] = 11;
    insert.run(...differentQuantity);
    db.exec(
      ddl
        .replace('ALTER VIEW ai_db.dwd_scm_material_age_his', 'CREATE VIEW clean_age')
        .replace('hive.dw.dwd_scm_material_age_his', 'raw_age'),
    );
    const rows = db.prepare('SELECT * FROM clean_age WHERE dt=?').all('20261025');
    assert.equal(rows.length, 4);
    assert.equal(
      rows.reduce((sum, r) => sum + r.inv_qty, 0),
      41,
    );
    assert.deepEqual(Object.keys(rows[0]), [
      'dt',
      'warehouseid',
      'belong_base',
      'material_code',
      'inv_qty',
      'age_days',
    ]);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM raw_age').get().n, 6);
  } finally {
    db.close();
  }
});
