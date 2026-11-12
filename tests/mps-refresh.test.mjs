import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';

const { outputFiles } = await build({
  entryPoints: ['static/mps/source/context.js'],
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
});

test('MPS refresh returns a JSON acknowledgement before reloading the owned page', async () => {
  const listeners = new Map(),
    messages = [],
    timers = [];
  let reloads = 0;
  const parent = { postMessage() {} };
  const window = {
    parent,
    location: {
      reload: () => {
        reloads++;
      },
    },
    addEventListener: (name, callback) => {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(callback);
    },
    dispatchEvent() {},
  };
  runInNewContext(outputFiles[0].text, {
    window,
    document: { referrer: 'https://workbench.test/' },
    setTimeout: (callback) => {
      timers.push(callback);
      return timers.length;
    },
    clearTimeout() {},
    URL,
    AbortController,
    queueMicrotask,
    Event,
    console,
  });
  const port = { start() {}, close() {}, postMessage: (message) => messages.push(message) };
  for (const listener of listeners.get('message'))
    listener({
      source: parent,
      origin: 'https://workbench.test',
      data: {
        protocol: 'gea-html-v2',
        type: 'connect',
        context: { plugin: 'inventory-mps', session: 'owned-session' },
      },
      ports: [port],
    });
  await new Promise(setImmediate);
  assert.ok(messages.some((message) => message.type === 'register' && message.name === 'refresh'));
  port.onmessage({
    data: {
      type: 'invoke',
      id: 'refresh-call',
      session: 'owned-session',
      name: 'refresh',
      arguments: {},
    },
  });
  await new Promise(setImmediate);
  const receipt = messages.find(
    (message) => message.type === 'invoked' && message.id === 'refresh-call',
  );
  assert.ok(receipt);
  assert.deepEqual(JSON.parse(JSON.stringify(receipt.result)), { reloadScheduled: true });
  assert.equal(reloads, 0, 'the acknowledgement must be posted before navigation');
  assert.equal(timers.length, 1);
  timers[0]();
  assert.equal(reloads, 1);
});
