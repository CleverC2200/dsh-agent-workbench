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

test('shipment SQL sums daily flows once, reads cutoff snapshots and calculates the actual recent three days', (t) => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec(`CREATE TABLE agents_scm_stock_detail_d (
    data_month TEXT, belong_base TEXT, material_code TEXT, the_date TEXT,
    material_name TEXT, series TEXT, product_item TEXT,
    total_sales_qty REAL, allocated_qty REAL, ordered_qty REAL,
    begin_stock REAL, produce_in_qty REAL
  )`);
  const insert = db.prepare(
    'INSERT INTO agents_scm_stock_detail_d VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  for (let day = 1; day <= 23; day++) {
    const date = `2026-09-${String(day).padStart(2, '0')}`;
    insert.run(
      '2026-09-01',
      '郑州',
      'A',
      date,
      '产品A',
      '系列',
      '汤圆',
      day === 22 ? 20 : 10,
      day === 22 ? 10 : 999,
      day === 22 ? 30 : 999,
      100,
      2,
    );
    insert.run(
      '2026-09-01',
      '郑州',
      'B',
      date,
      '产品B',
      '系列',
      '汤圆',
      0,
      0,
      day === 22 ? null : 0,
      0,
      day === 2 ? null : 0,
    );
  }
  insert.run('2026-09-01', '郑州', 'C', '2026-09-01', '产品C', '系列', '汤圆', 5, 1, 2, 10, 3);
  insert.run('2026-09-01', '郑州', 'C', '2026-09-01', '产品冲突', '系列', '汤圆', 5, 1, 2, 10, 3);
  const query = db.prepare(config.queries['facts.shipment'].request.sql);
  const parameters = {
    month: '2026-09-01',
    cutoff: '2026-09-22',
    recent_start: '2026-09-20',
    gea_p98: 2,
    gea_p99: 0,
  };
  const rows = [...query.all(parameters), ...query.all({ ...parameters, gea_p99: 2 })];
  assert.equal(
    db
      .prepare(config.queries['facts.shipment.count'].request.sql)
      .get({ month: parameters.month, cutoff: parameters.cutoff }).total,
    3,
  );
  assert.deepEqual(
    rows.map(
      ({ material_code, shipped, prepped, unprepped, daily3, open, inbound, duplicate_days }) => [
        material_code,
        shipped,
        prepped,
        unprepped,
        daily3,
        open,
        inbound,
        duplicate_days,
      ],
    ),
    [
      ['A', 230, 10, 30, 40 / 3, 100, 44, 0],
      ['B', 0, 0, null, 0, 0, null, 0],
      ['C', null, null, null, null, null, null, 1],
    ],
  );
  assert.equal(rows[2].material_name, null);
  const early = query.all({ ...parameters, cutoff: '2026-09-02', recent_start: '2026-09-01' });
  assert.equal(early[0].daily3, null);
  db.exec(
    "UPDATE agents_scm_stock_detail_d SET total_sales_qty = NULL WHERE material_code = 'A' AND the_date = '2026-09-20'",
  );
  assert.equal(query.all(parameters)[0].shipped, null);
  assert.equal(query.all(parameters)[0].daily3, null);
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
