import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { workbenchQueries } from '../business/inventory-orderworkbench/queries.mjs';
import {
  computeWorkbenchMetrics,
  reportPeriods,
  reusableWorkbenchFacts,
} from '../prototypes/inventory-orderworkbench/metric-model.mjs';

function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE age_history(dt,warehouseid,belong_base,material_code,inv_qty,age_days);
    CREATE TABLE warehouse(warehouse_id,warehouse_classify,warehouse_classify_name);
    CREATE TABLE agents_scm_material_in_out_summary_d(material_code,product_categ_name,material_group_name);
    CREATE TABLE agents_scm_stock_detail_d(material_code,product_item,the_date);
    CREATE TABLE agents_order_execute_isontime_mi(new_material_code,pinxiang,fromorderno_month);
    INSERT INTO warehouse VALUES
      ('factory','01','工厂成品仓'),('factory','01','工厂成品仓'),
      ('rented','02','工厂外租库'),('branch','02','分仓成品仓');
    INSERT INTO age_history VALUES
      ('20261025','factory','郑州','sku',100,59),
      ('20261025','factory','郑州','sku',20,60),
      ('20261025','factory','郑州','sku',30,61),
      ('20261025','factory','郑州','sku',0,NULL),
      ('20261025','rented','郑州','sku',50,90),
      ('20261025','branch','郑州','sku',999,100),
      ('20261018','factory','郑州','sku',500,100),
      ('20261026','factory','郑州','sku',500,100),
      ('20261025','factory','华南','unknown',10,NULL),
      ('20261025','factory','华南','missing',NULL,100);`);
  return db;
}

function read(db, name, params) {
  const sql = workbenchQueries[name].sql
    .replaceAll('dwd_scm_material_age_his', 'age_history')
    .replaceAll('dim_bas_warehouse', 'warehouse');
  return db.prepare(sql).all(params);
}

test('Hive age uses the inclusive source age and one covered warehouse contribution per row', () => {
  const db = fixture();
  try {
    const rows = read(db, 'ages', {
      gea_p1: '20261025',
      gea_p4: '2026-10-25',
      gea_p5: '2026-10-01',
      gea_p6: '2026-10-26',
      gea_p900: '郑州',
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].stock_qty, 200);
    assert.equal(rows[0].aged_qty, 100);
    assert.equal(rows[0].invalid, 0);
    assert.equal(rows[0].snapshot_date, '20261025');
    assert.equal(
      computeWorkbenchMetrics({ sections: [{ id: 'ages', status: 'ready', rows }] })[
        '货龄（>60天库存占比）'
      ].value,
      50,
    );
    const unknown = read(db, 'ages', {
      gea_p1: '20261025',
      gea_p4: '2026-10-25',
      gea_p5: '2026-10-01',
      gea_p6: '2026-10-26',
      gea_p900: '华南',
    });
    assert.equal(
      computeWorkbenchMetrics({ sections: [{ id: 'ages', status: 'ready', rows: unknown }] })[
        '货龄（>60天库存占比）'
      ].value,
      null,
    );
  } finally {
    db.close();
  }
});

test('month and week ending on October 25 select the same covered business snapshot', () => {
  const db = fixture();
  try {
    const periods = reportPeriods('2026-10-19', '2026-10-26', new Date('2026-10-30T00:00:00Z'));
    for (const period of [periods.month, periods.week]) {
      const dates = read(db, 'ageDate', {
        gea_p1: period.start.replaceAll('-', ''),
        gea_p2: period.inventoryEnd.replaceAll('-', ''),
        gea_p900: '郑州',
      });
      assert.equal(dates[0].day, '20261025');
    }
    assert.equal(
      reusableWorkbenchFacts({
        complete: true,
        attributionVersion: 2,
        metricCalculationVersion: 7,
        periods: { month: { sections: [] } },
      }),
      false,
    );
  } finally {
    db.close();
  }
});
