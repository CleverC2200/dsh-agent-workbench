import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
const output = await build({
  stdin: {
    contents:
      "export {readConfiguredOverview} from './business/shared/configured-overview.ts'; export {readConfiguredFacts} from './business/shared/configured-facts.ts'; export {inventoryAverageAge} from './business/shared/inventory-age.ts';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { readConfiguredOverview, readConfiguredFacts, inventoryAverageAge } = await import(
  'data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].text).toString('base64')
);
const config = JSON.parse(await readFile('business/inventory-fc/sql.config.json', 'utf8'));
const response = (id) => ({
  configVersion: 'v1',
  rows: [
    Object.fromEntries(
      config.queries[id].resultColumns.map((k) => [
        k,
        {
          day: '2026-10-29',
          snapshot_date: '2026-10-29',
          location_type: '分仓',
          row_count: 1,
          total_qty: 100,
          weighted_age_sum: 5000,
          age_weight_qty: 100,
          weighted_age: 50,
          invalid: 0,
        }[k] ?? 1,
      ]),
    ),
  ],
});
test('selected branch overview retains weighted average age through its summary path', async () => {
  const calls = [];
  const result = await readConfiguredOverview(config, '2026-10-29', '', {
    viewIds: ['branch-stock'],
    warehouseCode: 'A020',
    execute: async (_, o) => {
      calls.push(o.queryId);
      return response(o.queryId);
    },
  });
  assert.equal(result['branch-stock'].summary.total_qty, 100);
  assert.equal(inventoryAverageAge(result['branch-stock'].summary), 50, JSON.stringify(calls));
});

test('all branches and a selected branch both use compact summaries and one shared snapshot read', async () => {
  for (const warehouseCode of ['', 'A020']) {
    const calls = [];
    const result = await readConfiguredOverview(config, '2026-10-29', '', {
      viewIds: ['branch-stock'],
      warehouseCode,
      execute: async (request, o) => {
        calls.push({ id: o.queryId, values: o.values });
        return response(o.queryId);
      },
    });
    assert.equal(result['branch-stock'].error, undefined);
    assert.equal(inventoryAverageAge(result['branch-stock'].summary), 50);
    assert.equal(calls.filter((c) => c.id === 'source.branch-stock-date').length, 1);
    assert.ok(!calls.some((c) => ['health.summary', 'overview.quick-stock'].includes(c.id)));
    assert.ok(!calls.some((c) => c.id === 'health.inventory'));
    assert.ok(calls.some((c) => c.id === 'current-shortage.overview'));
    for (const id of ['source.branch-stock-date', 'health.cards']) {
      const value = calls.find((c) => c.id === id).values.warehouse_code;
      assert.equal(value, warehouseCode || null);
    }
  }
});

test('slow or invalid age data cannot hide or replace ready single-warehouse inventory', async () => {
  let failAge, startedAge;
  const ageStarted = new Promise((resolve) => { startedAge = resolve; });
  const progress = [];
  const pending = readConfiguredOverview(config, '2026-10-29', '', {
    viewIds: ['branch-stock'],
    warehouseCode: 'A020',
    onProgress: (p) => progress.push(p),
    execute: async (_, o) => {
      if (o.queryId === 'health.cards')
        return new Promise((_, reject) => {
          failAge = reject;
          startedAge();
        });
      return response(o.queryId);
    },
  });
  await ageStarted;
  const early = progress.find((p) => p['branch-stock']?.summary?.total_qty === 100);
  assert.ok(early);
  assert.equal(inventoryAverageAge(early['branch-stock'].summary), null);
  failAge(Error('INVALID_AGE_SOURCE'));
  const result = await pending;
  assert.equal(result['branch-stock'].summary.total_qty, 100);
  assert.equal(result['branch-stock'].error, 'INVALID_AGE_SOURCE');
});

test('custom cycles retain the complete card formula instead of the default-cycle shortcut', async () => {
  const calls = [];
  await readConfiguredOverview(config, '2026-10-29', '', {
    viewIds: ['replenishment'],
    fcCycleRules: [{ level: 'category', object: '汤圆', days: 14, from: '', to: '' }],
    execute: async (_, o) => {
      calls.push(o.queryId);
      return response(o.queryId);
    },
  });
  assert.ok(calls.includes('replenishment.summary'));
  assert.ok(!calls.includes('replenishment.overview'));
});

test('a cropped snapshot quantity rejects the inventory card without blocking the date-dependent list', async () => {
  const calls = [];
  const execute = async (_, o) => {
    calls.push(o.queryId);
    if (o.queryId === 'source.branch-stock-date')
      return {
        configVersion: 'v1',
        rows: [{ day: '2026-10-29' }],
        returnedColumns: ['day'],
        rejectedColumns: ['total_qty'],
      };
    return {
      configVersion: 'v1',
      rows: [Object.fromEntries(config.queries[o.queryId].resultColumns.map((k) => [
        k, k === 'page_row_present' ? null : 0,
      ]))],
    };
  };
  const results = await Promise.allSettled([
    readConfiguredFacts(config, 'branch-stock', { asOf: '2026-10-29' }, {
      execute, inventoryOnly: true, summaryOnly: true,
    }),
    readConfiguredFacts(config, 'replenishment', { asOf: '2026-10-29' }, {
      execute, detailsOnly: true,
    }),
  ]);
  assert.equal(results[0].status, 'rejected');
  assert.equal(results[0].reason.code, 'REQUIRED_COLUMN_UNAVAILABLE');
  assert.equal(results[1].status, 'fulfilled');
  assert.equal(results[1].value.total, 0);
  assert.equal(calls.filter((id) => id === 'source.branch-stock-date').length, 1);
  assert.ok(!calls.includes('health.inventory'));
});

test('replenishment reuses order counts only from the same snapshot', async () => {
  for (const day of ['2026-10-29', '2026-10-30']) {
    const result = await readConfiguredOverview(config, '2026-10-29', '', {
      viewIds: ['replenishment'],
      execute: async (_, o) => {
        const value = response(o.queryId);
        if (o.queryId === 'current-shortage.overview') {
          value.rows[0].snapshot_date = day;
          value.rows[0].replenishment_shortage_sku_count = 7;
        }
        return value;
      },
    });
    assert.equal(result.replenishment.summary.known_shortage_sku_count,
      day === '2026-10-29' ? 7 : null);
    assert.equal(result.replenishment.summary.inventory_qty, 1);
  }
});

test('missing count permission and denied orders cannot erase independent replenishment quantities', async () => {
  for (const denied of [false, true]) {
    const calls = [];
    const result = await readConfiguredOverview(config, '2026-10-29', '', {
      viewIds: ['replenishment'],
      execute: async (_, o) => {
        calls.push(o.queryId);
        const value = response(o.queryId);
        if (o.queryId === 'current-shortage.overview') {
          if (denied) throw Object.assign(Error('denied'), { code: 'DATA_PERMISSION_DENIED' });
          delete value.rows[0].replenishment_shortage_sku_count;
          value.rejectedColumns = ['replenishment_shortage_sku_count'];
        }
        return value;
      },
    });
    assert.equal(result.replenishment.summary.known_shortage_sku_count, null);
    assert.equal(result.replenishment.summary.inventory_qty, 1);
    assert.equal(result['current-shortage'].errorCode,
      denied ? 'DATA_PERMISSION_DENIED' : undefined);
    assert.equal(calls.filter((id) => id === 'current-shortage.overview').length, 1);
    assert.ok(!calls.includes('current-shortage.summary'));
  }
});
