import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { workbenchPresentation } from '../prototypes/inventory-orderworkbench/live-presentation.mjs';
import { workbenchQueries } from '../business/inventory-orderworkbench/queries.mjs';
import { missingPlanPolicySql } from '../business/inventory-orderworkbench/plan-policy.mjs';
import {
  computeWorkbenchMetrics,
  stockDaily,
  stockDemandDays,
  metricCalculationVersion,
  compatibleWorkbenchFacts,
} from '../prototypes/inventory-orderworkbench/metric-model.mjs';

function snapshot(date, values = {}, options = {}) {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`CREATE TABLE agents_scm_stock_detail_d (
      belong_base,material_code,product_item,material_name,the_date,
      main_sales_plan_v1,main_sales_plan_adj,roll_sales_plan,next_month_sales_plan,
      transfer_out_plan_v1,transfer_out_plan_adj,transfer_out_plan_roll,next_month_out_plan);
      CREATE TABLE agents_scm_inventory_sku_data_d (
      belong_base,material_code,material_name,month_date,available_qty,live_qty,warehouse_classify,warehouse_classify_name);
      CREATE TABLE agents_scm_material_in_out_summary_d (material_code,product_categ_name,material_group_name);`);
    const plans = {
      main_sales_plan_v1: 310,
      main_sales_plan_adj: 620,
      roll_sales_plan: 930,
      next_month_sales_plan: 1240,
      transfer_out_plan_v1: 62,
      transfer_out_plan_adj: 124,
      transfer_out_plan_roll: 186,
      next_month_out_plan: 248,
      ...values,
    };
    db.exec(`CREATE TABLE agents_sales_plan_demand_m(stat_month,belong_base,material_code,plannum,allnum);
      CREATE TABLE agents_dim_material_prod_sales_info_d(material_code,channel_name);`);
    const nextMonth = new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 1))
      .toISOString()
      .slice(0, 10);
    const demandRows = options.demandRows ?? [
      [
        date.slice(0, 7) + '-01',
        '郑州',
        'SKU',
        plans.main_sales_plan_v1,
        plans.main_sales_plan_adj,
      ],
      [nextMonth, '郑州', 'SKU', plans.next_month_sales_plan, 0],
    ];
    for (const row of demandRows)
      db.prepare('INSERT INTO agents_sales_plan_demand_m VALUES (?,?,?,?,?)').run(...row);
    for (const row of options.channels ?? [['SKU', '思念']])
      db.prepare('INSERT INTO agents_dim_material_prod_sales_info_d VALUES (?,?)').run(...row);
    db.prepare('INSERT INTO agents_scm_stock_detail_d VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
      '郑州',
      'SKU',
      '水饺',
      '产品',
      date,
      ...Object.values(plans),
    );
    db.prepare('INSERT INTO agents_scm_inventory_sku_data_d VALUES (?,?,?,?,?,?,?,?)').run(
      '郑州',
      'SKU',
      '产品',
      date.replaceAll('-', ''),
      1,
      options.inventory ?? 100,
      '01',
      '工厂成品仓',
    );
    db.exec(`ALTER TABLE agents_scm_stock_detail_d ADD COLUMN current_stock;
      ALTER TABLE agents_scm_stock_detail_d ADD COLUMN current_stock_60 DEFAULT 0;
      ALTER TABLE agents_scm_stock_detail_d ADD COLUMN available_stock DEFAULT 1;`);
    db.prepare('UPDATE agents_scm_stock_detail_d SET current_stock=?').run(
      options.inventory ?? 100,
    );
    db.exec('CREATE TABLE test_plan_policy(initial_day,corrected_day,rolling_day)');
    db.prepare('INSERT INTO test_plan_policy VALUES (?,?,?)').run(
      ...(options.cutoffs ?? [16, 20, 26]),
    );
    return db
      .prepare(
        workbenchQueries.stock.sql.replaceAll(
          missingPlanPolicySql,
          'SELECT initial_day,corrected_day,rolling_day FROM test_plan_policy',
        ),
      )
      .all({ gea_p1: date.slice(0, 7) + '-01', gea_p2: date.slice(0, 7) + '-32' });
  } finally {
    db.close();
  }
}

test('published node changes select different versions without changing the query code', () => {
  assert.equal(snapshot('2026-10-15', {}, { cutoffs: [14, 20, 28] })[0].sales_plan, 620);
  assert.equal(snapshot('2026-10-15', {}, { cutoffs: [16, 20, 26] })[0].sales_plan, 310);
  assert.equal(snapshot('2026-10-27', {}, { cutoffs: [14, 20, 28] })[0].sales_plan, 930);
  for (const cutoffs of [
    [null, 20, 28],
    [20, 14, 28],
    [14, 20, 32],
    [14.5, 20, 28],
  ]) {
    const [row] = snapshot('2026-10-31', {}, { cutoffs });
    assert.equal(row.sales_plan, null);
    assert.equal(row.transfer_plan, null);
  }
});

for (const [day, sales, transfer] of [
  [1, 310, 62],
  [16, 310, 62],
  [17, 620, 124],
  [20, 620, 124],
  [21, 930, 186],
  [26, 930, 186],
  [27, 1240, 248],
  [31, 1240, 248],
]) {
  test(`business day ${day} selects matching demand and transfer versions`, () => {
    const rows = snapshot(`2026-10-${String(day).padStart(2, '0')}`),
      row = rows[0];
    assert.equal(row.sales_plan, sales);
    assert.equal(row.transfer_plan, transfer);
    const days = day <= 20 ? 31 : 30;
    assert.equal(row.plan_month_offset, day <= 20 ? 0 : 1);
    const nationalSales = sales;
    assert.equal(stockDaily(row), nationalSales / days);
    assert.equal(stockDaily(row, 'base'), (sales + 0.5 * transfer) / days);
    const period = { sections: [{ id: 'stock', status: 'ready', rows }] };
    assert.equal(computeWorkbenchMetrics(period)['周转天数'].value, 100 / (nationalSales / days));
    assert.equal(
      computeWorkbenchMetrics(period, () => true, { turnoverScope: 'base' })['周转天数'].value,
      100 / ((sales + 0.5 * transfer) / days),
    );
  });
}

test('selected zero does not fall back to positive initial plans; selected missing/negative plans stay unknown', () => {
  for (const value of [0, null, -1]) {
    const rows = snapshot('2026-10-17', {
      main_sales_plan_adj: value,
      transfer_out_plan_adj: value,
    });
    assert.equal(rows[0].sales_plan, value);
    assert.equal(rows[0].transfer_plan, value);
    assert.equal(
      computeWorkbenchMetrics({ sections: [{ id: 'stock', status: 'ready', rows }] })['周转天数']
        .value,
      null,
    );
    assert.equal(rows[0].invalid, value === 0 ? 0 : 1);
  }
});

test('missing transfer only blocks base days; nationwide/item demand excludes transfers', () => {
  const rows = snapshot('2026-10-21', { transfer_out_plan_roll: null });
  const period = { sections: [{ id: 'stock', status: 'ready', rows }] };
  assert.equal(computeWorkbenchMetrics(period)['周转天数'].value, 100 / 31);
  assert.equal(
    computeWorkbenchMetrics(period, () => true, { turnoverScope: 'base' })['周转天数'].value,
    null,
  );
});

test('rolling and next-month plans use the next calendar month across leap February and year end', () => {
  for (const [date, days] of [
    ['2028-01-27', 29],
    ['2026-01-27', 28],
    ['2028-02-27', 31],
    ['2026-02-27', 31],
    ['2026-12-31', 31],
  ]) {
    const [row] = snapshot(date);
    assert.equal(row.sales_plan, 1240);
    assert.equal(stockDaily(row), 1240 / days);
  }
  for (const [date, days] of [
    ['2028-01-21', 29],
    ['2026-01-21', 28],
    ['2026-04-21', 31],
  ]) {
    const [row] = snapshot(date);
    assert.equal(row.sales_plan, 930);
    assert.equal(stockDemandDays(row), days);
  }
});

test('divisor follows the selected version from configured nodes even when plan amounts are identical', () => {
  const plans = { main_sales_plan_adj: 930, roll_sales_plan: 930 };
  const [corrected] = snapshot('2026-10-19', plans, { cutoffs: [14, 20, 28] });
  const [rolling] = snapshot('2026-10-19', plans, { cutoffs: [14, 18, 28] });
  assert.equal(corrected.sales_plan, rolling.sales_plan);
  assert.equal(stockDemandDays(corrected), 31);
  assert.equal(stockDemandDays(rolling), 30);
  for (const plan_month_offset of [null, 2, -1, 0.5])
    assert.equal(stockDaily({ ...rolling, plan_month_offset }), null);
});

test('old cached facts are invalidated for the changed plan selection', () => {
  assert.ok(metricCalculationVersion >= 13);
  assert.equal(
    compatibleWorkbenchFacts({
      complete: true,
      attributionVersion: 2,
      metricCalculationVersion,
      periods: { month: {} },
    }),
    true,
  );
  assert.equal(
    compatibleWorkbenchFacts({
      complete: true,
      attributionVersion: 2,
      metricCalculationVersion: metricCalculationVersion - 1,
      periods: { month: {} },
    }),
    false,
  );
});

test('October 31 example uses the November divisor and produces 91.3353 days', () => {
  const rows = snapshot(
    '2026-10-31',
    { next_month_sales_plan: 500, next_month_out_plan: 11 },
    { inventory: 1539, cutoffs: [14, 20, 28] },
  );
  const days = computeWorkbenchMetrics(
    { sections: [{ id: 'stock', status: 'ready', rows }] },
    () => true,
    { turnoverScope: 'base' },
  )['周转天数'].value;
  assert.equal(stockDemandDays(rows[0]), 30);
  assert(Math.abs(days - 91.33531157270029) < 1e-10);
});

test('October rolling plan uses November days in nationwide and item presentation', () => {
  const rows = snapshot(
    '2026-10-25',
    { roll_sales_plan: 9435719.78 },
    { inventory: 4745203, demandRows: [['2026-10-01', '郑州', 'SKU', 9649140, 9905512]] },
  );
  const period = { sections: [{ id: 'stock', status: 'ready', rows }] };
  assert.equal(rows[0].national_sales_plan, 9435719.78);
  period.metrics = computeWorkbenchMetrics(period);
  const view = workbenchPresentation(
    {
      selected: 'week',
      periods: { week: period, month: period },
      directors: { rows: [] },
      customers: { rows: [] },
    },
    { dimension: 'category-days' },
  );
  const detail = view.dimensions['category-days'].rows[0];
  assert.equal(detail[2], Math.round(9435719.78) + '件');
  assert.equal(detail[3], (9435719.78 / 30).toFixed(2) + '件/天');
  assert.equal(detail[4], (4745203 / (9435719.78 / 30)).toFixed(2) + '天');
  for (const turnoverScope of ['national', 'item']) {
    const value = computeWorkbenchMetrics(period, () => true, { turnoverScope })['周转天数'].value;
    assert.equal(value, 4745203 / (9435719.78 / 30));
    assert.equal(value.toFixed(1), '15.1');
  }
});

test('customer demand rows and channels cannot override a base-imported rolling plan', () => {
  for (const options of [
    { demandRows: [] },
    { channels: [] },
    { channels: [['SKU', '出口']] },
    {
      demandRows: [
        ['2026-10-01', '郑州', 'SKU', 100, 200],
        ['2026-10-01', '郑州', 'SKU', 100, 110],
        ['2026-10-01', '郑州', 'plan-only', 100, 310],
      ],
      channels: [
        ['SKU', '思念'],
        ['plan-only', '思念'],
      ],
    },
  ]) {
    const rows = snapshot('2026-10-25', {}, options);
    assert.equal(rows.length, 1);
    const period = { sections: [{ id: 'stock', status: 'ready', rows }] };
    assert.equal(computeWorkbenchMetrics(period)['周转天数'].value, 100 / 31);
  }
});

test('missing rolling demand cannot fall back to a positive corrected customer plan', () => {
  const rows = snapshot('2026-10-25', { roll_sales_plan: null });
  assert.equal(
    computeWorkbenchMetrics({ sections: [{ id: 'stock', status: 'ready', rows }] })['周转天数']
      .value,
    null,
  );
});
