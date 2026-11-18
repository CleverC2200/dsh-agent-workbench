import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

const config = JSON.parse(await readFile('static/mps/sql.config.json', 'utf8'));
test('调拨计划使用截止日前最新同月快照，各方向保留纠偏零、初版和确认无计划', (t) => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec(`CREATE TABLE agents_scm_stock_detail_d (
    data_month TEXT, belong_base TEXT, material_code TEXT, the_date TEXT,
    material_name TEXT, series TEXT, product_item TEXT, total_sales_qty REAL,
    allocated_qty REAL, ordered_qty REAL, begin_stock REAL, produce_in_qty REAL,
    avg_30d_send REAL, transfer_in_plan_v1 REAL, transfer_in_plan_adj REAL,
    transfer_out_plan_v1 REAL, transfer_out_plan_adj REAL
  )`);
  const insert = db.prepare(`INSERT INTO agents_scm_stock_detail_d VALUES
    ('2026-09-01','郑州',?,?, '产品','系列','物料组',0,0,0,100,0,0,?,?,?,?)`);
  for (const row of [
    ['A', '2026-09-01', 99, 99, 99, 99],
    ['A', '2026-09-21', 10, 0, 20, null],
    ['A', '2026-09-23', 999, 999, 999, 999],
    ['B', '2026-09-22', 30, null, 40, 5],
    ['C', '2026-09-22', null, null, null, null],
    ['D', '2026-09-21', 50, null, 50, null],
    ['D', '2026-09-22', 10, 20, 30, 40],
    ['D', '2026-09-22', 10, 20, 30, 40],
  ])
    insert.run(...row);
  const query = db.prepare(config.queries['facts.shipment'].request.sql);
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
      ['A', '2026-09-21', 1, 10, 0, 20, null],
      ['B', '2026-09-22', 1, 30, null, 40, 5],
      ['C', '2026-09-22', 1, null, null, null, null],
      ['D', '2026-09-22', 2, null, null, null, null],
    ],
  );
});
