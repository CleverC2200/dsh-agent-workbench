import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
const compiled = await build({
  stdin: {
    contents:
      "export * from './business/shared/original-business-views.ts';export * from './business/inventory-fc/source/fc/src/lib/replenishment-columns.ts';",
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
const views = await import(
  'data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64')
);
const config = async (id) =>
  JSON.parse(await readFile(`business/inventory-${id}/sql.config.json`, 'utf8'));
test('FC replenishment keeps every original business column in its original order', async () => {
  const c = await config('fc');
  assert.deepEqual(
    views
      .originalFcView(c, 'replenishment')
      .columns.map((c) => c.label)
      .filter((label) => !['上月实际出库量', '本月日均出库量'].includes(label)),
    Object.values(views.REPLENISHMENT_COLUMNS).map(
      (label) =>
        ({
          备单中量: '当前未备单需求',
          本月调拨未发: '当前调拨备单',
          本月调拨在途: '当前调拨在途',
          安全库存天数: '目标覆盖天数',
          计划来源: '取数来源',
        })[label] ?? label,
    ),
  );
  const labels = views.originalFcView(c, 'replenishment').columns.map((column) => column.label);
  assert.deepEqual(labels.slice(labels.indexOf('30日日均') + 1, labels.indexOf('30日日均') + 3), [
    '上月实际出库量',
    '本月日均出库量',
  ]);
});
test('QLL organization uses the original structure columns, with pieces for company stock and boxes for dealer stock', async () => {
  const c = await config('qll');
  assert.equal(views.originalQllView(c, 'category').columns[0].valueField, 'category');
  assert.equal(views.originalQllView(c, 'structure').columns[0].valueField, 'base');
  const original = await readFile(
    'business/inventory-qll/source/inventory-light-plugins/src/pages/qll/components/reference-structure.tsx',
    'utf8',
  );
  const labels = [...original.matchAll(/title: '([^']+)'/g)]
    .map((m) => m[1])
    .filter((v) => !v.startsWith('渠道日快照库存'));
  assert.deepEqual(
    views.originalQllView(c, 'structure').columns.map((c) => c.label),
    ['组织 / 品类 / SKU', ...labels],
  );
  assert.equal(
    views
      .originalQllLayerView(c, 'customer', true)
      .columns.some((c) => c.label === '渠道日快照库存（箱）'),
    true,
  );
});
test('presentation selection never changes SQL, parameters, permissions or source columns', async () => {
  for (const id of ['fc', 'qll', 'dealer']) {
    const c = await config(id),
      before = structuredClone(c);
    const list =
      id === 'fc'
        ? ['replenishment', 'orders', 'structure', 'plan', 'base']
        : id === 'qll'
          ? ['category', 'structure', 'aging', 'shortage']
          : [
              'customer-stock',
              'category-stock',
              'sku-stock',
              'shortage-stock',
              'expiry',
              'catalog',
              'policies',
            ];
    for (const tab of list) {
      const p =
        id === 'fc'
          ? views.originalFcView(c, tab)
          : id === 'qll'
            ? views.originalQllView(c, tab)
            : views.originalDealerView(c, tab);
      assert.equal(
        new Set(p.columns.map((c) => c.field)).size,
        p.columns.length,
        `${id}/${tab}: duplicate display column`,
      );
      assert.ok(
        p.columns.every((c) => c.label && c.label !== '-'),
        `${id}/${tab}: original label missing`,
      );
    }
    assert.deepEqual(c, before);
  }
});
