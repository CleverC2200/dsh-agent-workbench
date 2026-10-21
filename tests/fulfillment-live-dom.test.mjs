import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM, VirtualConsole } from 'jsdom';

const html = await readFile(
  new URL('../lib/business/inventory-orderfulfillment/index.html', import.meta.url),
  'utf8',
);
const config = JSON.parse(
  await readFile(
    new URL('../business/inventory-orderfulfillment/sql.config.json', import.meta.url),
    'utf8',
  ),
);
const tick = () => new Promise((resolve) => setTimeout(resolve, 10));
async function until(predicate) {
  for (let i = 0; i < 200; i++) {
    if (predicate()) return;
    await tick();
  }
  assert.fail('page did not settle');
}

test('built live page renders granted records, hides denied fields, and clears facts on identity changes', async (t) => {
  const errors = [],
    contexts = [];
  const console = new VirtualConsole();
  console.on('jsdomError', (error) => errors.push(error.message));
  const injected = html.replace(
    '<head>',
    '<head><script id="agent-sql-config" type="application/json">' +
      JSON.stringify(config).replaceAll('<', '\\u003c') +
      '</script>',
  );
  const dom = new JSDOM(injected, {
    url: 'https://workbench.test/page',
    referrer: 'https://workbench.test/',
    runScripts: 'dangerously',
    virtualConsole: console,
    beforeParse(window) {
      window.structuredClone = structuredClone;
      window.AbortController = AbortController;
      window.AbortSignal = AbortSignal;
    },
  });
  t.after(async () => {
    dom.window.dispatchEvent(new dom.window.Event('pagehide'));
    await tick();
    dom.window.close();
  });
  const { window } = dom;
  let deny = false;
  let completeInventory;
  const port = {
    start() {},
    close() {},
    postMessage(message) {
      if (message.type !== 'request') return;
      let result = { ok: true };
      if (message.method === 'context') contexts.push(message.parameters);
      if (message.method === 'sql') {
        const id = message.parameters.queryId;
        if (deny)
          result = {
            success: false,
            errorCode: 'RETURN_PERMISSION_DENIED',
            message: 'Denied',
          };
        else if (id.endsWith('.count')) result = { rows: [{ total: 1 }], configVersion: 'v1' };
        else if (id === 'orders.summary')
          result = {
            rows: [
              {
                source_orders: 1,
                source_rows: 1,
                first_created: '2026-10-21',
                latest_created: '2026-10-21',
              },
            ],
            configVersion: 'v1',
          };
        else if (id === 'trace.summary')
          result = {
            rows: [{ matched_orders: 1, overdue_orders: 0, warning_orders: 0 }],
            configVersion: 'v1',
          };
        else
          result = {
            rows: [
              {
                order_no: 'AUTHORIZED-01',
                customer_code: 'C01',
                customer_name: 'DENIED-CUSTOMER',
              },
            ],
            returnedColumns: ['order_no', 'customer_code'],
            rejectedColumns: ['customer_name'],
            configVersion: 'v1',
          };
      }
      const respond = () =>
        queueMicrotask(() =>
          port.onmessage?.({
            data: { type: 'response', id: message.id, result },
          }),
        );
      if (!deny && message.method === 'sql' && message.parameters.queryId === 'sku.detail')
        completeInventory = respond;
      else respond();
    },
  };
  const connect = (session) =>
    window.dispatchEvent(
      new window.MessageEvent('message', {
        source: window,
        origin: 'https://workbench.test',
        data: {
          protocol: 'gea-html-v2',
          type: 'connect',
          context: { session, plugin: 'inventory-orderfulfillment' },
        },
        ports: [port],
      }),
    );
  connect('session-a');
  await until(() =>
    window.document
      .querySelector('#deliveryOrderDetailRows')
      ?.textContent.includes('AUTHORIZED-01'),
  );
  assert.ok(!window.document.body.textContent.includes('DENIED-CUSTOMER'));
  assert.ok(!window.document.body.textContent.includes('6,320'));
  assert.ok(window.document.querySelector('.item-analysis h3').textContent.includes('正在读取'));
  await until(() => completeInventory);
  completeInventory();
  await until(
    () =>
      window.document.querySelector('.item-analysis h3').textContent ===
      '当前授权范围的品项库存情况',
  );
  assert.equal(
    window.document.querySelector('.item-analysis h3').textContent,
    '当前授权范围的品项库存情况',
  );
  assert.ok(window.document.querySelector('.item-analysis > p').textContent.includes('1 条'));
  assert.equal(window.document.querySelectorAll('#prototypeStatus').length, 1);
  assert.equal(window.document.querySelector('#salesConfirmOverlay').hidden, true);
  await until(() =>
    contexts.some((context) => context.parts?.['orders.detail']?.state === 'ready'),
  );
  port.onmessage({ data: { type: 'identity-changed' } });
  assert.ok(
    !window.document
      .querySelector('#deliveryOrderDetailRows')
      .textContent.includes('AUTHORIZED-01'),
  );
  deny = true;
  connect('session-b');
  await until(() => window.document.body.textContent.includes('RETURN_PERMISSION_DENIED'));
  assert.ok(!window.document.body.textContent.includes('AUTHORIZED-01'));
  assert.ok(
    !window.document
      .querySelector('#deliveryOrderDetailRows')
      .textContent.includes('AUTHORIZED-01'),
  );
  assert.deepEqual(errors, []);
});
