import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
const dir = new URL('../prototypes/inventory-orderfulfillment/sales-window/', import.meta.url);
const html = await readFile(new URL('window.html', dir), 'utf8');
const scripts =
  (await readFile(new URL('order-editor.js', dir), 'utf8')) +
  '\n' +
  (await readFile(new URL('window.js', dir), 'utf8'));
const flush = () => new Promise((resolve) => setImmediate(resolve));
function setup(view = 'process') {
  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    url: 'https://fixture.invalid/window/task?view=' + view,
  });
  const calls = [];
  let resolveVehicles, rejectVehicles;
  const vehicles = new Promise((resolve, reject) => {
    resolveVehicles = resolve;
    rejectVehicles = reject;
  });
  const state = {
    status: 'pending',
    version: 'v1',
    csrf: 'csrf',
    permissions: { canAct: true },
    snapshot: {
      executionOrderNo: 'E1',
      quantity: 40,
      satisfactionRate: 100,
      priceStatus: 'READY',
      vehicleType: '8.6米',
      deliveryDate: '2026-11-25',
      lines: [
        {
          sku: 'A',
          quantity: 40,
          unitPrice: 128,
          priceStatus: 'READY',
          orderMultiple: 40,
          minimumOrderQuantity: 10,
          shortage: 0,
        },
      ],
    },
    editor: {
      editable: true,
      canSubmit: true,
      omsModificationAvailable: true,
      vehicleRulesAvailable: true,
      inventoryRecalculationAvailable: false,
    },
  };
  if (view === 'credit') state.snapshot.credit = { status: 'insufficient', shortfall: 200 };
  dom.window.fetch = async (url) => {
    calls.push(url);
    if (url.includes('kind=vehicles')) return { ok: true, json: async () => vehicles };
    if (url.includes('/data?')) return { ok: true, json: async () => structuredClone(state) };
    throw Error('Unexpected business request ' + url);
  };
  dom.window.eval(scripts);
  return { dom, document: dom.window.document, calls, resolveVehicles, rejectVehicles };
}
test('order paints while vehicle lookup is still pending and keeps edited quantity and date when it completes', async () => {
  const f = setup();
  try {
    await flush();
    assert.equal(f.document.getElementById('windowLoading').hidden, true);
    assert.equal(f.document.querySelector('#orderEditor h1').textContent, '订单提交');
    assert.equal(f.calls.filter((x) => x.includes('kind=vehicles')).length, 1);
    const qty = f.document.querySelector('[aria-label="A 数量"]');
    qty.value = '80';
    qty.dispatchEvent(new f.dom.window.Event('input'));
    const date = f.document.querySelector('#orderEditor [aria-label="预计交货日期"]');
    date.value = '2026-11-26';
    date.dispatchEvent(new f.dom.window.Event('input'));
    f.resolveVehicles({ vehicles: [{ value: '6.8米', label: '6.8米' }] });
    await flush();
    assert.equal(f.document.querySelector('[aria-label="A 数量"]').value, '80');
    assert.equal(
      f.document.querySelector('#orderEditor [aria-label="预计交货日期"]').value,
      '2026-11-26',
    );
    assert.equal(f.document.querySelector('[aria-label="选择车型"]').disabled, false);
    assert.equal(f.document.querySelector('[aria-label="选择车型"]').options.length, 2);
    assert.equal(f.calls.filter((x) => x.includes('kind=vehicles')).length, 1);
  } finally {
    f.dom.window.close();
  }
});
for (const view of ['details', 'defer', 'price', 'credit'])
  test(view + ' does not wait for or request unused vehicle data', async () => {
    const f = setup(view);
    try {
      await flush();
      assert.equal(f.document.getElementById('windowLoading').hidden, true);
      assert.equal(
        f.calls.some((x) => x.includes('kind=vehicles')),
        false,
      );
    } finally {
      f.dom.window.close();
    }
  });
test('details does not automatically query live stock or price', async () => {
  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    url: 'https://fixture.invalid/window/task?view=details',
  });
  let calls = 0;
  try {
    dom.window.eval(await readFile(new URL('order-editor.js', dir), 'utf8'));
    dom.window.OrderShortageEditor.mount(dom.window.document, {
      view: 'details',
      status: 'pending',
      permissions: { canAct: true },
      snapshot: {
        satisfactionRate: 100,
        lines: [{ sku: 'A', quantity: 40, orderMultiple: 40, unitPrice: 1 }],
      },
      editor: { editable: true, inventoryRecalculationAvailable: true },
      onInventoryRecalculate: async () => {
        calls++;
        throw Error('Unused');
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 350));
    assert.equal(calls, 0);
    assert.doesNotMatch(
      dom.window.document.getElementById('orderEditor').textContent,
      /正在核算最新库存/,
    );
    assert.equal(dom.window.document.querySelector('[data-editor-inventory-retry]'), null);
    assert.match(dom.window.document.querySelector('.editor-rate').textContent, /100\.0%/);
  } finally {
    dom.window.close();
  }
});
test('failed vehicle lookup keeps the current draft and does not retry on every page render', async () => {
  const f = setup();
  try {
    await flush();
    f.rejectVehicles(Error('读取失败'));
    await flush();
    assert.equal(f.document.querySelector('[aria-label="选择车型"]').title, '读取失败');
    [...f.document.querySelectorAll('button')].find((b) => b.textContent === '+ 商品').click();
    [...f.document.querySelectorAll('#orderEditor button')]
      .find((b) => b.textContent === '返回')
      .click();
    await flush();
    assert.equal(f.document.querySelector('[aria-label="A 数量"]').value, '40');
    assert.equal(f.calls.filter((x) => x.includes('kind=vehicles')).length, 1);
  } finally {
    f.dom.window.close();
  }
});
test('late vehicle results cannot alter a replacement read-only view', async () => {
  const f = setup();
  try {
    await flush();
    f.dom.window.OrderShortageEditor.mount(f.document, {
      view: 'details',
      status: 'pending',
      permissions: { canAct: false },
      snapshot: { lines: [] },
      editor: { editable: false },
    });
    f.resolveVehicles({ vehicles: [{ value: '6.8米', label: '6.8米' }] });
    await flush();
    assert.equal(f.document.querySelector('[aria-label="选择车型"]'), null);
    assert.equal(f.document.querySelector('#orderEditor h1').textContent, '订单明细');
  } finally {
    f.dom.window.close();
  }
});
