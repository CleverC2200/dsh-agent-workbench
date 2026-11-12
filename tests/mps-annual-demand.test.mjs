import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

const savedWindow = globalThis.window;
globalThis.window = { addEventListener() {}, parent: { postMessage() {} } };
const { annualRows, productRows, normalizedMonth, sourceMonthValues } =
  await import('../static/mps/source/master-data.js');
if (savedWindow === undefined) delete globalThis.window;
else globalThis.window = savedWindow;
const config = JSON.parse(await readFile('static/mps/sql.config.json', 'utf8'));

test('product old-code and name use the confirmed replacement fields while annual categories use sub_category', () => {
  const [product] = productRows([
    {
      material_code: 'A',
      sub_category: '水饺',
      replacement_material_code: 'OLD',
      replacement_product: '老产品',
    },
  ]);
  assert.equal(product['老品编码'], 'OLD');
  assert.equal(product['老品名称'], '老产品');
  const [missing] = productRows([{ material_code: 'B' }]);
  assert.equal(missing['老品编码'], '');
  assert.equal(missing['老品名称'], '');
  assert.equal(
    annualRows([
      {
        belong_base: '全国',
        sub_category: '休闲',
        old_category: '错误分类',
        stat_month: '2026-7',
        source_rows: 1,
        missing_qty: 0,
        duplicate_rows: 0,
        demand_qty: 10,
      },
    ])[0]['大类'],
    '休闲',
  );
});

test('annual demand accepts padded and unpadded months and queries both representations', () => {
  for (const month of ['2026-7', '2026-07']) assert.equal(normalizedMonth(month), '2026-07');
  assert.equal(normalizedMonth('2026-12'), '2026-12');
  for (const month of ['2026-0', '2026-13', '2026-007']) assert.equal(normalizedMonth(month), null);
  assert(sourceMonthValues('2026-07').includes('2026-7'));
  assert.equal(new Set(sourceMonthValues('2026-12')).size, sourceMonthValues('2026-12').length);
});

test('annual SQL counts equal quantities once per full grain and retains conflicts and missing values', (t) => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec(`CREATE TABLE agents_dim_demand_annual_mi (
    belong_base TEXT, sub_category TEXT, old_category TEXT, product_item TEXT,
    product_item_name TEXT, material_code TEXT, material_name TEXT, stat_month TEXT,
    demand_qty INTEGER, update_time TEXT
  )`);
  const insert = db.prepare(
    'INSERT INTO agents_dim_demand_annual_mi VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  const row = (category, sku, qty, base = '全国', updated = '2026-10-28') => [
    base,
    category,
    category,
    'group',
    '物料组',
    sku,
    sku,
    '2026-07',
    qty,
    updated,
  ];
  for (const values of [
    row('休闲', 'A', 100),
    row('休闲', 'A', 100, '全国', '2026-10-27'),
    row('休闲', 'B', 100),
    row('休闲', '', 200),
    row('休闲', 'A', 100, '华东'),
    row('饼类', 'C', 100),
    row('饼类', 'C', 120),
    row('汤圆', 'D', null),
    row('汤圆', 'D', null),
    row('馄饨', 'E', 0),
    row('馄饨', 'E', 0),
    row('面点', 'F', null),
    row('面点', 'F', 20),
  ])
    insert.run(...values);
  const records = db
    .prepare(config.queries['annual.summary'].request.sql)
    .all({ gea_p98: 200, gea_p99: 0 });
  assert.equal(
    db.prepare(config.queries['annual.summary.count'].request.sql).get().total,
    records.length,
  );
  const parsed = annualRows(records);
  const national = (category) =>
    parsed.find((item) => item['基地'] === '全国' && item['大类'] === category);
  assert.equal(national('休闲')['数量'], 200);
  assert.equal(national('休闲')['源记录数'], 3);
  assert.equal(national('休闲')['重复记录数'], 0);
  assert.equal(parsed.find((item) => item['基地'] === '华东')['数量'], 100);
  assert.equal(national('饼类')['数量'], '');
  assert.equal(national('饼类')['重复记录数'], 2);
  assert.equal(national('汤圆')['数量'], '');
  assert.equal(national('汤圆')['缺失数量'], 2);
  assert.equal(national('馄饨')['数量'], 0);
  assert.equal(national('面点')['数量'], '');
});

test('product snapshot reads the latest month with base/tag source attributes but keeps one nationwide relationship', (t) => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec(`CREATE TABLE agents_dim_product_list_mi (
    stat_period TEXT, target_base TEXT, transfer_tag TEXT,
    sub_category TEXT, series TEXT, product_item TEXT, product_item_name TEXT,
    material_code TEXT, material_name TEXT, responsible_item TEXT,
    replacement_product TEXT, replacement_material_code TEXT,
    net_weight TEXT, weight_unit TEXT, measure_unit TEXT, replace_num TEXT, update_time TEXT
  )`);
  const insert = db.prepare(
    'INSERT INTO agents_dim_product_list_mi VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
  );
  const entry = [
    '2026-11',
    '郑州',
    '新品',
    '汤圆',
    '系列甲',
    'G',
    '组甲',
    'A',
    '产品甲',
    '标签甲',
    '老品甲',
    'R',
    '8.08000001',
    'KG',
    '件',
    '0.00000000',
    '2026-11-12',
  ];
  insert.run(...entry);
  insert.run(...entry);
  insert.run(...entry.map((v, i) => (i === 1 ? '华东' : i === 2 ? '自产' : v)));
  insert.run(...entry.map((v, i) => (i === 0 ? '2026-10' : i === 3 ? '旧分类' : v)));
  const count = db.prepare(config.queries['products.count'].request.sql).get().total;
  assert.equal(count, 2);
  const detail = db.prepare(config.queries['products.detail'].request.sql);
  const rows = [0, 1].flatMap((offset) => detail.all({ gea_p98: 1, gea_p99: offset }));
  assert(rows.every((row) => row.stat_period === '2026-11'));
  assert.deepEqual(new Set(rows.map((row) => row.target_base)), new Set(['郑州', '华东']));
  assert.deepEqual(new Set(rows.map((row) => row.transfer_tag)), new Set(['新品', '自产']));
  assert.equal(rows.find((row) => row.target_base === '郑州').source_rows, 2);
  assert.equal(rows[0].net_weight, '8.08000001');
  assert.equal(rows[0].replace_num, '0.00000000');
  assert.equal(productRows(rows).length, 1);
  assert.equal(productRows(rows)[0]['基地'], '');
  for (const [id, query] of Object.entries(config.queries)) {
    if (!query.request?.sql?.includes('agents_dim_product_list_mi')) continue;
    assert.match(
      query.request.sql,
      /stat_period = \(SELECT MAX\(stat_period\) FROM agents_dim_product_list_mi\)/,
      id,
    );
  }
});
