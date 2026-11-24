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
async function setup(
  now = '2026-11-23T08:00:00Z',
  capability = true,
  receipt = { status: 'accepted', omsExecuted: true, orderModified: true },
) {
  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    url: 'https://fixture.invalid/window/test?view=defer',
  });
  const NativeDate = dom.window.Date;
  dom.window.Date = class extends NativeDate {
    constructor(...args) {
      super(...(args.length ? args : [now]));
    }
    static now() {
      return NativeDate.parse(now);
    }
  };
  const actions = [];
  const state = {
    status: 'pending',
    editor: { deferOmsAvailable: capability },
    permissions: { canAct: true },
    version: 'v1',
    csrf: 'csrf',
    snapshot: {
      orderNo: 'S1',
      customer: '客户',
      base: '郑州',
      quantity: 40,
      satisfactionRate: 100,
      lines: [],
    },
  };
  dom.window.fetch = async (url, options = {}) => {
    if (url.endsWith('/action')) {
      actions.push(JSON.parse(options.body));
      return { ok: true, json: async () => receipt };
    }
    return { ok: true, json: async () => structuredClone(state) };
  };
  dom.window.eval(scripts);
  await new Promise((resolve) => setImmediate(resolve));
  return { dom, document: dom.window.document, actions };
}
test('date button has white fill, grey border and a single confirmation action', async () => {
  const { dom, document } = await setup();
  try {
    const trigger = document.getElementById('deferDateTrigger');
    const style = dom.window.getComputedStyle(trigger);
    assert.equal(style.backgroundColor, 'rgb(255, 255, 255)');
    assert.equal(style.borderTopColor, 'rgb(201, 205, 212)');
    trigger.click();
    assert.equal(document.getElementById('deferDatePicker').hidden, false);
    const labels = [...document.querySelectorAll('#deferDatePicker button')].map(
      (button) => button.textContent,
    );
    assert.equal(labels.filter((label) => label === '确认').length, 1);
    for (const label of ['清除', '取消', '设置']) assert.ok(!labels.includes(label));
    assert.equal(document.getElementById('days').hidden, true);
  } finally {
    dom.window.close();
  }
});
test('choosing a day commits only on confirmation and does not save a deferral', async () => {
  const { dom, document, actions } = await setup();
  try {
    const input = document.getElementById('days');
    document.getElementById('deferDateTrigger').click();
    document.querySelector('[data-date="' + input.max + '"]').click();
    assert.equal(input.value, '');
    assert.equal(document.getElementById('submit').disabled, true);
    document.getElementById('deferDateConfirm').click();
    assert.equal(input.value, input.max);
    assert.equal(document.getElementById('deferDateValue').textContent, input.max);
    assert.equal(document.getElementById('submit').disabled, false);
    assert.equal(actions.length, 0);
    document.getElementById('submit').click();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(actions.length, 1);
    assert.equal(actions[0].actionId, 'defer_shipment');
    assert.equal(actions[0].input.deliveryDate, input.max);
    assert.equal(actions[0].input.deferDays, undefined);
  } finally {
    dom.window.close();
  }
});
test('dismissing a draft keeps the confirmed date and restores focus', async () => {
  const { dom, document, actions } = await setup();
  try {
    const trigger = document.getElementById('deferDateTrigger'),
      input = document.getElementById('days');
    trigger.click();
    document.getElementById('deferDateConfirm').click();
    const original = input.value;
    trigger.click();
    document.querySelector('[data-date="' + input.max + '"]').click();
    document
      .getElementById('deferDatePicker')
      .dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(input.value, original);
    assert.equal(document.activeElement, trigger);
    assert.equal(actions.length, 0);
    trigger.click();
    assert.equal(document.querySelector('[aria-pressed="true"]').dataset.date, original);
    document.getElementById('deferDatePicker').click();
    assert.equal(input.value, original);
  } finally {
    dom.window.close();
  }
});
for (const now of ['2026-11-28T08:00:00Z', '2026-12-28T08:00:00Z', '2028-02-27T08:00:00Z'])
  test('calendar honours the one-to-seven-day range across month boundaries: ' + now, async () => {
    const { dom, document } = await setup(now);
    try {
      const input = document.getElementById('days');
      document.getElementById('deferDateTrigger').click();
      const validate = () => {
        for (const button of document.querySelectorAll('#deferCalendarDays button'))
          assert.equal(
            button.disabled,
            button.dataset.date < input.min || button.dataset.date > input.max,
          );
      };
      validate();
      assert.equal(document.getElementById('deferMonthPrevious').disabled, true);
      document.getElementById('deferMonthNext').click();
      validate();
      assert.equal(document.getElementById('deferMonthNext').disabled, true);
      assert.ok(document.querySelector('[data-date="' + input.max + '"]'));
      document.querySelector('[data-date="' + input.max + '"]').click();
      document.getElementById('deferDateConfirm').click();
      assert.equal(input.value, input.max);
    } finally {
      dom.window.close();
    }
  });

test('deferral cannot report success from a GEA-only acceptance or missing OMS capability', async () => {
  for (const capability of [false, true]) {
    const { dom, document, actions } = await setup(undefined, capability, { status: 'accepted' });
    try {
      const input = document.getElementById('days');
      input.value = input.max;
      input.dispatchEvent(new dom.window.Event('change'));
      assert.equal(document.getElementById('submit').disabled, !capability);
      document.getElementById('submit').click();
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(actions.length, capability ? 1 : 0);
      assert.match(
        document.getElementById('notice').textContent,
        capability ? /尚未确认成功/ : /尚未启用/,
      );
    } finally {
      dom.window.close();
    }
  }
});
