import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { delimiter } from 'node:path';

async function load(file, key) {
  const { outputFiles } = await build({
    entryPoints: [file],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    nodePaths: (process.env.WORKBENCH_BROWSER_NODE_PATH || '').split(delimiter).filter(Boolean),
  });
  return import(
    'data:text/javascript;base64,' + Buffer.from(outputFiles[0].text).toString('base64') + '#' + key
  );
}

async function picker(t, response, pageId = 'inventory-apsplan') {
  const saved = {
    window: globalThis.window,
    document: globalThis.document,
    fetch: globalThis.fetch,
  };
  const listeners = new Set(),
    pageListeners = new Set(),
    calls = [];
  const host = {
    parent: null,
    dispatchEvent() {},
    addEventListener: (_name, fn) => listeners.add(fn),
    removeEventListener: (_name, fn) => listeners.delete(fn),
  };
  host.parent = host;
  const page = {
    parent: host,
    addEventListener: (_name, fn) => pageListeners.add(fn),
    dispatchEvent() {},
  };
  host.postMessage = (data) => {
    for (const fn of listeners) fn({ source: page, origin: 'null', data });
  };
  page.postMessage = (data, _origin, ports = []) => {
    for (const fn of pageListeners)
      fn({ source: host, origin: 'https://host.example', data, ports });
  };
  globalThis.window = page;
  globalThis.document = {
    referrer: 'https://host.example/workbench',
    body: {
      style: { setProperty() {}, removeProperty() {} },
      toggleAttribute() {},
    },
    documentElement: { style: {} },
    getElementById: () => ({ textContent: '' }),
  };
  const key = t.name;
  const channel = await load('business/shared/channel.js', key);
  globalThis.window = host;
  globalThis.fetch = async (path, init) => {
    calls.push({ path, init });
    return response();
  };
  const { connectHtmlFrame } = await load('src/html-bridge.ts', key);
  const stop = connectHtmlFrame(
    { contentWindow: page },
    {
      page: { id: pageId, kind: 'html', pluginId: pageId },
      sessionId: 'owned',
      scope: 'principal',
    },
    { call: async () => [] },
    () => ({ active: { colorScheme: 'light', tokens: {} }, fontSize: 14 }),
    new AbortController().signal,
    () => {},
  );
  t.after(async () => {
    stop();
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  });
  return {
    search: () =>
      channel.call('detection', {
        op: 'people',
        keyword: '测试人员',
        pageNo: 1,
        pageSize: 10,
      }),
    calls,
  };
}

test('warning picker receives people rather than the GEA response envelope', async (t) => {
  const value = {
    people: [{ username: 'test01', realname: '测试人员', orgCodeTxt: '华南' }],
    hasMore: false,
  };
  const { search, calls } = await picker(t, () => Response.json({ ok: true, value }));
  assert.deepEqual(await search(), value);
  assert.equal(calls[0].path, '/api/gea-proof/people/search');
});

test('an older host missing the people route gives an actionable error instead of JSON syntax', async (t) => {
  const { search } = await picker(t, () => new Response('not found', { status: 404 }));
  await assert.rejects(search(), /人员搜索接口不可用.*更新/);
});

test('directory permission rejection is preserved instead of becoming an empty result', async (t) => {
  const { search } = await picker(t, () =>
    Response.json({
      ok: false,
      error: { code: 'DENIED', message: '没有人员查询权限' },
    }),
  );
  await assert.rejects(search(), /没有人员查询权限/);
});

test('other pages cannot invoke the warning recipient lookup', async (t) => {
  const { search, calls } = await picker(t, () => Response.json({}), 'inventory-fc');
  await assert.rejects(search(), /DETECTION_PAGE_NOT_ALLOWED/);
  assert.equal(calls.length, 0);
});
