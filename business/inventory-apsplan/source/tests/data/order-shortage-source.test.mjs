import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const registry = JSON.parse(
  await readFile(new URL('../../app/data/gea-queries.json', import.meta.url), 'utf8'),
);
const requirements = JSON.parse(
  await readFile(new URL('../fixtures/gea-resource-requirements.json', import.meta.url), 'utf8'),
);
const keys = ['orders', 'orders-month', 'orders-products', 'orders-month-products'];

test('order fulfillment reads the synchronized shortage supply match snapshot', () => {
  for (const key of keys) {
    const { sql, parameters } = registry.queries[key];
    assert.match(sql, /FROM agents_scm_shortage_supply_match AS s/);
    assert.doesNotMatch(sql, /agents_scm_order_fulfillment/);
    assert.match(sql, /need_qty_origin\*s\.source_rows/);
    assert.match(sql, /final_short_qty\*s\.source_rows/);
    assert.match(sql, /s\.addtime>=CAST\(:gea_p1 AS DATE\)/);
    assert.deepEqual(parameters, ['start', 'end']);
    assert.deepEqual(requirements.resourcesBySection[key], ['agents_scm_shortage_supply_match']);
  }
});

test('order product drill-down uses published shortage dimensions', () => {
  const sql = registry.queries['orders-products'].sql;
  assert.match(sql, /pickup_point_desc_short_form AS base/);
  assert.match(sql, /product_categ_name AS category/);
  assert.match(sql, /pinxiang AS item/);
  assert.match(sql, /xilie AS material/);
});
