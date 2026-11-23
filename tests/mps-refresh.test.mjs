import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';
import { pageActionEffect } from '../src/page-bridge/catalog.ts';

const { outputFiles } = await build({
  stdin: {
    contents:
      "import { registerMpsRefresh } from './static/mps/source/context.js'; registerMpsRefresh(() => window.startRecalculation());",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
});

test('both MPS refresh routes start a recalculation on the connected page', async () => {
  const listeners = new Map(),
    messages = [],
    timers = [];
  let reloads = 0,
    recalculations = 0;
  const parent = { postMessage() {} };
  const window = {
    parent,
    startRecalculation: () => recalculations++,
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
  const catalog = messages.findLast((message) => message.type === 'catalog');
  const args = { kind: 'invoke', target: 'control:refresh' };
  assert.equal(pageActionEffect(catalog, args), 'view');
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
  assert.deepEqual(JSON.parse(JSON.stringify(receipt.result)), { status: 'recalculation-started' });
  assert.equal(recalculations, 1);
  port.onmessage({
    data: {
      type: 'apply',
      session: 'owned-session',
      toolCallId: 'catalog-refresh',
      args,
    },
  });
  await new Promise(setImmediate);
  const applied = messages.find(
    (message) => message.type === 'applied' && message.toolCallId === 'catalog-refresh',
  );
  assert.equal(applied?.applied, true);
  assert.equal(recalculations, 2);
  assert.equal(reloads, 0);
  assert.equal(timers.length, 0);
});
