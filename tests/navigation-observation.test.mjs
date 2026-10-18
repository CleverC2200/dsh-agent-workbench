import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import React from 'react';
import { JSDOM } from 'jsdom';
import { zh } from '../src/client/locales.ts';
import { createBusinessIdentityReader } from '../../dsh-gea-plugin/src/business-identity-client.ts';

const bundle = await build({
  stdin: {
    contents: "export {DesktopNavigation} from './src/client/desktop-navigation.tsx';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  external: ['react', 'react/jsx-runtime'],
});
const module = { exports: {} };
new Function('module', 'exports', 'require', bundle.outputFiles[0].text)(
  module,
  module.exports,
  createRequire(import.meta.url),
);
const { DesktopNavigation } = module.exports;

async function mount(t, fetch, initial, open = async () => {}, observation) {
  const dom = new JSDOM('<main id="root"></main>', { pretendToBeVisual: true });
  const saved = [
    'window',
    'document',
    'Node',
    'navigator',
    'IS_REACT_ACT_ENVIRONMENT',
    'fetch',
  ].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  for (const [key, value] of [
    ['window', dom.window],
    ['document', dom.window.document],
    ['Node', dom.window.Node],
    ['navigator', dom.window.navigator],
    ['IS_REACT_ACT_ENVIRONMENT', true],
    ['fetch', fetch],
  ])
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(document.getElementById('root'));
  let snapshot = initial;
  const listeners = new Set();
  const identity =
    typeof initial === 'function'
      ? initial
      : {
          getSnapshot: () => snapshot,
          subscribe: (fn) => (listeners.add(fn), () => listeners.delete(fn)),
        };
  const render = () =>
    React.act(async () =>
      root.render(
        React.createElement(DesktopNavigation, {
          t: (key) => zh[key],
          identity,
          open,
          observation,
          login() {},
        }),
      ),
    );
  await render();
  t.after(async () => {
    await React.act(() => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  return {
    root,
    render,
    update: (next) =>
      React.act(async () => {
        snapshot = next;
        listeners.forEach((fn) => fn());
      }),
  };
}
const confirmed = {
  state: 'confirmed',
  scope: 'A',
  subject: 'user-A',
  status: { authenticated: true },
};
const idle = () => Response.json({ ok: true, value: { state: 'idle' } });
const tick = (t, ms) =>
  React.act(async () => {
    t.mock.timers.tick(ms);
  });

test('navigation waits for the shared initial identity and does not duplicate its observation errors', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1000 });
  const reader = createBusinessIdentityReader();
  let identityRequests = 0,
    polls = 0,
    opens = 0,
    finish = 0;
  const fetch = async (path) => {
    if (path === '/api/gea-html/identity') {
      if (++identityRequests === 1) throw new TypeError('connection unavailable');
      return Response.json({
        scope: 'A',
        subject: 'user-A',
        status: {
          environment: 'test',
          environments: ['test'],
          authenticated: true,
          loginState: 'authenticated',
          user: null,
        },
      });
    }
    if (path.endsWith('/finish')) finish++;
    if (path.endsWith('/poll')) polls++;
    return idle();
  };
  await mount(t, fetch, reader, async () => {
    opens++;
  });
  assert.equal(polls, 0);
  let stop;
  await React.act(async () => {
    stop = reader.start();
  });
  t.after(() => stop());
  assert.equal(reader.getSnapshot().state, 'unknown');
  assert.equal(polls, 0);
  assert.equal(document.querySelector('[role="alert"]'), null);
  await tick(t, 1000);
  assert.equal(reader.getSnapshot().state, 'confirmed');
  assert.equal(polls, 1);
  assert.equal(opens, 0);
  assert.equal(finish, 0);
  assert.equal(document.querySelector('[role="alert"]'), null);
  await React.act(async () => {
    globalThis.fetch = async () => {
      throw new TypeError('offline');
    };
    await assert.rejects(reader.refresh());
  });
  assert.ok(reader.getSnapshot().error);
  assert.equal(document.querySelector('[role="alert"]'), null);
  await tick(t, 1500);
  assert.equal(polls, 1, 'identity observation failure pauses navigation without its own error');
});

test('navigation startup budget expires at five seconds and valid recovery ends it permanently', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1000 });
  let mode = 'offline',
    opens = 0;
  await mount(
    t,
    async () => (mode === 'offline' ? Response.json({}, { status: 503 }) : idle()),
    confirmed,
    async () => {
      opens++;
    },
  );
  assert.equal(document.querySelector('[role="alert"]'), null);
  await tick(t, 4999);
  assert.equal(document.querySelector('[role="alert"]'), null);
  await tick(t, 1);
  assert.match(document.querySelector('[role="alert"]').textContent, /消息服务暂不可用/);
  assert.equal(
    document.querySelector('[role="alert"]').dataset.navigationCode,
    'NAVIGATION_HTTP_503',
  );
  mode = 'ok';
  await tick(t, 1500);
  assert.equal(document.querySelector('[role="alert"]'), null);
  mode = 'offline';
  await tick(t, 1500);
  assert.match(document.querySelector('[role="alert"]').textContent, /消息服务暂不可用/);
  assert.equal(opens, 0);
});

test('a real open failure stays immediate and identity changes cancel a late operation without an error', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1000 });
  const pending = Promise.withResolvers();
  let attempt = 0,
    finished = 0,
    signal;
  const ui = await mount(
    t,
    async (path) => {
      if (path.endsWith('/finish')) finished++;
      return Response.json({
        ok: true,
        value: { state: 'ready', receipt: 'receipt-A', panel: 'gea-inbox' },
      });
    },
    confirmed,
    async (_target, current) => {
      signal = current;
      if (++attempt === 1) throw Error('failed');
      await pending.promise;
    },
  );
  assert.equal(document.querySelector('[role="alert"]').dataset.navigationStage, 'open');
  assert.equal(finished, 0);
  await ui.update({ ...confirmed, scope: 'B', subject: 'user-B' });
  assert.equal(attempt, 2);
  await ui.update({ ...confirmed, scope: 'B', subject: 'user-B', error: 'observation failed' });
  assert.equal(signal.aborted, true);
  await React.act(async () => pending.reject(Error('late failure')));
  assert.equal(document.querySelector('[role="alert"]'), null);
  assert.equal(finished, 0);
});

test('a remounted navigation keeps the completed service observation and does not renew startup recovery', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1000 });
  const observation = { deadline: 6000, ended: false };
  let mode = 'ok';
  const ui = await mount(
    t,
    async () => (mode === 'ok' ? idle() : Response.json({}, { status: 503 })),
    confirmed,
    async () => {},
    observation,
  );
  assert.equal(document.querySelector('[role="alert"]'), null);
  await React.act(async () => ui.root.render(null));
  mode = 'offline';
  await ui.render();
  assert.match(document.querySelector('[role="alert"]').textContent, /消息服务暂不可用/);
});

test('invalid navigation responses and explicit business denial remain immediate and diagnostic', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1000 });
  let response = Response.json({ ok: true, value: { state: 'ready', panel: 'gea-inbox' } });
  await mount(t, async () => response, confirmed);
  assert.equal(
    document.querySelector('[role="alert"]').dataset.navigationCode,
    'NAVIGATION_RESPONSE_INVALID',
  );
  response = Response.json({ ok: false, error: { code: 'NAVIGATION_FORBIDDEN' } });
  await tick(t, 1500);
  assert.equal(
    document.querySelector('[role="alert"]').dataset.navigationCode,
    'NAVIGATION_FORBIDDEN',
  );
  response = Response.json({}, { status: 401 });
  await tick(t, 1500);
  assert.equal(
    document.querySelector('[role="alert"]').dataset.navigationCode,
    'NAVIGATION_HTTP_401',
  );
});

test('a genuinely pending navigation request times out after five seconds and remains retryable', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1000 });
  t.mock.method(AbortSignal, 'timeout', (delay) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), delay);
    return controller.signal;
  });
  let requests = 0;
  const pending = (_path, options) => {
    requests++;
    return new Promise((_resolve, reject) =>
      options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }),
    );
  };
  await mount(t, pending, confirmed);
  await tick(t, 4999);
  assert.equal(document.querySelector('[role="alert"]'), null);
  await tick(t, 1);
  assert.equal(
    document.querySelector('[role="alert"]').dataset.navigationCode,
    'NAVIGATION_TIMEOUT',
  );
  assert.equal(document.querySelector('[role="alert"] button').disabled, false);
  await tick(t, 1500);
  assert.equal(requests, 2);
});

test('a first real navigation failure after identity recovery uses the original startup deadline', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1000 });
  let polls = 0;
  const ui = await mount(
    t,
    async () => {
      polls++;
      return Response.json({}, { status: 503 });
    },
    { state: 'unknown', scope: null, subject: null, status: null },
  );
  await tick(t, 5500);
  assert.equal(polls, 0);
  assert.equal(document.querySelector('[role="alert"]'), null);
  await ui.update(confirmed);
  assert.equal(polls, 1);
  assert.equal(
    document.querySelector('[role="alert"]').dataset.navigationCode,
    'NAVIGATION_HTTP_503',
  );
});
