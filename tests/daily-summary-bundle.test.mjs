import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
globalThis.window = new EventTarget();
const out = await build({
  stdin: {
    contents:
      "export * from './business/shared/daily-summary-bundle.ts'; export {requireColumns} from './business/shared/configured-query-client.mjs';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const { executeDailyBundle, requireColumns, dailyBundleValues } = await import(
  'data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64')
);
const snapshot = {
  kind: 'ready',
  batchId: 'batch1',
  businessDate: '2026-11-02',
  stockDate: '2026-11-01',
  targetMonth: '2026-11-01',
  defaultInventoryVersion: '月初',
};
const fixture = () => ({
  agentId: 'fixture',
  queries: {
    a: {
      parameterSpec: { gea_p1: { name: 'sku', type: 'string' } },
      request: { sql: 'SELECT :gea_p1 AS value', parameters: { gea_p1: 'all' } },
    },
    b: { parameterSpec: {} },
    bundle: {
      parameterSpec: {
        gea_p10: { name: 'sku', type: 'string' },
        gea_p11: { name: 'bundle_offset', type: 'integer' },
      },
      request: { sql: 'SELECT :gea_p10 AS r0_value', parameters: { gea_p10: 'all', gea_p11: 0 } },
    },
  },
  dailySummary: {
    bundle: {
      queryId: 'bundle',
      maxRows: 2,
      maxTotalRows: 10,
      members: [
        {
          queryId: 'a',
          part: '0',
          columns: { value: 'r0_value' },
          values: { sku: 'all' },
          bindings: { gea_p10: 'sku' },
        },
        { queryId: 'b', part: '1', columns: { value: 'r1_value' }, values: {}, bindings: {} },
      ],
    },
  },
});
const rows = [
  { bundle_part: '0', bundle_total: 1, bundle_present: 1, bundle_scope_total: 2, r0_value: 12 },
  { bundle_part: '1', bundle_total: 1, bundle_present: 1, bundle_scope_total: 2, r1_value: 23 },
];
const request = { parameters: { gea_p1: 'all' } };
const call = (cfg, run, id = 'a', extra = {}, req = request) =>
  executeDailyBundle(cfg, snapshot, run, run, req, { queryId: id, ...extra }, 0);
test('concurrent members share one request and preserve their own values', async () => {
  const cfg = fixture();
  let n = 0;
  const run = async () => {
    n++;
    await new Promise(setImmediate);
    return { rows };
  };
  const [a, b] = await Promise.all([call(cfg, run), call(cfg, run, 'b', {}, { parameters: {} })]);
  assert.deepEqual(a.rows, [{ value: 12 }]);
  assert.deepEqual(b.rows, [{ value: 23 }]);
  assert.equal(n, 1);
});
test('nondefault filters execute the original selected query without using a bundle', async () => {
  let ids = [];
  const run = async (_, o) => {
    ids.push(o.queryId);
    return { rows: [{ value: 7 }] };
  };
  assert.equal(
    (await call(fixture(), run, 'a', {}, { parameters: { gea_p1: 'SKU' } })).rows[0].value,
    7,
  );
  assert.deepEqual(ids, ['a']);
});
test('permission denied response is retained and never retried through original queries', async () => {
  let n = 0;
  const run = async () => {
    n++;
    return { failure: { reasonCode: 'NO_RETURN_COLUMN_ALLOWED' } };
  };
  const cfg = fixture();
  for (let i = 0; i < 2; i++)
    await assert.rejects(call(cfg, run), (e) => e.code === 'NO_RETURN_COLUMN_ALLOWED');
  assert.equal(n, 1);
});
test('column permissions remain isolated even when gateway metadata uses objects', async () => {
  const cfg = fixture();
  const run = async () => ({
    rows: [{ ...rows[0] }, { ...rows[1], r1_value: undefined }].map((r, i) => {
      if (i) delete r.r1_value;
      return r;
    }),
    returnedColumns: [
      'bundle_part',
      'bundle_total',
      'bundle_present',
      'bundle_scope_total',
      'r0_value',
    ].map((outputAlias) => ({ outputAlias })),
    rejectedColumns: [{ outputAlias: 'r1_value' }],
  });
  const a = await call(cfg, run);
  requireColumns(a, ['value']);
  const b = await call(cfg, run, 'b', {}, { parameters: {} });
  assert.deepEqual(b.rows, [{}]);
  assert.throws(
    () => requireColumns(b, ['value']),
    (e) => e.code === 'REQUIRED_COLUMN_UNAVAILABLE',
  );
});
test('missing bundle rows fail visibly instead of silently truncating the list', async () => {
  await assert.rejects(
    call(fixture(), async () => ({ rows: rows.slice(0, 1) })),
    (e) => e.code === 'RESULT_INCOMPLETE',
  );
});
test('more than one result page is fully collected', async () => {
  const cfg = fixture();
  const many = [0, 1, 2].map((i) => ({
    ...rows[0],
    bundle_total: 3,
    bundle_scope_total: 4,
    r0_value: i,
  }));
  many.push({ ...rows[1], bundle_scope_total: 4 });
  const offsets = [];
  const run = async (req) => {
    offsets.push(req.parameters.gea_p11);
    return {
      rows: many.slice(req.parameters.gea_p11, req.parameters.gea_p11 + 2),
      configVersion: 1,
    };
  };
  assert.deepEqual((await call(cfg, run)).rows, [{ value: 0 }, { value: 1 }, { value: 2 }]);
  assert.deepEqual(offsets, [0, 2]);
});
test('changing permission or batch response while paging aborts the collection', async () => {
  const cfg = fixture();
  const run = async (req) => ({
    rows: [
      { ...rows[0], bundle_scope_total: 4 },
      { ...rows[1], bundle_scope_total: 4 },
    ],
    configVersion: req.parameters.gea_p11,
  });
  await assert.rejects(call(cfg, run), (e) => e.code === 'QUERY_CONFIG_CHANGED');
});
test('one cancelled card does not cancel another card sharing the result', async () => {
  const cfg = fixture();
  let done, signal;
  const run = (_, o) => {
    signal = o.signal;
    return new Promise((r) => (done = r));
  };
  const a = new AbortController();
  const pa = call(cfg, run, 'a', { signal: a.signal });
  const pb = call(cfg, run, 'b', {}, { parameters: {} });
  a.abort();
  await assert.rejects(pa);
  assert.equal(signal.aborted, false);
  done({ rows });
  assert.deepEqual((await pb).rows, [{ value: 23 }]);
});
test('identity change invalidates cached results', async () => {
  const cfg = fixture();
  let n = 0;
  const run = async () => {
    n++;
    return { rows };
  };
  await call(cfg, run);
  window.dispatchEvent(new Event('gea-identity-changed'));
  await call(cfg, run);
  assert.equal(n, 2);
});
test('snapshot templates use calendar boundaries and compact date formats', () => {
  assert.deepEqual(
    dailyBundleValues(snapshot, {
      start: { snapshotValue: 'rollingStart', format: 'YYYYMMDD' },
      month: { snapshotValue: 'businessMonth', format: 'YYYYMM' },
      version: { snapshotValue: 'defaultInventoryVersion' },
    }),
    { start: '20261004', month: '202611', version: '月初' },
  );
});

const warehouseFixture = () => {
  const cfg = fixture();
  cfg.agentId = 'inventory-fc';
  cfg.queries.a.parameterSpec.gea_p2 = { name: 'warehouse_code', type: 'string', nullable: true };
  cfg.queries.b.parameterSpec = {
    gea_p3: { name: 'warehouse_code', type: 'string', nullable: true },
    gea_p4: { name: 'warehouse_code_mode', type: 'string' },
  };
  Object.assign(cfg.queries.bundle.parameterSpec, {
    gea_p12: { name: 'a_warehouse', type: 'string', nullable: true },
    gea_p13: { name: 'b_warehouse', type: 'string', nullable: true },
    gea_p14: { name: 'b_warehouse_mode', type: 'string' },
  });
  Object.assign(cfg.dailySummary.bundle.members[0].values, { warehouse_code: null });
  Object.assign(cfg.dailySummary.bundle.members[0].bindings, { gea_p12: 'warehouse_code' });
  Object.assign(cfg.dailySummary.bundle.members[1].values, {
    warehouse_code: null,
    warehouse_code_mode: 'all',
  });
  Object.assign(cfg.dailySummary.bundle.members[1].bindings, {
    gea_p13: 'warehouse_code',
    gea_p14: 'warehouse_code_mode',
  });
  return cfg;
};
const warehouseCall = (cfg, run, warehouse, id = 'a', preloaded) => {
  const parameters =
    id === 'a'
      ? { gea_p1: 'all', gea_p2: warehouse }
      : { gea_p3: warehouse, gea_p4: warehouse ? 'equal' : 'all' };
  return executeDailyBundle(
    cfg,
    snapshot,
    run,
    run,
    { parameters },
    {
      queryId: id,
      values: { warehouse_code: warehouse },
    },
    0,
    preloaded,
  );
};
test('single warehouse cards and list share one scoped response and ignore all-warehouse preload', async () => {
  const cfg = warehouseFixture();
  const requests = [];
  const run = async (req, options) => {
    requests.push({ req, options });
    await new Promise(setImmediate);
    return { rows };
  };
  const preload = { at: Date.now(), result: { rows: rows.map((r) => ({ ...r, r0_value: 999 })) } };
  const [a, b] = await Promise.all([
    warehouseCall(cfg, run, 'A110', 'a', preload),
    warehouseCall(cfg, run, 'A110', 'b', preload),
  ]);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].options.queryId, 'bundle');
  assert.deepEqual(requests[0].req.parameters, {
    gea_p10: 'all',
    gea_p11: 0,
    gea_p12: 'A110',
    gea_p13: 'A110',
    gea_p14: 'equal',
  });
  assert.deepEqual(a.rows, [{ value: 12 }]);
  assert.deepEqual(b.rows, [{ value: 23 }]);
});
test('warehouse scope cache separates warehouses and the all-warehouse response', async () => {
  const cfg = warehouseFixture();
  const scopes = [];
  const run = async (req) => {
    scopes.push(req.parameters.gea_p12);
    return { rows: rows.map((r) => ({ ...r, r0_value: req.parameters.gea_p12 })) };
  };
  for (const warehouse of ['A110', 'A120', null, 'A110']) {
    const result = await warehouseCall(cfg, run, warehouse);
    assert.equal(result.rows[0].value, warehouse);
  }
  assert.deepEqual(scopes, ['A110', 'A120', null]);
});
test('single warehouse still preserves custom filter and permission error behavior', async () => {
  const cfg = warehouseFixture();
  const ids = [];
  const run = async (_, options) => {
    ids.push(options.queryId);
    return { failure: { reasonCode: 'NO_RETURN_COLUMN_ALLOWED' } };
  };
  await call(
    cfg,
    run,
    'a',
    { values: { warehouse_code: 'A110' } },
    {
      parameters: { gea_p1: 'custom-sku', gea_p2: 'A110' },
    },
  );
  await assert.rejects(
    warehouseCall(cfg, run, 'A110'),
    (e) => e.code === 'NO_RETURN_COLUMN_ALLOWED',
  );
  await assert.rejects(
    warehouseCall(cfg, run, 'A110', 'b'),
    (e) => e.code === 'NO_RETURN_COLUMN_ALLOWED',
  );
  assert.deepEqual(ids, ['a', 'bundle']);
});

test('older all-only SQL bindings cannot supply a single-warehouse response', async () => {
  const cfg = warehouseFixture();
  delete cfg.dailySummary.bundle.members[0].bindings.gea_p12;
  const ids = [];
  const run = async (_, options) => {
    ids.push(options.queryId);
    return { rows: [{ value: 110 }] };
  };
  assert.deepEqual((await warehouseCall(cfg, run, 'A110')).rows, [{ value: 110 }]);
  assert.deepEqual(ids, ['a']);
});

test('FC published bundle retains every member warehouse binding and its named SQL placeholder', async () => {
  const cfg = JSON.parse(await readFile('business/inventory-fc/sql.config.json', 'utf8'));
  const bundle = cfg.dailySummary.bundle;
  const query = cfg.queries[bundle.queryId];
  for (const member of bundle.members) {
    for (const name of ['warehouse_code', 'warehouse_code_mode']) {
      if (!Object.hasOwn(member.values, name)) continue;
      const binding = Object.entries(member.bindings).find(([, value]) => value === name);
      assert.ok(binding, member.queryId + ':' + name);
      assert.ok(query.parameterSpec[binding[0]], member.queryId + ':' + name);
      assert.match(query.request.sql, new RegExp(':' + binding[0] + '\\b'));
    }
  }
});

test('completed branch bundles last five minutes and base/full-chain bundles last twenty without sliding hits', async (t) => {
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  for (const [agentId, minutes] of [
    ['inventory-fc', 5],
    ['inventory-aqkc', 20],
    ['inventory-qll', 20],
  ]) {
    const cfg = { ...fixture(), agentId };
    let reads = 0;
    const run = async () => {
      reads++;
      return { rows };
    };
    await call(cfg, run);
    now += minutes * 60 * 1000 - 1;
    await call(cfg, run);
    assert.equal(reads, 1, agentId);
    now++;
    await call(cfg, run);
    assert.equal(reads, 2, agentId);
  }
});

test('a transient bundle failure does not occupy the longer successful-result cache lifetime', async (t) => {
  let now = Date.now(),
    reads = 0;
  t.mock.method(Date, 'now', () => now);
  const cfg = { ...fixture(), agentId: 'inventory-fc' };
  const run = async () => {
    reads++;
    if (reads === 1) throw Error('temporary gateway outage');
    return { rows };
  };
  await assert.rejects(call(cfg, run), /temporary/);
  now += 45000;
  assert.deepEqual((await call(cfg, run)).rows, [{ value: 12 }]);
  assert.equal(reads, 2);
});
