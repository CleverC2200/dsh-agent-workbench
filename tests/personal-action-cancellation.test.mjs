import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

// Exercise the actual shared bridge, including the public refresh apply wrapper.
test('delivered invocation and page apply carry cancellation into pending transitions', async (t) => {
  const listeners = new Map(),
    sent = [],
    parent = { postMessage() {} };
  const previousWindow = globalThis.window,
    previousDocument = globalThis.document;
  globalThis.window = {
    parent,
    addEventListener: (name, fn) => listeners.set(name, fn),
    dispatchEvent() {},
  };
  globalThis.document = { referrer: 'https://host.fixture/page' };
  try {
    const output = await build({
      entryPoints: ['business/shared/channel.js'],
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'node',
    });
    const bridge = await import(
      'data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].text).toString('base64')
    );
    const port = { postMessage: (message) => sent.push(message), start() {} };
    listeners.get('message')({
      source: parent,
      origin: 'https://host.fixture',
      data: {
        protocol: 'gea-html-v2',
        type: 'connect',
        context: { session: 'fixture-session', plugin: 'inventory-personal' },
      },
      ports: [port],
    });
    const abort = new AbortController();
    const publishing = bridge.publish({ loading: true }, { signal: abort.signal });
    await new Promise((done) => setImmediate(done));
    const request = sent.find(
      (message) => message.type === 'request' && message.method === 'context',
    );
    const rejected = assert.rejects(publishing, { name: 'AbortError' });
    abort.abort();
    await rejected;
    assert.deepEqual(
      sent.find((message) => message.type === 'cancel' && message.id === request.id),
      { type: 'cancel', id: request.id, session: request.session },
    );
    port.onmessage({
      data: { type: 'response', id: request.id, result: { accepted: true } },
    });
    const switching = bridge.publish({ loading: true });
    const switched = assert.rejects(switching, /页面会话已切换/);
    await new Promise((done) => setImmediate(done));
    const oldRequest = sent.filter((message) => message.type === 'request').at(-1);
    port.onmessage({
      data: {
        type: 'context',
        context: { session: 'new-session', plugin: 'inventory-personal' },
      },
    });
    await switched;
    assert.deepEqual(
      sent.find((message) => message.type === 'cancel' && message.id === oldRequest.id),
      { type: 'cancel', id: oldRequest.id, session: 'fixture-session' },
    );
    port.onmessage({
      data: {
        type: 'context',
        context: { session: 'fixture-session', plugin: 'inventory-personal' },
      },
    });
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const timeout = bridge.publish({ loading: true });
    const timedOut = assert.rejects(timeout, /业务请求超时/);
    await new Promise((done) => setImmediate(done));
    const timedRequest = sent.filter((message) => message.type === 'request').at(-1);
    t.mock.timers.tick(120000);
    await timedOut;
    t.mock.timers.reset();
    assert.deepEqual(
      sent.find((message) => message.type === 'cancel' && message.id === timedRequest.id),
      { type: 'cancel', id: timedRequest.id, session: 'fixture-session' },
    );

    for (const kind of ['filter', 'refresh', 'apply-refresh']) {
      let release,
        signal,
        committed = false;
      const stop = bridge.action(
        kind === 'filter' ? 'filter' : 'refresh',
        'fixture',
        async (_args, options) => {
          signal = options.signal;
          await new Promise((done) => (release = done));
          signal.throwIfAborted();
          committed = true;
        },
      );
      const id = 'cancelled-' + kind;
      port.onmessage({
        data:
          kind === 'apply-refresh'
            ? {
                type: 'apply',
                session: 'fixture-session',
                toolCallId: id,
                args: { kind: 'invoke', target: 'control:refresh' },
              }
            : {
                type: 'invoke',
                session: 'fixture-session',
                id,
                name: kind,
                arguments: {},
              },
      });
      await new Promise((done) => setImmediate(done));
      assert.ok(signal instanceof AbortSignal);
      port.onmessage({
        data: {
          type: 'cancel',
          session: 'fixture-session',
          ...(kind === 'apply-refresh' ? { toolCallId: id } : { id }),
        },
      });
      assert.equal(signal.aborted, true);
      release();
      await new Promise((done) => setImmediate(done));
      assert.equal(committed, false);
      const result = sent.find((message) => message.toolCallId === id || message.id === id);
      assert.ok(result.error);
      if (kind === 'apply-refresh') assert.equal(result.applied, false);
      stop();
    }
  } finally {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
  }
});
