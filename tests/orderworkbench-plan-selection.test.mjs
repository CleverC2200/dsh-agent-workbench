import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { workbenchPresentation } from '../prototypes/inventory-orderworkbench/live-presentation.mjs';
import { workbenchQueries } from '../business/inventory-orderworkbench/queries.mjs';
import {
  computeWorkbenchMetrics,
  stockDaily,
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
    return db
      .prepare(workbenchQueries.stock.sql)
      .all({ gea_p1: date.slice(0, 7) + '-01', gea_p2: date.slice(0, 7) + '-32' });
  } finally {
    db.close();
  }
}

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
    const nationalSales = sales;
    assert.equal(stockDaily(row), nationalSales / 31);
    assert.equal(stockDaily(row, 'base'), (sales + 0.5 * transfer) / 31);
    const period = { sections: [{ id: 'stock', status: 'ready', rows }] };
    assert.equal(computeWorkbenchMetrics(period)['周转天数'].value, 100 / (nationalSales / 31));
    assert.equal(
      computeWorkbenchMetrics(period, () => true, { turnoverScope: 'base' })['周转天数'].value,
      100 / ((sales + 0.5 * transfer) / 31),
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
  assert.equal(computeWorkbenchMetrics(period)['周转天数'].value, 100 / 30);
  assert.equal(
    computeWorkbenchMetrics(period, () => true, { turnoverScope: 'base' })['周转天数'].value,
    null,
  );
});

test('next-month plans retain snapshot month divisor across leap February and year end', () => {
  for (const [date, days] of [
    ['2028-02-27', 29],
    ['2026-02-27', 28],
    ['2026-12-31', 31],
  ]) {
    const [row] = snapshot(date);
    assert.equal(row.sales_plan, 1240);
    assert.equal(stockDaily(row), 1240 / days);
  }
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
      metricCalculationVersion: 12,
      periods: { month: {} },
    }),
    false,
  );
});

test('strict October 19–25 rolling plan produces 15.6 independently of the BI comparison value', () => {
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
  assert.equal(detail[3], (9435719.78 / 31).toFixed(2) + '件/天');
  assert.equal(detail[4], '15.59天');
  for (const turnoverScope of ['national', 'item']) {
    const value = computeWorkbenchMetrics(period, () => true, { turnoverScope })['周转天数'].value;
    assert.equal(value, 4745203 / (9435719.78 / 31));
    assert.equal(value.toFixed(1), '15.6');
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
    assert.equal(computeWorkbenchMetrics(period)['周转天数'].value, 100 / 30);
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
