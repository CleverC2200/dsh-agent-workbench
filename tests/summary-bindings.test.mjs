import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
async function bundle(path) {
  const r = await build({
    entryPoints: [path],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
  });
  return import(
    'data:text/javascript;base64,' + Buffer.from(r.outputFiles[0].text).toString('base64')
  );
}
const { readConfiguredStockSummary } = await bundle(
  'business/inventory-aqkc/source/inventory-light-plugins/src/configured-stock.ts',
);
const { readWorkspaceQuery } = await bundle('business/shared/workspace-query.ts');
const base = JSON.parse(await readFile('business/inventory-aqkc/sql.config.json'));
const aps = JSON.parse(await readFile('business/inventory-apsplan/sql.config.json'));
function executor(c, calls) {
  return async (request, o) => {
    calls.push(o.queryId);
    assert.equal(request.sql.includes('%(gea_'), false);
    let rows;
    if (o.queryId.endsWith('.count')) rows = [{ total: 1 }];
    else if (o.queryId === 'calendar.target_versions')
      rows = [{ month: '2026-10-01', inventory_version: '纠偏' }];
    else if (['source.stock-date', 'source.health-date'].includes(o.queryId))
      rows = [{ day: '2026-10-18' }];
    else
      rows = [
        Object.fromEntries(
          c.queries[o.queryId].resultColumns.map((k) => [
            k,
            k === 'base' ? '郑州' : k === 'category' ? '水饺' : k === 'month' ? '2026-10-01' : 1,
          ]),
        ),
      ];
    return { rows, configVersion: 'test-v1' };
  };
}
test('base summary executes full real configured path without detailed SKU reads', async () => {
  const calls = [];
  const r = await readConfiguredStockSummary(['郑州'], {
    now: new Date('2026-10-19T00:00:00Z'),
    execute: executor(base, calls),
  });
  assert.equal(r.day, '2026-10-18');
  assert.equal(calls.filter((id) => id === 'source.health-date').length, 1);
  assert.equal(r.groups.length, 1);
  assert.ok(calls.includes('page.dashboard-groups'));
  assert.ok(!calls.includes('page.base-stock'));
});
test('every APS landing source selects summary and keeps period parameters', async () => {
  for (const name of Object.keys(aps.workspaceSummaryBindings)) {
    const calls = [];
    await readWorkspaceQuery(
      aps,
      name,
      { summary: true, start: '2026-10-01', end: '2026-10-19', version: '滚动', order_type: 'M' },
      { execute: executor(aps, calls) },
    );
    assert.ok(calls.includes(aps.workspaceSummaryBindings[name].queryId));
    assert.ok(calls.every((q) => q.startsWith('overview.') || q === 'source.stock-date'));
  }
});
test('product expansion is bound as scope parameters, and collapsed scope requests only grouped totals', async () => {
  for (const scope of [
    { mode: 'category', categories: [], items: [] },
    { mode: 'category', categories: ["水饺'"], items: ["水饺'::蒸饺"] },
    { mode: 'base', categories: ['郑州::水饺'], items: ['郑州::水饺::蒸饺'] },
  ]) {
    const calls = [];
    const run = executor(aps, calls);
    let captured;
    await readWorkspaceQuery(
      aps,
      'stock',
      {
        detailMode: 'product',
        productScope: scope,
        start: '2026-10-01',
        end: '2026-10-19',
        version: '滚动',
        order_type: 'M',
      },
      {
        execute: async (request, o) => {
          if (['drill.product.stock', 'drill.product.stock.atomic'].includes(o.queryId)) {
            captured = o.values;
            assert.ok(!request.sql.includes("水饺'"));
          }
          return run(request, o);
        },
      },
    );
    assert.equal(captured.product_group_mode, scope.mode);
    assert.equal(captured.product_categories_enabled, !!scope.categories.length);
    assert.deepEqual(
      captured.product_categories,
      scope.categories.length ? scope.categories : [''],
    );
    assert.deepEqual(captured.product_items, scope.items.length ? scope.items : ['']);
    assert.ok(!calls.some((q) => q === 'page.stock'));
  }
});
