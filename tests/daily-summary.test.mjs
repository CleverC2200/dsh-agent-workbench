import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
const out = await build({
  stdin: {
    contents:
      "export * from './business/shared/daily-summary.ts'; export * from './business/shared/agent-query.ts'; export {refreshConfiguredQueries} from './business/shared/query-cache.ts';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const {
  dailySummaryQuery,
  parseDailySummarySnapshot,
  createAgentQueries,
  refreshConfiguredQueries,
} = await import(
  'data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64')
);
const row = {
  batch_id: '20261102170000000000',
  business_date: '2026-11-02',
  stock_date: '2026-11-01',
  target_month: '2026-11-01',
};
const snapshot = parseDailySummarySnapshot({ rows: [row] });
const route = (kind) => ({ summaryRoute: { queryId: 'snapshot.fact', kind } });
test('empty publication is unavailable; malformed or denied metadata is not silently accepted', () => {
  assert.deepEqual(parseDailySummarySnapshot({ rows: [] }), { kind: 'unavailable' });
  assert.throws(
    () => parseDailySummarySnapshot({ rows: [{ ...row, stock_date: '2026-02-30' }] }),
    /INVALID/,
  );
  assert.throws(
    () => parseDailySummarySnapshot({ rows: [{ business_date: '2026-11-02' }] }),
    /INVALID/,
  );
});
test('date and target-version coverage are checked before choosing summary', () => {
  assert.equal(
    dailySummaryQuery(route('base'), snapshot, {
      month: '2026-10-01',
      stock_date: '2026-11-01',
      inventory_version: '月初',
    }),
    null,
  );
  assert.equal(
    dailySummaryQuery(route('base'), snapshot, {
      month: '2026-11-01',
      stock_date: '2026-10-31',
      inventory_version: '月初',
    }),
    null,
  );
  assert.equal(
    dailySummaryQuery(route('base'), snapshot, {
      month: '2026-11-01',
      inventory_version: '新版本',
    }),
    null,
  );
  assert.equal(
    dailySummaryQuery(route('base'), snapshot, {
      month: '2026-11-01',
      stock_date: '2026-11-01',
      inventory_version: '滚动',
    }).values.summary_batch_id,
    row.batch_id,
  );
});
test('actual compact shipment bindings and custom cycle settings retain snapshot eligibility', () => {
  const values = {
    month: '2026-11-01',
    stat_date: '2026-11-01',
    as_of: '2026-11-02',
    rolling_start: '20261004',
    shipment_month_start: '20261101',
    shipment_end_exclusive: '20261103',
    shipment_start: '20261004',
    fc_cycle_0_days: 12,
  };
  assert.equal(
    dailySummaryQuery(route('branch-period'), snapshot, values).values.fc_cycle_0_days,
    12,
  );
  assert.equal(
    dailySummaryQuery(route('branch-period'), snapshot, { ...values, rolling_start: '20261005' }),
    null,
  );
  assert.equal(
    dailySummaryQuery(route('age'), snapshot, {
      stat_date: '2026-11-01',
      batch_rolling_start: '20261003',
      batch_end_exclusive: '20261102',
    }).queryId,
    'snapshot.fact',
  );
});
function config() {
  return {
    schemaVersion: 1,
    agentId: 'summary-fixture',
    templates: {},
    dailySummary: { snapshotQueryId: 'summary.snapshot' },
    queries: {
      'summary.snapshot': {
        parameterSpec: {},
        request: { sql: 'SELECT 1 AS batch_id', parameters: {} },
        resultColumns: Object.keys(row),
      },
      fact: {
        ...route('current'),
        parameterSpec: {},
        request: { sql: 'SELECT 1 AS value', parameters: {} },
        resultColumns: ['value'],
      },
      'snapshot.fact': {
        parameterSpec: { gea_p1: { name: 'summary_batch_id', type: 'string', required: true } },
        request: { sql: 'SELECT :gea_p1 AS value', parameters: { gea_p1: 'unpublished' } },
        resultColumns: ['value'],
      },
    },
  };
}
test('concurrent cards share metadata and keep the same batch; explicit refresh obtains a new snapshot', async () => {
  const calls = [];
  let batch = row.batch_id;
  const execute = async (request, o) => {
    calls.push(o.queryId);
    await new Promise(setImmediate);
    return {
      rows:
        o.queryId === 'summary.snapshot'
          ? [{ ...row, batch_id: batch }]
          : [{ value: request.parameters.gea_p1 }],
    };
  };
  const q = createAgentQueries(config(), execute);
  const [a, b] = await Promise.all([q.read('fact', {}), q.read('fact', {})]);
  assert.equal(a.rows[0].value, b.rows[0].value);
  assert.equal(calls.filter((x) => x === 'summary.snapshot').length, 1);
  batch = '20261102180000000000';
  assert.equal((await q.read('fact', {})).rows[0].value, row.batch_id);
  assert.equal(
    (await createAgentQueries(config(), execute, { freshAfter: 1 }).read('fact', {})).rows[0].value,
    batch,
  );
});
test('snapshot permission denial stops the read and never invokes original detail SQL', async () => {
  const calls = [];
  const execute = async (_, o) => {
    calls.push(o.queryId);
    throw Object.assign(Error('FIELD_NOT_PUBLISHED'), { code: 'FIELD_NOT_PUBLISHED' });
  };
  await assert.rejects(
    createAgentQueries(config(), execute).read('fact', {}),
    /FIELD_NOT_PUBLISHED/,
  );
  await assert.rejects(
    createAgentQueries(config(), execute).read('fact', {}),
    /FIELD_NOT_PUBLISHED/,
  );
  assert.deepEqual(calls, ['summary.snapshot']);
});
test('summary query failure never falls through to original query', async () => {
  const calls = [];
  const execute = async (_, o) => {
    calls.push(o.queryId);
    if (o.queryId === 'summary.snapshot') return { rows: [row] };
    throw Error('DATA_PERMISSION_DENIED');
  };
  await assert.rejects(
    createAgentQueries(config(), execute).read('fact', {}),
    /DATA_PERMISSION_DENIED/,
  );
  assert.deepEqual(calls, ['summary.snapshot', 'snapshot.fact']);
});

function bootstrapConfig() {
  const cfg = config();
  cfg.queries.bootstrap = {
    parameterSpec: {},
    request: { sql: 'SELECT 1 AS value', parameters: {} },
    resultColumns: [
      ...Object.keys(row),
      'bundle_part',
      'bundle_total',
      'bundle_present',
      'bundle_scope_total',
      'v0',
    ],
  };
  cfg.queries.bundle = cfg.queries['snapshot.fact'];
  cfg.dailySummary.bundle = {
    bootstrapQueryId: 'bootstrap',
    queryId: 'bundle',
    maxRows: 200,
    maxTotalRows: 1000,
    members: [
      {
        queryId: 'snapshot.fact',
        part: '0',
        columns: { value: 'v0' },
        values: { summary_batch_id: { snapshotValue: 'batchId' } },
        bindings: { gea_p1: 'summary_batch_id' },
      },
    ],
  };
  return cfg;
}
const bootstrapRow = {
  ...row,
  bundle_part: '0',
  bundle_total: 1,
  bundle_present: 1,
  bundle_scope_total: 1,
  v0: 42,
};

test('batch metadata and initial rows share one authorized request; refresh does not reuse it', async () => {
  const calls = [];
  let value = 42;
  const execute = async (_, options) => {
    calls.push(options.queryId);
    return { rows: [{ ...bootstrapRow, v0: value }] };
  };
  const cfg = bootstrapConfig();
  const q = createAgentQueries(cfg, execute);
  assert.deepEqual((await q.read('fact', {})).rows, [{ value: 42 }]);
  assert.deepEqual(calls, ['bootstrap']);
  value = 99;
  assert.deepEqual(
    (await createAgentQueries(cfg, execute, { freshAfter: 2 }).read('fact', {})).rows,
    [{ value: 99 }],
  );
  assert.deepEqual(calls, ['bootstrap', 'bootstrap']);
});

test('bootstrap preserves denied columns and never retries a malformed or denied response as detail', async () => {
  for (const response of [
    { failure: { reasonCode: 'NO_RETURN_COLUMN_ALLOWED' } },
    {
      rows: [{ ...bootstrapRow, v0: undefined }],
      rejectedColumns: ['v0'],
      returnedColumns: Object.keys(bootstrapRow).filter((key) => key !== 'v0'),
    },
    { rows: [{ ...bootstrapRow, bundle_scope_total: 2 }] },
    { rows: [bootstrapRow, { ...bootstrapRow, batch_id: 'another-batch' }] },
  ]) {
    const calls = [];
    const execute = async (_, options) => {
      calls.push(options.queryId);
      return response;
    };
    await assert.rejects(
      createAgentQueries(bootstrapConfig(), execute).read(
        'fact',
        {},
        { requiredColumns: ['value'] },
      ),
    );
    assert.deepEqual(calls, ['bootstrap']);
  }
});

test('bootstrap metadata does not masquerade as a permission change on later pages', async () => {
  const cfg = bootstrapConfig();
  cfg.dailySummary.bundle.maxRows = 1;
  cfg.queries.bundle = structuredClone(cfg.queries.bundle);
  cfg.queries.bundle.parameterSpec.gea_p2 = { name: 'bundle_offset', type: 'integer' };
  cfg.queries.bundle.request.parameters.gea_p2 = 0;
  const columns = ['bundle_part', 'bundle_total', 'bundle_present', 'bundle_scope_total', 'v0'];
  const calls = [];
  const execute = async (request, options) => {
    calls.push(options.queryId);
    const initial = options.queryId === 'bootstrap';
    if (!initial) assert.equal(request.parameters.gea_p2, 1);
    return {
      rows: [
        {
          ...(initial ? row : {}),
          bundle_part: '0',
          bundle_total: 2,
          bundle_present: 1,
          bundle_scope_total: 2,
          v0: initial ? 42 : 43,
        },
      ],
      configVersion: 1,
      returnedColumns: [...columns, ...(initial ? Object.keys(row) : [])].map((outputAlias) => ({
        outputAlias,
      })),
      rejectedColumns: [],
    };
  };
  assert.deepEqual((await createAgentQueries(cfg, execute).read('fact', {})).rows, [
    { value: 42 },
    { value: 43 },
  ]);
  assert.deepEqual(calls, ['bootstrap', 'bundle']);
});

test('cached base customer-order metrics never absorb a different period or customer filter', () => {
  const def = {
    summaryRoute: {
      queryId: 'snapshot.fact',
      kind: 'base',
      materializedInputs: {
        order_customer_mode: 'all',
        order_pickup_type_mode: 'equal',
        order_pickup_type: '工厂',
      },
      materializedPeriod: true,
    },
  };
  const values = {
    month: '2026-11-01',
    inventory_version: '月初',
    order_customer_mode: 'all',
    order_pickup_type_mode: 'equal',
    order_pickup_type: '工厂',
    order_start: '2026-11-01',
    order_end_exclusive: '2026-11-03',
    rolling_start: '20261004',
    shipment_end_exclusive: '20261103',
  };
  assert.equal(dailySummaryQuery(def, snapshot, values).queryId, 'snapshot.fact');
  assert.equal(dailySummaryQuery(def, snapshot, { ...values, order_customer_mode: 'equal' }), null);
  assert.equal(
    dailySummaryQuery(def, snapshot, { ...values, order_end_exclusive: '2026-11-02' }),
    null,
  );
});

test('default calculation route is used only for the materialized 7+3 cycle', () => {
  const def = {
    summaryRoute: {
      queryId: 'snapshot.fact',
      defaultQueryId: 'snapshot-default.fact',
      kind: 'branch-period',
    },
  };
  const v = {
    month: '2026-11-01',
    as_of: '2026-11-02',
    cycle_days: 7,
    preparation_days: 3,
    fc_cycle_0_level: '',
    fc_cycle_0_object: '',
    fc_cycle_0_days: 7,
  };
  assert.equal(dailySummaryQuery(def, snapshot, v).queryId, 'snapshot-default.fact');
  assert.equal(dailySummaryQuery(def, snapshot, { ...v, cycle_days: 14 }).queryId, 'snapshot.fact');
  assert.equal(
    dailySummaryQuery(def, snapshot, {
      ...v,
      fc_cycle_0_level: 'warehouse',
      fc_cycle_0_object: 'B011',
    }).queryId,
    'snapshot.fact',
  );
  assert.equal(dailySummaryQuery(def, snapshot, { ...v, next_month: '2027-01-01' }), null);
});

test('confirmation fast path preserves custom cycles and unsupported filter/sort semantics', async () => {
  const cfg = JSON.parse(await readFile('business/inventory-fc/sql.config.json', 'utf8'));
  const query = cfg.queries['replenishment-confirmation.detail.atomic'];
  const values = {
    month: '2026-11-01',
    stat_date: '2026-11-01',
    as_of: '2026-11-02',
    cycle_days: 7,
    preparation_days: 3,
    needed_only: true,
    business_only: false,
    list_mode: 'all',
    sort_field: 'key',
    sort_direction: 'asc',
  };
  assert.equal(
    dailySummaryQuery(query, snapshot, values).queryId,
    'snapshot-default.replenishment-confirmation.detail.atomic',
  );
  assert.equal(
    dailySummaryQuery(query, snapshot, { ...values, cycle_days: 12 }).queryId,
    'snapshot.replenishment.detail.atomic',
  );
  for (const change of [{ business_only: true }, { sort_field: 'sku' }, { list_mode: 'urgent' }])
    assert.equal(dailySummaryQuery(query, snapshot, { ...values, ...change }), null);
});

test('required summary never substitutes live detail when the daily batch is missing or uncovered', async () => {
  for (const metadata of [[], [row]]) {
    const cfg = config();
    cfg.queries.fact.summaryRoute = {
      queryId: 'snapshot.fact',
      kind: 'branch-period',
      required: true,
    };
    const calls = [];
    const execute = async (_, options) => {
      calls.push(options.queryId);
      return { rows: options.queryId === 'summary.snapshot' ? metadata : [{ value: 999 }] };
    };
    await assert.rejects(createAgentQueries(cfg, execute).read('fact', { month: '2026-12-01' }), {
      code: metadata.length ? 'SUMMARY_SCOPE_NOT_COVERED' : 'SUMMARY_NOT_AVAILABLE',
    });
    assert.deepEqual(calls, ['summary.snapshot']);
  }
});

test('cards and later lists retain the same daily batch beyond cache TTL until explicit refresh', async (t) => {
  const now = Date.now();
  let clock = now;
  t.mock.method(Date, 'now', () => clock);
  let batch = row.batch_id;
  const execute = async (request, options) => ({
    rows:
      options.queryId === 'summary.snapshot'
        ? [{ ...row, batch_id: batch }]
        : [{ value: request.parameters.gea_p1 }],
  });
  const cfg = config();
  const card = await createAgentQueries(cfg, execute).read('fact', {});
  clock += 21 * 60 * 1000;
  batch = '20261102190000000000';
  const list = await createAgentQueries(cfg, execute).read('fact', {});
  assert.deepEqual(list.rows, card.rows);
  const refreshed = await createAgentQueries(cfg, execute, { freshAfter: clock }).read('fact', {});
  assert.equal(refreshed.rows[0].value, batch);
});

test('separate authorized users and cold entries calculate the same fixed batch without sharing rows', async () => {
  const cfg = config();
  const values = [];
  for (let principal = 0; principal < 3; principal++) {
    const calls = [];
    const execute = async (request, options) => {
      calls.push(options.queryId);
      return {
        rows:
          options.queryId === 'summary.snapshot' ? [row] : [{ value: request.parameters.gea_p1 }],
      };
    };
    values.push((await createAgentQueries(cfg, execute).read('fact', {})).rows);
    assert.deepEqual(calls, ['summary.snapshot', 'snapshot.fact']);
  }
  assert.deepEqual(values[0], values[1]);
  assert.deepEqual(values[1], values[2]);
});

test('every FC replenishment entry and its stock date require the validated daily batch', async () => {
  const cfg = JSON.parse(await readFile('business/inventory-fc/sql.config.json', 'utf8'));
  const names = Object.keys(cfg.queries).filter(
    (id) => id.startsWith('replenishment') || id === 'source.branch-stock-date',
  );
  assert.ok(names.length >= 11);
  for (const id of names) assert.equal(cfg.queries[id].summaryRoute?.required, true, id);
});

test('an in-flight reader keeps its refresh cohort while a new reader advances', async (t) => {
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  let batch = row.batch_id;
  const execute = async (request, options) => ({
    rows:
      options.queryId === 'summary.snapshot'
        ? [{ ...row, batch_id: batch }]
        : [{ value: request.parameters.gea_p1 }],
  });
  const cfg = config();
  const old = createAgentQueries(cfg, execute);
  const first = await old.read('fact', {});
  batch = '20261102200000000000';
  now += 1000;
  refreshConfiguredQueries();
  assert.deepEqual((await old.read('fact', {})).rows, first.rows);
  assert.equal((await createAgentQueries(cfg, execute).read('fact', {})).rows[0].value, batch);
});

test('Shanghai business-day rollover selects a new batch without a manual refresh', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-03T15:59:59Z').getTime() });
  let batch = '20261103083642623642';
  const execute = async (request, options) => ({
    rows:
      options.queryId === 'summary.snapshot'
        ? [{ ...row, batch_id: batch }]
        : [{ value: request.parameters.gea_p1 }],
  });
  const cfg = config();
  assert.equal((await createAgentQueries(cfg, execute).read('fact', {})).rows[0].value, batch);
  t.mock.timers.tick(2000);
  batch = '20261104083642623642';
  assert.equal((await createAgentQueries(cfg, execute).read('fact', {})).rows[0].value, batch);
});

test('category stock age keeps its snapshot date while actual movement follows the business-day window', () => {
  const values = {
    stat_date: '2026-11-01',
    batch_rolling_start: '20261004',
    batch_end_exclusive: '20261103',
  };
  assert.equal(dailySummaryQuery(route('age-movement'), snapshot, values).queryId, 'snapshot.fact');
  assert.equal(dailySummaryQuery(route('age'), snapshot, values), null);
  assert.equal(
    dailySummaryQuery(route('age-movement'), snapshot, {
      ...values,
      batch_rolling_start: '20261003',
      batch_end_exclusive: '20261102',
    }),
    null,
  );
  assert.equal(
    dailySummaryQuery(route('age-movement'), snapshot, { ...values, stat_date: '2026-10-31' }),
    null,
  );
});

test('unavailable metadata coalesces initial readers and recovers after a short fixed retry window', async (t) => {
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  let available = false,
    snapshotReads = 0;
  const execute = async (request, options) => {
    if (options.queryId === 'summary.snapshot') {
      snapshotReads++;
      return { rows: available ? [row] : [] };
    }
    return { rows: [{ value: request.parameters.gea_p1 }] };
  };
  const cfg = config();
  assert.deepEqual(await createAgentQueries(cfg, execute).snapshot(), { kind: 'unavailable' });
  available = true;
  now += 44999;
  assert.deepEqual(await createAgentQueries(cfg, execute).snapshot(), { kind: 'unavailable' });
  assert.equal(snapshotReads, 1, 'one initial load must not repeat an empty bootstrap');
  now += 1;
  assert.equal((await createAgentQueries(cfg, execute).snapshot()).kind, 'ready');
  assert.equal(snapshotReads, 2);
});

test('explicit refresh bypasses the unavailable metadata retry window immediately', async () => {
  let available = false;
  const execute = async () => ({ rows: available ? [row] : [] });
  const cfg = config();
  assert.equal(
    (await createAgentQueries(cfg, execute, { freshAfter: 1 }).snapshot()).kind,
    'unavailable',
  );
  available = true;
  assert.equal(
    (await createAgentQueries(cfg, execute, { freshAfter: 2 }).snapshot()).kind,
    'ready',
  );
});

test('a new branch read obtains a fresh batch at five minutes while an active read stays coherent', async (t) => {
  let now = Date.now(),
    batch = row.batch_id,
    reads = 0;
  t.mock.method(Date, 'now', () => now);
  const cfg = { ...config(), agentId: 'inventory-fc' };
  const execute = async (request, options) => {
    if (options.queryId === 'summary.snapshot') {
      reads++;
      return { rows: [{ ...row, batch_id: batch }] };
    }
    return { rows: [{ value: request.parameters.gea_p1 }] };
  };
  const active = createAgentQueries(cfg, execute);
  await active.read('fact', {});
  now += 5 * 60 * 1000 - 1;
  await createAgentQueries(cfg, execute).read('fact', {});
  assert.equal(reads, 1);
  now++;
  batch = '20261102190000000000';
  assert.equal((await createAgentQueries(cfg, execute).read('fact', {})).rows[0].value, batch);
  assert.equal((await active.read('fact', {})).rows[0].value, row.batch_id);
  assert.equal(reads, 2);
});

test('branch summary and rows select the same default cycle and retain custom cycles', async () => {
  for (const agent of ['fc', 'qll']) {
    const cfg = JSON.parse(await readFile(`business/inventory-${agent}/sql.config.json`, 'utf8'));
    const query = cfg.queries['replenishment.summary'];
    const values = { month: '2026-11-01', as_of: '2026-11-02', cycle_days: 7, preparation_days: 3 };
    assert.equal(
      dailySummaryQuery(query, snapshot, values).queryId,
      'snapshot-default.replenishment.summary',
    );
    for (const change of [
      { cycle_days: 5 },
      { preparation_days: 1 },
      { fc_cycle_0_level: 'warehouse', fc_cycle_0_object: 'A110' },
    ]) {
      assert.equal(
        dailySummaryQuery(query, snapshot, { ...values, ...change }).queryId,
        'snapshot.replenishment.summary',
      );
    }
    assert.equal(dailySummaryQuery(query, snapshot, { ...values, as_of: '2026-11-01' }), null);
  }
});
