import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const { outputFiles } = await build({ entryPoints: ['src/page-interaction/page-bridge/client.ts'], bundle: true, write: false, platform: 'browser', format: 'esm' });
const { startPageBridgeClient } = await import('data:text/javascript;base64,' + Buffer.from(outputFiles[0].text).toString('base64'));
const host = await build({ entryPoints: ['src/page-bridge/host.ts'], bundle: true, write: false, platform: 'node', format: 'esm' });
const { createPageBridge } = await import('data:text/javascript;base64,' + Buffer.from(host.outputFiles[0].text).toString('base64'));

test('disposing the page cancels its active application and does not publish a late success', async () => {
  let resolveApply;
  let signal;
  const calls = [];
  const dispose = startPageBridgeClient({ endpoint: 'owned-page', sessionId: 'owned', initialDelayMs: 0, pollMs: 1000, closeOnDispose: true,
    request: async (_endpoint, payload) => { calls.push(payload); return { events: calls.length === 1 ? [
      { type: 'TOOL_CALL_START', toolCallId: 'selected', toolCallName: 'original_apply' },
      { type: 'TOOL_CALL_ARGS', toolCallId: 'selected', delta: '{"targets":["row:1"]}' },
      { type: 'TOOL_CALL_END', toolCallId: 'selected' },
    ] : [] } },
    apply: (_args, _meta, current) => { signal = current; return new Promise(resolve => { resolveApply = resolve }) },
  });
  await new Promise(resolve => setTimeout(resolve, 20));
  dispose();
  assert.equal(signal.aborted, true);
  resolveApply({ applied: true });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(calls.at(-1), { sessionId: 'owned', toolMessages: [], catalog: null, pageSource:'self-report' });
  assert.equal(calls.length, 2);
});

test('a page without an associated Session does not poll or close another page', async () => {
  let calls = 0;
  const dispose = startPageBridgeClient({ endpoint: 'page', sessionId: null, initialDelayMs: 0, request: async () => { calls++; return { events: [] } }, apply: () => ({ applied: true }) });
  await new Promise(resolve => setTimeout(resolve, 10));
  dispose();
  assert.equal(calls, 0);
});

for (const lostResponse of [false, true]) test(`receipts survive ${lostResponse ? 'a response lost after Host acceptance' : 'a request failing before Host acceptance'} without repeating the action`, { timeout: 2000 }, async t => {
  const bridge = createPageBridge();
  const call = bridge.enqueue('owned', { toolCallName: 'original_apply', args: { row: 1 } });
  const delivered = Promise.withResolvers();
  const batches = [];
  const results = [];
  let applies = 0;
  let failed = false;
  const stop = startPageBridgeClient({ endpoint: 'page', sessionId: 'owned', initialDelayMs: 0, pollMs: 1, closeOnDispose: false,
    request: async (_endpoint, payload) => {
      batches.push(payload.toolMessages);
      const firstReceipt = payload.toolMessages.length && !failed;
      if (firstReceipt && !lostResponse) { failed = true; throw Error('transport failed'); }
      const events = bridge.pull(payload.sessionId, payload.toolMessages);
      const result = bridge.take('owned', call);
      if (result) results.push(result);
      if (firstReceipt) { failed = true; throw Error('response lost'); }
      if (payload.toolMessages.length) delivered.resolve();
      return { events };
    },
    apply: () => { applies++; return { applied: true }; },
  });
  t.after(stop);
  await delivered.promise;
  stop();
  assert.equal(applies, 1);
  const receipts = batches.filter(batch => batch.length);
  assert.equal(receipts.length, 2);
  assert.deepEqual(receipts[1], receipts[0], 'delivery retries the same receipt');
  assert.equal(results.length, 1, 'the Host accepts exactly one result even if it was already consumed');
  assert.equal(JSON.parse(results[0].content).applied, true);
  assert.deepEqual(bridge.pull('owned', []), []);
});

test('disposing while a receipt request fails stops delivery without resurrecting the cancelled Host call', { timeout: 2000 }, async t => {
  const bridge = createPageBridge();
  const call = bridge.enqueue('owned', { toolCallName: 'apply', args: {} });
  const sending = Promise.withResolvers();
  const response = Promise.withResolvers();
  let requests = 0;
  const stop = startPageBridgeClient({ endpoint: 'page', sessionId: 'owned', initialDelayMs: 0, pollMs: 1, closeOnDispose: false,
    request: async (_endpoint, payload) => {
      requests++;
      if (payload.toolMessages.length) { sending.resolve(); return response.promise; }
      return { events: bridge.pull('owned', payload.toolMessages) };
    }, apply: () => ({ applied: true }),
  });
  t.after(stop);
  await sending.promise;
  bridge.cancel('owned', call);
  stop();
  response.reject(Error('transport failed'));
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(requests, 2);
  assert.equal(bridge.take('owned', call), undefined);
  assert.deepEqual(bridge.pull('owned', []), []);
});
