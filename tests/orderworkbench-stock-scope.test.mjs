import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { build } from 'esbuild';
import { orderWorkbenchSourceConfig } from '../business/inventory-orderworkbench/source-config.mjs';
import {
  readOrderMetric,
  metricCalculationVersion,
} from '../lib/business/inventory-orderworkbench/metric-runtime.mjs';

function fixture() {
  const db = new DatabaseSync(':memory:');
  db.function('CONCAT', { varargs: true }, (...values) => values.join(''));
  db.function('FLOOR', Math.floor);
  db.function('LENGTH', (value) =>
    value === null ? null : BigInt(Buffer.byteLength(String(value))),
  );
  db.aggregate('ARRAY_AGG', {
    start: '[]',
    step: (state, value) => JSON.stringify([...JSON.parse(state), value]),
  });
  db.exec(`CREATE TABLE agents_scm_stock_detail_d(
    belong_base,material_code,product_item,material_name,the_date,current_stock,current_stock_60,available_stock,
    main_sales_plan_v1,main_sales_plan_adj,roll_sales_plan,next_month_sales_plan,
    transfer_out_plan_v1,transfer_out_plan_adj,transfer_out_plan_roll,next_month_out_plan);
    CREATE TABLE agents_scm_material_in_out_summary_d(material_code,product_categ_name,material_group_name);
    CREATE TABLE agents_dim_mark_xilie_d(product_item,series,series_sort);
    INSERT INTO agents_dim_mark_xilie_d VALUES ('节点','<=初版',14),('节点','<=纠偏',20),('节点','<=滚动',28);
    CREATE TABLE agents_scm_execute_detail_d(belong_base,material_code,director,product_item,header_addtime,executeorderno,cust_code);
    CREATE TABLE agents_scm_execute_detail_hourly_d(belong_base,material_code,director,product_item,header_addtime);
    CREATE TABLE agents_order_execute_isontime_mi(belong_base,new_material_code,pinxiang,fromorderno_month);
    CREATE TABLE agents_scm_order_trace_final_di(executeorderno,cust_code,lastshipmenttime,update_time,load_time);`);
  const insert = db.prepare(
    'INSERT INTO agents_scm_stock_detail_d VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
  );
  for (const [base, inventory, sales, transfer] of [
    ['郑州', 1870294, 3792995, 1536057],
    ['华东', 1000, 3000, 6000],
    ['华南', 200, 1000, 0],
  ])
    insert.run(
      base,
      'shared',
      '水饺',
      '商品',
      '2026-10-31',
      inventory,
      0,
      inventory,
      0,
      0,
      0,
      sales,
      0,
      0,
      0,
      transfer,
    );
  return db;
}

test('page report defaults to its base formula and does not reuse another base seed', async () => {
  const bundle = await build({
    entryPoints: ['prototypes/inventory-orderworkbench/report-source.js'],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    packages: 'external',
  });
  const { loadWorkbenchReport } = await import(
    'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64')
  );
  const db = fixture();
  try {
    const config = orderWorkbenchSourceConfig(
      JSON.parse(
        readFileSync(
          new URL('../business/inventory-apsplan/sql.config.json', import.meta.url),
          'utf8',
        ),
      ),
    );
    const execute = async (request) => ({
      configVersion: 'page-scope-fixture',
      rows: db
        .prepare(request.sql)
        .all(
          Object.fromEntries(
            Object.entries(request.parameters).filter(([key]) =>
              new RegExp(':' + key + '\\b').test(request.sql),
            ),
          ),
        ),
    });
    const common = {
      config,
      execute,
      summary: true,
      metadata: false,
      sections: ['stock'],
      singlePeriod: {
        start: '2026-10-31',
        end: '2026-11-01',
        inventoryEnd: '2026-11-01',
        kind: 'range',
      },
    };
    const zhengzhou = await loadWorkbenchReport('2026-10-31', '2026-11-01', undefined, {
      ...common,
      base: '郑州',
    });
    assert.equal(zhengzhou.base, '郑州');
    assert.equal(zhengzhou.turnoverScope, 'base');
    assert(Math.abs(zhengzhou.periods.month.metrics['周转天数'].value - 12.301804627842852) < 1e-9);
    const east = await loadWorkbenchReport('2026-10-31', '2026-11-01', undefined, {
      ...common,
      base: '华东',
      seedFacts: [zhengzhou],
    });
    assert.equal(east.periods.month.metrics['周转天数'].value, 5);
  } finally {
    db.close();
  }
});

test('the unified turnover entry applies base scope to real stock SQL before publishing quantities and target', async () => {
  const db = fixture();
  try {
    const config = orderWorkbenchSourceConfig(
      JSON.parse(
        readFileSync(
          new URL('../business/inventory-apsplan/sql.config.json', import.meta.url),
          'utf8',
        ),
      ),
    );
    config.metricRuntime = { version: metricCalculationVersion, revision: 'stock-scope-test' };
    const results = {};
    for (const base of ['郑州', '华东', '']) {
      results[base] = await readOrderMetric(
        config,
        { metric: '周转天数', start: '2026-10-31', endExclusive: '2026-11-01', base },
        async (request) => {
          const parameters = Object.fromEntries(
            Object.entries(request.parameters).filter(([key]) => request.sql.includes(':' + key)),
          );
          const rows = db.prepare(request.sql).all(parameters);
          return { configVersion: 'scope-fixture', rows };
        },
        undefined,
        { now: new Date('2026-11-10T00:00:00Z') },
      );
      assert.equal(results[base].sources[0].status, 'ready', JSON.stringify(results[base].sources));
    }
    assert.equal(results['郑州'].current.numerator, 1870294);
    assert.equal(results['郑州'].current.denominator, (3792995 + 1536057 * 0.5) / 30);
    assert.equal(results['郑州'].current.value, 1870294 / ((3792995 + 1536057 * 0.5) / 30));
    assert.equal(results['华东'].current.numerator, 1000);
    assert.equal(results['华东'].current.value, 5);
    assert.equal(results[''].current.numerator, 1871494);
    assert.equal(results[''].current.denominator, (3792995 + 3000 + 1000) / 30);
  } finally {
    db.close();
  }
});

test('a failed cancellation query does not hide the independently readable amendment metric', async () => {
  const bundle = await build({
    entryPoints: ['prototypes/inventory-orderworkbench/report-source.js'],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    packages: 'external',
  });
  const { loadWorkbenchReport } = await import(
    'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64')
  );
  const config = orderWorkbenchSourceConfig(
    JSON.parse(
      readFileSync(
        new URL('../business/inventory-apsplan/sql.config.json', import.meta.url),
        'utf8',
      ),
    ),
  );
  const calls = [];
  const facts = await loadWorkbenchReport('2026-10-01', '2026-11-01', undefined, {
    config,
    metadata: false,
    summary: true,
    sections: ['changes'],
    base: '郑州',
    singlePeriod: { start: '2026-10-01', end: '2026-11-01', kind: 'range' },
    execute: async (_request, { queryId, values }) => {
      calls.push(queryId);
      assert.equal(values.report_base, '郑州');
      if (queryId !== 'workbench.amendments')
        throw Object.assign(Error('unavailable'), { code: 'GEA_SQL_UNAVAILABLE' });
      return {
        configVersion: 'partial-source',
        rows: [
          {
            kind: '2',
            region: '一区',
            province: '一省',
            numerator: 10,
            denominator: 100,
            records: 1,
            invalid: 0,
            sample_numerator: 10,
            sample_denominator: 100,
            sample_records: 1,
            unknown_quantity: 0,
          },
        ],
      };
    },
  });
  assert(calls.includes('workbench.changes'));
  assert(calls.includes('workbench.cancellations'));
  assert(calls.includes('workbench.amendments'));
  const metrics = facts.periods.month.metrics;
  assert.equal(metrics['改单率'].value, 10);
  assert.equal(metrics['作废率'].value, null);
  assert.match(metrics['作废率'].missingReason, /GEA_SQL_UNAVAILABLE/);
  assert.equal(facts.periods.month.sections[0].rows.length, 1);
});
