import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readUnitWeights } from '../static/mps/source/unit-weights.js';

const config = JSON.parse(await readFile('static/mps/sql.config.json', 'utf8'));
let receive, execute;
const port = {
  start() {},
  postMessage(message) {
    if (message.type !== 'request') return;
    Promise.resolve(execute(message.parameters)).then(
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
const { readCapacityAnnual } = await import('../static/mps/source/master-data.js');
receive({
  source: window.parent,
  origin: 'https://mps.test',
  ports: [port],
  data: {
    protocol: 'gea-html-v2',
    type: 'connect',
    context: { session: 'test', plugin: 'mps' },
  },
});

const response = (queryId, rows, configVersion = 'v1') => ({
  rows,
  configVersion,
  returnedColumns: config.queries[queryId].columns,
  rejectedColumns: [],
});

test('年度产能按5000行批读，保留原全源计数、空SKU剔除数及尾页', async () => {
  const source = Array.from({ length: 5201 }, (_, index) => ({
    ...Object.fromEntries(config.queries['annual.detail'].columns.map((column) => [column, null])),
    stat_month: 'Jul-26',
    belong_base: '华东',
    material_code: String(index),
    demand_qty: index,
  }));
  const calls = [];
  execute = ({ queryId, parameters }) => {
    calls.push({ queryId, parameters });
    return response(
      queryId,
      queryId === 'annual.count'
        ? [{ total: 7202 }]
        : queryId === 'annual.capacity.count'
          ? [{ total: source.length }]
          : source.slice(parameters.offset, parameters.offset + parameters.page_size),
    );
  };
  const result = await readCapacityAnnual(['2026-07']);
  assert.deepEqual(
    result.rows,
    source.map((row) => ({
      month: '2026-07',
      base: '华东',
      code: row.material_code,
      quantity: row.demand_qty,
    })),
  );
  assert.equal(result.excludedRows, 2001);
  assert.equal(calls.length, 6);
  assert.deepEqual(calls[0].parameters.months, ['2026-07', 'Jul-26', '2026年7月', '2026-7']);
  assert.deepEqual(
    calls
      .filter((call) => call.queryId === 'annual.capacity.detail')
      .map((call) => [call.parameters.page_size, call.parameters.offset]),
    [
      [5000, 0],
      [5000, 5000],
    ],
  );
});

test('件吨401编码按200分三批且最多两批并行，保留多渠道尾页及输入排序', async () => {
  const codes = Array.from({ length: 401 }, (_, index) => String(index).padStart(3, '0'));
  const rows = codes.flatMap((material_code) => [
    { material_code, channel_name: '经销', ton_per_piece: 0.01 },
    ...(material_code === '000'
      ? [{ material_code, channel_name: '直营', ton_per_piece: 0.02 }]
      : []),
  ]);
  const batches = [],
    counts = new Map();
  let active = 0,
    peak = 0,
    requests = 0;
  const result = await readUnitWeights(
    config,
    async (_request, { queryId, values }) => {
      requests++;
      const key = values.codes[0];
      const selected = rows.filter((row) => values.codes.includes(row.material_code));
      if (queryId === 'unit-weights.count') {
        const count = (counts.get(key) ?? 0) + 1;
        counts.set(key, count);
        if (count === 1) {
          batches.push(values.codes);
          peak = Math.max(peak, ++active);
        } else active--;
      }
      await new Promise((resolve) => setTimeout(resolve, key === '000' ? 5 : 0));
      return response(
        queryId,
        queryId.endsWith('.count')
          ? [{ total: selected.length }]
          : selected.slice(values.offset, values.offset + values.page_size),
      );
    },
    [...codes].reverse().concat([' 000 ', '']),
  );
  assert.deepEqual(result.rows, rows);
  assert.deepEqual(result.codes, codes);
  assert.deepEqual(
    batches.map((batch) => batch.length),
    [200, 200, 1],
  );
  assert.equal(peak, 2);
  assert.equal(requests, 9);
  assert.equal(result.configVersion, 'v1');
  assert.equal(
    [...counts.values()].reduce((sum, count) => sum + count, 0),
    6,
  );
});

for (const [failure, expected] of [
  ['short', /分页与计数不一致/],
  ['count', /源计数变化/],
  ['version', /配置.*变化/],
  ['duplicate', /重复业务键/],
  ['limit', /完整计算范围超过上限/],
]) {
  test(`年度读取在${failure}时保留完整性拒绝`, async () => {
    let counts = 0;
    execute = ({ queryId }) => {
      if (queryId.endsWith('.count'))
        return response(queryId, [
          {
            total:
              failure === 'limit'
                ? 100001
                : failure === 'count' && queryId === 'annual.count' && ++counts > 1
                  ? 1
                  : 2,
          },
        ]);
      const row = {
        ...Object.fromEntries(config.queries[queryId].columns.map((column) => [column, null])),
        stat_month: 'Jul-26',
        belong_base: '华东',
        material_code: 'A',
        demand_qty: 1,
      };
      return response(
        queryId,
        failure === 'short'
          ? [row]
          : [row, failure === 'duplicate' ? row : { ...row, material_code: 'B' }],
        failure === 'version' ? 'v2' : 'v1',
      );
    };
    await assert.rejects(readCapacityAnnual(['2026-07']), expected);
  });
}

for (const [failure, expected] of [
  ['scope', /范围外/],
  ['duplicate', /重复业务键/],
  ['version', /版本变化/],
  ['limit', /完整计算范围超过上限/],
]) {
  test(`件吨批量在${failure}时拒绝整轮结果`, async () => {
    const codes = Array.from({ length: 201 }, (_, index) => String(index).padStart(3, '0'));
    await assert.rejects(
      readUnitWeights(
        config,
        async (_request, { queryId, values }) => {
          const row = {
            material_code: failure === 'scope' ? 'outside' : values.codes[0],
            channel_name: '经销',
            ton_per_piece: 0.01,
          };
          return response(
            queryId,
            queryId.endsWith('.count')
              ? [{ total: failure === 'limit' ? 10001 : failure === 'duplicate' ? 2 : 1 }]
              : failure === 'duplicate'
                ? [row, row]
                : [row],
            failure === 'version' && values.codes[0] === '200' ? 'v2' : 'v1',
          );
        },
        codes,
      ),
      expected,
    );
  });
}

test('件吨任一批失败取消同组在途读取并停止后续批，保留原失败', async () => {
  const original = Error('上游拒绝');
  const started = [],
    aborted = [];
  const codes = Array.from({ length: 601 }, (_, index) => String(index).padStart(3, '0'));
  await assert.rejects(
    readUnitWeights(
      config,
      async (_request, { values, signal }) => {
        started.push(values.codes[0]);
        if (values.codes[0] === '000') {
          await new Promise((resolve) => setImmediate(resolve));
          throw original;
        }
        return new Promise((_resolve, reject) =>
          signal.addEventListener(
            'abort',
            () => {
              aborted.push(values.codes[0]);
              reject(signal.reason);
            },
            { once: true },
          ),
        );
      },
      codes,
    ),
    (error) => error === original,
  );
  assert.deepEqual(started, ['000', '200']);
  assert.deepEqual(aborted, ['200']);
});

test('调用者取消件吨读取后清除同组工作，不返回部分成功', async () => {
  const controller = new AbortController();
  const cancelled = Error('取消本轮');
  let started = 0,
    aborted = 0;
  await assert.rejects(
    readUnitWeights(
      config,
      async (_request, { signal }) => {
        started++;
        const pending = new Promise((_resolve, reject) =>
          signal.addEventListener(
            'abort',
            () => {
              aborted++;
              reject(signal.reason);
            },
            { once: true },
          ),
        );
        if (started === 2) controller.abort(cancelled);
        return pending;
      },
      Array.from({ length: 401 }, (_, index) => String(index)),
      controller.signal,
    ),
    (error) => error === cancelled,
  );
  assert.equal(started, 2);
  assert.equal(aborted, 2);
});

for (const total of [null, '', -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
  test(`年度过滤不能绕过原全源计数约束 ${String(total)}`, async () => {
    execute = ({ queryId }) => response(queryId, [{ total }]);
    await assert.rejects(readCapacityAnnual(['2026-07']), /计数必须是唯一非负整数/);
  });
}

test('年度全源尾计数配置变化时拒绝已有的过滤结果', async () => {
  let fullCounts = 0;
  execute = ({ queryId }) =>
    response(
      queryId,
      [{ total: 0 }],
      queryId === 'annual.count' && ++fullCounts === 2 ? 'v2' : 'v1',
    );
  await assert.rejects(readCapacityAnnual(['2026-07']), /配置.*变化/);
});

test('年度源端过滤与原始完整投影等价，保留重复数量、冲突和空SKU统计', async (t) => {
  const { DatabaseSync } = await import('node:sqlite');
  const { makeRequest } = await import('../business/shared/configured-query-client.mjs');
  const { capacityAnnualRows } = await import('../static/mps/source/master-data.js');
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
  for (const [base, code, month, quantity] of [
    ['华东', 'A', 'Jul-26', 10],
    ['华东', 'A', 'Jul-26', 10],
    ['华东', 'A', '2026-07', 10],
    ['华东', 'B', 'Jul-26', 10],
    ['华东', 'B', 'Jul-26', 20],
    ['华东', 'C', '2026年7月', null],
    ['华东', 'D', '2026-7', 0],
    ['华东', null, 'Jul-26', 50],
    ['华东', '', 'Jul-26', 50],
    ['华东', ' ', 'Jul-26', 50],
    ['华东', '\t', 'Jul-26', 50],
    [null, 'E', 'Jul-26', 50],
    ['华东', 'Z', 'Aug-26', 10],
  ])
    insert.run(base, '点心', '旧类', '组', '组名', code, '品名', month, quantity, null);
  const run = (queryId, parameters) => {
    const request = makeRequest(config, queryId, parameters);
    let sql = request.sql;
    const bindings = {};
    for (const [name, value] of Object.entries(request.parameters)) {
      if (Array.isArray(value)) {
        sql = sql.replace(':' + name, value.map((_, index) => ':' + name + '_' + index).join(','));
        value.forEach((item, index) => {
          bindings[name + '_' + index] = item;
        });
      } else bindings[name] = value;
    }
    return db
      .prepare(sql)
      .all(bindings)
      .map((row) => ({ ...row }));
  };
  const months = ['2026-07', 'Jul-26', '2026年7月', '2026-7'];
  const original = run('annual.detail', { months, page_size: 200, offset: 0 });
  execute = ({ queryId, parameters }) => response(queryId, run(queryId, parameters));
  const result = await readCapacityAnnual(['2026-07']);
  assert.deepEqual(result, capacityAnnualRows(original, ['2026-07']));
  assert.equal(result.excludedRows, 4);
  assert.equal(result.rows.find((row) => row.code === 'B').quantity, null);
  assert.equal(result.rows.find((row) => row.code === 'D').quantity, 0);
  assert.equal(result.unmapped.length, 1);
});
