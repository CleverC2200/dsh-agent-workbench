import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeOperationsTableCell,
  templateOperationsTableCell,
} from '../prototypes/inventory-orderfulfillment/operations-table-cell.mjs';
test('missing table text is normalized while real zero, markup and business labels remain intact', () => {
  for (const value of [
    undefined,
    null,
    '',
    ' ',
    NaN,
    Infinity,
    '<b></b>',
    '<b>undefined</b>',
    '<span>null</span>',
  ]) {
    assert.equal(normalizeOperationsTableCell(value).replace(/<[^>]*>/g, ''), '—');
  }
  assert.equal(normalizeOperationsTableCell(0), '0');
  assert.equal(
    normalizeOperationsTableCell('<b>产品</b> <span>undefined</span>'),
    '<b>产品</b> <span>—</span>',
  );
  assert.equal(
    normalizeOperationsTableCell('<span title="nullable">已知 0</span>'),
    '<span title="nullable">已知 0</span>',
  );
});
test('template display removes generated numeric prefixes while preserving scope in hover text and leaving business names intact', () => {
  const known = templateOperationsTableCell('已知 12.3万');
  assert.equal(known.replace(/<[^>]*>/g, ''), '12.3万');
  assert.match(known, /title="已关联来源小计/);
  const shared = templateOperationsTableCell('<span title="唯一仓库库存池">共享仓库 0</span>');
  assert.equal(shared, '<span title="唯一仓库库存池">0</span>');
  assert.equal(templateOperationsTableCell('<b>已知 1号商品</b>'), '<b>已知 1号商品</b>');
  assert.equal(templateOperationsTableCell(NaN), '—');
});
