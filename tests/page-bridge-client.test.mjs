import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { mountReportImport } from '../prototypes/inventory-orderworkbench/report-import.mjs';
const { outputFiles } = await build({
  entryPoints: ['src/page-interaction/page-bridge/client.ts'],
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'esm',
});
const { startPageBridgeClient } = await import(
  'data:text/javascript;base64,' + Buffer.from(outputFiles[0].text).toString('base64')
);
const host = await build({
  entryPoints: ['src/page-bridge/host.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { createPageBridge } = await import(
  'data:text/javascript;base64,' + Buffer.from(host.outputFiles[0].text).toString('base64')
);

test(
  'report preview returns a page receipt before slow validation and later opens a valid confirmation',
  { timeout: 3000 },
  async (t) => {
    const dom = new JSDOM('<div class="wb-summary-actions"></div>');
    t.after(() => dom.window.close());
    const period = { type: 'WEEK', start: '2026-10-19', end: '2026-10-26' };
    const batch = {
      batchId: 'bridge-preview-test',
      period,
      summary: { risk: '联调记录' },
      unmet: [],
      short: [],
      long: [],
    };
    const backend = Promise.withResolvers();
    let readSignal;
    const importer = mountReportImport({
      document: dom.window.document,
      state: () => ({ ready: true, key: 'week', period }),
      preview: (_batch, signal) => {
        readSignal = signal;
        return backend.promise;
      },
      commit: async () => assert.fail('a preview must not write'),
      changed() {},
      ask() {},
    });
    t.after(() => importer.dispose());
    const bridge = createPageBridge();
    const call = bridge.enqueue('owned', {
      toolCallName: 'apply',
      args: {
        kind: 'invoke',
        target: 'report:import-preview',
        action: 'preview',
        value: JSON.stringify(batch),
      },
    });
    const stop = startPageBridgeClient({
      endpoint: 'page',
      sessionId: 'owned',
      initialDelayMs: 0,
      pollMs: 1,
      closeOnDispose: false,
      applyTimeoutMs: 1000,
      request: async (_endpoint, payload) => ({
        events: bridge.pull(payload.sessionId, payload.toolMessages),
      }),
      apply: async (args, _meta, signal) => {
        await importer.apply(args, signal);
        return { applied: true };
      },
    });
    t.after(stop);
    const receipt = await bridge.wait('owned', call, 500, 1);
    assert.ok(receipt, 'waiting for backend validation must not consume the Host receipt deadline');
    assert.equal(JSON.parse(receipt.content).applied, true);
    assert.equal(importer.context().processing, true);
    stop();
    assert.equal(readSignal.aborted, false);
    backend.resolve({ batch, previewId: 'validated', canCommit: true });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(importer.context().previewId, 'validated');
    assert.equal(importer.context().awaitingUserConfirmation, true);
  },
);

test('disposing the page cancels its active application and does not publish a late success', async () => {
  let resolveApply;
  let signal;
  const calls = [];
  const dispose = startPageBridgeClient({
    endpoint: 'owned-page',
    sessionId: 'owned',
    initialDelayMs: 0,
    pollMs: 1000,
    closeOnDispose: true,
    request: async (_endpoint, payload) => {
      calls.push(payload);
      return {
        events:
          calls.length === 1
            ? [
                { type: 'TOOL_CALL_START', toolCallId: 'selected', toolCallName: 'original_apply' },
                { type: 'TOOL_CALL_ARGS', toolCallId: 'selected', delta: '{"targets":["row:1"]}' },
                { type: 'TOOL_CALL_END', toolCallId: 'selected' },
              ]
            : [],
      };
    },
    apply: (_args, _meta, current) => {
      signal = current;
      return new Promise((resolve) => {
        resolveApply = resolve;
      });
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  dispose();
  assert.equal(signal.aborted, true);
  resolveApply({ applied: true });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(calls.at(-1), {
    sessionId: 'owned',
    toolMessages: [],
    catalog: null,
    pageSource: 'self-report',
  });
  assert.equal(calls.length, 2);
});

test('a page without an associated Session does not poll or close another page', async () => {
  let calls = 0;
  const dispose = startPageBridgeClient({
    endpoint: 'page',
    sessionId: null,
    initialDelayMs: 0,
    request: async () => {
      calls++;
      return { events: [] };
    },
    apply: () => ({ applied: true }),
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  dispose();
  assert.equal(calls, 0);
});

for (const lostResponse of [false, true])
  test(
    `receipts survive ${lostResponse ? 'a response lost after Host acceptance' : 'a request failing before Host acceptance'} without repeating the action`,
    { timeout: 2000 },
    async (t) => {
      const bridge = createPageBridge();
      const call = bridge.enqueue('owned', { toolCallName: 'original_apply', args: { row: 1 } });
      const delivered = Promise.withResolvers();
      const batches = [];
      const results = [];
      let applies = 0;
      let failed = false;
      const stop = startPageBridgeClient({
        endpoint: 'page',
        sessionId: 'owned',
        initialDelayMs: 0,
        pollMs: 1,
        closeOnDispose: false,
        request: async (_endpoint, payload) => {
          batches.push(payload.toolMessages);
          const firstReceipt = payload.toolMessages.length && !failed;
          if (firstReceipt && !lostResponse) {
            failed = true;
            throw Error('transport failed');
          }
          const events = bridge.pull(payload.sessionId, payload.toolMessages);
          const result = bridge.take('owned', call);
          if (result) results.push(result);
          if (firstReceipt) {
            failed = true;
            throw Error('response lost');
          }
          if (payload.toolMessages.length) delivered.resolve();
          return { events };
        },
        apply: () => {
          applies++;
          return { applied: true };
        },
      });
      t.after(stop);
      await delivered.promise;
      stop();
      assert.equal(applies, 1);
      const receipts = batches.filter((batch) => batch.length);
      assert.equal(receipts.length, 2);
      assert.deepEqual(receipts[1], receipts[0], 'delivery retries the same receipt');
      assert.equal(
        results.length,
        1,
        'the Host accepts exactly one result even if it was already consumed',
      );
      assert.equal(JSON.parse(results[0].content).applied, true);
      assert.deepEqual(bridge.pull('owned', []), []);
    },
  );

test(
  'disposing while a receipt request fails stops delivery without resurrecting the cancelled Host call',
  { timeout: 2000 },
  async (t) => {
    const bridge = createPageBridge();
    const call = bridge.enqueue('owned', { toolCallName: 'apply', args: {} });
    const sending = Promise.withResolvers();
    const response = Promise.withResolvers();
    let requests = 0;
    const stop = startPageBridgeClient({
      endpoint: 'page',
      sessionId: 'owned',
      initialDelayMs: 0,
      pollMs: 1,
      closeOnDispose: false,
      request: async (_endpoint, payload) => {
        requests++;
        if (payload.toolMessages.length) {
          sending.resolve();
          return response.promise;
        }
        return { events: bridge.pull('owned', payload.toolMessages) };
      },
      apply: () => ({ applied: true }),
    });
    t.after(stop);
    await sending.promise;
    bridge.cancel('owned', call);
    stop();
    response.reject(Error('transport failed'));
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(requests, 2);
    assert.equal(bridge.take('owned', call), undefined);
    assert.deepEqual(bridge.pull('owned', []), []);
  },
);

test(
  'rebinding a page to another Session revokes its pending receipt and keeps the new Session independent',
  { timeout: 2000 },
  async (t) => {
    const bridge = createPageBridge();
    const oldCall = bridge.enqueue('old', { toolCallName: 'apply', args: { row: 'old' } });
    const sending = Promise.withResolvers();
    const oldResponse = Promise.withResolvers();
    const newDelivered = Promise.withResolvers();
    const payloads = [];
    const actions = [];
    const request = async (_endpoint, payload) => {
      payloads.push(payload);
      if (payload.sessionId === 'old' && payload.toolMessages.length) {
        sending.resolve();
        await oldResponse.promise;
      }
      const events = bridge.pull(payload.sessionId, payload.toolMessages);
      if (payload.sessionId === 'new' && payload.toolMessages.length) newDelivered.resolve();
      return { events };
    };
    const options = {
      endpoint: 'page',
      initialDelayMs: 0,
      pollMs: 1,
      closeOnDispose: false,
      request,
      apply: (args) => {
        actions.push(args.row);
        return { applied: true };
      },
    };
    const stopOld = startPageBridgeClient({ ...options, sessionId: 'old' });
    t.after(stopOld);
    await sending.promise;
    bridge.cancel('old', oldCall);
    stopOld();
    const newCall = bridge.enqueue('new', { toolCallName: 'apply', args: { row: 'new' } });
    const stopNew = startPageBridgeClient({ ...options, sessionId: 'new' });
    t.after(stopNew);
    oldResponse.resolve();
    await newDelivered.promise;
    stopNew();
    assert.deepEqual(actions, ['old', 'new']);
    assert.equal(bridge.take('old', oldCall), undefined);
    assert.equal(JSON.parse(bridge.take('new', newCall).content).applied, true);
    assert.equal(payloads.filter((payload) => payload.sessionId === 'old').length, 2);
    assert.ok(
      payloads
        .filter((payload) => payload.sessionId === 'new')
        .every((payload) =>
          payload.toolMessages.every((message) => message.toolCallId === newCall),
        ),
    );
  },
);
