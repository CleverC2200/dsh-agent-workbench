import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { mountPushSettings } from '../prototypes/inventory-orderfulfillment/push-settings.mjs';
const settings = {
  thresholdEnabled: false,
  thresholdPercent: 95,
  reminderEnabled: false,
  reminderHours: 2,
};
function fixture(request) {
  const dom = new JSDOM('<button id="fulfillmentPushSettings">推送设置</button>');
  dom.window.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  dom.window.HTMLDialogElement.prototype.close = function () {
    this.open = false;
    this.dispatchEvent(new dom.window.Event('close'));
  };
  dom.window.HTMLFormElement.prototype.reportValidity = () => true;
  mountPushSettings(dom.window.document, request);
  return dom;
}
const tick = () => new Promise((resolve) => setImmediate(resolve));
test('settings are loaded from backend, explicitly saved and reopened from the persisted receipt', async () => {
  let saved = { ...settings },
    version = '0',
    writes = 0;
  const dom = fixture(async (input) => {
    if (input.operation === 'settings_save') {
      assert.equal(input.expectedVersion, version);
      saved = { ...input.settings };
      version = '11111111-1111-1111-1111-111111111111';
      writes++;
    }
    return { settings: { ...saved }, version, workerEnabled: true };
  });
  const d = dom.window.document;
  d.querySelector('button').click();
  await tick();
  assert.equal(writes, 0);
  d.querySelector('[name=thresholdEnabled]').checked = true;
  d.querySelector('[name=thresholdPercent]').value = '97.5';
  d.querySelector('form').dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
  await tick();
  assert.equal(writes, 1);
  assert.equal(saved.thresholdPercent, 97.5);
  d.querySelector('[data-close]').click();
  d.querySelector('button').click();
  await tick();
  assert.equal(d.querySelector('[name=thresholdPercent]').value, '97.5');
  assert.match(d.querySelector('[role=status]').textContent, /调度已启用/);
  dom.window.close();
});
test('failed reads and late identity results cannot enable controls or restore old user settings', async () => {
  let complete;
  const pending = new Promise((resolve) => {
    complete = resolve;
  });
  const dom = fixture(() => pending),
    d = dom.window.document;
  d.querySelector('button').click();
  dom.window.dispatchEvent(new dom.window.Event('gea-session-changing'));
  complete({
    settings: { ...settings, thresholdEnabled: true },
    version: '0',
    workerEnabled: true,
  });
  await tick();
  assert.equal(d.querySelector('dialog').open, false);
  assert.equal(d.querySelector('[name=thresholdEnabled]').checked, false);
  assert.equal(d.querySelector('[type=submit]').disabled, true);
  dom.window.close();
  const denied = fixture(async () => {
    throw Error('权限已撤销');
  });
  denied.window.document.querySelector('button').click();
  await tick();
  assert.equal(denied.window.document.querySelector('[type=submit]').disabled, true);
  denied.window.close();
});
