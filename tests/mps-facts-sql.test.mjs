import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

const config = JSON.parse(await readFile('static/mps/sql.config.json', 'utf8'));

test('reported quantities retain partial NULL independently and preserve real zero through named SQL paging', (t) => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec(`
    CREATE TABLE agents_sales_plan_demand_m (
      stat_month TEXT, cust_code TEXT, belong_base TEXT, material_code TEXT,
      plannum REAL, allnum REAL
    );
    CREATE TABLE agents_dim_cust_sales_material_scope_detail_d (
      cust_code TEXT, material_code TEXT, region_name TEXT
    );
    CREATE TABLE agents_dim_product_list_mi (
      material_code TEXT, material_name TEXT, sub_category TEXT, series TEXT,
      product_item TEXT, product_item_name TEXT
    );
  `);
  const insert = db.prepare('INSERT INTO agents_sales_plan_demand_m VALUES (?, ?, ?, ?, ?, ?)');
  for (const [code, plan, correction] of [
    ['A', 100, 20],
    ['A', null, 30],
    ['B', 0, 0],
    ['B', 0, 0],
    ['C', 0, 10],
    ['C', null, null],
    ['D', 4, null],
    ['D', 6, 5],
  ])
    insert.run('2026-10-01', 'customer', '基地甲', code, plan, correction);
  const query = db.prepare(config.queries['facts.report'].request.sql);
  const first = query.all({ month: '2026-10-01', gea_p98: 2, gea_p99: 0 });
  const second = query.all({ month: '2026-10-01', gea_p98: 2, gea_p99: 2 });
  assert.equal(
    db.prepare(config.queries['facts.report.count'].request.sql).get({ month: '2026-10-01' }).total,
    4,
  );
  assert.deepEqual(
    [...first, ...second].map(({ material_code, plannum_total, allnum_total }) => [
      material_code,
      plannum_total,
      allnum_total,
    ]),
    [
      ['A', null, 50],
      ['B', 0, 0],
      ['C', null, null],
      ['D', 10, null],
    ],
  );
});
