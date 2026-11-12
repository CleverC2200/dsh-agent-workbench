import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { addFulfillmentPacketQueries } from '../business/inventory-orderfulfillment/packet-queries.mjs';
import { createFulfillmentReader } from '../prototypes/inventory-orderfulfillment/live-model.mjs';
import { createFulfillmentDerivedCache } from '../prototypes/inventory-orderfulfillment/derived-cache.mjs';
import {
  startFulfillmentCardReads,
  fulfillmentCardQueries,
} from '../prototypes/inventory-orderfulfillment/paged-source.mjs';
import { computeOrderMetrics } from '../prototypes/inventory-orderfulfillment/order-metrics.mjs';

const original = JSON.parse(
  readFileSync('business/inventory-orderfulfillment/sql.config.json', 'utf8'),
);
const config = addFulfillmentPacketQueries(original);
const filters = Object.fromEntries(
  Object.values(original.queries['orders.facts.count'].parameterSpec).map((spec) => [
    spec.name,
    spec.name === 'start' ? '2026-11-02' : spec.name === 'end_exclusive' ? '2026-11-03' : null,
  ]),
);
const columns = original.queries['orders.facts'].resultColumns;
const scalar = (value) =>
  value === null ? 'N' : 'V' + Buffer.byteLength(String(value)) + ':' + value;
function packets(rows) {
  const result = [];
  for (let offset = 0; offset < rows.length; offset += 64) {
    const batch = rows.slice(offset, offset + 64);
    result.push({
      packet_index: offset / 64,
      packet_count: batch.length,
      packet_scope_total: rows.length,
      packet_rows: batch
        .map((row, index) =>
          [offset + index + 1, ...columns.map((key) => row[key])].map(scalar).join(''),
        )
        .reverse(),
    });
  }
  return result;
}
const row = (index) => ({
  ...Object.fromEntries(columns.map((key) => [key, null])),
  cust_order_no: '00' + index,
  cust_code: '01',
  material_code: '02',
  executeorderno: 'E' + index,
  executeorderlineno: '1',
  belong_base: '郑州',
  cust_name: '客户😀"\\:测试',
  detailstatus: '10',
  is_stat: '1',
  prapare_order_status: '备单中',
  packingunitmain: 'CS',
  order_qty: '100',
  packingunitconvertrate: '8',
  pack_unitqty: '50',
  qtyallocated: '400',
});

test('packet transport preserves complete rows, duplicates, UTF-8, nulls and computed metrics with one small-scope read', async () => {
  const rows = Array.from({ length: 870 }, (_, index) => row(index));
  rows.push({ ...rows[0] });
  const calls = [];
  const reader = createFulfillmentReader(config, async (_request, options) => {
    calls.push(options);
    assert.equal(options.queryId, 'orders.facts.packets');
    return {
      rows: packets(rows),
      configVersion: 'v1',
      returnedColumns: config.queries[options.queryId].resultColumns,
      rejectedColumns: [],
    };
  });
  const result = await reader.all('orders.facts', filters);
  assert.deepEqual(result.rows, rows);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].values.page_size, 32);
  assert.equal(result.total, rows.length);
  const now = Date.parse('2026-11-03T00:00:00Z');
  assert.deepEqual(computeOrderMetrics(result.rows, { now }), computeOrderMetrics(rows, { now }));
  assert.deepEqual(original.queries['orders.facts'].resultColumns, columns);
});

test('multi-page packets keep paired counts and reject missing, corrupt or denied source fields', async () => {
  for (const fault of ['none', 'missing', 'corrupt', 'permission', 'config', 'count']) {
    const rows = Array.from({ length: 4200 }, (_, index) => row(index));
    const all = packets(rows);
    let counts = 0;
    const reader = createFulfillmentReader(config, async (_request, options) => {
      if (options.queryId.endsWith('.count')) {
        counts++;
        return {
          rows: [{ total: all.length + (fault === 'count' && counts > 1 ? 1 : 0) }],
          configVersion: 'v1',
        };
      }
      const offset = options.values.offset;
      const batch = structuredClone(all.slice(offset, offset + options.values.page_size));
      if (fault === 'missing' && offset > 0) batch[0].packet_count--;
      if (fault === 'corrupt') batch[0].packet_rows[0] = 'invalid';
      return {
        rows: batch,
        configVersion: fault === 'config' && offset > 0 ? 'v2' : 'v1',
        returnedColumns: config.queries[options.queryId].resultColumns,
        rejectedColumns: fault === 'permission' ? ['qtyallocated'] : [],
      };
    });
    if (fault === 'none') {
      assert.deepEqual((await reader.all('orders.facts', filters)).rows, rows);
      assert.equal(counts, 2);
    } else await assert.rejects(reader.all('orders.facts', filters));
  }
});

test('derived results invalidate on new facts, supplements and time-sensitive deadlines', () => {
  let now = 0,
    computations = 0;
  const cache = createFulfillmentDerivedCache({ maxAge: 1000, now: () => now });
  const facts = {},
    supplement = {};
  const calculate = () => ++computations;
  assert.equal(cache(facts, supplement, 'base', calculate), 1);
  assert.equal(cache(facts, supplement, 'base', calculate), 1);
  assert.equal(cache(facts, supplement, 'province', calculate), 2);
  now = 1000;
  assert.equal(cache(facts, supplement, 'base', calculate), 3);
  assert.equal(cache(facts, {}, 'base', calculate), 4);
  assert.equal(cache({}, supplement, 'base', calculate), 5);
});

test('independent card reads overlap source metadata and consume cancellation and failures safely', async () => {
  const started = [],
    controller = new AbortController();
  let release;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  const read = async (id) => {
    started.push(id);
    await held;
    controller.signal.throwIfAborted();
    return id;
  };
  const requests = startFulfillmentCardReads(
    { all: read, summary: read },
    filters,
    controller.signal,
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(started, fulfillmentCardQueries);
  controller.abort();
  release();
  const result = await Promise.all(requests.values());
  assert.ok(result.every((part) => part.status === 'rejected'));
});
