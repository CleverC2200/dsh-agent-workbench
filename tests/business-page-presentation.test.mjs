import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
const pause = () => new Promise((resolve) => setTimeout(resolve, 25));
async function until(check) {
  for (let attempt = 0; attempt < 80; attempt++) {
    if (check()) return;
    await pause();
  }
  assert.ok(check(), 'the original page settles into the expected presentation');
}

async function mount(page, t) {
  const html = await readFile(`lib/business/inventory-${page}/index.html`, 'utf8');
  const errors = [],
    external = [];
  const dom = new JSDOM(html, {
    url: `https://host.example/api/agent-workbench/html?id=inventory-${page}`,
    referrer: 'https://host.example/workbench',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  t.after(() => dom.window.close());
  Object.assign(dom.window, {
    AbortController,
    AbortSignal,
    Response,
    Request,
    Headers,
    TextEncoder,
    TextDecoder,
    structuredClone,
  });
  dom.window.ResizeObserver = class {
    observe() {}
    disconnect() {}
    unobserve() {}
  };
  dom.window.fetch = (...args) => {
    external.push(args);
    return Promise.reject(Error('Unexpected external request'));
  };
  dom.window.addEventListener('error', (event) => errors.push(event.error));
  dom.window.addEventListener('unhandledrejection', (event) => errors.push(event.reason));
  const sqlConfig = JSON.parse(
    await readFile(`business/${`inventory-${page}`}/sql.config.json`, 'utf8'),
  );
  const configNode = dom.window.document.createElement('script');
  configNode.id = 'agent-sql-config';
  configNode.type = 'application/json';
  configNode.textContent = JSON.stringify(sqlConfig);
  dom.window.document.head.appendChild(configNode);
  for (const script of dom.window.document.querySelectorAll(
    'script:not([src]):not([type="application/json"])',
  ))
    dom.window.eval(script.textContent);
  const root = dom.window.document.getElementById('app');
  await until(() => root.textContent.trim().length > 0);
  return { dom, root, errors, external };
}
function navigation(page, root) {
  return page === 'fc'
    ? [...root.querySelectorAll('nav[aria-label="库存业务页签"] button')]
    : [...root.querySelectorAll('[role="tablist"][aria-label="查看方式"] [role="tab"]')];
}

for (const page of ['fc', 'aqkc'])
  test(`the ${page} native page waits for its Host connection before mounting business reads`, async (t) => {
    const { root, errors, external } = await mount(page, t);
    await until(() => /正在连接/.test(root.textContent));
    assert.ok(root.querySelector('[role="status"]'));
    assert.equal(root.querySelectorAll('.kpi-card').length, 0);
    assert.equal(navigation(page, root).length, 0);
    assert.deepEqual(external, []);
    assert.deepEqual(errors, []);
  });

for (const page of ['fc', 'aqkc'])
  test(`the existing ${page} page retries its original read after connection and clears presentation on identity change`, async (t) => {
    const { dom, root, errors, external } = await mount(page, t);
    await until(() => /登录|连接/.test(root.textContent));
    const requests = [];
    let closed = false;
    // A recording protocol peer supplies no inventory rows or business facts.
    // It records the real page pipeline and deliberately rejects each SQL read.
    const port = {
      onmessage: null,
      start() {},
      close() {
        closed = true;
      },
      postMessage(message) {
        if (message.type !== 'request') return;
        requests.push(message);
        queueMicrotask(() => {
          if (!closed)
            port.onmessage?.({
              data:
                message.method === 'access'
                  ? {
                      type: 'response',
                      id: message.id,
                      result: { principalId: 'recording-fixture' },
                    }
                  : { type: 'response', id: message.id, error: 'OFFLINE_QUERY_FAILURE' },
            });
        });
      },
    };
    t.after(() => {
      closed = true;
    });
    dom.window.dispatchEvent(
      new dom.window.MessageEvent('message', {
        source: dom.window.parent,
        origin: 'https://host.example',
        ports: [port],
        data: {
          protocol: 'gea-html-v2',
          type: 'connect',
          context: { session: 'recording-fixture', plugin: page },
        },
      }),
    );
    await until(() => requests.some((message) => message.method === 'sql'));
    await until(() => root.querySelectorAll('[role="alert"]').length > 0);
    assert.ok(
      requests.some((message) => message.method === (page === 'fc' ? 'sql' : 'access')),
      'connected reads stay on the existing Host-authorized operation',
    );
    assert.equal(navigation(page, root).length, page === 'fc' ? 6 : 3);
    if (page === 'fc') {
      assert.equal(root.querySelectorAll('.kpi-card').length, 5);
      assert.ok(
        [...root.querySelectorAll('.kpi-value')].every((node) =>
          /^[-—]$/.test(node.textContent.trim()),
        ),
        'failed sources must remain unknown, not become zero facts',
      );
    }
    const before = requests.filter((message) => message.method === 'sql').length;
    [...root.querySelectorAll('button')]
      .find((button) => ['刷新', '刷新数据'].includes(button.textContent.trim()))
      .click();
    await until(() => requests.filter((message) => message.method === 'sql').length > before);
    port.onmessage({ data: { type: 'identity-changed' } });
    await until(() =>
      /登录身份已变化|登录并连接|页面已显示|暂不可用|读取失败/.test(root.textContent),
    );
    assert.equal(navigation(page, root).length, page === 'fc' ? 6 : 3);
    if (page === 'fc')
      assert.ok(
        [...root.querySelectorAll('.kpi-value')].every((node) =>
          /^[-—]$/.test(node.textContent.trim()),
        ),
      );
    assert.deepEqual(external, []);
    assert.deepEqual(errors, []);
  });
