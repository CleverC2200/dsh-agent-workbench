import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { readDealerMock } from './fixtures/dealer-mock-sql.mjs';
const pause = () => new Promise((resolve) => setTimeout(resolve, 25));
async function until(check) {
  for (let i = 0; i < 100; i++) {
    if (check()) return;
    await pause();
  }
  assert.ok(check(), 'dealer page settles');
}

test('the built dealer page opens safely, reports current scope and restores the last SKU page through the public view protocol', async (t) => {
  const html = await readFile('lib/business/inventory-dealer/index.html', 'utf8');
  const dom = new JSDOM(html, {
    url: 'https://host.example/api/agent-workbench/html?id=inventory-dealer',
    referrer: 'https://host.example/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  t.after(() => dom.window.close());
  Object.assign(dom.window, {
    AbortController,
    AbortSignal,
    structuredClone,
    TextEncoder,
    TextDecoder,
  });
  dom.window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Object.defineProperty(dom.window.HTMLElement.prototype, 'innerText', {
    get() {
      return this.textContent;
    },
  });
  const external = [],
    requests = [],
    errors = [];
  dom.window.fetch = (...args) => {
    external.push(args);
    return Promise.reject(Error('Unexpected HTTP'));
  };
  dom.window.addEventListener('error', (e) => errors.push(e.error));
  dom.window.addEventListener('unhandledrejection', (e) => errors.push(e.reason));
  for (const script of dom.window.document.querySelectorAll('script'))
    dom.window.eval(script.textContent);
  const root = dom.window.document.getElementById('app');
  const port = {
    start() {},
    close() {},
    async postMessage(message) {
      requests.push(message);
      if (message.type === 'request') {
        const result =
          message.method === 'sql' ? await readDealerMock(message.parameters) : { accepted: true };
        queueMicrotask(() =>
          port.onmessage?.({ data: { type: 'response', id: message.id, result } }),
        );
      }
    },
  };
  const post = (data) =>
    dom.window.dispatchEvent(
      new dom.window.MessageEvent('message', {
        source: dom.window.parent,
        origin: 'https://host.example',
        data,
      }),
    );
  await pause();
  await pause();
  assert.equal(
    requests.filter((m) => m.method === 'sql').length,
    0,
    'waits for the public channel before reading',
  );
  assert.equal(root.textContent, '', 'does not mount a failed page before connect');
  dom.window.dispatchEvent(
    new dom.window.MessageEvent('message', {
      source: dom.window.parent,
      origin: 'https://host.example',
      ports: [port],
      data: {
        protocol: 'gea-html-v2',
        type: 'connect',
        context: { session: 'dealer-session-fixture', plugin: 'inventory-dealer' },
      },
    }),
  );
  await until(
    () => root.textContent.includes('GEA 授权只读数据') && root.textContent.includes('12,060'),
  );
  dom.window.dispatchEvent(new dom.window.Event('gea-session-changing'));
  await until(() => root.textContent.includes('会话切换中'));
  const pausedReads = requests.filter((m) => m.method === 'sql').length;
  await pause();
  assert.equal(requests.filter((m) => m.method === 'sql').length, pausedReads);
  dom.window.dispatchEvent(new dom.window.Event('gea-session-changed'));
  await until(
    () => root.textContent.includes('GEA 授权只读数据') && root.textContent.includes('12,060'),
  );
  assert.doesNotMatch(root.textContent, /UNDECLARED_DEALER_MOCK_QUERY/);
  post({
    protocol: 'dsh-workbench-view-v1',
    type: 'restore',
    page: 'inventory-dealer',
    version: 1,
    channel: 'dealer-view-fixture',
    generation: 1,
    state: { version: 1, customer: 'customer-A', tab: 'sku', page: 21, pageSize: 10, search: '' },
  });
  await until(() => root.textContent.includes('sku-A-200'));
  await until(() =>
    requests.some(
      (m) =>
        m.type === 'request' && m.method === 'context' && m.parameters.parts?.dealer?.page === 21,
    ),
  );
  const current = requests.filter((m) => m.method === 'context').at(-1).parameters;
  assert.equal(current.source, 'GEA_GOVERNED_SQL');
  assert.equal(current.mock, false);
  assert.equal(current.realData, true);
  assert.equal(current.parts.dealer.recordTotal, 201);
  assert.equal(current.parts.dealer.visibleRows.length, 1);
  assert.equal(current.parts.dealer.visibleRows[0].code, 'sku-A-200');
  assert.equal(current.parts.dealer.health.unreasonable, 201);
  assert.ok(requests.some((m) => m.method === 'sql'));
  assert.deepEqual(
    requests.filter((m) => m.method === 'conversation'),
    [],
  );
  assert.deepEqual(external, []);
  assert.deepEqual(errors, []);
});
