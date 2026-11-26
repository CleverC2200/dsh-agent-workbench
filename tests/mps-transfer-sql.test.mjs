import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

const config = JSON.parse(await readFile('static/mps/sql.config.json', 'utf8'));
test('调拨只读取日度计划明细截止日前的最新同月快照', (t) => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec(`CREATE TABLE agents_scm_stock_detail_d (
    data_month TEXT, belong_base TEXT, material_code TEXT, the_date TEXT,
    material_name TEXT, series TEXT, product_item TEXT, total_sales_qty REAL,
    allocated_qty REAL, ordered_qty REAL, begin_stock REAL, produce_in_qty REAL,
    avg_30d_send REAL, transfer_in_plan_v1 REAL, transfer_in_plan_adj REAL,
    transfer_out_plan_v1 REAL, transfer_out_plan_adj REAL, month_order_qty REAL
  )`);
  const insert = db.prepare(`INSERT INTO agents_scm_stock_detail_d VALUES
    ('2026-09-01','郑州',?,?, '产品','系列','物料组',0,0,0,100,0,0,?,?,?,?,NULL)`);
  for (const row of [
    ['A', '2026-09-01', 99, 99, 99, 99],
    ['A', '2026-09-21', 10, 0, 20, null],
    ['A', '2026-09-23', 999, 999, 999, 999],
    ['B', '2026-09-22', 30, null, 40, 5],
    ['C', '2026-09-22', 10, 20, 30, 40],
    ['D', '2026-09-21', 50, null, 50, null],
    ['D', '2026-09-22', 10, 20, 30, 40],
    ['D', '2026-09-22', 10, 20, 30, 40],
  ])
    insert.run(...row);
  db.exec(`CREATE TABLE agents_ads_scm_base_sku_daily_plan_detail_d (
    belong_base TEXT, material_code TEXT, the_date TEXT, in_qty REAL, ship_qty REAL,
    transfer_in_plan_v1 REAL, transfer_in_plan_adj REAL, transfer_out_plan_v1 REAL, transfer_out_plan_adj REAL
  )`);
  const daily = db.prepare(
    "INSERT INTO agents_ads_scm_base_sku_daily_plan_detail_d VALUES ('郑州',?,?,0,9,?,?,?,?)",
  );
  for (const row of [
    ['A', '2026-09-20', 99, 99, 99, 99],
    ['A', '2026-09-22', 50, 0, null, null],
    ['A', '2026-09-23', 999, 999, 999, 999],
    ['B', '2026-09-21', 75, null, 10, 15],
    ['C', '2026-08-31', 999, 999, 999, 999],
    ['D', '2026-09-22', 10, 20, 30, 40],
    ['D', '2026-09-22', 10, 20, 30, 40],
    ['NEW', '2026-09-22', 999, 999, 999, 999],
  ])
    daily.run(...row);
  const { columns, request } = config.queries['facts.shipment'];
  assert.doesNotMatch(request.sql, /\bSELECT\s+(?:\w+\.)?\*/i);
  const query = db.prepare(request.sql);
  assert.deepEqual(
    query.columns().map(({ name }) => name),
    columns,
  );
  const rows = query.all({
    month: '2026-09-01',
    cutoff: '2026-09-22',
    recent_start: '2026-09-20',
    gea_p98: 5000,
    gea_p99: 0,
  });
  assert.deepEqual(
    rows.map((row) => [
      row.material_code,
      row.transfer_date,
      row.transfer_rows,
      row.transfer_in_plan_v1,
      row.transfer_in_plan_adj,
      row.transfer_out_plan_v1,
      row.transfer_out_plan_adj,
    ]),
    [
      ['A', '2026-09-22', 1, 50, 0, null, null],
      ['B', '2026-09-21', 1, 75, null, 10, 15],
      ['C', null, null, null, null, null, null],
      ['D', '2026-09-22', 2, null, null, null, null],
      ['NEW', null, null, null, null, null, null],
    ],
  );
  assert.equal(rows.find((row) => row.material_code === 'D').shipped, null);
});
