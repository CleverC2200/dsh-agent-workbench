import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { makeRequest } from '../business/shared/configured-query-client.mjs';

const config = JSON.parse(await readFile('static/mps/sql.config.json', 'utf8'));
let receive, execute;
const port = {
  start() {},
  postMessage(message) {
    if (message.type !== 'request') return;
    Promise.resolve()
      .then(() => execute(message.parameters))
      .then(
        (result) => port.onmessage({ data: { type: 'response', id: message.id, result } }),
        (error) =>
          port.onmessage({ data: { type: 'response', id: message.id, error: error.message } }),
      );
  },
};
globalThis.window = {
  parent: { postMessage() {} },
  location: { href: 'https://mps.test/' },
  addEventListener(name, handler) {
    if (name === 'message') receive = handler;
  },
  dispatchEvent() {},
};
globalThis.document = {
  referrer: 'https://mps.test/',
  getElementById: () => ({ textContent: JSON.stringify(config) }),
};
const source = await import('../static/mps/source/master-data.js');
receive({
  source: window.parent,
  origin: 'https://mps.test',
  ports: [port],
  data: {
    protocol: 'gea-html-v2',
    type: 'connect',
    context: { session: 'product-period-test', plugin: 'mps' },
  },
});

function fixture(t, rows) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec(`CREATE TABLE agents_dim_product_list_mi (
    stat_period TEXT, target_base TEXT, transfer_tag TEXT,
    sub_category TEXT, series TEXT, product_item TEXT, product_item_name TEXT,
    material_code TEXT, material_name TEXT, responsible_item TEXT,
    replacement_product TEXT, replacement_material_code TEXT,
    net_weight TEXT, weight_unit TEXT, measure_unit TEXT, replace_num TEXT, update_time TEXT
  ); CREATE TABLE agents_scm_cust_jxc_ai_daliy_d (material_code TEXT, cif_price TEXT)`);
  const insert = db.prepare(
    'INSERT INTO agents_dim_product_list_mi VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
  );
  for (const [period, code, category = '汤圆'] of rows)
    insert.run(
      period,
      '郑州',
      '自产',
      '源分类',
      '系列甲',
      'G',
      '组甲',
      code,
      `产品${code}`,
      category,
      '',
      '',
      '1',
      'KG',
      '件',
      '1',
      '2026-11-26',
    );
  const calls = [];
  const query = ({ queryId, parameters }) => {
    calls.push({ queryId, parameters });
    const request = makeRequest(config, queryId, parameters);
    const statement = db.prepare(request.sql);
    return {
      rows: statement.all(request.parameters),
      returnedColumns: statement.columns().map((column) => column.name),
      rejectedColumns: [],
      configVersion: 'product-period-v1',
    };
  };
  execute = query;
  return { query, calls, db };
}

test('December adopts the complete November month and retains source dates', async (t) => {
  fixture(t, [
    ['2026-11-26', 'A'],
    ['2026-11-01', 'B'],
    ['2026-10', 'OLD'],
  ]);
  const result = await source.readProducts('2026-12');
  assert.deepEqual(result.period, {
    targetMonth: '2026-12',
    adoptedMonth: '2026-11',
    configVersion: 'product-period-v1',
  });
  assert.deepEqual(result.raw.map((row) => row.material_code).sort(), ['A', 'B']);
  assert.deepEqual(result.raw.map((row) => row.stat_period).sort(), ['2026-11-01', '2026-11-26']);
});

test('invalid period responses fail instead of being treated as an empty month', async (t) => {
  const { query } = fixture(t, [['2026-11-26', 'A']]);
  for (const invalid of [
    { rows: [] },
    { rows: [{ month: '2026-11' }, { month: '2026-10' }] },
    { rows: [{ month: '2026-13' }] },
    { rows: [{ month: '2027-01' }] },
    { rows: [{ month: '' }] },
    { rows: [{ month: undefined }] },
    { rows: [{ month: '2026-11' }], configVersion: undefined },
  ]) {
    execute = (request) => ({ ...query(request), ...invalid });
    await assert.rejects(source.resolveProductPeriod('2026-12'), /产品清单/);
  }
});

test('an invalid target month is rejected before any source query', async (t) => {
  const { calls } = fixture(t, [['2026-11', 'A']]);
  for (const month of ['2026-13', '2026-1', '2026-11-01', null])
    await assert.rejects(source.resolveProductPeriod(month), /产品统计期/);
  assert.equal(calls.length, 0);
});

test('a configuration change between period resolution and snapshot reading fails', async (t) => {
  const { query } = fixture(t, [['2026-11-26', 'A']]);
  execute = (request) => ({
    ...query(request),
    configVersion:
      request.queryId === 'products.period' ? 'product-period-v1' : 'product-period-v2',
  });
  await assert.rejects(source.readProducts('2026-12'), /配置.*变化/);
});

test('product pages reject a different source month or pinned configuration', async (t) => {
  const { query } = fixture(t, [['2026-11-26', 'A']]);
  await assert.rejects(
    source.readMasterPage('products', '2026-11', 0, undefined, { configVersion: 'old' }),
    /配置.*变化/,
  );
  execute = (request) => {
    const result = query(request);
    return request.queryId === 'products.detail'
      ? { ...result, rows: result.rows.map((row) => ({ ...row, stat_period: '2026-10-31' })) }
      : result;
  };
  await assert.rejects(source.readMasterPage('products', '2026-11', 0), /统计月份/);
});

for (const scenario of [
  {
    name: 'January skips multiple missing months and excludes future months',
    target: '2027-01',
    rows: [
      ['2026-09', 'OLD'],
      ['2026-11-26', 'A'],
      ['2027-02', 'FUTURE'],
    ],
    adopted: '2026-11',
    codes: ['A'],
  },
  {
    name: 'a populated target month replaces the whole earlier list without filling missing SKUs',
    target: '2026-12',
    rows: [
      ['2026-11', 'A'],
      ['2026-11', 'B'],
      ['2026-12-08', 'A'],
    ],
    adopted: '2026-12',
    codes: ['A'],
  },
  {
    name: 'a month containing only excluded products is adopted with an empty filtered list',
    target: '2026-12',
    rows: [
      ['2026-11', 'A'],
      ['2026-12-08', 'Z', '粽子'],
    ],
    adopted: '2026-12',
    codes: [],
  },
  {
    name: 'no record at or before the target confirms no available product list',
    target: '2026-10',
    rows: [['2026-11', 'A']],
    adopted: null,
    codes: [],
  },
  {
    name: 'an empty source confirms no available product list',
    target: '2027-01',
    rows: [],
    adopted: null,
    codes: [],
  },
])
  test(scenario.name, async (t) => {
    fixture(t, scenario.rows);
    const result = await source.readProducts(scenario.target);
    assert.equal(result.period.adoptedMonth, scenario.adopted);
    assert.deepEqual(
      result.raw.map((row) => row.material_code),
      scenario.codes,
    );
  });

test('a resolved month stays fixed when the target later gains source records', async (t) => {
  const { db } = fixture(t, [['2026-11-26', 'A']]);
  const period = await source.resolveProductPeriod('2026-12');
  db.exec(
    "INSERT INTO agents_dim_product_list_mi (stat_period, material_code) VALUES ('2026-12-01', 'NEW')",
  );
  const pinned = await source.readProductSnapshot(period);
  assert.equal(pinned.period.adoptedMonth, '2026-11');
  assert.deepEqual(
    pinned.raw.map((row) => row.material_code),
    ['A'],
  );
  assert.equal((await source.resolveProductPeriod('2026-12')).adoptedMonth, '2026-12');
});

test('a stored adopted month can establish a fresh configuration without resolving the target again', async (t) => {
  fixture(t, [
    ['2026-11-26', 'A'],
    ['2026-12-01', 'NEW'],
  ]);
  const result = await source.readProductSnapshot({
    targetMonth: '2026-12',
    adoptedMonth: '2026-11',
  });
  assert.equal(result.period.configVersion, 'product-period-v1');
  assert.equal(result.period.adoptedMonth, '2026-11');
  assert.deepEqual(
    result.raw.map((row) => row.material_code),
    ['A'],
  );
});

test('the source entry reads all 5001 distinct rows including the last page', async (t) => {
  fixture(
    t,
    Array.from({ length: 5001 }, (_, index) => ['2026-11-26', `SKU-${index}`]),
  );
  const result = await source.readProducts('2027-01');
  assert.equal(result.raw.length, 5001);
  assert.equal(new Set(result.raw.map((row) => row.material_code)).size, 5001);
  assert(result.raw.some((row) => row.material_code === 'SKU-5000'));
});

test('failed, incomplete, duplicate or unversioned source responses never initiate another month search', async (t) => {
  const { query, calls } = fixture(t, [
    ['2026-11-26', 'A'],
    ['2026-11-26', 'B'],
  ]);
  for (const invalid of [
    { success: false, error: { message: '产品权限已失效' } },
    { rows: [] },
    { rows: [{ stat_period: '2026-11' }] },
    { configVersion: undefined },
    { rejectedColumns: ['material_code'] },
  ]) {
    calls.length = 0;
    execute = (request) => ({
      ...query(request),
      ...(request.queryId === 'products.detail' ? invalid : {}),
    });
    await assert.rejects(source.readProducts('2027-01'));
    assert.equal(calls.filter((call) => call.queryId === 'products.period').length, 1);
  }
  execute = (request) => {
    const result = query(request);
    return request.queryId === 'products.detail'
      ? { ...result, rows: [result.rows[0], result.rows[0]] }
      : result;
  };
  await assert.rejects(source.readProducts('2027-01'), /重复业务键/);
});

test('a failed period lookup preserves its reason instead of declaring no available list', async (t) => {
  fixture(t, []);
  execute = () => ({ success: false, error: { message: '数据源暂不可用' } });
  await assert.rejects(source.readProducts('2027-01'), /数据源暂不可用/);
});

test('a source identity change rejects the pending product lookup', async (t) => {
  const { query } = fixture(t, [['2026-11', 'A']]);
  execute = (request) => {
    port.onmessage({ data: { type: 'identity-changed' } });
    return query(request);
  };
  await assert.rejects(source.readProducts('2027-01'), /登录身份已变化/);
});
