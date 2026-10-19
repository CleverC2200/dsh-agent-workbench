import test from 'node:test';
import assert from 'node:assert/strict';
import { createQueryClient } from '../business/shared/configured-query-client.mjs';
const spec = {
  gea_p1: { name: 'page_size', type: 'integer', minimum: 1, maximum: 200 },
  gea_p2: { name: 'offset', type: 'integer', minimum: 0 },
};
const config = {
  queries: {
    list: {
      parameterSpec: spec,
      request: { sql: 'SELECT value AS value', parameters: {} },
      pagination: { countQuery: 'count', atomicQuery: 'atomic' },
    },
    atomic: { parameterSpec: spec, request: { sql: 'SELECT value AS value', parameters: {} } },
    count: { parameterSpec: {}, request: { sql: 'SELECT COUNT(*) AS total', parameters: {} } },
  },
};
const rows = (offset, total) =>
  Array.from({ length: Math.max(0, Math.min(200, total - offset)) }, (_, i) => ({
    value: offset + i,
  }));
test('complete grouped collection uses two gateway requests for 320 groups, without standalone counts', async () => {
  const calls = [];
  const client = createQueryClient(config, async (_, o) => {
    calls.push(o.queryId);
    return {
      configVersion: 'v',
      rows:
        o.queryId === 'count'
          ? [{ total: 320 }]
          : rows(o.values.offset, 320).map((r) =>
              o.queryId === 'atomic' ? { ...r, page_scope_total: 320, page_row_present: 1 } : r,
            ),
    };
  });
  const result = await client.readAll(
    'list',
    { page_size: 200, offset: 0 },
    { keyFields: ['value'], atomicPages: true },
  );
  assert.deepEqual(result.rows, rows(0, 320).concat(rows(200, 320)));
  assert.deepEqual(calls, ['atomic', 'atomic']);
});
const response = (offset, total = 320, version = 'v') => ({
  configVersion: version,
  rows:
    total === 0
      ? [{ value: null, page_scope_total: 0, page_row_present: null }]
      : rows(offset, total).map((r) => ({ ...r, page_scope_total: total, page_row_present: 1 })),
});
test('empty atomic collection preserves a validated zero total in one query', async () => {
  let calls = 0;
  const c = createQueryClient(config, async () => {
    calls++;
    return response(0, 0);
  });
  const r = await c.readAll(
    'list',
    { page_size: 200, offset: 0 },
    { keyFields: ['value'], atomicPages: true },
  );
  assert.equal(calls, 1);
  assert.equal(r.total, 0);
  assert.deepEqual(r.rows, []);
});
for (const [name, code, mutate] of [
  ['count changes', 'SOURCE_CHANGED', () => response(200, 321)],
  ['configuration changes', 'QUERY_CONFIG_CHANGED', (r) => ({ ...r, configVersion: 'new' })],
  ['short batch', 'RESULT_INCOMPLETE', (r) => ({ ...r, rows: r.rows.slice(1) })],
  [
    'duplicate keys',
    'UNSTABLE_PAGINATION',
    (r) => ({ ...r, rows: r.rows.map((x, i) => (i ? x : { ...x, value: 0 })) }),
  ],
  [
    'permission denial',
    'ROW_SCOPE_DENIED',
    () => ({ failure: { reasonCode: 'ROW_SCOPE_DENIED' } }),
  ],
  [
    'count column denied',
    'REQUIRED_COLUMN_UNAVAILABLE',
    (r) => ({ ...r, rejectedColumns: ['page_scope_total'] }),
  ],
])
  test('atomic collection rejects ' + name + ' without fallback', async () => {
    const calls = [];
    const c = createQueryClient(config, async (_, o) => {
      calls.push(o.queryId);
      const r = response(o.values.offset);
      return o.values.offset ? mutate(r) : r;
    });
    await assert.rejects(
      c.readAll('list', { page_size: 200, offset: 0 }, { keyFields: ['value'], atomicPages: true }),
      { code },
    );
    assert.deepEqual(calls, ['atomic', 'atomic']);
  });
test('atomic collection keeps ordered results with bounded concurrent continuation batches', async () => {
  let pending = [],
    timer,
    peak = 0;
  const c = createQueryClient(
    config,
    async (_, o) =>
      new Promise((resolve) => {
        pending.push(() => resolve(response(o.values.offset, 1001)));
        peak = Math.max(peak, pending.length);
        if (!timer)
          timer = setImmediate(() => {
            const batch = pending;
            pending = [];
            timer = null;
            batch.reverse().forEach((f) => f());
          });
      }),
  );
  const r = await c.readAll(
    'list',
    { page_size: 200, offset: 0 },
    { keyFields: ['value'], atomicPages: true },
  );
  assert.deepEqual(
    r.rows.map((x) => x.value),
    Array.from({ length: 1001 }, (_, i) => i),
  );
  assert.ok(peak <= 3);
  assert.equal(r.consistency, 'page_totals_checked_not_atomic_snapshot');
});
test('atomic collection refuses row budget overflow before additional requests', async () => {
  let calls = 0;
  const c = createQueryClient(config, async () => {
    calls++;
    return response(0);
  });
  await assert.rejects(
    c.readAll(
      'list',
      { page_size: 200, offset: 0 },
      { keyFields: ['value'], maxRows: 300, atomicPages: true },
    ),
    { code: 'RESULT_TOO_LARGE' },
  );
  assert.equal(calls, 1);
});
