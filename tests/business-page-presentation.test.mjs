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
  for (const script of dom.window.document.querySelectorAll('script:not([src])'))
    dom.window.eval(script.textContent);
  const root = dom.window.document.getElementById('app');
  await until(() => root.querySelectorAll('button').length >= 2);
  return { dom, root, errors, external };
}
function navigation(page, root) {
  return page === 'fc'
    ? [...root.querySelectorAll('nav[aria-label="库存业务页签"] button')]
    : [...root.querySelectorAll('[role="tablist"][aria-label="查看方式"] [role="tab"]')];
}

for (const page of ['fc', 'aqkc'])
  test(`the existing ${page} HTML keeps its original navigation and controls before an authorized bridge is selected`, async (t) => {
    const { root, errors, external } = await mount(page, t);
    await until(() => /登录|连接/.test(root.textContent));
    assert.ok(
      root.children.length > 0,
      'the original React page must mount without a GEA ready port',
    );
    assert.ok(
      root.querySelectorAll('button').length >= 2,
      'existing navigation and controls remain rendered before connection',
    );
    const tabs = navigation(page, root);
    assert.deepEqual(
      tabs.map((tab) => tab.textContent.trim()),
      page === 'fc'
        ? ['补货确认', '当前订单', '货龄结构', '分仓计划', '基地资源', '运营观察']
        : ['基地结构', '品类结构', '货龄结构'],
    );
    if (page === 'fc') {
      assert.equal(root.querySelectorAll('[aria-label="运营步骤"] button').length, 5);
      assert.equal(
        root.querySelector('[aria-label="选择分仓"]').disabled,
        true,
        'no warehouse is declared authorized before the real session check',
      );
      assert.equal(root.querySelector('[aria-label="补货周期配置"]').disabled, true);
      assert.equal(
        root.querySelectorAll('.kpi-card').length,
        0,
        'an unconnected page publishes no placeholder quantities',
      );
      assert.doesNotMatch(root.textContent, /演示数据（非真实业务）/);
      tabs[4].click();
      await until(() => navigation(page, root)[4].getAttribute('aria-current') === 'page');
    } else {
      assert.equal(root.querySelector('[aria-label^="切换当前对象"]').disabled, true);
      tabs[1].click();
      await until(() => navigation(page, root)[1].getAttribute('aria-selected') === 'true');
    }
    const refresh = [...root.querySelectorAll('button')].find((button) =>
      ['刷新', '刷新数据'].includes(button.textContent.trim()),
    );
    assert.ok(refresh, 'the original refresh control remains usable');
    refresh.click();
    await until(
      () =>
        navigation(page, root).length === (page === 'fc' ? 6 : 3) &&
        /登录|连接/.test(root.textContent),
    );
    assert.deepEqual(
      external,
      [],
      'the test and unconnected page do not make external HTTP requests',
    );
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
      requests.some((message) => message.method === 'access'),
      'connection uses the existing access operation before data reads',
    );
    assert.equal(navigation(page, root).length, page === 'fc' ? 6 : 3);
    if (page === 'fc')
      assert.equal(
        root.querySelectorAll('.kpi-card').length,
        0,
        'a failed original query cannot produce placeholder KPIs',
      );
    const before = requests.filter((message) => message.method === 'sql').length;
    [...root.querySelectorAll('button')]
      .find((button) => ['刷新', '刷新数据'].includes(button.textContent.trim()))
      .click();
    await until(() => requests.filter((message) => message.method === 'sql').length > before);
    port.onmessage({ data: { type: 'identity-changed' } });
    await until(() => /登录身份已变化|登录并连接|页面已显示/.test(root.textContent));
    assert.equal(navigation(page, root).length, page === 'fc' ? 6 : 3);
    if (page === 'fc') assert.equal(root.querySelectorAll('.kpi-card').length, 0);
    assert.deepEqual(external, []);
    assert.deepEqual(errors, []);
  });
