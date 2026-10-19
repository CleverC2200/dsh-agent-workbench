import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
const config = JSON.parse(await readFile('business/inventory-dealer/sql.config.json', 'utf8'));
async function load(path) {
  const r = await build({
    entryPoints: [path],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
  });
  return import(
    'data:text/javascript;base64,' + Buffer.from(r.outputFiles[0].text).toString('base64')
  );
}
const { readConfiguredFacts } = await load('business/shared/configured-facts.ts');
const { dealerStockOverview } = await load(
  'business/inventory-dealer/source/inventory-light-plugins/src/native/dealer-stock-overview.ts',
);
function io(day = '2026-09-22') {
  const calls = [];
  return {
    calls,
    execute: async (_, call) => {
      calls.push(call);
      const q = config.queries[call.queryId],
        columns = q.resultColumns;
      let rows;
      if (call.queryId === 'source.dealer-stock-date') rows = [{ day }];
      else if (columns.includes('total')) rows = [{ total: 23 }];
      else
        rows = Array.from({ length: Math.min(10, 23 - call.values.offset) }, (_, i) =>
          Object.fromEntries(
            columns.map((k) => [
              k,
              k === 'sku'
                ? String(call.values.offset + i)
                : k === 'page_scope_total'
                  ? 23
                  : k === 'page_row_present'
                    ? 1
                    : null,
            ]),
          ),
        );
      return { rows, returnedColumns: columns, rejectedColumns: [], configVersion: 'one' };
    },
  };
}
test('stock uses returned historic date, optional customer and ten-row fresh paging', async () => {
  const source = io();
  const one = await readConfiguredFacts(
    config,
    'sku-stock',
    { asOf: '2026-10-16', customer: 'A' },
    source,
  );
  const two = await readConfiguredFacts(
    config,
    'sku-stock',
    { asOf: '2026-10-16', customer: 'A', page: 2 },
    source,
  );
  assert.equal(one.snapshotDate, '2026-09-22');
  assert.equal(one.rows.length, 10);
  assert.equal(two.rows.length, 10);
  for (const call of source.calls.filter((c) => !c.queryId.startsWith('source.'))) {
    assert.equal(call.values.stat_date, '2026-09-22');
    assert.equal(call.values.customer_mode, 'equal');
    assert.equal(call.values.customer, 'A');
  }
  assert.deepEqual(
    source.calls
      .filter((c) => c.queryId === 'dealer.stock.detail.atomic')
      .map((c) => [c.values.page_size, c.values.offset]),
    [
      [10, 0],
      [10, 10],
    ],
  );
});
test('no snapshot is empty, future snapshot is rejected, catalogue requires selection', async () => {
  const source = io(null);
  const result = await readConfiguredFacts(config, 'sku-stock', { asOf: '2026-09-21' }, source);
  assert.equal(result.total, 0);
  assert.equal(source.calls.length, 1);
  await assert.rejects(readConfiguredFacts(config, 'sku-stock', { asOf: '2026-09-21' }, io()), {
    code: 'INVALID_SOURCE_DATE',
  });
  const cat = await readConfiguredFacts(
    config,
    'catalog',
    { asOf: '2026-10-16' },
    {
      execute: () => {
        throw Error('unscoped catalogue');
      },
    },
  );
  assert.equal(cat.status, 'select_customer');
});
test('headline uses matched rows and units are explicit, zero and unknown remain different', () => {
  const summary = {
    row_count: 5,
    inventory: '15',
    valid_inventory: 3,
    in_transit: '3',
    valid_in_transit: 3,
    total_inventory: '12',
    valid_total_inventory: 2,
    cover_days: '36',
    valid_cover: 2,
  };
  const r = dealerStockOverview(summary, '2026-09-22', config.dealerStockUnits);
  assert.equal(r.matchedTotalInventory, 12);
  assert.notEqual(r.matchedTotalInventory, r.totalInventory + r.totalTransitInventory);
  assert.equal(r.stockCoverDays, 36);
  assert.equal(r.salesQuantityUnit, '箱');
  assert.equal(r.inventoryValueUnit, '元');
  assert.equal(dealerStockOverview(summary).stockCoverDays, null);
  assert.equal(dealerStockOverview(null).matchedTotalInventory, null);
  assert.equal(
    dealerStockOverview({ total_inventory: 0, valid_total_inventory: 1 }).matchedTotalInventory,
    0,
  );
  assert.equal(
    dealerStockOverview({ total_inventory: 0, valid_total_inventory: 0 }).matchedTotalInventory,
    null,
  );
});

test('onhand support is independent of missing transit and still requires confirmed units and valid rows', () => {
  const summary = { valid_onhand_cover: 2, onhand_days: '7.5', valid_cover: 0, cover_days: null };
  const r = dealerStockOverview(summary, '2026-09-22', config.dealerStockUnits);
  assert.equal(r.onhandCoverDays, 7.5);
  assert.equal(r.stockCoverDays, null);
  assert.equal(dealerStockOverview(summary).onhandCoverDays, null);
  assert.equal(
    dealerStockOverview({ ...summary, valid_onhand_cover: 0 }, null, config.dealerStockUnits)
      .onhandCoverDays,
    null,
  );
});
