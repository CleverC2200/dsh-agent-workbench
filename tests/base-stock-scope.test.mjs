import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath } from 'node:url';

function load(entry) {
  const output = buildSync({
    entryPoints: [fileURLToPath(new URL(entry, import.meta.url))],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
  }).outputFiles[0].text;
  const module = { exports: {} };
  new Function('module', 'exports', output)(module, module.exports);
  return module.exports;
}

const { workbenchSql } = load(
  '../business/inventory-aqkc/source/aqkc/web/src/lib/workbench-sql.ts',
);
const { dailyReportSql } = load(
  '../business/inventory-aqkc/source/aqkc/web/src/lib/daily-report-sql.ts',
);

test('all base-stock queries exclude warehouses classified as branches', () => {
  for (const query of [
    workbenchSql.supportByBase(60),
    workbenchSql.ageStructure(60),
    workbenchSql.currentOrders,
    workbenchSql.currentOrderSkus,
    dailyReportSql.age,
  ]) {
    assert.match(query.sql, /branch_warehouses AS/i, query.name);
    assert.match(query.sql, /warehouse_classify\s*=\s*'20'/i, query.name);
    assert.match(query.sql, /branch\.warehouseid IS NULL/i, query.name);
  }
});

test('header over-age inventory and age tab use strictly more than 60 days', () => {
  assert.match(workbenchSql.supportByBase(60).sql, /productage > 60 THEN qty/i);
  assert.match(workbenchSql.ageStructure(60).sql, /age\.productage > 60 THEN age\.qty/i);
});
