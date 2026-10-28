import test from 'node:test';
import assert from 'node:assert/strict';
import { fulfillmentSimulationRequest } from '../src/fulfillment-simulation-transport.ts';

test('simulation transport is restricted to the local fulfillment page and fixed endpoint', async (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'location');
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: { origin: 'http://127.0.0.1:3198' },
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'location', previous);
    else delete globalThis.location;
  });
  let request;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ state: { simulation: true } }) };
  });
  const input = { operation: 'state', token: 'local-test-token', runId: 'run' };
  const signal = new AbortController().signal;
  for (const page of ['inventory-customer', 'inventory-orderworkbench'])
    await assert.rejects(fulfillmentSimulationRequest(page, input, signal), /DENIED/);
  await assert.rejects(
    fulfillmentSimulationRequest(
      'inventory-orderfulfillment',
      { ...input, operation: 'sql' },
      signal,
    ),
    /DENIED/,
  );
  assert.equal(request, undefined);
  await fulfillmentSimulationRequest('inventory-orderfulfillment', input, signal);
  assert.equal(request.url, 'http://127.0.0.1:3197/client');
  assert.equal(request.options.signal, signal);
  assert.deepEqual(JSON.parse(request.options.body), input);
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: { origin: 'https://production.invalid' },
  });
  await assert.rejects(
    fulfillmentSimulationRequest('inventory-orderfulfillment', input, signal),
    /DENIED/,
  );
});
