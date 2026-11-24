import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

const config = JSON.parse(await readFile('static/mps/sql.config.json', 'utf8'));

test('category source SQL retains base SKU grain and rebuilds complete base fiscal quantities from monthly actuals', (t) => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec(`CREATE TABLE agents_scm_base_dimension_delivery_mi (
    dimension_type TEXT, stat_month TEXT, belong_base TEXT, dimension_value TEXT,
    fiscal_year TEXT, dimension_act_dl_qty INTEGER, national_dimension_fiscal_act_dl_qty INTEGER DEFAULT 999999
  )`);
  const insert = db.prepare(
    'INSERT INTO agents_scm_base_dimension_delivery_mi (dimension_type, stat_month, belong_base, dimension_value, fiscal_year, dimension_act_dl_qty) VALUES (?,?,?,?,?,?)',
  );
  for (const [base, code, quantity] of [
    ['郑州', 'A', 100],
    ['华东', 'A', 9000],
    ['郑州', 'Z', 8000],
  ])
    for (let month = 1; month <= 12; month++)
      insert.run(
        '基地+产品',
        `2025${String(month).padStart(2, '0')}`,
        base,
        code,
        '2025',
        quantity,
      );
  insert.run('基地+产品', '202512', '郑州', 'B', '2025', 40);
  const detail = config.queries['category-history.detail'].request.sql;
  const rows = db.prepare(detail).all({ gea_p1: '202512', gea_p98: 200, gea_p99: 0 });
  const current = rows.find((row) => row.belong_base === '郑州' && row.dimension_value === 'A');
  assert.equal(current.dimension_act_dl_qty, 100);
  assert.equal(current.last_month_dimension_act_dl_qty, 100);
  assert.equal(current.base_fiscal_act_dl_qty, 1200);
  assert.equal(current.base_fiscal_month_count, 12);
  assert.equal(current.base_fiscal_quantity_month_count, 12);
  assert.equal(current.national_dimension_fiscal_act_dl_qty, 999999);
  assert.equal(rows.find((row) => row.belong_base === '华东').base_fiscal_act_dl_qty, 108000);
  assert.equal(rows.find((row) => row.dimension_value === 'B').base_fiscal_act_dl_qty, null);
  assert.equal(
    db.prepare(config.queries['category-history.count'].request.sql).get({ gea_p1: '202512' })
      .total,
    rows.length,
  );
  insert.run('基地+产品', '202512', '郑州', 'A', '2025', 101);
  const conflicted = db
    .prepare(detail)
    .all({ gea_p1: '202512', gea_p98: 200, gea_p99: 0 })
    .find((row) => row.belong_base === '郑州' && row.dimension_value === 'A');
  assert.equal(conflicted.dimension_act_dl_qty, null);
  assert.equal(conflicted.base_fiscal_act_dl_qty, null);
});
