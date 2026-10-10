import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
test('cancelled bridge calls stop pending work without cancelling unrelated calls', async () => {
  const previousDocument = globalThis.document;
  globalThis.document = { referrer: 'https://host.test', body: {} };
  const previous = globalThis.window,
    events = new EventTarget(),
    messages = [];
  const port = { postMessage: (m) => messages.push(m), start() {} };
  globalThis.window = Object.assign(events, { parent: { postMessage() {} } });
  try {
    const bundled = await build({
      entryPoints: [fileURLToPath(new URL('../src/channel.js', import.meta.url))],
      bundle: true,
      platform: 'node',
      format: 'esm',
      write: false,
    });
    const source = bundled.outputFiles[0].text;
    const channel = await import(
      'data:text/javascript;base64,' + Buffer.from(source).toString('base64')
    );
    const event = new Event('message');
    Object.assign(event, {
      source: window.parent,
      origin: 'https://host.test',
      data: {
        protocol: 'gea-html-v2',
        type: 'connect',
        context: { plugin: 'inventory-qll', session: 'test-session' },
      },
      ports: [port],
    });
    window.dispatchEvent(event);
    const controller = new AbortController();
    const cancelled = channel.call('sql', { sql: 'one' }, { signal: controller.signal });
    const other = channel.call('sql', { sql: 'two' });
    await Promise.resolve();
    controller.abort(Error('switched page'));
    await assert.rejects(cancelled, /switched page/);
    const requests = messages.filter((m) => m.type === 'request');
    assert.equal(requests.length, 2);
    assert.deepEqual(
      messages.filter((m) => m.type === 'cancel').map((m) => m.id),
      [requests[0].id],
    );
    port.onmessage({
      data: { type: 'response', id: requests[1].id, result: { rows: [{ value: 2 }] } },
    });
    assert.deepEqual(await other, { rows: [{ value: 2 }] });
  } finally {
    globalThis.window = previous;
    globalThis.document = previousDocument;
  }
});
