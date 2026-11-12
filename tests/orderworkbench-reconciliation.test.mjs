import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeWorkbenchMetrics,
  stockDaily,
} from '../prototypes/inventory-orderworkbench/metric-model.mjs';
import {
  changesSql,
  amendmentChangesSql,
} from '../business/inventory-orderworkbench/document-queries.mjs';
import { workbenchQueries } from '../business/inventory-orderworkbench/queries.mjs';
import { workbenchCellMissingReason } from '../prototypes/inventory-orderworkbench/missing-reasons.mjs';
import {
  directorNames,
  workbenchPresentation,
} from '../prototypes/inventory-orderworkbench/live-presentation.mjs';

const stockPeriod = (rows) => ({ sections: [{ id: 'stock', status: 'ready', rows }] });
const stock = {
  stock_date: '2026-10-25',
  available: 1,
  inventory: 100,
  sales_plan: 310,
  transfer_plan: 0,
  source_rows: 1,
  invalid: 0,
};

test('base tables and cross comparisons omit Puyang and exclude it from current and historical base totals', () => {
  const period = (shortage) => {
    const value = {
      sections: [
        {
          id: 'orders',
          status: 'ready',
          rows: [
            {
              base: '郑州',
              category: '食品',
              item: '水饺',
              sku: 'A',
              demand: 100,
              shortage,
              invalid: 0,
            },
            {
              base: '濮阳',
              category: '食品',
              item: '水饺',
              sku: 'B',
              demand: 100,
              shortage: 90,
              invalid: 0,
            },
          ],
        },
      ],
    };
    value.metrics = computeWorkbenchMetrics(value);
    return value;
  };
  const current = period(10),
    previous = period(20);
  const presentation = workbenchPresentation({
    selected: 'month',
    periods: {
      month: current,
      week: current,
      previousMonth: previous,
      previousWeek: previous,
      yearMonth: previous,
      yearWeek: previous,
    },
    directors: { rows: [] },
    customers: { rows: [] },
  });
  for (const key of ['month', 'week']) {
    const table = presentation.performance['base-performance'][key];
    assert.deepEqual(
      table.map((row) => row[0]),
      ['郑州', '合计'],
    );
    const total = table.find((row) => row[0] === '合计');
    assert.equal(total[1].raw, 90);
    assert.equal(total[2], '+10.00%');
  }
  for (const key of ['base-category', 'base-category-days'])
    assert.deepEqual(
      presentation.dimensions[key].rows.map((row) => row[0]),
      ['郑州'],
    );
  assert.equal(
    presentation.cards[2].value,
    '50.00',
    'base-only exclusion does not change nationwide overview scope',
  );
});

test('one negative stock row remains in the valid nationwide net quantity', () => {
  const p = stockPeriod([stock, { ...stock, inventory: -1, sales_plan: 0 }]);
  assert.equal(computeWorkbenchMetrics(p)['周转天数'].value, 9.9);
  assert.doesNotMatch(workbenchQueries.stock.sql, /available_stock<0/);
  assert.match(computeWorkbenchMetrics(p)['周转天数'].note, /负库存按来源原值汇总/);
});
test('unknown stock is never replaced with zero and a negative total is not a valid support day', () => {
  assert.equal(
    computeWorkbenchMetrics(stockPeriod([{ ...stock, inventory: null }]))['周转天数'].value,
    null,
  );
  assert.equal(
    computeWorkbenchMetrics(stockPeriod([{ ...stock, inventory: -1 }]))['周转天数'].value,
    null,
  );
  assert.equal(
    computeWorkbenchMetrics(stockPeriod([{ ...stock, sales_plan: null }]))['周转天数'].value,
    null,
  );
});

test('all inventory is the numerator, never silently replaced with available stock', () => {
  assert.equal(computeWorkbenchMetrics(stockPeriod([stock]))['周转天数'].value, 10);
  assert.match(computeWorkbenchMetrics(stockPeriod([stock]))['周转天数'].note, /current_stock/);
  assert.match(workbenchQueries.stock.sql, /b.inventory IS NULL/);
});

test('stock and aged quantities share the published stock population and missing fields invalidate age', () => {
  assert.match(workbenchQueries.ages.sql, /FROM agents_scm_stock_detail_d/);
  assert.match(workbenchQueries.ageDate.sql, /FROM agents_scm_stock_detail_d/);
  assert.match(workbenchQueries.ages.sql, /SUM\(b.inv_qty\) AS stock_qty/);
  assert.match(workbenchQueries.ages.sql, /COUNT\(current_stock_60\)<>COUNT\(\*\)/);
  assert.doesNotMatch(workbenchQueries.ages.sql, /dwd_scm_material_age_his|snapshot_warehouse/);
  assert.match(
    workbenchQueries.ages.sql,
    /MAX\(s.names\)>1 THEN NULL ELSE COALESCE\(MAX\(s.item\),MAX\(m.item\)\)/,
  );
  assert.doesNotMatch(workbenchQueries.ages.sql, /MAX\(d.item\) AS item/);
  assert.equal(workbenchQueries.ages.scoped, true);
  assert.match(
    workbenchQueries.ages.sql,
    /WHERE \(:gea_p900='' OR CASE WHEN TRIM\(b.belong_base\)[\s\S]*?=:gea_p900\) AND b.dt/,
  );
});

test('non-Zhengzhou responsibility is base-wide while shared Zhengzhou products retain both owners', () => {
  const mappings = [
    { base: '华东', sku: 'ordered', names: 1, director: '甲' },
    { base: '郑州', sku: 'shared', names: 1, director: '乙,丙' },
  ];
  assert.deepEqual(directorNames(mappings, { base: '华东', sku: 'inventory-only' }), ['甲']);
  assert.deepEqual(
    directorNames(mappings, { base: '郑州', sku: 'shared' }),
    ['丙', '乙'].sort((a, b) => a.localeCompare(b, 'zh')),
  );
  assert.deepEqual(directorNames(mappings, { base: '郑州', sku: 'missing' }), ['归属待补全']);
  assert.deepEqual(
    directorNames([...mappings, { base: '华东', sku: 'other', names: 1, director: '丁' }], {
      base: '华东',
      sku: 'inventory-only',
    }),
    ['归属待补全'],
  );
});

test('director historical comparisons use the matching period owner, not the latest mapping', () => {
  const make = (director) => {
    const period = stockPeriod([{ ...stock, base: '郑州', sku: 'shared' }]);
    period.sections.push({
      id: 'directors',
      status: 'ready',
      rows: [{ base: '郑州', sku: 'shared', director, names: 1 }],
    });
    period.metrics = computeWorkbenchMetrics(period);
    return period;
  };
  const facts = {
    selected: 'month',
    periods: { month: make('甲'), week: make('甲'), previousMonth: make('乙') },
    directors: { rows: [] },
    customers: { rows: [] },
  };
  const row = workbenchPresentation(facts).performance['director-performance'].month.find(
    (row) => row[0] === '甲',
  );
  assert.equal(row[9].text, '10.00');
  assert.equal(row[10].text, '—');
  assert.match(row[10].title, /比较期.*stock/);
});
test('base and item formulas retain documented weights instead of fitting the screenshot', () => {
  const p = stockPeriod([{ ...stock, transfer_plan: 620 }]);
  assert.equal(stockDaily(p.sections[0].rows[0], 'base'), 20);
  assert.equal(computeWorkbenchMetrics(p)['周转天数'].value, 10);
  assert.equal(
    computeWorkbenchMetrics(p, () => true, { turnoverScope: 'base' })['周转天数'].value,
    5,
  );
  assert.equal(
    computeWorkbenchMetrics(p, () => true, { turnoverScope: 'item' })['周转天数'].value,
    10,
  );
});
test('cancellations retain execution business time while amendments select BI order close time', () => {
  assert.match(
    changesSql,
    /CASE WHEN s.orderstatus=90 THEN s.cancelled ELSE s.header_addtime END AS business_time/,
  );
  assert.doesNotMatch(changesSql, /COUNT\(DISTINCT header_addtime\)=1/);
  assert.match(amendmentChangesSql, /AND d\.order_close_time>=:gea_p1/);
  assert.doesNotMatch(amendmentChangesSql, /d\.header_addtime>=/);
});
test('amendments use the BI order-close cohort while cancellations use quantities and their event cohort', () => {
  assert.match(
    amendmentChangesSql,
    /requested_qty>=0 AND requested_qty<effective_qty THEN effective_qty-requested_qty/,
  );
  assert.doesNotMatch(amendmentChangesSql, /custchangetime|requireddeliverytime|\blocked\b/);
  assert.match(
    changesSql,
    /requested_qty>=0 AND requested_qty<effective_qty THEN effective_qty-requested_qty/,
  );
  assert.match(
    changesSql,
    /COALESCE\(s.change_order_qty,s.dms_last_update_qty,s.need_qty_origin\)/,
  );
  assert.doesNotMatch(changesSql, /COALESCE\(cancelled/);
});

test('fulfillment uses the upstream original-order business period without a downstream SKU date join', () => {
  const sql = workbenchQueries.orders.sql;
  assert.match(
    sql,
    /MAX\(fromorderno_month\) OVER \(PARTITION BY fromorderno,cust_code\) AS final_period/,
  );
  assert.match(sql, /m.period_end>=:gea_p1 AND m.period_end<:gea_p2/);
  assert.doesNotMatch(
    sql,
    /agents_scm_order_trace_final_di|agents_scm_execute_detail_hourly_d|complete_time/,
  );
  assert.match(sql, /GROUP BY fromorderno,cust_code,new_material_code/);
});

test('complete explicit shared responsibility survives multiple source names but truncated lists do not', () => {
  const row = { base: '郑州', sku: 'shared' };
  const mapping = { ...row, names: 2, director: '甲', directors: '["甲", "乙,丙", null]' };
  assert.deepEqual(
    directorNames([mapping], row),
    ['甲', '乙', '丙'].sort((a, b) => a.localeCompare(b, 'zh')),
  );
  assert.deepEqual(directorNames([{ ...mapping, directors: '["甲"]' }], row), ['归属待补全']);
  assert.match(workbenchQueries.directors.sql, /agents_scm_execute_detail_hourly_d/);
  assert.doesNotMatch(workbenchQueries.directors.sql, /ARRAY_AGG\(DISTINCT/);
  assert.match(workbenchQueries.directors.sql, /SELECT DISTINCT d\.belong_base,d\.material_code/);
  assert.match(workbenchQueries.directors.sql, /COUNT\(DISTINCT NULLIF\(TRIM\(d\.director\)/);
});

test('unmapped dimensions retain a field-specific hover explanation', () => {
  const facts = { periods: {} };
  assert.match(
    workbenchCellMissingReason(facts, {
      row: ['未映射'],
      header: '品项',
      dimension: 'item-performance',
    }),
    /product_item.*pinxiang/,
  );
  assert.match(
    workbenchCellMissingReason(facts, {
      row: ['归属待补全', '郑州'],
      header: '应责总监',
      dimension: 'director-performance',
    }),
    /hourly_d.director/,
  );
});
