import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { formatCustomerQuantity } from '../prototypes/inventory-customer/quantity-format.js';

test('missing quantities omit units while real zero retains its unit', () => {
  for (const value of [null, undefined, NaN, Infinity]) {
    for (const unit of ['万', '箱', '%', '天', '分']) {
      assert.equal(formatCustomerQuantity(value, unit, 1), '—');
    }
  }
  assert.equal(formatCustomerQuantity(0, '万', 1), '0.0万');
  assert.equal(formatCustomerQuantity(462.54, '万', 1), '462.5万');
  assert.equal(formatCustomerQuantity(87929, '箱'), '87,929箱');
});

test('customer table and diagnostic metrics use the missing-safe unit formatter', async () => {
  const source = await readFile(
    new URL('../prototypes/inventory-customer/application.js', import.meta.url),
    'utf8',
  );
  assert.ok(source.includes('formatCustomerQuantity(N,"万",1)'));
  assert.ok(source.includes('formatCustomerQuantity(N,"箱")'));
  assert.ok(!source.includes('pe(N,1),"\\u4E07"'));
  assert.ok(!source.includes('${pe(d.value,1)} \\u4E07'));
});
