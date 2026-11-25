import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const source = new URL('../prototypes/inventory-orderfulfillment/sales-window/', import.meta.url);
const html = await readFile(new URL('window.html', source), 'utf8');
const scripts =
  (await readFile(new URL('order-editor.js', source), 'utf8')) +
  '\n' +
  (await readFile(new URL('window.js', source), 'utf8'));
const flush = () => new Promise((resolve) => setImmediate(resolve));

async function fixture({
  preview = false,
  canAct = true,
  rate = 95,
  catalog = false,
  packaging,
} = {}) {
  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    url: 'https://fixture.invalid/window/test?view=process',
  });
  const state = {
    status: 'pending',
    version: 'v1',
    csrf: 'csrf',
    previewOnly: preview,
    permissions: { canAct },
    snapshot: {
      executionOrderNo: 'EXEC-1',
      vehicleType: '8.6米',
      dmsOrderNo: 'DMS-1',
      deliveryDate: '2026-11-20',
      satisfactionRate: rate,
      lines: [
        {
          sku: 'SKU-1',
          name: '商品',
          quantity: 84,
          orderMultiple: 42,
          minimumOrderQuantity: 5,
          unitPrice: 15.5,
        },
      ],
    },
    editor: {
      editable: true,
      canSubmit: true,
      omsModificationAvailable: true,
      catalogAvailable: catalog,
      vehicleRulesAvailable: catalog,
    },
  };
  if (packaging)
    Object.assign(state.editor, {
      packagingValidationAvailable: true,
      recommendationsAvailable: true,
      recommendations: [
        {
          sku: 'REC',
          name: '推荐商品',
          quantity: 0,
          unitPrice: 15.5,
          priceStatus: 'READY',
          minimumOrderQuantity: 5,
          orderMultiple: 40,
          ...packaging,
        },
      ],
    });
  const sent = [];
  dom.window.fetch = async (url, options = {}) => {
    if (url.includes('/options?kind=vehicles'))
      return {
        ok: true,
        json: async () => ({ vehicles: [{ value: '8.6米' }, { value: '6.8米' }] }),
      };
    if (url.includes('/options?kind=products'))
      return {
        ok: true,
        json: async () => ({
          products: [
            {
              sku: 'NEW',
              name: '新增商品',
              quantity: 0,
              unitPrice: 15.5,
              priceStatus: 'READY',
              minimumOrderQuantity: 5,
              orderMultiple: 40,
              ...packaging,
            },
          ],
        }),
      };
    if (options.method === 'POST') {
      sent.push({ url, headers: options.headers, body: JSON.parse(options.body) });
      state.status = 'resolved';
      state.editor = {
        editable: false,
        canSubmit: false,
        modificationState: 'succeeded',
        reason: '订单修改成功，请等待OMS重新校验。',
      };
      return { ok: true, json: async () => ({ status: 'accepted', orderModified: true }) };
    }
    return { ok: true, json: async () => structuredClone(state) };
  };
  dom.window.eval(scripts);
  await flush();
  await flush();
  return { dom, document: dom.window.document, state, sent };
}

test('catalog and recommended products with unavailable packaging cannot be selected', async () => {
  for (const packagingStatus of ['MISSING', 'CONFLICT', 'QUERY_UNAVAILABLE']) {
    const f = await fixture({
      catalog: true,
      packaging: { packagingStatus, packagingMessage: '包装资料未核实，暂不能选用。' },
    });
    const button = (text) =>
      [...f.document.querySelectorAll('#orderEditor button')].find(
        (item) => item.textContent === text,
      );
    try {
      button('+ 商品').click();
      await flush();
      await flush();
      assert.equal(f.document.querySelector('[aria-label="NEW 增加"]').disabled, true);
      const input = f.document.querySelector('[aria-label="NEW 数量"]');
      assert.equal(input.disabled, true);
      input.value = '40';
      input.dispatchEvent(new f.dom.window.Event('change'));
      assert.match(f.document.getElementById('orderEditor').textContent, /包装资料未核实/);
      button('商品推荐').click();
      assert.equal(f.document.querySelector('[aria-label="REC 增加"]').disabled, true);
      assert.equal(f.sent.length, 0);
    } finally {
      f.dom.window.close();
    }
  }
});

test('verified non-case packaging keeps browser draft quantities in cases for server conversion', async () => {
  const f = await fixture({
    catalog: true,
    packaging: {
      packagingStatus: 'READY',
      unit: 'PC',
      unitsPerCase: 24,
      packagingSource: 'agents_order_sku_d',
    },
  });
  const button = (text) =>
    [...f.document.querySelectorAll('#orderEditor button')].find(
      (item) => item.textContent === text,
    );
  try {
    button('+ 商品').click();
    await flush();
    await flush();
    const plus = f.document.querySelector('[aria-label="NEW 增加"]');
    assert.equal(plus.disabled, false);
    plus.click();
    button('完成选品').click();
    button('提交').click();
    [...f.document.querySelectorAll('[role="dialog"] button')]
      .find((item) => item.textContent === '确认')
      .click();
    await flush();
    await flush();
    assert.equal(f.sent.length, 1);
    assert.deepEqual(f.sent[0].body.draft.lines, [
      { sku: 'SKU-1', quantity: 84 },
      { sku: 'NEW', quantity: 40 },
    ]);
  } finally {
    f.dom.window.close();
  }
});

test('explicitly enabled modification submits changed quantity and date after confirmation', async () => {
  const f = await fixture();
  try {
    const quantity = f.document.querySelector('#orderEditor input[type="number"]');
    quantity.value = '126';
    quantity.dispatchEvent(new f.dom.window.Event('change'));
    const date = f.document.querySelector('#orderEditor input[type="date"]');
    date.value = '2026-11-21';
    date.dispatchEvent(new f.dom.window.Event('change'));
    [...f.document.querySelectorAll('#orderEditor button')]
      .find((b) => b.textContent === '提交')
      .click();
    assert.equal(f.sent.length, 0);
    const confirm = [...f.document.querySelectorAll('[role="dialog"] button')].find(
      (b) => b.textContent === '确认',
    );
    assert.equal(confirm.disabled, false);
    confirm.click();
    confirm.click();
    await flush();
    assert.equal(f.sent.length, 1);
    assert.ok(f.sent[0].url.endsWith('/modify'));
    assert.deepEqual(f.sent[0].body, {
      expectedVersion: 'v1',
      draft: { deliveryDate: '2026-11-21', lines: [{ sku: 'SKU-1', quantity: 126 }] },
    });
    assert.equal(f.sent[0].headers['X-CSRF-Token'], 'csrf');
    assert.match(f.document.getElementById('orderEditor').textContent, /订单修改成功/);
  } finally {
    f.dom.window.close();
  }
});

test('catalog additions, original SKU removal and vehicle change form one final list submission', async () => {
  const f = await fixture({ catalog: true });
  const click = (text) =>
    [...f.document.querySelectorAll('#orderEditor button')]
      .find((button) => button.textContent === text)
      .click();
  try {
    click('+ 商品');
    const search = f.document.querySelector('[aria-label="商品搜索"]');
    search.value = 'NEW';
    search.dispatchEvent(new f.dom.window.Event('input'));
    await flush();
    await flush();
    f.document.querySelector('[aria-label="NEW 增加"]').click();
    click('完成选品');
    f.document.querySelector('#orderEditor .editor-remove').click();
    const vehicle = f.document.querySelector('[aria-label="选择车型"]');
    assert.equal(vehicle.disabled, false);
    vehicle.value = '6.8米';
    vehicle.dispatchEvent(new f.dom.window.Event('change'));
    click('提交');
    const confirm = [...f.document.querySelectorAll('[role="dialog"] button')].find(
      (button) => button.textContent === '确认',
    );
    assert.equal(confirm.disabled, false);
    confirm.click();
    confirm.click();
    await flush();
    assert.equal(f.sent.length, 1);
    assert.deepEqual(f.sent[0].body.draft, {
      deliveryDate: '2026-11-20',
      vehicleType: '6.8米',
      lines: [{ sku: 'NEW', quantity: 40 }],
    });
  } finally {
    f.dom.window.close();
  }
});

test('removing the last product cannot submit an empty order', async () => {
  const f = await fixture({ catalog: true });
  try {
    f.document.querySelector('#orderEditor .editor-remove').click();
    [...f.document.querySelectorAll('#orderEditor button')]
      .find((button) => button.textContent === '提交')
      .click();
    const confirm = [...f.document.querySelectorAll('[role="dialog"] button')].find(
      (button) => button.textContent === '确认',
    );
    assert.equal(confirm.disabled, true);
    confirm.click();
    await flush();
    assert.equal(f.sent.length, 0);
  } finally {
    f.dom.window.close();
  }
});

test('read-only and preview windows never submit OMS modifications', async () => {
  for (const options of [{ canAct: false }, { preview: true }]) {
    const f = await fixture(options);
    try {
      [...f.document.querySelectorAll('#orderEditor button')]
        .find((b) => b.textContent === '提交')
        ?.click();
      [...f.document.querySelectorAll('[role="dialog"] button')]
        .find((b) => b.textContent === '确认')
        ?.click();
      await flush();
      assert.equal(f.sent.length, 0);
    } finally {
      f.dom.window.close();
    }
  }
});

test('non-pallet quantity blocks modification even with server capability enabled', async () => {
  const f = await fixture();
  try {
    const input = f.document.querySelector('#orderEditor input[type="number"]');
    input.value = '100';
    input.dispatchEvent(new f.dom.window.Event('change'));
    [...f.document.querySelectorAll('#orderEditor button')]
      .find((b) => b.textContent === '提交')
      .click();
    const confirm = [...f.document.querySelectorAll('[role="dialog"] button')].find(
      (b) => b.textContent === '确认',
    );
    assert.equal(confirm.disabled, true);
    confirm.click();
    await flush();
    assert.equal(f.sent.length, 0);
  } finally {
    f.dom.window.close();
  }
});

for (const scenario of [
  { name: 'increase one pallet', button: 'SKU-1 增加', quantity: 126 },
  { name: 'decrease one pallet', button: 'SKU-1 减少', quantity: 42 },
  { name: 'manual full-pallet quantity', manual: 168, quantity: 168 },
  { name: 'delivery date only', date: '2026-11-22', quantity: 84 },
  { name: 'shortage catalog quantity change', rate: 70, button: 'SKU-1 减少', quantity: 42 },
])
  test(`supported modification: ${scenario.name}`, async () => {
    const f = await fixture({ rate: scenario.rate });
    const button = (text) =>
      [...f.document.querySelectorAll('#orderEditor button')].find((b) => b.textContent === text);
    try {
      if (scenario.button) f.document.querySelector(`[aria-label="${scenario.button}"]`).click();
      if (scenario.manual) {
        const input = f.document.querySelector('#orderEditor input[type="number"]');
        input.value = String(scenario.manual);
        input.dispatchEvent(new f.dom.window.Event('change'));
      }
      button('完成选品')?.click();
      if (scenario.date) {
        const input = f.document.querySelector('#orderEditor input[type="date"]');
        input.value = scenario.date;
        input.dispatchEvent(new f.dom.window.Event('change'));
      }
      button('提交').click();
      const confirm = [...f.document.querySelectorAll('[role="dialog"] button')].find(
        (b) => b.textContent === '确认',
      );
      assert.equal(confirm.disabled, false);
      confirm.click();
      await flush();
      assert.equal(f.sent.length, 1);
      assert.ok(f.sent[0].url.endsWith('/modify'));
      assert.deepEqual(f.sent[0].body.draft, {
        deliveryDate: scenario.date || '2026-11-20',
        lines: [{ sku: 'SKU-1', quantity: scenario.quantity }],
      });
      assert.equal(f.state.status, 'resolved');
    } finally {
      f.dom.window.close();
    }
  });

test('unsupported vehicle, new catalog and credit operations are not presented as successful writes', async () => {
  const f = await fixture();
  const button = (text) =>
    [...f.document.querySelectorAll('#orderEditor button')].find((b) => b.textContent === text);
  try {
    assert.equal(f.document.querySelector('[aria-label="选择车型"]').disabled, true);
    button('+ 商品').click();
    button('商品推荐').click();
    assert.match(f.document.getElementById('orderEditor').textContent, /暂无推荐商品/);
    assert.equal(f.sent.length, 0);
  } finally {
    f.dom.window.close();
  }
});

test('quantity zero cannot delete an original SKU through the modification endpoint', async () => {
  const f = await fixture();
  try {
    const input = f.document.querySelector('#orderEditor input[type="number"]');
    input.value = '0';
    input.dispatchEvent(new f.dom.window.Event('change'));
    [...f.document.querySelectorAll('#orderEditor button')]
      .find((b) => b.textContent === '提交')
      .click();
    const confirm = [...f.document.querySelectorAll('[role="dialog"] button')].find(
      (b) => b.textContent === '确认',
    );
    assert.equal(confirm.disabled, true);
    confirm.click();
    await flush();
    assert.equal(f.sent.length, 0);
  } finally {
    f.dom.window.close();
  }
});
