import test from 'node:test';
import assert from 'node:assert/strict';
import { createQueryClient } from '../business/shared/configured-query-client.mjs';
const spec = {
  size: { name: 'page_size', type: 'integer', minimum: 1, maximum: 200 },
  offset: { name: 'offset', type: 'integer', minimum: 0 },
};
const config = {
  queries: {
    list: {
      parameterSpec: spec,
      request: { sql: 'SELECT value', parameters: {} },
      pagination: { countQuery: 'count', initialQuery: 'initial' },
    },
    initial: { parameterSpec: spec, request: { sql: 'SELECT value', parameters: {} } },
    count: { parameterSpec: {}, request: { sql: 'SELECT COUNT(*) AS total', parameters: {} } },
  },
};
const opts = { keyFields: ['value'], singlePageFirst: true };
test('bounded initial collection returns a complete short result without LIMIT or another count', async () => {
  const calls = [];
  const c = createQueryClient(config, async (_q, { queryId }) => {
    calls.push(queryId);
    return { rows: [{ value: 1 }, { value: 2 }] };
  });
  const r = await c.readAll('list', { page_size: 200, offset: 0 }, opts);
  assert.deepEqual(r.rows, [{ value: 1 }, { value: 2 }]);
  assert.deepEqual(calls, ['initial']);
});
test('a full initial batch is discarded and the original counted paging path still reads every row', async () => {
  const calls = [];
  const c = createQueryClient(config, async (_q, { queryId, values }) => {
    calls.push(queryId);
    return {
      configVersion: 'v',
      rows:
        queryId === 'count'
          ? [{ total: 320 }]
          : Array.from({ length: Math.min(200, 320 - values.offset) }, (_, i) => ({
              value: values.offset + i,
            })),
    };
  });
  const r = await c.readAll('list', { page_size: 200, offset: 0 }, opts);
  assert.deepEqual(
    r.rows.map((x) => x.value),
    Array.from({ length: 320 }, (_, i) => i),
  );
  assert.equal(calls.filter((x) => x === 'initial').length, 1);
  assert.equal(calls.filter((x) => x === 'list').length, 2);
  assert.equal(calls.filter((x) => x === 'count').length, 2);
});
test('denied or oversized initial responses are rejected without switching queries', async () => {
  for (const deny of [true, false]) {
    const calls = [];
    const c = createQueryClient(config, async (_q, { queryId }) => {
      calls.push(queryId);
      return deny
        ? { failure: { reasonCode: 'RETURN_PERMISSION_DENIED' } }
        : { rows: Array.from({ length: 201 }, (_, value) => ({ value })) };
    });
    await assert.rejects(
      c.readAll('list', { page_size: 200, offset: 0 }, opts),
      (e) => e.code === (deny ? 'RETURN_PERMISSION_DENIED' : 'RESULT_INCOMPLETE'),
    );
    assert.deepEqual(calls, ['initial']);
  }
});
