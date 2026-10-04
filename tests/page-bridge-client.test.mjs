import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const { outputFiles } = await build({ entryPoints: ['src/page-interaction/page-bridge/client.ts'], bundle: true, write: false, platform: 'browser', format: 'esm' });
const { startPageBridgeClient } = await import('data:text/javascript;base64,' + Buffer.from(outputFiles[0].text).toString('base64'));

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
  assert.deepEqual(calls.at(-1), { sessionId: 'owned', toolMessages: [], catalog: null });
  assert.equal(calls.length, 2);
});

test('a page without an associated Session does not poll or close another page', async () => {
  let calls = 0;
  const dispose = startPageBridgeClient({ endpoint: 'page', sessionId: null, initialDelayMs: 0, request: async () => { calls++; return { events: [] } }, apply: () => ({ applied: true }) });
  await new Promise(resolve => setTimeout(resolve, 10));
  dispose();
  assert.equal(calls, 0);
});
