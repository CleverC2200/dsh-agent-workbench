import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { ordersSql } from '../business/inventory-orderworkbench/document-queries.mjs';
import { workbenchQueries } from '../business/inventory-orderworkbench/queries.mjs';
import { nationalStockDays } from '../prototypes/inventory-orderworkbench/metric-model.mjs';

test('upstream business period includes all original-order SKUs without any logistics table and caps overfulfillment', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`CREATE TABLE agents_order_execute_isontime_mi(
      fromorderno,cust_code,new_material_code,belong_base,product_categ_name,pinxiang,new_material_name,
      need_qty_origin,qtyshipped,executeorderno,fromorderno_month,exp_flag,order_qty_origin
    );
    INSERT INTO agents_order_execute_isontime_mi VALUES
      ('O','C','S1','郑州','食品','水饺','一',100,80,'E1','2026-10-25','否',100),
      ('O','C','S1','郑州','食品','水饺','一',100,80,'E1','2026-10-25','否',100),
      ('O','C','S2','郑州','食品','水饺','二',100,120,'E2','2026-10-25','否',100),
      ('outside','C','S3','郑州','食品','水饺','三',200,0,'E3','2026-10-18','否',200),
      ('excluded','C','S4','郑州','食品','水饺','四',200,0,'E4','2026-10-25','是',200),
      ('conflict','C','S5','郑州','食品','水饺','五',100,80,'E5','2026-10-25','否',100),
      ('conflict','C','S5','郑州','食品','水饺','五',200,80,'E5','2026-10-25','否',200);`);
    db.function('GREATEST', { varargs: true }, (...values) => Math.max(...values));
    db.function('LEAST', { varargs: true }, (...values) => Math.min(...values));
    const rows = db
      .prepare(ordersSql)
      .all({ gea_p1: '2026-10-19', gea_p2: '2026-10-26', gea_p900: '' });
    assert.equal(rows.length, 3);
    assert.equal(
      rows.reduce((sum, row) => sum + row.sample_demand, 0),
      200,
    );
    assert.equal(
      rows.reduce((sum, row) => sum + row.sample_shortage, 0),
      20,
    );
    assert.equal(rows.find((row) => row.sku === 'S5').invalid, 1);
    assert.equal(rows.find((row) => row.sku === 'S5').sample_records, 0);
  } finally {
    db.close();
  }
});

test('covered stock retains factory and rented warehouses and exposes unmatched plan or inventory instead of zero', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`CREATE TABLE agents_scm_stock_detail_d(
      belong_base,material_code,product_item,material_name,main_sales_plan_adj,main_sales_plan_v1,
      transfer_out_plan_adj,transfer_out_plan_v1,the_date
    );
    CREATE TABLE agents_scm_inventory_sku_data_d(
      belong_base,material_code,material_name,month_date,available_qty,live_qty,warehouse_classify
    );
    CREATE TABLE agents_scm_material_in_out_summary_d(material_code,product_categ_name,material_group_name);
    INSERT INTO agents_scm_stock_detail_d VALUES
      ('郑州','matched','水饺','一',310,300,620,600,'2026-10-25'),
      ('郑州','plan-only','水饺','二',100,100,0,0,'2026-10-25');
    INSERT INTO agents_scm_inventory_sku_data_d VALUES
      ('郑州','matched','一','20261025',90,100,'01'),
      ('郑州','matched','一','20261025',40,50,'02'),
      ('郑州','matched','一','20261025',999,999,'03'),
      ('郑州','matched','一','20261025',999,999,'20'),
      ('郑州','inventory-only','三','20261025',20,20,'01');`);
    db.exec(`ALTER TABLE agents_scm_inventory_sku_data_d ADD COLUMN warehouse_classify_name;
      UPDATE agents_scm_inventory_sku_data_d SET warehouse_classify_name=CASE warehouse_classify WHEN '01' THEN '工厂成品仓' WHEN '02' THEN '工厂外租库' ELSE '分仓成品仓' END;
      INSERT INTO agents_scm_inventory_sku_data_d VALUES ('郑州','wrong-code','误分类','20261025',999,999,'02','分仓成品仓');`);
    db.function('CONCAT', { varargs: true }, (...values) => values.join(''));
    const rows = db
      .prepare(workbenchQueries.stock.sql)
      .all({ gea_p1: '2026-10-19', gea_p2: '2026-10-26' });
    assert.equal(rows.length, 3);
    const matched = rows.find((row) => row.sku === 'matched');
    assert.equal(matched.inventory, 150);
    assert.equal(matched.sales_plan, 310, 'batch joins must not multiply the plan');
    assert.equal(matched.stock_date, '2026-10-25');
    assert.equal(matched.invalid, 0);
    assert.equal(rows.find((row) => row.sku === 'plan-only').inventory, null);
    assert.equal(rows.find((row) => row.sku === 'inventory-only').sales_plan, null);
    assert.equal(rows.filter((row) => row.invalid === 1).length, 2);
    assert.equal(
      nationalStockDays(rows),
      170 / (410 / 31),
      'nationwide sets need not have matching SKU membership',
    );
    const summary = {
      stock_date: '2026-10-25',
      ...Object.fromEntries(
        [
          'national_inventory',
          'national_sales_plan',
          'national_stock_records',
          'national_plan_records',
          'national_stock_invalid',
          'national_plan_invalid',
        ].map((field) => [field, rows.reduce((sum, row) => sum + Number(row[field] ?? 0), 0)]),
      ),
    };
    assert.equal(nationalStockDays([summary]), nationalStockDays(rows));
    assert.equal(
      nationalStockDays(
        rows.map((row) =>
          row.sku === 'matched'
            ? { ...row, national_inventory: null, national_stock_invalid: 1 }
            : row,
        ),
      ),
      null,
    );
    assert.equal(
      nationalStockDays(
        rows.map((row) =>
          row.sku === 'plan-only'
            ? { ...row, national_sales_plan: null, national_plan_invalid: 1 }
            : row,
        ),
      ),
      null,
    );
    assert.equal(nationalStockDays(rows.filter((row) => row.national_stock_records === 0)), null);
  } finally {
    db.close();
  }
});
