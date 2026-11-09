import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
const configs = Object.fromEntries(
  await Promise.all(
    ['aqkc', 'fc', 'qll', 'apsplan', 'dealer'].map(async (id) => [
      id,
      JSON.parse(await readFile(`business/inventory-${id}/sql.config.json`)),
    ]),
  ),
);
const bundle = await build({
  entryPoints: ['business/shared/configured-facts.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { readConfiguredFacts } = await import(
  'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64')
);
for (const [agent, viewId, field] of [
  ['apsplan', 'order-plan-source', 'planned'],
  ['qll', 'shipment-batches', 'warehouse_quantity'],
  ['apsplan', 'workflow-source', 'node_num'],
  ['apsplan', 'base-stock-flows', 'produce_in_qty'],
  ['aqkc', 'base-stock-flows', 'transfer_out_qty'],
  ['fc', 'base-stock-flows', 'produce_plan_adj'],
  ['qll', 'base-stock-flows', 'next_month_sales_plan'],
]) {
  test(`${agent} ${viewId}: actual source reader defaults to ten rows and queries the next page`, async () => {
    const config = configs[agent],
      calls = [];
    const execute = async (_, call) => {
      calls.push(call);
      const q = config.queries[call.queryId];
      const rows =
        call.queryId === 'source.customer-analysis-date'
          ? [{ day: '2026-10-18' }]
          : call.queryId.endsWith('.count')
            ? [{ total: 21 }]
            : Array.from({ length: 10 }, (_, i) =>
                Object.fromEntries(
                  q.resultColumns.map((key) => [
                    key,
                    key === field ? 0 : key === 'source_rows' ? 1 : String(i + call.values.offset),
                  ]),
                ),
              );
      return {
        rows,
        returnedColumns: q.resultColumns,
        rejectedColumns: [],
        configVersion: 'fixture',
      };
    };
    const first = await readConfiguredFacts(
      config,
      viewId,
      { asOf: '2026-10-19', customer: 'C1' },
      { execute },
    );
    assert.equal(first.pageSize, 10);
    assert.equal(first.rows[0][field], 0);
    const second = await readConfiguredFacts(
      config,
      viewId,
      { asOf: '2026-10-19', customer: 'C1', page: 2 },
      { execute },
    );
    assert.equal(second.total, 21);
    assert.ok(calls.some((c) => c.values.offset === 10 && c.values.page_size === 10));
    assert.ok(calls.every((c) => !c.queryId.startsWith('source.stock')));
  });
}
test('new data-source authorization failures are not retried as another source', async () => {
  let calls = 0;
  await assert.rejects(
    readConfiguredFacts(
      configs.apsplan,
      'order-plan-source',
      { asOf: '2026-10-19' },
      {
        execute: async () => {
          calls++;
          throw Object.assign(Error('denied'), { code: 'NO_RETURN_COLUMN_ALLOWED' });
        },
      },
    ),
    { code: 'NO_RETURN_COLUMN_ALLOWED' },
  );
  assert.equal(calls, 1);
});
for (const agent of ['aqkc', 'fc', 'qll', 'apsplan'])
  test(`${agent} health source exposes a unique SKU name without multiplying inventory rows`, () => {
    const c = configs[agent];
    assert.ok(c.queries['health.detail'].resultColumns.includes('material_name'));
    assert.match(c.queries['health.detail'].request.sql, /LEFT JOIN sku_names/);
    if (c.queries['health.detail.atomic'])
      assert.ok(c.queries['health.detail.atomic'].resultColumns.includes('material_name'));
    for (const v of c.sourceViews.views.filter((v) => v.queryId === 'health.detail')) {
      const col = v.columns.find((col) => col.label === '产品名称' || col.label === '商品名称');
      if (col) {
        assert.equal(col.field, 'material_name');
        assert.ok(!col.unavailable);
      }
    }
  });

test('unpublished customer analysis stays unavailable without a denied query or fallback', async () => {
  const config = structuredClone(configs.dealer);
  config.agentId = 'inventory-unpublished-fixture';
  delete config.sourceViews.views.find((view) => view.id === 'customer-plan-analysis').queryId;
  let calls = 0;
  const result = await readConfiguredFacts(
    config,
    'customer-plan-analysis',
    { asOf: '2026-10-19', customer: 'C1' },
    {
      execute: async () => {
        calls++;
        throw Error('must not query an unavailable dataset');
      },
    },
  );
  assert.equal(result.status, 'unavailable');
  assert.equal(calls, 0);
  assert.equal(result.total, null);
  assert.deepEqual(result.rows, []);
});
test('order plan source never accumulates monthly plans repeated across dates', () => {
  for (const agent of ['apsplan', 'aqkc', 'qll']) {
    const sql = configs[agent].queries['order_plan_source.detail'].request.sql;
    assert.doesNotMatch(
      sql,
      /SUM\(t\.(allnum|plan_order_qty_origin|plan_act_dl_qty|demand_change_outqty|plan_inner_outqty)\)/i,
    );
    assert.match(sql, /COUNT\(DISTINCT t\.allnum\)=1/);
    assert.match(sql, /GROUP BY t\.fromorderno_month/);
  }
});
