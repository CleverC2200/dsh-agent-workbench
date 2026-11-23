import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
const source = new URL('../prototypes/inventory-orderfulfillment/sales-window/', import.meta.url);
const html = await readFile(new URL('window.html', source), 'utf8');
const script =
  (await readFile(new URL('order-editor.js', source), 'utf8')) +
  '\n' +
  (await readFile(new URL('window.js', source), 'utf8'));
const flush = () => new Promise((resolve) => setImmediate(resolve));
async function setup(canAct = true) {
  const dom = new JSDOM(html, {
      runScripts: 'outside-only',
      url: 'https://fixture.invalid/window/order?view=process',
    }),
    calls = [];
  const state = {
    status: 'pending',
    version: 'v1',
    csrf: 'csrf',
    permissions: { canAct },
    snapshot: {
      executionOrderNo: 'E1',
      deliveryDate: '2026-11-25',
      quantity: 40,
      satisfactionRate: 100,
      priceStatus: 'READY',
      lines: [
        {
          sku: 'A',
          name: '商品A',
          quantity: 40,
          unitPrice: 128,
          priceStatus: 'READY',
          minimumOrderQuantity: 10,
          orderMultiple: 40,
          shortage: 0,
        },
      ],
    },
    editor: {
      editable: true,
      canSubmit: true,
      omsModificationAvailable: true,
      vehicleRulesAvailable: false,
      inventoryRecalculationAvailable: false,
    },
  };
  dom.window.fetch = async (url, options = {}) => {
    calls.push({ url, body: options.body ? JSON.parse(options.body) : undefined });
    return {
      ok: true,
      json: async () => (url.endsWith('/modify') ? { status: 'accepted' } : structuredClone(state)),
    };
  };
  dom.window.eval(script);
  await flush();
  const document = dom.window.document;
  return {
    dom,
    document,
    calls,
    state,
    input: document.querySelector('#orderEditor input[type="date"]'),
    trigger: document.querySelector('#orderEditor .editor-date-trigger'),
    overlay: document.getElementById('deferDatePicker'),
    confirm: document.getElementById('deferDateConfirm'),
  };
}
test('order date uses the shared white and grey picker, never a visible native date input', async () => {
  const f = await setup();
  try {
    assert.equal(f.input.hidden, true);
    assert.equal(f.trigger.disabled, false);
    const style = f.dom.window.getComputedStyle(f.trigger);
    assert.equal(style.backgroundColor, 'rgb(255, 255, 255)');
    assert.equal(style.borderTopColor, 'rgb(201, 205, 212)');
    f.trigger.click();
    assert.equal(f.overlay.hidden, false);
    const labels = [...f.overlay.querySelectorAll('button')].map((b) => b.textContent);
    assert.equal(labels.filter((x) => x === '确认').length, 1);
    for (const label of ['清除', '取消', '设置']) assert.ok(!labels.includes(label));
    assert.equal(f.document.querySelector('[aria-pressed="true"]').dataset.date, '2026-11-25');
  } finally {
    f.dom.window.close();
  }
});
test('order dates beyond seven days commit only after picker confirmation and reach the submission draft', async () => {
  const f = await setup();
  try {
    f.trigger.click();
    f.document.getElementById('deferMonthNext').click();
    const day = f.document.querySelector('[data-date="2026-12-15"]');
    assert.equal(day.disabled, false);
    day.click();
    assert.equal(f.input.value, '2026-11-25');
    f.confirm.click();
    assert.equal(f.input.value, '2026-12-15');
    assert.equal(f.trigger.textContent, '2026-12-15');
    assert.equal(f.calls.filter((x) => x.url.endsWith('/modify')).length, 0);
    [...f.document.querySelectorAll('#orderEditor button')]
      .find((b) => b.textContent === '提交')
      .click();
    [...f.document.querySelectorAll('[role="dialog"] button')]
      .find((b) => b.textContent === '确认')
      .click();
    await flush();
    const sent = f.calls.filter((x) => x.url.endsWith('/modify'));
    assert.equal(sent.length, 1);
    assert.equal(sent[0].body.draft.deliveryDate, '2026-12-15');
  } finally {
    f.dom.window.close();
  }
});
test('dismissal discards the draft and restores focus without modifying the date', async () => {
  const f = await setup();
  try {
    f.trigger.click();
    f.document.querySelector('[data-date="2026-11-27"]').click();
    f.overlay.dispatchEvent(
      new f.dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    assert.equal(f.input.value, '2026-11-25');
    assert.equal(f.document.activeElement, f.trigger);
    f.trigger.click();
    assert.equal(f.document.querySelector('[aria-pressed="true"]').dataset.date, '2026-11-25');
    f.overlay.click();
    assert.equal(f.input.value, '2026-11-25');
  } finally {
    f.dom.window.close();
  }
});
test('replacement read-only views dismiss an open picker and ignore late confirmation', async () => {
  const f = await setup();
  try {
    f.trigger.click();
    f.document.querySelector('[data-date="2026-11-27"]').click();
    f.dom.window.OrderShortageEditor.mount(f.document, {
      ...f.state,
      view: 'details',
      status: 'resolved',
      permissions: { canAct: false },
    });
    assert.equal(f.overlay.hidden, true);
    f.confirm.click();
    assert.equal(f.calls.filter((x) => x.url.endsWith('/modify')).length, 0);
    assert.equal(f.document.querySelector('.editor-date-trigger'), null);
  } finally {
    f.dom.window.close();
  }
});
