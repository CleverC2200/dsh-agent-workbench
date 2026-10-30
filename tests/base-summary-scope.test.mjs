import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const config = JSON.parse(await readFile('business/inventory-aqkc/sql.config.json', 'utf8'));
const bundle = await build({
  entryPoints: ['business/inventory-aqkc/source/aqkc/web/src/lib/cube-dashboard.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  plugins: [
    {
      name: 'host-only',
      setup(api) {
        api.onResolve({ filter: /channel\.js$/ }, () => ({ path: 'host', namespace: 'host' }));
        api.onLoad({ filter: /.*/, namespace: 'host' }, () => ({
          contents:
            'export const ready=Promise.resolve();export const call=(...args)=>globalThis.baseSummaryHost(...args);',
        }));
        api.onResolve({ filter: /^dsh-agent-manage\/inventory-compute\/[a-z-]+$/ }, (x) => ({
          path: resolve(
            '../dsh-agent-manage/src/inventory-compute',
            x.path.split('/').at(-1) + '.ts',
          ),
        }));
      },
    },
  ],
});
const previous = new Map(
  ['window', 'document', 'baseSummaryHost'].map((key) => [
    key,
    Object.getOwnPropertyDescriptor(globalThis, key),
  ]),
);
globalThis.window = new EventTarget();
globalThis.document = {
  getElementById: (id) =>
    id === 'agent-sql-config' ? { textContent: JSON.stringify(config) } : null,
};
const { loadInitialDashboard, loadInventorySkuPage } = await import(
  'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64')
);
const bases = ['华东', '郑州'];
const values = {
  华东: { stock: 100, weight: 10, age: 10, demand: 8 },
  郑州: { stock: 900, weight: 90, age: 30, demand: 12 },
};
let failStock = false;
globalThis.baseSummaryHost = async (_, call) => {
  const id = call.queryId,
    columns = config.queries[id].resultColumns;
  const row = (extra) => Object.fromEntries(columns.map((k) => [k, extra[k] ?? null]));
  let rows;
  if (id === 'calendar.target_versions')
    rows = [{ month: new Date().toISOString().slice(0, 7) + '-01', inventory_version: '滚动' }];
  else if (id === 'source.health-date') rows = [{ day: new Date().toISOString().slice(0, 10) }];
  else if (['page.inventory-groups', 'page.dashboard-groups'].includes(id)) {
    if (failStock) throw Error('STOCK_SOURCE_FAILED');
    // Deliberately return a wider scope; the page must still enforce the selected scope.
    rows = bases.map((base) =>
      row({
        base,
        category: '汤圆',
        row_count: 1,
        inventory: values[base].stock,
        inventory_count: 1,
        inventory_complete: values[base].stock,
        age_weighted_sum: values[base].weight * values[base].age,
        age_qty: values[base].weight,
      }),
    );
  } else if (id === 'page.sku-detail.atomic') {
    rows = Array.from(
      { length: Math.min(call.parameters.page_size, 25 - call.parameters.offset) },
      (_, i) =>
        row({
          base: '郑州',
          sku: String(call.parameters.offset + i),
          material_name: '零库存商品',
          category: '汤圆',
          inventory: 0,
          target: 0,
          daily_demand: 0,
          rolling_ship_positive: 0,
          stock_source_rows: 1,
          target_source_rows: 1,
          page_scope_total: 25,
          page_row_present: 1,
        }),
    );
  } else if (id === 'page.workbench-support-by-base')
    rows = bases.map((base) =>
      row({
        base,
        domain: 'order',
        ordered: 10,
        need: 10,
        shortage: 0,
        shipped_order_quantity: 10,
        shipped_quantity: 10,
      }),
    );
  else if (id === 'page.health-groups')
    rows = bases
      .filter((base) => !call.parameters.bases_enabled || call.parameters.bases.includes(base))
      .map((base) =>
        row({
          level: base,
          average_age: values[base].age,
          weighted_age_sum: values[base].weight * values[base].age,
          age_weight_qty: values[base].weight,
          row_count: 1,
          age_valid_count: 1,
          max_age: values[base].age,
        }),
      );
  else if (id === 'current-shortage.locations')
    rows = bases.map((base) =>
      row({
        base,
        location_type: '基地',
        demand: values[base].demand,
        allocated: 0,
        remaining: values[base].demand,
        available: 0,
        shortage: values[base].demand,
        invalid: 0,
      }),
    );
  else throw Error('UNEXPECTED_QUERY:' + id);
  return { rows, returnedColumns: columns, rejectedColumns: [], configVersion: 'fixture' };
};
test('all and selected-base cards reconcile additive stock/orders and weight age rather than average averages', async (t) => {
  t.after(() => {
    for (const [key, value] of previous) {
      if (value) Object.defineProperty(globalThis, key, value);
      else delete globalThis[key];
    }
  });
  const all = await loadInitialDashboard();
  const selected = await loadInitialDashboard(undefined, undefined, undefined, ['郑州']);
  const kpi = (w, label) => w.kpis.find((k) => k.label === label).value;
  assert.equal(kpi(all, '当前库存'), '1,000');
  assert.equal(kpi(selected, '当前库存'), '900');
  assert.equal(kpi(all, '平均货龄'), '28.0天');
  assert.equal(kpi(selected, '平均货龄'), '30.0天');
  assert.equal(kpi(all, '当前订单'), '20');
  assert.equal(kpi(selected, '当前订单'), '12');
  assert.deepEqual(
    selected.table.rows.map((r) => r.level),
    ['郑州'],
  );
  assert.equal(
    selected.table.rows[0].current,
    all.table.rows.find((r) => r.level === '郑州').current,
  );
  const first = await loadInventorySkuPage({ base: '郑州', page: 1, pageSize: 10 });
  const second = await loadInventorySkuPage({
    base: '郑州',
    page: 2,
    pageSize: 10,
    readContext: first.readContext,
  });
  assert.equal(
    first.table.rows.length,
    10,
    'server-paged zero-stock rows cannot disappear during formatting',
  );
  assert.equal(second.table.rows.length, 10);
  assert.equal(first.total, 25);
  assert.equal(second.total, 25);
  assert.equal(first.table.rows[0].current, '0');
  assert.notEqual(first.table.rows[0].level, second.table.rows[0].level);
  failStock = true;
  const partial = await loadInitialDashboard(undefined, undefined, undefined, ['郑州']);
  assert.deepEqual(
    partial.table.rows.map((r) => r.level),
    ['郑州'],
    'stock failure cannot broaden selected scope through national support',
  );
  assert.equal(kpi(partial, '当前库存'), '-');
  assert.equal(kpi(partial, '平均货龄'), '30.0天');
  assert.equal(kpi(partial, '当前订单'), '12');
});
