import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

const bundled = await build({
  entryPoints: ['business/shared/workspace-query.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const { readWorkspaceQuery } = await import(
  'data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64')
);
const config = JSON.parse(await readFile('business/inventory-apsplan/sql.config.json', 'utf8'));
const [name, binding] = Object.entries(config.workspaceBindings).find(
  ([, b]) => b.queryId.includes('sales-accuracy') || b.queryId.includes('sales_accuracy'),
);
assert.ok(binding);

// Model each gateway roundtrip as one deterministic wave. Keep SQL, parameter
// mapping, collection validation and the workspace caller real.
test('large workspace source does not serialize every 200-row gateway page', async () => {
  const q = config.queries[binding.queryId],
    total = 5881;
  let wave = 0,
    pending = [],
    timer,
    calls = 0,
    peak = 0;
  const execute = async (_request, { queryId, values }) => {
    calls++;
    return new Promise((resolve) => {
      pending.push(() =>
        resolve({
          configVersion: 'fixture',
          rows:
            queryId === q.pagination.countQuery
              ? [{ total }]
              : Array.from({ length: Math.min(values.page_size, total - values.offset) }, (_, i) =>
                  Object.fromEntries(
                    q.resultColumns.map((k) => [
                      k,
                      binding.keyFields.includes(k) ? String(values.offset + i) : 1,
                    ]),
                  ),
                ),
        }),
      );
      peak = Math.max(peak, pending.length);
      if (!timer)
        timer = setImmediate(() => {
          const batch = pending;
          pending = [];
          timer = undefined;
          wave++;
          batch.forEach((done) => done());
        });
    });
  };
  const rows = await readWorkspaceQuery(
    config,
    name,
    { start: '2026-10-01', end: '2026-10-19', version: '滚动', order_type: 'M' },
    { execute },
  );
  assert.equal(rows.length, total);
  console.log(
    JSON.stringify({ source: name, rows: rows.length, calls, gatewayRoundtripWaves: wave, peak }),
  );
  assert.ok(wave <= 14, `5881 rows waited for ${wave} sequential roundtrips`);
  assert.ok(peak <= 3, 'collection concurrency must remain bounded');
});

const { createQueryClient } = await import('../business/shared/configured-query-client.mjs');
const registry = {
  queries: {
    list: {
      parameterSpec: {
        gea_p1: { name: 'page_size', type: 'integer', minimum: 1, maximum: 200 },
        gea_p2: { name: 'offset', type: 'integer', minimum: 0 },
      },
      request: { sql: 'SELECT value AS value', parameters: {} },
      pagination: { countQuery: 'count' },
    },
    count: { parameterSpec: {}, request: { sql: 'SELECT COUNT(*) AS total', parameters: {} } },
  },
};
const pageRows = (offset, total = 1001) =>
  Array.from({ length: Math.min(200, total - offset) }, (_, i) => ({ value: offset + i }));

test('concurrent pages preserve row order despite responses arriving in reverse order', async () => {
  let pending = [],
    timer;
  const client = createQueryClient(registry, async (_, o) => {
    if (o.queryId === 'count') return { rows: [{ total: 1001 }] };
    return new Promise((resolve) => {
      pending.push(() => resolve({ rows: pageRows(o.values.offset) }));
      if (!timer)
        timer = setImmediate(() => {
          let batch = pending;
          pending = [];
          timer = undefined;
          batch.reverse().forEach((f) => f());
        });
    });
  });
  const result = await client.readAll(
    'list',
    { page_size: 200, offset: 0 },
    { keyFields: ['value'] },
  );
  assert.deepEqual(
    result.rows.map((r) => r.value),
    Array.from({ length: 1001 }, (_, i) => i),
  );
  assert.deepEqual(
    result.pages.map((p) => p.offset),
    [0, 200, 400, 600, 800, 1000],
  );
});

test('permission rejection cancels its concurrent siblings and does not schedule later pages', async () => {
  const denied = Object.assign(Error('denied'), { code: 'ROW_SCOPE_DENIED' }),
    calls = [],
    cancelled = [];
  const client = createQueryClient(registry, async (_, o) => {
    if (o.queryId === 'count') return { rows: [{ total: 1600 }] };
    const at = o.values.offset;
    calls.push(at);
    if (at === 0) return { rows: pageRows(0, 1600) };
    if (at === 200) throw denied;
    return new Promise((resolve, reject) =>
      o.signal.addEventListener(
        'abort',
        () => {
          cancelled.push(at);
          reject(o.signal.reason);
        },
        { once: true },
      ),
    );
  });
  await assert.rejects(
    client.readAll('list', { page_size: 200, offset: 0 }, { keyFields: ['value'] }),
    (e) => e === denied,
  );
  assert.deepEqual(calls, [0, 200, 400, 600]);
  assert.deepEqual(
    cancelled.sort((a, b) => a - b),
    [400, 600],
  );
});

test('short intermediate pages reject the collection instead of silently skipping rows', async () => {
  const client = createQueryClient(registry, async (_, o) =>
    o.queryId === 'count'
      ? { rows: [{ total: 1001 }] }
      : { rows: pageRows(o.values.offset).slice(0, o.values.offset === 200 ? 199 : 200) },
  );
  await assert.rejects(
    client.readAll('list', { page_size: 200, offset: 0 }, { keyFields: ['value'] }),
    { code: 'RESULT_INCOMPLETE' },
  );
});

test('all cards share four transport slots and an aborted queued read is never sent', async () => {
  const active = new Map(),
    sent = [];
  let peak = 0;
  const client = createQueryClient(registry, async (_, o) => {
    const at = o.values.offset;
    sent.push(at);
    return new Promise((resolve) => {
      active.set(at, () => {
        active.delete(at);
        resolve({ rows: [] });
      });
      peak = Math.max(peak, active.size);
    });
  });
  const jobs = Array.from({ length: 4 }, (_, i) =>
    client.read('list', { page_size: 10, offset: i }),
  );
  await new Promise(setImmediate);
  assert.equal(active.size, 4);
  const stop = new AbortController();
  const queued = client.read('list', { page_size: 10, offset: 4 }, { signal: stop.signal });
  const rejected = assert.rejects(queued, { name: 'AbortError' });
  stop.abort();
  await rejected;
  for (const done of active.values()) done();
  await Promise.all(jobs);
  assert.equal(peak, 4);
  assert.deepEqual(sent, [0, 1, 2, 3]);
});

test('short aggregate result is complete in one statement; full page keeps counted collection checks', async () => {
  for (const total of [0, 42, 200, 201]) {
    const calls = [];
    const client = createQueryClient(registry, async (_, o) => {
      calls.push(o.queryId);
      return {
        configVersion: 'v',
        rows: o.queryId === 'count' ? [{ total }] : pageRows(o.values.offset, total),
      };
    });
    const r = await client.readAll(
      'list',
      { page_size: 200, offset: 0 },
      { keyFields: ['value'], singlePageFirst: true },
    );
    assert.equal(r.total, total);
    assert.equal(r.rows.length, total);
    if (total < 200) {
      assert.deepEqual(calls, ['list']);
      assert.equal(r.consistency, 'single_statement_complete_page');
    } else {
      assert.equal(calls.filter((x) => x === 'count').length, 2);
      assert.equal(r.consistency, 'count_checked_not_atomic_snapshot');
    }
  }
});
test('single statement aggregate retains field permissions, unique keys and max-row checks', async () => {
  for (const [response, code, options] of [
    [{ rows: [{ value: 1 }, { value: 1 }] }, 'UNSTABLE_PAGINATION', {}],
    [{ rows: [{ value: 1 }], rejectedColumns: ['value'] }, 'REQUIRED_COLUMN_UNAVAILABLE', {}],
    [{ rows: [{ value: 1 }, { value: 2 }] }, 'RESULT_TOO_LARGE', { maxRows: 1 }],
    [{ failure: { reasonCode: 'ROW_SCOPE_DENIED' } }, 'ROW_SCOPE_DENIED', {}],
  ]) {
    let calls = 0;
    const c = createQueryClient(registry, async () => {
      calls++;
      return response;
    });
    await assert.rejects(
      c.readAll(
        'list',
        { page_size: 200, offset: 0 },
        { keyFields: ['value'], singlePageFirst: true, ...options },
      ),
      { code },
    );
    assert.equal(calls, 1);
  }
});

test('expanded product stock uses same-statement counts and never downloads the first batch twice', async () => {
  const binding = config.workspaceDrillBindings.product.stock,
    q = config.queries[binding.queryId],
    calls = [];
  const execute = async (_, o) => {
    calls.push(o.queryId);
    if (o.queryId === 'source.stock-date')
      return { configVersion: 'v', rows: [{ day: '2026-10-18' }] };
    if (o.queryId === q.pagination.countQuery)
      return { configVersion: 'v', rows: [{ total: 320 }] };
    return {
      configVersion: 'v',
      rows: Array.from({ length: Math.min(o.values.page_size, 320 - o.values.offset) }, (_, i) => ({
        ...Object.fromEntries(
          q.resultColumns.map((k) => [
            k,
            binding.keyFields.includes(k) ? String(o.values.offset + i) : 1,
          ]),
        ),
        page_scope_total: 320,
        page_row_present: 1,
      })),
    };
  };
  const rows = await readWorkspaceQuery(
    config,
    'stock',
    {
      start: '2026-10-01',
      end: '2026-10-19',
      version: '滚动',
      detailMode: 'product',
      productScope: { mode: 'category', categories: ['汤圆'], items: ['汤圆::汤圆'] },
    },
    { execute },
  );
  assert.equal(rows.length, 320);
  assert.deepEqual(calls, [
    'source.stock-date',
    q.pagination.atomicQuery,
    q.pagination.atomicQuery,
  ]);
});

test('base order helpers return complete base groups in one query without extra counts', async () => {
  const base = JSON.parse(await readFile('business/inventory-aqkc/sql.config.json', 'utf8'));
  const b = base.workspaceBindings['workbench-support-by-base'],
    q = base.queries[b.queryId],
    calls = [];
  const rows = await readWorkspaceQuery(
    base,
    'workbench-support-by-base',
    { start: '2026-10-01', end: '2026-10-19', version: '滚动', order_type: 'M' },
    {
      execute: async (_, o) => {
        calls.push(o.queryId);
        return {
          configVersion: 'v1',
          rows:
            o.queryId === q.pagination.countQuery
              ? [{ total: 5 }]
              : Array.from({ length: 5 }, (_, i) =>
                  Object.fromEntries(q.resultColumns.map((k) => [k, k === 'base' ? String(i) : 1])),
                ),
        };
      },
    },
  );
  assert.equal(rows.length, 5);
  assert.deepEqual(calls, [b.queryId]);
});
