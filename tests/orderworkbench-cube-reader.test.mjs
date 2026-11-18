import test from 'node:test';
import assert from 'node:assert/strict';
import { createCubeReader } from '../business/inventory-orderworkbench/cube-source.mjs';

test('Cube pages close the complete collection while retaining null, zero and observation counts', async () => {
  const calls = [];
  const reader = createCubeReader(async (name, args) => {
    assert.equal(name, 'query_business_data');
    assert.equal(args.response_mode, 'inline_complete');
    const query = args.queries[0].query;
    assert.equal(Object.hasOwn(query, 'sql'), false);
    calls.push(query);
    const count = Math.min(5000, 5002 - query.offset);
    return JSON.stringify({
      datasets: [
        {
          dataStatus: 'ok',
          rows: Array.from({ length: count }, (_, index) => ({
            'source.id': String(query.offset + index),
            'source.quantity': index === 0 ? null : 0,
            'source.record_count': 2,
          })),
          rowCount: count,
          totalRowCount: 5002,
          hasMorePages: query.offset + count < 5002,
        },
      ],
    });
  }, new AbortController().signal);
  const rows = await reader.read('source', ['id', 'quantity']);
  assert.equal(rows.length, 5002);
  assert.equal(rows[0].quantity, null);
  assert.equal(rows[1].quantity, 0);
  assert.equal(rows[1].record_count, 2);
  assert.deepEqual(
    calls.map((call) => call.offset),
    [0, 5000],
  );
});

test('changed Cube page totals cannot become a partial metric', async () => {
  const reader = createCubeReader(async (_name, args) => {
    const offset = args.queries[0].query.offset;
    const count = offset ? 3 : 5000;
    return JSON.stringify({
      datasets: [
        {
          dataStatus: 'ok',
          rows: Array.from({ length: count }, (_, index) => ({
            'source.id': String(offset + index),
          })),
          rowCount: count,
          totalRowCount: offset ? 5003 : 5002,
          hasMorePages: !offset,
        },
      ],
    });
  }, new AbortController().signal);
  await assert.rejects(
    reader.read('source', ['id'], [], { observations: false }),
    /SOURCE_CHANGED/,
  );
});

test('missing Cube members remain unavailable rather than fabricated nulls', async () => {
  const reader = createCubeReader(
    async () =>
      JSON.stringify({
        datasets: [
          { dataStatus: 'ok', rows: [{}], rowCount: 1, totalRowCount: 1, hasMorePages: false },
        ],
      }),
    new AbortController().signal,
  );
  await assert.rejects(reader.read('source', ['quantity']), /MISSING_FIELD/);
});
