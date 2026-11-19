import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { salesConfirmationCard } from '../prototypes/inventory-orderfulfillment/sales-confirmation-card.mjs';
const dir = new URL('../prototypes/inventory-orderfulfillment/sales-window/', import.meta.url);
const html = await readFile(new URL('window.html', dir), 'utf8');
const scripts =
  (await readFile(new URL('order-editor.js', dir), 'utf8')) +
  '\n' +
  (await readFile(new URL('window.js', dir), 'utf8'));
const flush = () => new Promise((r) => setImmediate(r));
test('price card lists known missing SKUs and distinct maintenance, defer and process actions', () => {
  const text = JSON.stringify(
    salesConfirmationCard(
      {
        orderNo: 'DMS1',
        rate: 95,
        priceStatus: 'PARTIAL',
        lines: [
          { sku: '1000233', priceStatus: 'PRICE_MISSING' },
          { sku: '1000234', priceStatus: 'PRICE_MISSING' },
          { sku: 'READY1', priceStatus: 'READY', unitPrice: 10 },
        ],
      },
      { entryUrl: 'https://example.invalid/entry?reference=abc' },
    ),
  );
  for (const value of [
    '价格已维护',
    'SKU：1000233 没价格',
    'SKU：1000234 没价格',
    '%26view%3Dprice',
    '订单处理',
    '暂缓发货',
  ])
    assert.ok(text.includes(value), value);
  assert.doesNotMatch(text, /READY1 没价格/);
  const blocked = JSON.stringify(
    salesConfirmationCard({
      orderNo: 'DMS1',
      rate: 95,
      priceStatus: 'PARTIAL',
      notice: 'SAP查价提示客户冻结，请联系业务核实',
      lines: [{ sku: 'A', priceStatus: 'SAP_PRICE_CUSTOMER_BLOCKED' }],
    }),
  );
  assert.match(blocked, /客户冻结/);
  assert.doesNotMatch(blocked, /没价格/);
});
async function fixture({ ready = true, preview = false, canAct = true } = {}) {
  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    url: 'https://fixture.invalid/window/task?view=price',
  });
  const state = {
    status: 'pending',
    version: 'v1',
    csrf: 'csrf',
    previewOnly: preview,
    permissions: { canAct },
    editor: { editable: true },
    snapshot: {
      satisfactionRate: 95,
      priceStatus: 'PARTIAL',
      deliveryDate: '2026-11-20',
      lines: [
        {
          sku: 'A',
          quantity: 40,
          orderMultiple: 40,
          minimumOrderQuantity: 1,
          priceStatus: 'PRICE_MISSING',
        },
      ],
    },
  };
  const calls = [];
  dom.window.fetch = async (url, options = {}) => {
    if (options.method === 'POST') {
      calls.push({ url, options, body: JSON.parse(options.body) });
      state.version = 'v2';
      if (ready) {
        state.snapshot.priceStatus = 'READY';
        state.snapshot.lines[0].unitPrice = 10;
        state.snapshot.lines[0].priceStatus = 'READY';
      }
      return {
        ok: true,
        json: async () => ({
          ready,
          version: 'v2',
          message: ready ? '价格核验通过' : 'SAP查价提示客户冻结，请联系业务核实',
        }),
      };
    }
    return { ok: true, json: async () => structuredClone(state) };
  };
  dom.window.eval(scripts);
  await flush();
  return { dom, calls };
}
const confirm = (f) =>
  [...f.dom.window.document.querySelectorAll('#orderEditor button')].find(
    (b) => b.textContent === '确认',
  );
test('confirmation rechecks once and opens processing without a shipment or modification action', async () => {
  const f = await fixture();
  try {
    assert.match(f.dom.window.document.body.textContent, /确认价格已维护？/);
    const b = confirm(f);
    b.click();
    b.click();
    await flush();
    await flush();
    assert.equal(f.calls.length, 1);
    assert.ok(f.calls[0].url.endsWith('/price-recheck'));
    assert.deepEqual(f.calls[0].body, { expectedVersion: 'v1' });
    assert.equal(f.calls[0].options.headers['X-CSRF-Token'], 'csrf');
    assert.equal(f.dom.window.document.querySelector('#orderEditor').dataset.page, 'order');
    assert.equal(f.dom.window.location.search, '?view=process');
  } finally {
    f.dom.window.close();
  }
});
test('failed recheck stays on confirmation and uses the updated version on an explicit retry', async () => {
  const f = await fixture({ ready: false });
  try {
    confirm(f).click();
    await flush();
    assert.match(f.dom.window.document.body.textContent, /SAP查价提示客户冻结/);
    assert.equal(f.dom.window.document.querySelector('#orderEditor').dataset.page, 'price');
    confirm(f).click();
    await flush();
    assert.equal(f.calls.length, 2);
    assert.equal(f.calls[1].body.expectedVersion, 'v2');
  } finally {
    f.dom.window.close();
  }
});
test('preview and read-only users cannot recheck prices', async () => {
  for (const options of [{ preview: true }, { canAct: false }]) {
    const f = await fixture(options);
    try {
      confirm(f)?.click();
      await flush();
      assert.equal(f.calls.length, 0);
    } finally {
      f.dom.window.close();
    }
  }
});
