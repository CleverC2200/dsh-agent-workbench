import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { workbenchPlanSql } from '../business/inventory-orderworkbench/plan-version.mjs';
import { workbenchQueries } from '../business/inventory-orderworkbench/queries.mjs';

test('snapshot days 16/17,20/21,26/27 select the confirmed plan versions for both scopes', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(
      'CREATE TABLE p(the_date,main_sales_plan_v1,main_sales_plan_adj,roll_sales_plan,next_month_sales_plan,transfer_out_plan_v1,transfer_out_plan_adj,transfer_out_plan_roll,next_month_out_plan)',
    );
    const insert = db.prepare('INSERT INTO p VALUES(?,?,?,?,?,?,?,?,?)');
    for (const day of [1, 16, 17, 20, 21, 26, 27, 31])
      insert.run(`2026-10-${String(day).padStart(2, '0')}`, 100, 200, 300, 400, 10, 20, 30, 40);
    const rows = db
      .prepare(
        `SELECT ${workbenchPlanSql('sales')} AS sales,${workbenchPlanSql('transfer')} AS transfer FROM p ORDER BY the_date`,
      )
      .all();
    assert.deepEqual(
      rows.map((r) => [r.sales, r.transfer]),
      [
        [100, 10],
        [100, 10],
        [200, 20],
        [200, 20],
        [300, 30],
        [300, 30],
        [400, 40],
        [400, 40],
      ],
    );
    db.exec(
      "UPDATE p SET main_sales_plan_adj=0 WHERE the_date='2026-10-17';UPDATE p SET roll_sales_plan=NULL WHERE the_date='2026-10-21'",
    );
    assert.equal(
      db
        .prepare(`SELECT ${workbenchPlanSql('sales')} AS plan FROM p WHERE the_date='2026-10-17'`)
        .get().plan,
      0,
    );
    assert.equal(
      db
        .prepare(`SELECT ${workbenchPlanSql('sales')} AS plan FROM p WHERE the_date='2026-10-21'`)
        .get().plan,
      null,
    );
  } finally {
    db.close();
  }
});

test('the actual age query rolls both named branches into southwest before scoped weighted aggregation', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`CREATE TABLE agents_scm_inventory_sku_data_d(warehouseid,month_date,warehouse_classify,warehouse_classify_name,belong_base);
      CREATE TABLE dwd_scm_material_age_his(dt,warehouseid,belong_base,material_code,inv_qty,age_days);
      CREATE TABLE dim_bas_warehouse(warehouse_id,warehouse_classify,warehouse_classify_name);
      CREATE TABLE agents_scm_material_in_out_summary_d(material_code,product_categ_name,material_group_name);
      CREATE TABLE agents_scm_stock_detail_d(material_code,product_item,the_date);
      CREATE TABLE agents_order_execute_isontime_mi(new_material_code,pinxiang,fromorderno_month);
      INSERT INTO dim_bas_warehouse VALUES('W','02','工厂外租库');
      INSERT INTO dwd_scm_material_age_his VALUES
      ('20261031','W','西南','S',20,60),('20261031','W','西南','S',80,0),
      ('20261031','W','成都分仓','S',5,60),('20261031','W','成都分仓','S',45,0),
      ('20261031','W','上海分仓','S',50,0),('20261031','W',NULL,'S',100,0),('20261031','branch','上海分仓','S',99,99);
      INSERT INTO dim_bas_warehouse VALUES('branch','02','工厂外租库');
      INSERT INTO agents_scm_inventory_sku_data_d VALUES('branch','20261031','20','分仓成品仓','郑州');`);
    const rows = db.prepare(workbenchQueries.ages.sql).all({
      gea_p900: '西南',
      gea_p1: '20261031',
      gea_p4: '2026-10-31',
      gea_p5: '2026-10-01',
      gea_p6: '2026-11-01',
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].base, '西南');
    assert.equal(rows[0].stock_qty, 200);
    assert.equal(rows[0].aged_qty, 25);
    assert.equal((100 * rows[0].aged_qty) / rows[0].stock_qty, 12.5);
    const all = db.prepare(workbenchQueries.ages.sql).all({
      gea_p900: '',
      gea_p1: '20261031',
      gea_p4: '2026-10-31',
      gea_p5: '2026-10-01',
      gea_p6: '2026-11-01',
    });
    assert.equal(
      all.find((r) => r.base === null).stock_qty,
      100,
      'unknown attribution must stay unknown',
    );
    db.exec(`INSERT INTO dim_bas_warehouse VALUES('known','02','工厂外租库'),('conflict','02','工厂外租库');
      INSERT INTO dwd_scm_material_age_his VALUES('20261031','known',NULL,'K',10,60),('20261031','conflict',NULL,'C',10,0);
      INSERT INTO agents_scm_inventory_sku_data_d VALUES('known','20261031','02','工厂外租库','郑州'),('known','20261031','02','工厂外租库','郑州'),('conflict','20261031','02','工厂外租库','郑州'),('conflict','20261031','02','工厂外租库','华东');`);
    const mapped = db.prepare(workbenchQueries.ages.sql).all({
      gea_p900: '',
      gea_p1: '20261031',
      gea_p4: '2026-10-31',
      gea_p5: '2026-10-01',
      gea_p6: '2026-11-01',
    });
    assert.equal(mapped.find((r) => r.sku === 'K').base, '郑州');
    assert.equal(
      mapped.find((r) => r.sku === 'K').stock_qty,
      10,
      'repeated warehouse observations must not multiply batches',
    );
    assert.equal(
      mapped.find((r) => r.sku === 'C').base,
      null,
      'conflicting snapshot bases remain unknown',
    );
  } finally {
    db.close();
  }
});
