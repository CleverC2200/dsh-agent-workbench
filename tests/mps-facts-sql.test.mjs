import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

const config = JSON.parse(await readFile('static/mps/sql.config.json', 'utf8'));

test('DMS shipment source uses shipped pieces and rejects incomplete or repeated execution lines', (t) => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec(`CREATE TABLE agents_scm_execute_detail_d (
    order_month TEXT, is_stat TEXT, freegift TEXT, detailstatus INTEGER,
    belong_base TEXT, material_code TEXT, executeorderno TEXT, executeorderlineno INTEGER,
    delivery_qty REAL, qtyshipped REAL
  )`);
  const insert = db.prepare('INSERT INTO agents_scm_execute_detail_d VALUES (?,?,?,?,?,?,?,?,?,?)');
  for (const [sku, execution, quantity] of [
    ['A', 'A1', 100],
    ['A', 'A2', 25],
    ['B', 'B1', 20],
    ['B', 'B2', null],
    ['C', 'C1', 2],
    ['C', 'C1', 3],
    ['D', 'D1', 0],
  ])
    insert.run('2026-07', '1', 'N', 10, '基地甲', sku, execution, 1, quantity, 9999);
  for (const [month, stat, gift, status] of [
    ['2026-08', '1', 'N', 10],
    ['2026-07', '0', 'N', 10],
    ['2026-07', '1', 'Y', 10],
    ['2026-07', '1', 'N', 20],
  ])
    insert.run(month, stat, gift, status, '基地甲', 'A', 'excluded', 1, 1000, 9999);
  const query = db.prepare(config.queries['facts.execution-delivery'].request.sql);
  const rows = [
    ...query.all({ month: '2026-07-01', gea_p98: 2, gea_p99: 0 }),
    ...query.all({ month: '2026-07-01', gea_p98: 2, gea_p99: 2 }),
  ];
  assert.deepEqual(
    rows.map(({ shipment_qty_total }) => shipment_qty_total),
    [125, null, null, 0],
  );
  assert.equal(rows[1].missing_rows, 1);
  assert.equal(rows[2].duplicate_rows, 2);
  assert.equal(
    db
      .prepare(config.queries['facts.execution-delivery.count'].request.sql)
      .get({ month: '2026-07-01' }).total,
    4,
  );
});

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
