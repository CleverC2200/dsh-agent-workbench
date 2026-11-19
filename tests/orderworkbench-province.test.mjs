import {
  cancellationEvents,
  cancellationReasonEvents,
} from '../business/inventory-orderworkbench/document-queries.mjs';
import { provinceCancellationReasonsSql } from '../business/inventory-orderworkbench/province-cancellation-reasons.mjs';
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
  sqliteCancellationSql,
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
    ['河南', '大区一', '300', '30', '10.00%', '—', '—', '—', '—', '—', '+5.00%', '-5.00%', '2.00%'],
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

test('ranking retains all geography groups and places unavailable scores last', () => {
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
  assert.equal(result.tables[2].rows.length, 15);
  assert.deepEqual(
    result.tables[2].rows[0].slice(0, 2).map((cell) => cell.text),
    ['省11', '大区二'],
  );
  assert.equal(result.tables[2].rows[0].at(-1).text, '91.00%');
  assert.equal(result.unrankedCount, 1);
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
  assert.equal(context.tables[2].rows.length, 60);
  assert.equal(context.tables[0].rows[0][4], '1.00%');
  assert.equal(JSON.stringify(context).includes('tooltip'), false);
  assert.ok(Buffer.byteLength(JSON.stringify(context)) < 35000);
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
  assert.equal(result.tables[2].rows.length, 1);
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

test('province tables independently sort current rates and reconcile reason shares', () => {
  const facts = {
    complete: true,
    periods: {
      month: period([
        row('甲', '1', 30, 100),
        row('甲', '2', 2, 100),
        row('乙', '1', 10, 100),
        row('乙', '2', 40, 100),
      ]),
    },
    provinceReasons: {
      status: 'ready',
      rows: [
        { province: '甲', region: '大区一', reason: '客户取消', cancel_qty: 18 },
        { province: '甲', region: '大区一', reason: '缺货', cancel_qty: 9 },
        { province: '甲', region: '大区一', reason: '系统·车型·交期', cancel_qty: 3 },
        { province: '乙', region: '大区一', reason: '未明确', cancel_qty: 9 },
      ],
    },
  };
  const result = provinceAnalysis(facts);
  assert.deepEqual(
    result.tables.map((t) => t.rows[0][0].text),
    ['甲', '乙', '乙'],
  );
  assert.deepEqual(
    result.tables[0].rows[0].slice(5, 10).map((c) => c.text),
    ['60.00%', '30.00%', '10.00%', '0.00%', '0.00%'],
  );
  assert.ok(result.tables[0].rows[1].slice(5, 10).every((c) => c.text === '—'));
  assert.equal(result.tables[2].rows.length, 2);
});

test('province reasons deduplicate daily/hourly copies, classify expiry and retain unknown conflicts', () => {
  const lines = ['customer', 'stock', 'expired', 'missing', 'conflict'].map((id) =>
    cancellationLine(id, { orderstatus: 90, detailstatus: 20, canceltime: '2026-10-20 00:00:00' }),
  );
  const db = cancellationDb({ daily: lines, hourly: lines });
  try {
    for (const table of ['agents_scm_execute_detail_d', 'agents_scm_execute_detail_hourly_d']) {
      db.exec(
        'ALTER TABLE ' +
          table +
          ' ADD COLUMN cancelreasoncode; ALTER TABLE ' +
          table +
          ' ADD COLUMN cancelreason_desc',
      );
      const update = db.prepare(
        'UPDATE ' + table + ' SET cancelreasoncode=?,cancelreason_desc=? WHERE cust_order_no=?',
      );
      update.run('02', '客户要求作废', 'customer');
      update.run('03', '缺货作废', 'stock');
      update.run('01', '过期作废', 'expired');
      update.run('02', '客户要求作废', 'conflict');
    }
    db.exec(
      "UPDATE agents_scm_execute_detail_hourly_d SET cancelreasoncode='03',cancelreason_desc='缺货作废' WHERE cust_order_no='conflict'",
    );
    const result = db
      .prepare(sqliteCancellationSql(provinceCancellationReasonsSql()))
      .all(octoberCancellationParameters);
    const byReason = Object.fromEntries(result.map((row) => [row.reason, row.cancel_qty]));
    assert.deepEqual(byReason, { 客户取消: 10, 缺货: 10, 系统·车型·交期: 10, 未明确: 20 });
    assert.equal(
      result.reduce((sum, row) => sum + row.cancel_qty, 0),
      50,
    );
  } finally {
    db.close();
  }
});

test('province reason reader scopes the month/base and rejects unknown quantities', async () => {
  const config = orderWorkbenchSourceConfig(
    JSON.parse(readFileSync('business/inventory-apsplan/sql.config.json')),
  );
  const built = await build({
    stdin: {
      contents:
        "export {loadWorkbenchProvinceCancellationReasons} from './prototypes/inventory-orderworkbench/report-source.js';",
      resolveDir: process.cwd(),
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
  });
  const { loadWorkbenchProvinceCancellationReasons: read } = await import(
    'data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64')
  );
  let seen;
  const execute = async (_query, { queryId, values }) => {
    seen = { queryId, values };
    return {
      rows: [{ province: '河南', region: '华中', reason: '系统·车型·交期', cancel_qty: 10 }],
      returnedColumns: config.queries[queryId].resultColumns,
      rejectedColumns: [],
    };
  };
  const result = await read('2026-11-01', '2026-11-17', undefined, '郑州', { config, execute });
  assert.equal(result.rows[0].cancel_qty, 10);
  assert.equal(seen.queryId, 'workbench.province.cancellation.reasons');
  assert.equal(seen.values.start, '2026-11-01');
  assert.equal(seen.values.end_exclusive, '2026-11-17');
  assert.equal(seen.values.report_base, '郑州');
  await assert.rejects(
    read('2026-11-01', '2026-11-17', undefined, '', {
      config,
      execute: async (_query, { queryId }) => ({
        rows: [{ province: '河南', region: '华中', reason: '未明确', cancel_qty: null }],
        returnedColumns: config.queries[queryId].resultColumns,
        rejectedColumns: [],
      }),
    }),
    /INVALID_PROVINCE_REASON_QUANTITY/,
  );
  const failed = provinceAnalysis({
    complete: true,
    periods: { month: period([row('河南', '1', 10, 100)]) },
    provinceReasons: { status: 'error', code: 'REASON_FAILED', rows: [] },
  });
  assert.equal(failed.tables[0].rows[0][4].text, '10.00%');
  assert.ok(
    failed.tables[0].rows[0]
      .slice(5, 10)
      .every((cell) => cell.text === '—' && cell.title.includes('REASON_FAILED')),
  );
});

test('reason-only pruning keeps exactly the valid positive cancellation events', () => {
  const lines = [
    cancellationLine('valid', {
      orderstatus: 90,
      detailstatus: 20,
      canceltime: '2026-10-20',
      need_qty_origin: 12,
    }),
    cancellationLine('early', {
      orderstatus: 90,
      detailstatus: 20,
      header_addtime: '2026-10-20',
      canceltime: '2026-10-20 01:00:00',
    }),
    cancellationLine('no-departure', {
      orderstatus: 90,
      canceltime: '2026-10-20',
      latestsendcardate: null,
    }),
    cancellationLine('no-quantity', {
      orderstatus: 90,
      canceltime: '2026-10-20',
      need_qty_origin: null,
    }),
    cancellationLine('conflict', { orderstatus: 90, canceltime: '2026-10-20' }),
    cancellationLine('conflict', { orderstatus: 10, canceltime: '2026-10-20' }),
    cancellationLine('no-cancel-time', {
      orderstatus: 90,
      header_addtime: '2026-09-01',
      canceltime: null,
    }),
    cancellationLine('valid-order'),
  ];
  const db = cancellationDb({
    daily: lines,
    trace: [{ executeorderno: 'E-no-cancel-time', cust_code: 'C', lastshipmenttime: '2026-10-20' }],
  });
  try {
    const select = (sql) =>
      db
        .prepare(
          sqliteCancellationSql(
            'SELECT cust_order_no,executeorderlineno,material_code,cancel_numerator FROM (' +
              sql +
              ') events WHERE invalid_cancel=0 AND cancel_numerator>0 ORDER BY cust_order_no',
          ),
        )
        .all(octoberCancellationParameters)
        .map((row) => ({ ...row }));
    const expected = select(cancellationEvents);
    assert.deepEqual(select(cancellationReasonEvents), expected);
    assert.deepEqual(
      expected.map((row) => row.cust_order_no),
      ['valid'],
    );
  } finally {
    db.close();
  }
});

test('province reasons recover a transient failure and do not retry denied or persistent reads forever', async () => {
  const config = orderWorkbenchSourceConfig(
    JSON.parse(readFileSync('business/inventory-apsplan/sql.config.json')),
  );
  const built = await build({
    stdin: {
      contents:
        "export {loadWorkbenchProvinceCancellationReasons} from './prototypes/inventory-orderworkbench/report-source.js';",
      resolveDir: process.cwd(),
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
  });
  const { loadWorkbenchProvinceCancellationReasons: read } = await import(
    'data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64')
  );
  let calls = 0;
  const result = await read('2026-11-01', '2026-11-16', undefined, '', {
    config,
    execute: async (_query, { queryId }) => {
      if (++calls === 1) throw Object.assign(Error('temporary'), { code: 'GEA_SQL_UNAVAILABLE' });
      return {
        rows: [{ province: '河南', region: '华中', reason: '客户取消', cancel_qty: 10 }],
        returnedColumns: config.queries[queryId].resultColumns,
        rejectedColumns: [],
      };
    },
  });
  assert.equal(calls, 2);
  assert.equal(result.rows[0].cancel_qty, 10);
  for (const [code, expected] of [
    ['GEA_SQL_UNAVAILABLE', 2],
    ['DATA_PERMISSION_DENIED', 1],
    ['SESSION_EXPIRED', 1],
  ]) {
    calls = 0;
    await assert.rejects(
      read('2026-11-01', '2026-11-16', undefined, '', {
        config,
        execute: async () => {
          calls++;
          throw Object.assign(Error(code), { code });
        },
      }),
    );
    assert.equal(calls, expected);
  }
});
