import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeWorkbenchMetrics,
  stockDaily,
} from '../prototypes/inventory-orderworkbench/metric-model.mjs';
import { changesSql } from '../business/inventory-orderworkbench/document-queries.mjs';
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
  assert.match(workbenchQueries.stock.sql, /s.current_stock IS NULL/);
});

test('all warehouse classes remain in age denominator and unknown production dates invalidate age', () => {
  assert.doesNotMatch(workbenchQueries.ages.sql, /warehouse_classify IN/);
  assert.doesNotMatch(workbenchQueries.ageDate.sql, /warehouse_classify IN/);
  assert.match(workbenchQueries.ages.sql, /SUM\(b.live_qty\) AS stock_qty/);
  assert.match(workbenchQueries.ages.sql, /CAST\(b.prod_date AS DATE\) IS NULL OR/);
  assert.match(
    workbenchQueries.ages.sql,
    /MAX\(s.names\)>1 THEN NULL ELSE COALESCE\(MAX\(s.item\),MAX\(m.item\)\)/,
  );
  assert.doesNotMatch(workbenchQueries.ages.sql, /MAX\(d.item\) AS item/);
  assert.equal(workbenchQueries.ages.scoped, true);
  assert.match(
    workbenchQueries.ages.sql,
    /WHERE \(:gea_p900='' OR b.belong_base=:gea_p900\) AND b.month_date/,
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
  assert.equal(row[10], '—');
});
test('base and item formulas retain documented weights instead of fitting the screenshot', () => {
  const p = stockPeriod([{ ...stock, transfer_plan: 620 }]);
  assert.equal(stockDaily(p.sections[0].rows[0]), 20);
  assert.equal(computeWorkbenchMetrics(p)['周转天数'].value, 5);
  assert.equal(
    computeWorkbenchMetrics(p, () => true, { turnoverScope: 'item' })['周转天数'].value,
    10,
  );
});
test('split child creation times do not invalidate the original order and grouping precedes period selection', () => {
  assert.match(changesSql, /MIN\(header_addtime\) AS created/);
  assert.doesNotMatch(changesSql, /COUNT\(DISTINCT header_addtime\)=1/);
  assert.ok(
    changesSql.indexOf('GROUP BY cust_code,cust_order_no') <
      changesSql.indexOf('WHERE h.created>=:gea_p1'),
  );
  assert.doesNotMatch(changesSql, /AND header_addtime>=:gea_p1/);
});
test('historical cutoffs retain uncertainty rather than including later amendments or guessing cancellation times', () => {
  assert.match(changesSql, /changed>=locked AND changed<:gea_p2/);
  assert.match(changesSql, /changed>=:gea_p2 OR invalid_lock>0/);
  assert.match(changesSql, /cancelled IS NULL OR cancel_conflict>0/);
  assert.doesNotMatch(changesSql, /COALESCE\(cancelled/);
});

test('safe original-order formatting fallback is exact-first, customer/SKU-bound and unique on both sides', () => {
  const sql = workbenchQueries.orders.sql;
  assert.match(sql, /WHEN s.cust_order_no IS NOT NULL THEN s.shipped/);
  assert.match(sql, /WHEN n.references_count=1 AND r.references_count=1 THEN n.shipped/);
  assert.match(sql, /LIKE CONCAT\(m.cust_code,'-%'\)/);
  assert.match(sql, /LENGTH\(m.fromorderno\)-LENGTH\(REPLACE\(m.fromorderno,'-',''\)\)=1/);
  assert.match(sql, /n.cust_code=m.cust_code AND n.material_code=m.sku/);
  assert.match(sql, /r.cust_code=m.cust_code AND r.new_material_code=m.sku/);
  assert.match(sql, /AS unmatched_order/);
  assert.match(sql, /AS missing_trace/);
  assert.match(sql, /AS missing_ship_time/);
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
  assert.match(workbenchQueries.directors.sql, /ARRAY_AGG\(DISTINCT/);
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
