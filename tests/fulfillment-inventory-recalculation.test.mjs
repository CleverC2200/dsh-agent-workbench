import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';
const dir = new URL('../prototypes/inventory-orderfulfillment/sales-window/', import.meta.url);
const html = await readFile(new URL('window.html', dir), 'utf8');
const scripts =
  (await readFile(new URL('order-editor.js', dir), 'utf8')) +
  '\n' +
  (await readFile(new URL('window.js', dir), 'utf8'));
const settle = () => new Promise((resolve) => setTimeout(resolve, 15));
async function waitFor(predicate) {
  for (let attempt = 0; attempt < 30; attempt++) {
    if (predicate()) return;
    await settle();
  }
  assert.ok(predicate(), 'expected UI state did not arrive');
}
function inventory(lines, available) {
  const fresh = lines.map((line) => ({
    ...line,
    availableQuantity: available[line.sku] ?? 0,
    shortage: Math.max(0, line.quantity - (available[line.sku] ?? 0)),
  }));
  const quantity = fresh.reduce((sum, line) => sum + line.quantity, 0);
  const shortageQuantity = fresh.reduce((sum, line) => sum + line.shortage, 0);
  return {
    lines: fresh,
    quantity,
    shortageQuantity,
    satisfactionRate: (100 * (quantity - shortageQuantity)) / quantity,
    inventoryHash: createHash('sha256').update(JSON.stringify(fresh)).digest('hex'),
    checkedAt: '2026-11-19T07:00:00Z',
  };
}
async function fixture({
  mode = 'ready',
  available = { A: 20, B: 0 },
  preview = false,
  canAct = true,
} = {}) {
  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    url: 'https://fixture.invalid/window/task?view=process',
  });
  const timer = dom.window.setTimeout.bind(dom.window);
  dom.window.setTimeout = (callback, delay) => timer(callback, delay === 300 ? 0 : delay);
  const state = {
    status: 'pending',
    version: 'v1',
    csrf: 'csrf',
    previewOnly: preview,
    permissions: { canAct },
    snapshot: {
      executionOrderNo: 'EXEC',
      dmsOrderNo: 'DMS',
      satisfactionRate: 100,
      vehicleType: '8.6米',
      deliveryDate: '2026-11-20',
      lines: ['A', 'B'].map((sku, index) => ({
        sku,
        name: sku,
        quantity: index ? 60 : 40,
        minimumOrderQuantity: 1,
        orderMultiple: 10,
        unitPrice: 15.5,
      })),
    },
    editor: {
      editable: true,
      canSubmit: true,
      omsModificationAvailable: true,
      catalogAvailable: true,
      inventoryRecalculationAvailable: true,
    },
  };
  const f = {
    dom,
    document: dom.window.document,
    state,
    mode,
    available,
    reads: [],
    writes: [],
    deferred: [],
  };
  const reply = (body, ok = true) => ({ ok, json: async () => body });
  dom.window.fetch = async (url, options = {}) => {
    if (url.includes('/options?kind=products'))
      return reply({
        products: [
          {
            sku: 'C',
            name: 'C',
            quantity: 0,
            minimumOrderQuantity: 1,
            orderMultiple: 10,
            unitPrice: 20,
            priceStatus: 'READY',
          },
        ],
      });
    if (url.endsWith('/inventory-preview')) {
      const body = JSON.parse(options.body);
      f.reads.push(body);
      assert.equal(body.expectedVersion, 'v1');
      assert.equal(options.headers['X-CSRF-Token'], 'csrf');
      if (f.mode === 'failed')
        return reply(
          {
            code: 'ORDER_CONFIRMATION_OMS_MODIFICATION_INVENTORY_UNAVAILABLE',
            message: '库存查询失败',
          },
          false,
        );
      if (f.mode === 'deferred')
        return new Promise((resolve) =>
          f.deferred.push((values) => resolve(reply(inventory(body.draft.lines, values)))),
        );
      const result = inventory(body.draft.lines, f.available);
      if (f.mode === 'inconsistent') result.satisfactionRate = 100;
      return reply(result);
    }
    if (url.endsWith('/modify')) {
      f.writes.push(JSON.parse(options.body));
      if (f.mode === 'stock-changed') {
        f.mode = 'ready';
        f.available = {};
        return reply(
          {
            code: 'ORDER_CONFIRMATION_OMS_MODIFICATION_INVENTORY_CHANGED',
            message: '库存已变化，请重新核算',
          },
          false,
        );
      }
      state.status = 'resolved';
      state.editor = { editable: false, canSubmit: false, modificationState: 'succeeded' };
      return reply({ status: 'accepted', orderModified: true });
    }
    return reply(structuredClone(state));
  };
  dom.window.eval(scripts);
  await settle();
  if (!preview && canAct)
    await waitFor(() =>
      f.mode === 'deferred'
        ? f.deferred.length > 0
        : Boolean(f.document.querySelector('.editor-rate')) && !rate(f).includes('待核算'),
    );
  return f;
}
const click = (f, text) =>
  [...f.document.querySelectorAll('#orderEditor button')]
    .find((button) => button.textContent === text)
    .click();
const confirm = (f) =>
  [...f.document.querySelectorAll('[role="dialog"] button')].find(
    (button) => button.textContent === '确认',
  );
const rate = (f) => f.document.querySelector('.editor-rate').textContent;
function quantity(f, sku, value) {
  const input = f.document.querySelector(`[aria-label="${sku} 数量"]`);
  input.value = String(value);
  input.dispatchEvent(new f.dom.window.Event('change'));
}

test('quantity changes, deletion and new SKUs recalculate the whole draft by quantity rather than SKU average', async () => {
  const f = await fixture();
  try {
    assert.match(rate(f), /20\.0%/);
    f.document.querySelector('article[data-sku="B"] .editor-quantity input').value = '0';
    quantity(f, 'B', 0);
    await settle();
    assert.match(rate(f), /50\.0%/);
    quantity(f, 'A', 80);
    await settle();
    assert.match(rate(f), /25\.0%/);
    click(f, '+ 商品');
    const search = f.document.querySelector('[aria-label="商品搜索"]');
    search.value = 'C';
    search.dispatchEvent(new f.dom.window.Event('input'));
    await settle();
    f.document.querySelector('[aria-label="C 增加"]').click();
    f.document.querySelector('[aria-label="C 增加"]').click();
    f.available.C = 20;
    click(f, '完成选品');
    await settle();
    assert.match(rate(f), /40\.0%/);
    const last = f.reads.at(-1).draft.lines;
    assert.deepEqual(last, [
      { sku: 'A', quantity: 80 },
      { sku: 'C', quantity: 20 },
    ]);
    click(f, '提交');
    assert.equal(confirm(f).disabled, false);
    confirm(f).click();
    await settle();
    assert.equal(f.writes.length, 1);
    assert.equal(f.writes[0].draft.inventoryHash, inventory(last, f.available).inventoryHash);
    assert.equal(f.state.snapshot.satisfactionRate, 100);
  } finally {
    f.dom.window.close();
  }
});

test('all-shortage inventory displays zero instead of the old 100 percent', async () => {
  const f = await fixture({ available: {} });
  try {
    assert.match(rate(f), /0\.0%/);
    assert.match(f.document.querySelector('article[data-sku="A"]').textContent, /当前缺货 40 箱/);
    assert.equal(f.writes.length, 0);
  } finally {
    f.dom.window.close();
  }
});

test('stock failure and inconsistent replies never fall back to the snapshot rate or allow submission', async () => {
  for (const mode of ['failed', 'inconsistent']) {
    const f = await fixture({ mode, available: {} });
    try {
      assert.match(rate(f), /核算失败/);
      assert.doesNotMatch(rate(f), /100/);
      click(f, '提交');
      assert.equal(confirm(f).disabled, true);
      confirm(f).click();
      assert.equal(f.writes.length, 0);
      [...f.document.querySelectorAll('[role="dialog"] button')]
        .find((button) => button.textContent === '返回')
        .click();
      f.mode = 'ready';
      f.available = { A: 40, B: 60 };
      click(f, '重新核算库存');
      await waitFor(() => rate(f).includes('100.0%'));
      assert.match(rate(f), /100\.0%/);
    } finally {
      f.dom.window.close();
    }
  }
});

test('a slow old stock response cannot replace a newer draft result', async () => {
  const f = await fixture({ mode: 'deferred' });
  try {
    assert.equal(f.deferred.length, 1);
    quantity(f, 'A', 80);
    await settle();
    assert.equal(f.deferred.length, 2);
    f.deferred[1]({});
    await settle();
    assert.match(rate(f), /0\.0%/);
    f.deferred[0]({ A: 100, B: 100 });
    await settle();
    assert.match(rate(f), /0\.0%/);
    assert.equal(f.writes.length, 0);
  } finally {
    f.dom.window.close();
  }
});

test('preview and read-only windows do not invoke inventory recalculation', async () => {
  for (const settings of [{ preview: true }, { canAct: false }]) {
    const f = await fixture(settings);
    try {
      await settle();
      assert.equal(f.reads.length, 0);
      assert.equal(f.writes.length, 0);
    } finally {
      f.dom.window.close();
    }
  }
});

test('a stock change rejected before writing can be recalculated and confirmed with a fresh fingerprint', async () => {
  const f = await fixture({ mode: 'stock-changed', available: { A: 40, B: 60 } });
  try {
    click(f, '提交');
    confirm(f).click();
    await settle();
    await settle();
    assert.equal(f.writes.length, 1);
    assert.match(rate(f), /0\.0%/);
    click(f, '提交');
    assert.equal(confirm(f).disabled, false);
    confirm(f).click();
    await settle();
    assert.equal(f.writes.length, 2);
    assert.notEqual(f.writes[0].draft.inventoryHash, f.writes[1].draft.inventoryHash);
  } finally {
    f.dom.window.close();
  }
});
