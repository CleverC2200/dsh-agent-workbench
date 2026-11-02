import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
const config = JSON.parse(await readFile('business/inventory-fc/sql.config.json', 'utf8'));
test('N436 remains selectable with real inventory even though its source classification is 02', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(
      'CREATE TABLE agents_scm_inventory_sku_data_d(month_date TEXT,warehouse_classify TEXT,warehouseid TEXT,warehouse_name TEXT,belong_base TEXT)',
    );
    const insert = db.prepare('INSERT INTO agents_scm_inventory_sku_data_d VALUES (?,?,?,?,?)');
    for (const row of [
      ['20261029', '20', 'A020', '长沙分仓', '遂平'],
      ['20261029', '02', 'N436', '郑州DC仓', '郑州'],
      ['20261029', '02', 'Y302', '成都配送中心仓', '西南'],
      ['20261029', '03', 'OTHER', '其他仓', '其他'],
    ])
      insert.run(...row);
    const q = config.queries['branch-warehouse.directory'];
    const rows = db.prepare(q.request.sql).all({ gea_p1: '2026-10-30', gea_p2: 200, gea_p3: 0 });
    assert.deepEqual(
      rows.map((x) => x.warehouse_code),
      ['A020', 'N436'],
    );
  } finally {
    db.close();
  }
});

test('DSH business, urgent and recommendation filters and sorting run before the ten-row page', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const q = config.queries['replenishment.detail.atomic'];
    const fixtures = [
      { sku: 'zero', inventory_qty: 0, current_order_shortage: 0, recommended_qty: 0 },
      { sku: 'urgent', inventory_qty: 5, current_order_shortage: 2, recommended_qty: 10 },
      { sku: 'recommended', inventory_qty: 0, current_order_shortage: 0, recommended_qty: 7 },
    ];
    const source = fixtures
      .map(
        (row) =>
          'SELECT ' +
          config.queries['replenishment.detail'].resultColumns
            .map(
              (f) =>
                `${f === 'warehouse_code' ? "'N436'" : f === 'sku' ? "'" + row.sku + "'" : (row[f] ?? 0)} AS ${f}`,
            )
            .join(', '),
      )
      .join(' UNION ALL ');
    const sql =
      'WITH list_source AS (' +
      source +
      q.request.sql.slice(q.request.sql.indexOf('), list_filtered AS ('));
    const params = Object.fromEntries(
      [...new Set(sql.match(/:gea_p\d+/g))].map((k) => [
        k.slice(1),
        q.request.parameters[k.slice(1)],
      ]),
    );
    const run = (mode) =>
      db.prepare(sql).all({
        ...params,
        gea_p4100: mode,
        gea_p4101: 'recommended_qty',
        gea_p4102: 'desc',
        gea_p8: 10,
        gea_p9: 0,
      });
    assert.deepEqual(
      run('business').map((r) => r.sku),
      ['urgent'],
    );
    assert.deepEqual(
      run('urgent').map((r) => r.sku),
      ['urgent'],
    );
    assert.deepEqual(
      run('recommended').map((r) => r.sku),
      ['urgent', 'recommended'],
    );
    assert.equal(run('recommended')[0].page_scope_total, 2);
    assert.deepEqual(
      run('all').map((r) => r.sku),
      ['urgent', 'recommended', 'zero'],
    );
  } finally {
    db.close();
  }
});

test('FC age buckets match the original boundaries at 30, 60 and 90 days', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('CREATE TABLE batches(age_days INTEGER,live_qty REAL)');
    [0, 29, 30, 59, 60, 89, 90, 91].forEach((day, i) =>
      db.prepare('INSERT INTO batches VALUES (?,?)').run(day, i + 1),
    );
    const sql = config.queries['batch-age.atomic'].request.sql;
    for (const [field, expected] of [
      ['age0_30', 3],
      ['age31_60', 7],
      ['age61_90', 11],
      ['age90_plus', 15],
    ]) {
      const expression = sql.match(
        new RegExp(`SUM\\(CASE WHEN [^)]*? THEN a.live_qty ELSE 0 END\\) AS ${field}\\b`),
      )?.[0];
      assert.ok(expression, field);
      assert.equal(db.prepare(`SELECT ${expression} FROM batches AS a`).get()[field], expected);
    }
  } finally {
    db.close();
  }
});
