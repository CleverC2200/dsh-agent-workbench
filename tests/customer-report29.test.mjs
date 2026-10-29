import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  sortCustomerRows,
  customerAssessmentNote,
} from '../prototypes/inventory-customer/table-state.js';
import { customerInventoryStatus } from '../prototypes/inventory-customer/customer-inventory-model.js';
import { validatePageCatalog } from '../src/page-bridge/catalog.ts';
import { htmlPageCatalog } from '../src/html-page-catalog.ts';

test('sort the full index before paging, retain zero, keep unknown last and ties stable', () => {
  const rows = [
    { code: 'X', value: null },
    ...Array.from({ length: 15 }, (_, value) => ({ code: String(value), value })),
  ];
  const asc = sortCustomerRows(rows, { field: 'value', direction: 'ascend' });
  const desc = sortCustomerRows(rows, { field: 'value', direction: 'descend' });
  assert.deepEqual(
    asc.slice(0, 6).map((row) => row.value),
    [0, 1, 2, 3, 4, 5],
  );
  assert.deepEqual(
    desc.slice(0, 6).map((row) => row.value),
    [14, 13, 12, 11, 10, 9],
  );
  assert.equal(asc.at(-1).value, null);
  assert.equal(desc.at(-1).value, null);
  assert.equal(new Set([...asc.slice(0, 6), ...asc.slice(6, 12)].map((row) => row.code)).size, 12);
  assert.equal(sortCustomerRows(rows, {}), rows);
  assert.equal(rows[0].value, null);
});

test('missing structure stays explicit without concealing an established large-date warning', () => {
  const row = { structureScore: null, largeDateRatio: 16.4 };
  assert.equal(customerInventoryStatus(row), 'attention');
  assert.equal(customerAssessmentNote(row), '数据不足（结构分缺失）');
  assert.equal(customerAssessmentNote({ structureScore: 90, largeDateRatio: 0 }), '');
  assert.match(
    customerAssessmentNote({ structureScore: 90, largeDateRatio: null }),
    /大日期占比不完整/,
  );
});

test('authored controls apply only validated view changes and register filter action', async () => {
  const source = await readFile(
    new URL('../prototypes/inventory-customer/controls.js', import.meta.url),
    'utf8',
  );
  const { customerControls } = await import(
    'data:text/javascript;base64,' +
      Buffer.from(source.replace(/^import .*\n/, '')).toString('base64')
  );
  const changes = {};
  const setters = Object.fromEntries(
    ['region', 'status', 'tab', 'search', 'page'].map((key) => [
      key,
      (value) => {
        changes[key] = value;
      },
    ]),
  );
  const controls = customerControls(
    { region: 'all', status: 'all', tab: 'overview', search: '', page: 1, pageCount: 3 },
    setters,
    ['华南'],
  );
  assert.equal(controls.elements.filter((element) => element.editable).length, 5);
  assert.doesNotThrow(() =>
    validatePageCatalog(
      htmlPageCatalog({
        surface: 'inventory-customer',
        tool: 'gea_plugin_page_apply',
        label: 'Customer controls',
        elements: controls.elements,
      }),
    ),
  );
  controls.filter({ region: '华南', tab: 'risk' });
  assert.deepEqual(changes, { region: '华南', tab: 'risk' });
  assert.throws(() => controls.filter({ region: 'outside', status: 'risk' }), /VALUE_INVALID/);
  assert.equal(changes.status, undefined, 'invalid batches must not partially apply');
  assert.throws(() => controls.filter({ consumerCode: 'other' }), /CONTROL_UNKNOWN/);
  assert.throws(() => controls.filter({ page: 4 }), /VALUE_INVALID/);
  controls.apply({ target: 'customer-control:search', kind: 'setValue', value: '海口' });
  assert.equal(changes.search, '海口');
  const signal = AbortSignal.abort(Error('identity changed'));
  assert.throws(() => controls.filter({ page: 2 }, { signal }), /identity changed/);
  assert.match(source, /action\('filter'/);
  const app = await readFile(
    new URL('../prototypes/inventory-customer/application.js', import.meta.url),
    'utf8',
  );
  assert.ok(app.includes('if(extra?.action!=="sort")return;'));
  assert.ok(app.includes('sortOrder:customerSorter.field===col.dataIndex'));
  assert.ok(app.includes('pageControlsById:Object.fromEntries(customerControls('));
  assert.ok(app.includes('registeredPageActions:["filter"]'));
});
