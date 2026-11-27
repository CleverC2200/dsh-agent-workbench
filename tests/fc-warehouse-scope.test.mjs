import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
const config = JSON.parse(await readFile('business/inventory-fc/sql.config.json', 'utf8'));
test('N436, Y204, A221 and A540 are excluded while closed branches remain available', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(
      'CREATE TABLE agents_scm_inventory_sku_data_d(month_date TEXT,warehouse_classify TEXT,warehouseid TEXT,warehouse_name TEXT,belong_base TEXT)',
    );
    const insert = db.prepare('INSERT INTO agents_scm_inventory_sku_data_d VALUES (?,?,?,?,?)');
    for (const row of [
      ['20261029', '20', 'A020', '长沙分仓', '遂平'],
      ['20261029', '20', 'N436', '郑州DC仓', '郑州'],
      ['20261029', '20', 'Y204', '上海分仓', '郑州'],
      ['20261029', '20', 'A540', '中冷虚拟仓', '郑州'],
      ['20261029', '20', 'A221', '重庆前置仓', '西南'],
      ['20261029', '20', 'A052', '西安分仓', '郑州'],
      ['20261029', '02', 'Y302', '成都配送中心仓', '西南'],
      ['20261029', '03', 'OTHER', '其他仓', '其他'],
    ])
      insert.run(...row);
    const q = config.queries['branch-warehouse.directory'];
    const rows = db.prepare(q.request.sql).all({ gea_p1: '2026-10-30', gea_p2: 200, gea_p3: 0 });
    assert.deepEqual(
      rows.map((x) => x.warehouse_code),
      ['A020', 'A052'],
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

test('base directory returns exactly the three confirmed warehouses using each warehouse latest day', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(
      'CREATE TABLE agents_scm_inventory_sku_data_d(month_date TEXT,warehouse_classify TEXT,warehouseid TEXT,warehouse_name TEXT,belong_base TEXT)',
    );
    const insert = db.prepare('INSERT INTO agents_scm_inventory_sku_data_d VALUES (?,?,?,?,?)');
    for (const row of [
      ['20261117', '02', 'Y204', '上海分仓', '华东'],
      ['20261116', '02', 'N436', '郑州DC仓', '郑州'],
      ['20261117', '02', 'A221', '重庆前置仓', '西南'],
      ['20261115', '20', 'Y204', '旧名称', '华东'],
      ['20261118', '02', 'N436', '未来名称', '郑州'],
      ['20261117', '20', 'A160', '南京分仓', '郑州'],
      ['20261117', '20', 'A540', '虚拟仓', '郑州'],
    ])
      insert.run(...row);
    const q = config.queries['base-warehouse.directory'];
    const rows = db.prepare(q.request.sql).all({ gea_p1: '2026-11-17', gea_p2: 200, gea_p3: 0 });
    assert.deepEqual(
      rows.map((row) => [row.warehouse_code, row.warehouse_name]),
      [
        ['A221', '重庆前置仓'],
        ['N436', '郑州DC仓'],
        ['Y204', '上海分仓'],
      ],
    );
  } finally {
    db.close();
  }
});

test('base warehouse snapshot uses authorized readiness markers and rejects invalid batches', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`
      CREATE TABLE snapshots (
        inv_batch_id TEXT, inv_business_date TEXT, stock_date TEXT, stat_month TEXT,
        inv_variant_id TEXT, inv_rule_version TEXT, warehouseid TEXT
      );
      CREATE TABLE allowed_warehouses (warehouseid TEXT PRIMARY KEY);
      CREATE VIEW agents_inv_branch_sku_day AS
        SELECT s.* FROM snapshots AS s JOIN allowed_warehouses AS a USING (warehouseid);
    `);
    const insert = db.prepare('INSERT INTO snapshots VALUES (?, ?, ?, ?, ?, ?, ?)');
    const ready = (batch, warehouse, stockDate, variant = 'WAREHOUSE_BASE:__READY__') =>
      insert.run(batch, '2026-11-27', stockDate, '202611', variant, 'inventory-daily-v5-20261103', warehouse);
    for (const warehouse of ['Y204', 'N436', 'A221']) ready('01', warehouse, '2026-11-26');
    ready('02', 'Y204', '2026-11-26', 'WAREHOUSE_BASE:BRANCH_WAREHOUSE_DIRECTORY');
    ready('03', 'Y204', null);
    ready('04', 'Y204', '2026-11-26');
    ready('04', 'Y204', '2026-11-26');
    ready('05', 'A160', '2026-11-26');
    const query = db.prepare(config.queries['base-warehouse.summary.snapshot'].request.sql);
    const grant = db.prepare('INSERT INTO allowed_warehouses VALUES (?)');
    assert.deepEqual(query.all(), []);
    grant.run('A160');
    assert.deepEqual(query.all(), []);
    grant.run('Y204');
    assert.equal(query.get()?.batch_id, '01');
    grant.run('N436');
    assert.equal(query.get()?.batch_id, '01');
    grant.run('A221');
    assert.equal(query.get()?.batch_id, '01');
    ready('06', 'Y204', '2026-11-26');
    ready('06', 'N436', '2026-11-25');
    assert.equal(query.get()?.batch_id, '01');
  } finally {
    db.close();
  }
});

test('base card totals include warehouse-total SKUs without batch rows and never include a different warehouse', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(
      'CREATE TABLE agents_scm_inventory_sku_data_d(month_date TEXT,warehouse_classify TEXT,warehouseid TEXT,material_code TEXT,live_qty REAL,available_qty REAL,pack_unit_qty REAL,freeze_qty REAL)',
    );
    db.exec(
      'CREATE TABLE agents_scm_warehouse_total_data_d(warehouseid TEXT,material_code TEXT,warehouse_name TEXT,material_name TEXT,live_qty REAL,available_qty REAL,pack_unit_qty REAL,freeze_qty REAL,warehouse_transfer_qty REAL,transfer_onway_qty REAL,transfer_prepare_qty REAL)',
    );
    db.exec(
      "INSERT INTO agents_scm_inventory_sku_data_d VALUES ('20261117','02','N436','known',20,15,5,0)",
    );
    db.exec(
      "INSERT INTO agents_scm_warehouse_total_data_d VALUES ('N436','known','郑州DC仓','商品1',20,15,5,0,0,0,0),('N436','without-batch','郑州DC仓','商品2',100,80,20,0,0,0,0),('Y204','other','上海分仓','商品3',900,800,100,0,0,0,0)",
    );
    const q = config.queries['base-warehouse.health.inventory'];
    const [row] = db.prepare(q.request.sql).all({ gea_p1: '2026-11-17', gea_p2: 'N436' });
    assert.equal(row.total_qty, 120);
    assert.equal(row.available_qty, 95);
    assert.equal(row.pack_unit_qty, 25);
    assert.equal(row.row_count, 2);
  } finally {
    db.close();
  }
});

test('base fulfillment maps by execution order and SKU and keeps ambiguous warehouse mappings unknown', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(
      'CREATE TABLE agents_dwd_scm_execute_detail_mi(executeorderno TEXT,material_code TEXT,warehouseid TEXT)',
    );
    db.exec(
      "INSERT INTO agents_dwd_scm_execute_detail_mi VALUES ('multi','one','Y204'),('multi','two','N436'),('duplicate','one','A221'),('duplicate','one','A221'),('ambiguous','one','Y204'),('ambiguous','one','N436')",
    );
    const sql = config.queries['base-warehouse.orders.summary'].request.sql;
    const mapping = sql.match(
      /base_order_warehouse AS \((SELECT [\s\S]*?)\), source_records AS/u,
    )?.[1];
    assert.ok(mapping);
    const rows = db.prepare(mapping + ' ORDER BY execute_order,sku').all();
    assert.deepEqual(
      rows.map((row) => [row.execute_order, row.sku, row.warehouse_code]),
      [
        ['ambiguous', 'one', null],
        ['duplicate', 'one', 'A221'],
        ['multi', 'one', 'Y204'],
        ['multi', 'two', 'N436'],
      ],
    );
  } finally {
    db.close();
  }
});
