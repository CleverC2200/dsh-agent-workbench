import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const out = await build({
  stdin: {
    contents:
      "export * from './business/shared/daily-summary.ts'; export * from './business/shared/agent-query.ts';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const { dailySummaryQuery, parseDailySummarySnapshot, createAgentQueries } = await import(
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
