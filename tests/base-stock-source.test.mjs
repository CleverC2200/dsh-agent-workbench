import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
const source = readFileSync(
  new URL('../business/inventory-aqkc/source/aqkc/web/src/lib/cube-dashboard.ts', import.meta.url),
  'utf8',
);
const helper = source.slice(
  source.indexOf('export function alignAgeInventory'),
  source.indexOf('type DetailFilters'),
);
const code = transformSync(helper, { loader: 'ts', format: 'cjs' }).code;
const module = { exports: {} };
new Function('module', 'exports', code)(module, module.exports);
const { alignAgeInventory, missingSafetyStockTargetBases } = module.exports;
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
const targetOutputSource = source.slice(
  source.indexOf('export function targetInventoryOutput'),
  source.indexOf('function targetInventoryDisplay'),
);
const targetOutputCode = transformSync(
  'const numberOf = value => Number(value ?? 0);\n' + targetOutputSource,
  { loader: 'ts', format: 'cjs' },
).code;
const targetOutputModule = { exports: {} };
new Function('module', 'exports', targetOutputCode)(targetOutputModule, targetOutputModule.exports);
test('age-only seasonal SKU does not fabricate a zero target', () => {
  assert.equal(
    targetOutputModule.exports.targetInventoryOutput({
      'safety_stock.source': 'age-only',
      'safety_stock.product_categ_name': '粽子',
    }),
    null,
  );
  assert.equal(
    targetOutputModule.exports.targetInventoryOutput({
      'safety_stock.product_categ_name': '粽子',
      'safety_stock.planned_daily_demand': 0,
    }),
    0,
  );
});
const versionPolicySource = readFileSync(
  new URL(
    '../business/inventory-aqkc/source/aqkc/web/src/lib/target-inventory-version-policy.js',
    import.meta.url,
  ),
  'utf8',
);
const versionPolicyCode = transformSync(versionPolicySource, { loader: 'js', format: 'cjs' }).code;
const versionPolicyModule = { exports: {} };
new Function('module', 'exports', versionPolicyCode)(
  versionPolicyModule,
  versionPolicyModule.exports,
);
test('all five bases remain in the September 23 next-month rolling scope', () => {
  const bases = ['华东', '华南', '西南', '遂平', '郑州'];
  const rows = bases.map((base) => ({
    'safety_stock.base_name': base,
    'safety_stock.target_month': '2026-10-01',
    'safety_stock.inventory_version': '滚动',
  }));
  const selected = versionPolicyModule.exports.selectDefaultPublishedTargetInventory(
    rows,
    new Date('2026-09-23T01:00:00Z'),
  );
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
  const sqlSource = readFileSync(
    new URL('../business/inventory-aqkc/source/aqkc/web/src/lib/workbench-sql.ts', import.meta.url),
    'utf8',
  );
  const helper = sqlSource.slice(
    sqlSource.indexOf('export function safetyStockRowsForBase'),
    sqlSource.indexOf('export type WorkbenchSqlName'),
  );
  const transformed = transformSync(helper, { loader: 'ts', format: 'cjs' }).code;
  const target = { exports: {} };
  new Function('module', 'exports', transformed)(target, target.exports);
  const query = target.exports.safetyStockRowsForBase('华南');
  assert.deepEqual(query.parameters, { gea_p1: '华南' });
  assert.match(query.sql, /FROM agents_scm_safety_stock AS stock/);
  assert.match(query.sql, /stock\.base_name = :gea_p1/);
  assert.match(
    query.sql,
    /stock\.final_target_inventory AS "safety_stock\.final_target_inventory"/,
  );
  assert.doesNotMatch(query.sql, /\bOVER\s*\(|SELECT\s+\*/i);
});

test('age structure aggregates current inventory without an unrelated age variable', () => {
  const functionSource = source.slice(
    source.indexOf('function aggregateAgeStructureRows'),
    source.indexOf('/** Read-only tab aggregates'),
  );
  const transformed = transformSync(functionSource, { loader: 'ts', format: 'cjs' }).code;
  const aggregate = new Function(
    'categoryName',
    'numberOf',
    'displayNumber',
    'displayQuantityShare',
    `${transformed}\nreturn aggregateAgeStructureRows;`,
  )(
    (value) => String(value ?? '未分类'),
    (value) => Number(value ?? 0),
    (value) => Number(value).toLocaleString('en-US'),
    (value, total) => `${value} / ${total ? `${((value / total) * 100).toFixed(1)}%` : '0.0%'}`,
  );
  const rows = aggregate(
    [
      {
        'inventory_age.base_name': '遂平',
        'inventory_age.material_code': 'A',
        'inventory_age.current_inventory': 12,
      },
      {
        'inventory_age.base_name': '遂平',
        'inventory_age.material_code': 'B',
        'inventory_age.current_inventory': 8,
      },
    ],
    'base',
  );
  assert.equal(rows[0].level, '遂平');
  assert.equal(rows[0].current, '20');
  assert.equal(rows[0].skuCount, '2');
});
