import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
const config = JSON.parse(await readFile('business/inventory-qll/sql.config.json', 'utf8'));
const output = await build({
  entryPoints: ['business/shared/qll-category-tree.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { categorySummary, categoryTreeReader, treeRatio } = await import(
  'data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].text).toString('base64')
);

test('company categories combine quantities and weights without adding channel stock or averaging layer means', () => {
  const row = (inventory, age_qty, age_sum) => ({
    node_key: '汤圆',
    inventory,
    age_qty,
    age_sum,
    overaged: 0,
    risk_rank: 8,
  });
  const result = categorySummary('汤圆', {
    base: [row(100, 100, 1000)],
    branch: [row(900, 900, 27000)],
    customer: [row(500, 500, 50000)],
  });
  assert.equal(result.inventory, 1000);
  assert.equal(result.customer_inventory, 500);
  assert.equal(treeRatio(result.age_sum, result.age_qty), 28);
  assert.equal(categorySummary('汤圆', { base: [row(100, 100, 1000)] }).inventory, null);
  assert.equal(categorySummary('汤圆', { base: [row(100, 100, 1000)], branch: [] }).inventory, 100);
});
test('leaf requests use exact parents, bound search/risk, ten visible rows and an eleventh lookahead', async () => {
  const calls = [];
  const read = categoryTreeReader(config, async (request, options) => {
    calls.push(options);
    const columns = config.queries[options.queryId].resultColumns;
    return {
      rows: Array.from({ length: 11 }, (_, i) =>
        Object.fromEntries(columns.map((c) => [c, c === 'node_key' ? String(i) : null])),
      ),
      returnedColumns: columns,
      rejectedColumns: [],
      configVersion: 'test',
    };
  });
  const result = await read(
    'base',
    {
      date: '2026-11-01',
      snapshot: '2026-10-31',
      level: 'sku',
      category: '汤圆',
      organization: '郑州',
      page: 2,
      search: '100%',
      risk: '1',
    },
    new AbortController().signal,
  );
  assert.equal(result.rows.length, 10);
  assert.equal(result.hasNext, true);
  assert.equal(calls.length, 1);
  assert.deepEqual(
    Object.fromEntries(
      [
        'parent_category',
        'parent_organization',
        'tree_search',
        'tree_risk',
        'offset',
        'page_size',
        'stock_month',
        'order_start',
        'order_end_exclusive',
      ].map((k) => [k, calls[0].values[k]]),
    ),
    {
      parent_category: '汤圆',
      parent_organization: '郑州',
      tree_search: '%100\\%%',
      tree_risk: '1',
      offset: 10,
      page_size: 11,
      stock_month: '2026-10-01',
      order_start: '2026-11-01',
      order_end_exclusive: '2026-11-02',
    },
  );
});
test('hierarchy uses distinct branch codes and province keys, aggregates before leaf risk filtering', () => {
  const branch = config.queries['category-tree.branch'].request.sql;
  const customer = config.queries['category-tree.customer'].request.sql;
  assert.match(branch, /b\.warehouse_classify = '20'/);
  assert.match(branch, /r\.warehouseid AS organization/);
  assert.match(customer, /r\.province AS organization/);
  for (const layer of ['base', 'branch', 'customer']) {
    const sql = config.queries[`category-tree.${layer}`].request.sql;
    assert.match(sql, /HAVING \(:gea_p9100 <> 'sku'/);
    assert.match(sql, /LIMIT :gea_p9105 OFFSET :gea_p9106$/);
    assert.doesNotMatch(sql, /OVER\s*\(/i);
  }
});
