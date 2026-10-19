import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { resolve } from 'node:path';
import { selectDefaultPublishedTargetInventory } from '../business/inventory-aqkc/source/aqkc/web/src/lib/target-inventory-version-policy.js';

const compiled = await build({
  stdin: {
    contents: `
      export * from './business/inventory-aqkc/source/aqkc/web/src/lib/cube-dashboard.ts';
      export { safetyStockRowsForBase } from './business/inventory-aqkc/source/aqkc/web/src/lib/workbench-sql.ts';
    `,
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  plugins: [
    {
      name: 'gea-host',
      setup(api) {
        api.onResolve({ filter: /^dsh-agent-manage\/inventory-compute\/[a-z-]+$/ }, ({ path }) => ({
          path: resolve('../dsh-agent-manage/src/' + path.split('/').slice(1).join('/') + '.ts'),
        }));
        // Only the external Host RPC is replaced. Calculation and formatting modules are real.
        api.onResolve({ filter: /channel\.js$/ }, () => ({
          path: 'gea-host',
          namespace: 'host',
        }));
        api.onLoad({ filter: /.*/, namespace: 'host' }, () => ({
          contents: 'export const call=(...args)=>globalThis.stockSourceHost(...args);',
        }));
      },
    },
  ],
});
const {
  alignAgeInventory,
  missingSafetyStockTargetBases,
  targetInventoryOutput,
  safetyStockRowsForBase,
  loadInventoryDashboardTabs,
} = await import(
  'data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64')
);
const target = (material, current, finalTarget) => ({
  'safety_stock.base_name': '遂平',
  'safety_stock.material_code': material,
  'safety_stock.current_inventory': current,
  'safety_stock.final_target_inventory': finalTarget,
});
const age = (material, current) => ({
  'inventory_age.base_name': '遂平',
  'inventory_age.material_code': material,
  'inventory_age.current_inventory': current,
});
test('遂平 uses age total including age-only SKUs; target is unchanged', () => {
  const rows = alignAgeInventory(
    [target('A', 1024477, 833875)],
    [age('A', 1024477), age('B', 18549)],
  );
  const current = rows.reduce((sum, row) => sum + Number(row['safety_stock.current_inventory']), 0);
  assert.equal(current, 1043026);
  assert.equal(rows[0]['safety_stock.final_target_inventory'], 833875);
  assert.equal(current - 833875, 209151);
  assert.equal(rows[1]['safety_stock.final_target_inventory'], undefined);
});
test('duplicate target rows do not duplicate age stock', () => {
  const rows = alignAgeInventory(
    [target('A', 100, 80), target('A', 100, 80)],
    [age('A', 12), age('A', 8)],
  );
  assert.equal(
    rows.reduce((sum, row) => sum + Number(row['safety_stock.current_inventory']), 0),
    20,
  );
});
test('unknown quantities never use old stock and explicit zero remains zero', () => {
  const rows = alignAgeInventory([target('A', 100, 80), target('B', 50, 40)], [age('A', 0)]);
  assert.equal(rows[0]['safety_stock.current_inventory'], 0);
  assert.equal(rows[1]['safety_stock.current_inventory'], null);
  assert.throws(() => alignAgeInventory([target('A', 100, 80)], []), /暂无货龄库存/);
  assert.throws(() => alignAgeInventory([], [age('A', null)]), /货龄库存量缺失/);
});
test('age-only bases are identified instead of being counted as target coverage', () => {
  const targets = [target('A', 10, 8)];
  const ages = [
    age('A', 10),
    {
      'inventory_age.base_name': '华南',
      'inventory_age.material_code': 'B',
      'inventory_age.current_inventory': 20,
    },
  ];
  assert.deepEqual(missingSafetyStockTargetBases(targets, ages), ['华南']);
  const rows = alignAgeInventory(targets, ages);
  assert.equal(rows[1]['safety_stock.source'], 'age-only');
  assert.equal(rows[1]['safety_stock.final_target_inventory'], undefined);
});
test('age-only seasonal SKU does not fabricate a zero target', () => {
  assert.equal(
    targetInventoryOutput({
      'safety_stock.source': 'age-only',
      'safety_stock.product_categ_name': '粽子',
    }),
    null,
  );
  assert.equal(
    targetInventoryOutput({
      'safety_stock.product_categ_name': '粽子',
      'safety_stock.planned_daily_demand': 0,
    }),
    0,
  );
});
test('all five bases remain in the September 23 next-month rolling scope', () => {
  const bases = ['华东', '华南', '西南', '遂平', '郑州'];
  const rows = bases.map((base) => ({
    'safety_stock.base_name': base,
    'safety_stock.target_month': '2026-10-01',
    'safety_stock.inventory_version': '滚动',
  }));
  const selected = selectDefaultPublishedTargetInventory(rows, new Date('2026-09-23T01:00:00Z'));
  assert.equal(selected.targetMonth, '2026-10-01');
  assert.equal(selected.inventoryVersion, '滚动');
  assert.deepEqual(
    missingSafetyStockTargetBases(
      rows,
      bases.map((base) => ({ 'inventory_age.base_name': base })),
    ),
    [],
  );
});

test('missing-base retry uses the governed source with a named base parameter', () => {
  const query = safetyStockRowsForBase('华南');
  assert.deepEqual(query.parameters, { gea_p1: '华南' });
  assert.match(query.sql, /FROM agents_scm_safety_stock AS stock/);
  assert.match(query.sql, /stock\.base_name = :gea_p1/);
  assert.match(
    query.sql,
    /stock\.final_target_inventory AS "safety_stock\.final_target_inventory"/,
  );
  assert.doesNotMatch(query.sql, /\bOVER\s*\(|SELECT\s+\*/i);
});

test('age structure aggregates current inventory through the dashboard tab', async (t) => {
  const previousHost = globalThis.stockSourceHost;
  t.after(() => {
    if (previousHost === undefined) delete globalThis.stockSourceHost;
    else globalThis.stockSourceHost = previousHost;
  });
  globalThis.stockSourceHost = async (method, { sql }) => {
    assert.equal(method, 'sql');
    return {
      rows: sql.includes('inventory_age.current_inventory')
        ? [{ dsh_group: 0, dsh_count: 2, dsh_rows: JSON.stringify([age('A', 12), age('B', 8)]) }]
        : [
            {
              'safety_stock.base_name': '遂平',
              'safety_stock.target_month': '2026-10-01',
              'safety_stock.inventory_version': '滚动',
            },
          ],
    };
  };
  const tabs = await loadInventoryDashboardTabs(undefined, undefined, undefined, '货龄结构');
  const rows = tabs.货龄结构.rows;
  assert.equal(rows[0].level, '遂平');
  assert.equal(rows[0].current, '20');
  assert.equal(rows[0].skuCount, '2');
});
