import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import {
  customerObservationNotice,
  customerObservationChange,
  showCustomerObservation,
} from '../prototypes/inventory-customer/observation.js';

test('card scope uses a concise note without counts or technical timestamps', () => {
  const value = { summary: { customerCodes: ['a', 'b'] }, totalFilteredRows: 1 };
  const result = customerObservationNotice(value, '2026-10-29T03:00:00Z');
  assert.equal(result.filtered, true);
  assert.equal(result.text, '顶部卡片统计范围不随下方列表筛选变化。');
  assert.doesNotMatch(result.text, /2026|Cube|接收时间|当前列表/);
  assert.equal(customerObservationNotice({ ...value, totalFilteredRows: 2 }).filtered, false);
});

test('scope note stays below the cards without a banner or duplicate notices', () => {
  const dom = new JSDOM(
    '<section class="metric-section"><div class="metric-grid">cards</div></section><section class="dealer-table-card"></section>',
  );
  const document = dom.window.document;
  const value = { summary: { customerCodes: ['a', 'b'] }, totalFilteredRows: 1 };
  showCustomerObservation(value, 'time', document, 'change');
  showCustomerObservation(value, 'new-time', document, 'new-change');
  const notice = document.querySelector('.customer-observation-notice');
  assert.equal(notice.previousElementSibling.className, 'metric-grid');
  assert.equal(document.querySelectorAll('.customer-observation-notice').length, 1);
  assert.equal(notice.style.cssText, '');
  assert.equal(notice.getAttribute('role'), 'note');
  dom.window.close();
});

test('only a new observation in the same scope triggers a quantity refresh notice', () => {
  const before = { at: 'first', scope: 'scope', quantity: 20 };
  assert.match(
    customerObservationChange(before, { ...before, at: 'next', quantity: 18 }),
    /20 箱变为 18 箱/,
  );
  assert.equal(customerObservationChange(before, { ...before, quantity: 18 }), '');
  assert.equal(
    customerObservationChange(before, { ...before, at: 'next', scope: 'another', quantity: 18 }),
    '',
  );
  assert.equal(customerObservationChange(before, { ...before, at: 'next', quantity: null }), '');
});

test('context reporting reuses data observation time instead of manufacturing a new snapshot', async () => {
  const source = await readFile(
    new URL('../prototypes/inventory-customer/entry.js', import.meta.url),
    'utf8',
  );
  const report = source.slice(
    source.indexOf('function report(value)'),
    source.indexOf('async function reloadCustomerInventory'),
  );
  assert.match(report, /capturedAt: dataCapturedAt/);
  assert.match(report, /value.capturedAt !== dataCapturedAt/);
  assert.doesNotMatch(report, /new Date/);
  assert.match(report, /不是数据库不可变快照/);
});
