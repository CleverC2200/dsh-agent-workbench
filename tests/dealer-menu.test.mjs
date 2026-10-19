import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const compiled = await build({
  entryPoints: ['src/company/navigation.ts'],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
});
const module = { exports: {} };
new Function('module', 'exports', compiled.outputFiles[0].text)(module, module.exports);
const { BUSINESS_MENU_PRESET, resolveBusinessMenu } = module.exports;
const entries = (available) =>
  resolveBusinessMenu(BUSINESS_MENU_PRESET, new Map(available.map((id) => [id, id]))).find(
    (group) => group.key === 'inventory',
  ).entries;
test('received optional dealer and personal pages join the inventory menu only when the public directory exposes them', () => {
  const visible = entries(['inventory-dealer', 'inventory-personal']);
  assert.equal(visible.find((item) => item.id === 'inventory-dealer')?.disabled, false);
  assert.equal(visible.find((item) => item.id === 'inventory-personal')?.disabled, false);
  const hidden = entries([]);
  assert.equal(
    hidden.some((item) => ['inventory-dealer', 'inventory-personal'].includes(item.id)),
    false,
  );
  assert.equal(hidden.find((item) => item.id === 'inventory-fc')?.disabled, true);
});

test('order menu omits the removed workbench even when an old directory still declares it', () => {
  const orders = resolveBusinessMenu(
    BUSINESS_MENU_PRESET,
    new Map(['inventory-orderworkbench', 'inventory-orderfulfillment'].map((id) => [id, id])),
  ).find((group) => group.key === 'orders');
  assert.deepEqual(
    orders.entries.map((entry) => entry.id),
    ['inventory-orderfulfillment'],
  );
  assert.equal(orders.entries[0].disabled, false);
});
