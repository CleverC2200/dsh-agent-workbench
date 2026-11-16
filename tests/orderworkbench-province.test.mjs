import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import {
  provinceAnalysis,
  provinceAnalysisContext,
} from '../prototypes/inventory-orderworkbench/province-analysis.mjs';
import { computeWorkbenchMetrics } from '../prototypes/inventory-orderworkbench/metric-model.mjs';
import { changesSection } from '../prototypes/inventory-orderworkbench/metric-sections.mjs';
import { provinceAmendmentOrderCountSql } from '../business/inventory-orderworkbench/sku-amendments.mjs';
import { orderWorkbenchSourceConfig } from '../business/inventory-orderworkbench/source-config.mjs';
import {
  cancellationDb,
  cancellationLine,
  octoberCancellationParameters,
} from './helpers/cancellation-fixture.mjs';

const row = (province, kind, numerator, denominator, region = '大区一') => ({
  province,
  region,
  kind,
  numerator,
  denominator,
  invalid: 0,
  records: 1,
  sample_numerator: numerator,
  sample_denominator: denominator,
  sample_records: 1,
  unknown_quantity: 0,
});
const period = (rows, start = '2026-10-01', end = '2026-10-26') => {
  const value = {
    start,
    end,
    sections: [
      changesSection(
        ['1', '2'].map((kind) => ({
          id: kind,
          status: 'ready',
          rows: rows.filter((row) => row.kind === kind),
        })),
      ),
    ],
  };
  value.metrics = computeWorkbenchMetrics(value);
  return value;
};

test('province tables use quantity denominators, month-to-date comparisons and a separate week', () => {
  const facts = {
    complete: true,
    periods: {
      month: period([
        row('河南', '1', 20, 200),
        row('河南', '1', 10, 100),
        row('河南', '2', 12, 400),
      ]),
      previousMonth: period([row('河南', '1', 10, 200), row('河南', '2', 20, 400)]),
      yearMonth: period([row('河南', '1', 30, 200)]),
      week: period([row('河南', '1', 4, 200), row('河南', '2', 4, 100)], '2026-10-19'),
    },
    provinceOrders: {
      status: 'ready',
      rows: [{ province: '河南', region: '大区一', changed_orders: 2 }],
    },
  };
  const tables = provinceAnalysis(facts).tables;
  assert.equal(tables.length, 3);
  assert.deepEqual(
    tables[0].rows[0].map((cell) => cell.text),
    ['河南', '大区一', '300', '30', '10.00%', '+5.00%', '-5.00%', '2.00%'],
  );
  assert.deepEqual(
    tables[1].rows[0].map((cell) => cell.text),
    ['河南', '大区一', '400', '12', '3.00%', '-2.00%', '2', '4.00%'],
  );
  assert.equal(tables[2].rows[0].length, 14);
  assert.equal(tables[2].rows[0][2].text, '作废 300 / 改单 400');
  assert.equal(tables[2].rows[0][13].text, '13.00%');
  assert.match(tables[0].rows[0][4].title, /分子 30 件 \/ 分母 300 件/);
});

test('TOP10 uses unrounded rate sums, retains geography boundaries, and excludes unavailable scores', () => {
  const rows = Array.from({ length: 12 }, (_, i) => [
    row('省' + i, '1', i + 1, 100),
    row('省' + i, '2', 1, 100),
  ]).flat();
  rows.push(
    row('省11', '1', 90, 100, '大区二'),
    row('省11', '2', 1, 100, '大区二'),
    row('缺改单', '1', 1, 100),
    row(null, '1', 2, 100),
    row(null, '2', 1, 100),
  );
  const result = provinceAnalysis({ complete: true, periods: { month: period(rows) } });
  assert.equal(result.tables[0].rows.filter((row) => row[0].text === '省11').length, 2);
  assert.equal(result.tables[2].rows.length, 10);
  assert.deepEqual(
    result.tables[2].rows[0].slice(0, 2).map((cell) => cell.text),
    ['省11', '大区二'],
  );
  assert.equal(result.tables[2].rows[0].at(-1).text, '91.00%');
  assert.equal(result.omittedRanking, 1);
  assert.ok(result.tables[0].rows.some((row) => row[0].text === '省区待补全'));
  assert.equal(result.tables[1].rows.find((row) => row[0].text === '缺改单')[4].text, '—');
});

test('province Agent context retains all rows without repeating large tooltip contracts', () => {
  const rows = Array.from({ length: 60 }, (_, index) => [
    row('省区' + index, '1', 1, 100),
    row('省区' + index, '2', 2, 100),
  ]).flat();
  const view = provinceAnalysis({ complete: true, periods: { month: period(rows) } });
  const context = provinceAnalysisContext(view);
  assert.equal(context.tables[0].rows.length, 60);
  assert.equal(context.tables[1].rows.length, 60);
  assert.equal(context.tables[2].rows.length, 10);
  assert.equal(context.tables[0].rows[0][4], '1.00%');
  assert.equal(JSON.stringify(context).includes('tooltip'), false);
  assert.ok(Buffer.byteLength(JSON.stringify(context)) < 20000);
  assert.ok(view.tables[0].rows[0][4].title.length > 100);
});

test('failed cancellation and failed order counts do not hide amendment values or become zero', () => {
  const p = period([row('河南', '2', 2, 100)]);
  p.sections[0].parts[0] = { id: '1', status: 'error', code: 'SOURCE_FAILED', rows: [] };
  p.sections[0].status = 'error';
  const result = provinceAnalysis({
    complete: true,
    periods: { month: p },
    provinceOrders: { status: 'error', code: 'COUNT_FAILED', rows: [] },
  });
  assert.equal(result.tables[0].rows[0][4].text, '—');
  assert.equal(result.tables[1].rows[0][4].text, '2.00%');
  assert.equal(result.tables[1].rows[0][6].text, '—');
  assert.match(result.tables[1].rows[0][6].title, /COUNT_FAILED/);
  assert.equal(result.tables[2].rows.length, 0);
  assert.equal(result.ordersStatus, 'error');
});

test('province changed-order SQL deduplicates customer/order across SKUs, executions and bases', () => {
  const lines = [
    cancellationLine('A', { material_code: 'SKU1', need_qty_origin: 10, change_order_qty: 5 }),
    cancellationLine('A', {
      material_code: 'SKU2',
      executeorderno: 'E-other',
      need_qty_origin: 10,
      change_order_qty: 0,
      belong_base: '华东',
      pickup_point: '02',
    }),
    cancellationLine('A', { cust_code: 'C2', need_qty_origin: 10, change_order_qty: 1 }),
    cancellationLine('unchanged', { need_qty_origin: 10, change_order_qty: 10 }),
    cancellationLine('increase', { need_qty_origin: 10, change_order_qty: 15 }),
    cancellationLine('cancelled', { detailstatus: 20, need_qty_origin: 10, change_order_qty: 0 }),
    cancellationLine('short-transfer', { need_qty_origin: 10, change_order_qty: 0 }),
  ];
  const db = cancellationDb({
    daily: lines.map((row) => ({ ...row, pickup_point: row.belong_base === '华东' ? '02' : '01' })),
  });
  try {
    db.exec(
      "ALTER TABLE agents_scm_execute_detail_d ADD COLUMN order_close_time DEFAULT '2026-10-20'; ALTER TABLE agents_scm_execute_detail_d ADD COLUMN is_short_transfer DEFAULT '非短拨'; ALTER TABLE agents_scm_execute_detail_d ADD COLUMN is_stat DEFAULT '1'; UPDATE agents_scm_execute_detail_d SET is_short_transfer='短拨' WHERE cust_order_no='short-transfer'",
    );
    const rows = db.prepare(provinceAmendmentOrderCountSql()).all(octoberCancellationParameters);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].changed_orders, 2);
    const scoped = db
      .prepare(provinceAmendmentOrderCountSql())
      .all({ ...octoberCancellationParameters, gea_p900: '华东' });
    assert.equal(scoped[0].changed_orders, 1);
  } finally {
    db.close();
  }
});

test('province order-count reader uses the exact current month range and rejects invalid counts', async () => {
  const config = orderWorkbenchSourceConfig(
    JSON.parse(readFileSync('business/inventory-apsplan/sql.config.json')),
  );
  const built = await build({
    stdin: {
      contents:
        "export {loadWorkbenchProvinceOrderCounts} from './prototypes/inventory-orderworkbench/report-source.js';",
      resolveDir: process.cwd(),
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
  });
  const { loadWorkbenchProvinceOrderCounts } = await import(
    'data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64')
  );
  const seen = [];
  const execute = async (_query, { queryId, values }) => {
    seen.push({ queryId, values });
    return {
      rows: [{ province: '河南', region: '大区一', changed_orders: 2 }],
      returnedColumns: config.queries[queryId].resultColumns,
      rejectedColumns: [],
    };
  };
  const result = await loadWorkbenchProvinceOrderCounts(
    '2026-10-01',
    '2026-10-26',
    undefined,
    '华南',
    { config, execute },
  );
  assert.equal(result.rows[0].changed_orders, 2);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].values.start, '2026-10-01');
  assert.equal(seen[0].values.end_exclusive, '2026-10-26');
  assert.equal(seen[0].values.report_base, '华南');
  await assert.rejects(
    loadWorkbenchProvinceOrderCounts('2026-10-01', '2026-10-26', undefined, '', {
      config,
      execute: async (_query, { queryId }) => ({
        rows: [{ province: '河南', region: '大区一', changed_orders: null }],
        returnedColumns: config.queries[queryId].resultColumns,
        rejectedColumns: [],
      }),
    }),
    /INVALID_PROVINCE_ORDER_COUNT/,
  );
});
