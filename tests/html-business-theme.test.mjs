import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const load = async (file) => {
  const { outputFiles } = await build({
    entryPoints: [file],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
  });
  return import(
    'data:text/javascript;base64,' + Buffer.from(outputFiles[0].text).toString('base64')
  );
};
const tick = () => new Promise((resolve) => setImmediate(resolve));

test('the actual owned HTML bridge and shipped business channel accept current theme and reject retired or forged projections', async (t) => {
  const saved = { window: globalThis.window, document: globalThis.document };
  const hostListeners = new Set(),
    pageListeners = new Set(),
    values = new Map(),
    errors = [];
  const app = { textContent: 'Original business table' };
  const document = {
    referrer: 'https://host.example/document',
    body: {
      style: {
        setProperty: (key, value) => values.set(key, value),
        removeProperty: (key) => values.delete(key),
      },
      toggleAttribute() {},
    },
    documentElement: { style: {} },
    getElementById: () => app,
  };
  const host = {
    parent: null,
    dispatchEvent() {},
    addEventListener: (name, fn) => {
      if (name === 'message') hostListeners.add(fn);
    },
    removeEventListener: (_name, fn) => hostListeners.delete(fn),
  };
  host.parent = host;
  const page = {
    parent: host,
    addEventListener: (name, fn) => {
      if (name === 'message') pageListeners.add(fn);
    },
    dispatchEvent() {},
  };
  let port;
  host.postMessage = (data) => {
    for (const listener of hostListeners) listener({ source: page, origin: 'null', data });
  };
  page.postMessage = (data, _origin, ports = []) => {
    if (data.type === 'connect') port = ports[0];
    for (const listener of pageListeners)
      listener({ source: host, origin: 'https://host.example', data, ports });
  };
  globalThis.window = page;
  globalThis.document = document;
  await load('business/shared/channel.js');
  globalThis.window = host;
  const { connectHtmlFrame } = await load('src/html-bridge.ts');
  const abort = new AbortController();
  const context = { plugin: 'inventory-fc', session: 'current-session' };
  const stop = connectHtmlFrame(
    { contentWindow: page },
    {
      page: { kind: 'html', pluginId: context.plugin },
      sessionId: context.session,
      resourceId: 'original',
      owner: 'current-owner',
      binding: { surface: 'gea-html-inventory-fc', tool: 'gea_plugin_page_apply' },
    },
    {
      call: async (_connection, method) => (method === 'catalog' ? { events: [] } : []),
      prompt: async () => {},
    },
    () => ({
      fontSize: 17,
      active: { colorScheme: 'dark', tokens: { '--dsw-alias-label-primary': '#112233' } },
    }),
    abort.signal,
    (error) => errors.push(error),
  );
  t.after(() => {
    abort.abort();
    stop();
    port?.close();
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  });
  for (
    let attempt = 0;
    attempt < 30 &&
    values.get('--workbench-font-size') === undefined &&
    app.textContent === 'Original business table';
    attempt++
  )
    await tick();
  assert.equal(
    app.textContent,
    'Original business table',
    'the current1.1.1 owner theme must never replace live business content with a version error',
  );
  assert.equal(values.get('--workbench-font-size'), '17px');
  assert.equal(values.get('--dsh-content-font-size'), '17px');
  assert.equal(document.documentElement.style.colorScheme, 'dark');
  assert.equal(values.get('--dsw-alias-label-primary'), '#112233');
  const theme = {
    type: 'theme',
    context,
    version: '1.1.1',
    colorScheme: 'light',
    fontSize: 12,
    tokens: { '--dsw-alias-label-primary': '#223344' },
  };
  for (const forged of [
    { ...theme, context: { ...context, session: 'other-session' } },
    { ...theme, context: { ...context, plugin: 'inventory-other' } },
  ])
    port.dispatchEvent(new MessageEvent('message', { data: forged }));
  assert.equal(values.get('--workbench-font-size'), '17px');
  assert.equal(app.textContent, 'Original business table');
  for (const invalid of [
    { ...theme, version: '1.0.0' },
    { ...theme, tokens: { '--unowned-token': 'invalid' } },
  ]) {
    app.textContent = 'Original business table';
    port.dispatchEvent(new MessageEvent('message', { data: invalid }));
    assert.equal(app.textContent, '共享样式版本不兼容，请重新打开页面');
    assert.equal(values.get('--workbench-font-size'), '17px');
  }
  assert.deepEqual(errors, []);
});
