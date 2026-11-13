import test from 'node:test';
import assert from 'node:assert/strict';
import { orderMetricGroups } from '../prototypes/inventory-orderworkbench/metric-groups.mjs';
import { computeWorkbenchMetrics } from '../prototypes/inventory-orderworkbench/metric-model.mjs';
import { metricContract } from '../prototypes/inventory-orderworkbench/metric-definitions.mjs';
import { resolveMetricDimensions } from '../prototypes/inventory-orderworkbench/metric-dimensions.mjs';
import { directorMetricUsesBase } from '../prototypes/inventory-orderworkbench/live-presentation.mjs';
import { workbenchPresentation } from '../prototypes/inventory-orderworkbench/live-presentation.mjs';

function period(id, rows) {
  const value = {
    start: '2026-11-01',
    end: '2026-11-13',
    sections: [{ id, status: 'ready', rows }],
  };
  value.metrics = computeWorkbenchMetrics(value, undefined, { turnoverScope: 'base' });
  return value;
}
test('fulfillment groups preserve weighted numerator and denominator including unmapped items', () => {
  const rows = [
    { base: '郑州', item: '水饺', demand: 100, shortage: 10, records: 1, invalid: 0 },
    { base: '郑州', item: '馄饨', demand: 900, shortage: 0, records: 1, invalid: 0 },
    { base: '郑州', item: null, demand: 50, shortage: 5, records: 1, invalid: 0 },
  ];
  const result = orderMetricGroups(period('orders', rows), '订单满足率', { base: '郑州' });
  assert.equal(result.availability, 'available');
  assert.equal(result.rows.length, 3);
  assert.equal(result.unmappedGroups, 1);
  assert.equal(result.reconciliation.numerator, 1035);
  assert.equal(result.reconciliation.denominator, 1050);
  assert.equal(result.reconciliation.matches, true);
  assert.equal(result.total.value, (1035 / 1050) * 100);
});
test('one invalid item does not erase other item results', () => {
  const rows = [
    { base: '郑州', item: '水饺', demand: 100, shortage: 10, records: 1, invalid: 0 },
    { base: '郑州', item: '馄饨', demand: null, shortage: null, records: 1, invalid: 1 },
  ];
  const result = orderMetricGroups(period('orders', rows), '订单满足率', { base: '郑州' });
  assert.equal(result.rows.find((row) => row.item === '水饺').current.value, 90);
  assert.equal(result.rows.find((row) => row.item === '馄饨').current.value, null);
  assert.equal(result.rows.find((row) => row.item === '馄饨').current.pending, 1);
  assert.equal(result.reconciliation.matches, null);
});
test('ontime groups deduplicate execution orders without adding overlapping item denominators', () => {
  const rows = [
    { base: '郑州', item: '水饺', order_no: 'E1', customer: 'C1', ontime: 1, invalid: 0 },
    { base: '郑州', item: '水饺', order_no: 'E1', customer: 'C1', ontime: 1, invalid: 0 },
    { base: '郑州', item: '馄饨', order_no: 'E1', customer: 'C1', ontime: 1, invalid: 0 },
    { base: '郑州', item: '馄饨', order_no: 'E2', customer: 'C2', ontime: 0, invalid: 0 },
  ];
  const result = orderMetricGroups(period('ontime', rows), '准交率', { base: '郑州' });
  assert.equal(result.total.denominator, 2);
  assert.equal(result.rows.find((row) => row.item === '馄饨').current.denominator, 2);
  assert.equal(result.rows.find((row) => row.item === '水饺').current.denominator, 1);
  assert.equal(result.reconciliation.additive, false);
  assert.equal(result.reconciliation.matches, null);
});
test('source refusal remains unavailable rather than empty groups', () => {
  const value = {
    sections: [{ id: 'orders', status: 'error', code: 'ROW_SCOPE_DENIED', rows: [] }],
  };
  const result = orderMetricGroups(value, '订单满足率', { base: '郑州' });
  assert.equal(result.availability, 'unavailable');
  assert.equal(result.code, 'ROW_SCOPE_DENIED');
});
test('all six contracts publish groups independently of detail availability', () => {
  for (const metric of ['作废率', '改单率', '满足率', '准交率', '货龄占比', '可发货天数']) {
    const contract = metricContract(metric, {}, 'base');
    assert.equal(contract.grouping.available, true);
    assert.equal(contract.grouping.view, 'groups');
    assert.deepEqual(contract.grouping.dimensions, ['base', 'item']);
  }
  assert.equal(metricContract('满足率', {}, 'base').detailsQueryId, null);
});
test('empty periods remain empty instead of claiming zero-valued reconciliation', () => {
  const result = orderMetricGroups(period('orders', []), '订单满足率', { base: '郑州' });
  assert.deepEqual(result.rows, []);
  assert.equal(result.reconciliation.numerator, null);
  assert.equal(result.reconciliation.matches, null);
});
test('zero daily demand keeps known stock and zero denominator without inventing days', () => {
  const rows = [
    {
      base: '郑州',
      item: '粽子',
      inventory: 10,
      sales_plan: 0,
      transfer_plan: 0,
      source_rows: 1,
      invalid: 0,
      stock_date: '2026-11-12',
      plan_month_offset: 0,
    },
  ];
  const result = orderMetricGroups(period('stock', rows), '周转天数', { base: '郑州' });
  assert.equal(result.rows[0].current.value, null);
  assert.equal(result.rows[0].current.numerator, 10);
  assert.equal(result.rows[0].current.denominator, 0);
});
test('category, customer and province groupings preserve distinct keys and missing values', () => {
  const rows = [
    {
      base: '郑州',
      category: '速冻',
      item: '水饺',
      customer: 'C1',
      demand: 100,
      shortage: 10,
      records: 1,
      invalid: 0,
    },
    {
      base: '郑州',
      category: '速冻',
      item: '馄饨',
      customer: 'C2',
      demand: 50,
      shortage: 0,
      records: 1,
      invalid: 0,
    },
  ];
  const result = orderMetricGroups(period('orders', rows), '订单满足率', {
    base: '郑州',
    dimensions: ['customer', 'category'],
  });
  assert.equal(result.rows.length, 2);
  assert.equal(result.reconciliation.matches, true);
  assert.equal(result.rows[0].current.numerator, 90);
  assert.deepEqual(resolveMetricDimensions('周转天数', ['customer']).unsupported, ['customer']);
  assert.throws(() => resolveMetricDimensions('满足率', ['item', 'item']), /INVALID/);
});
test('director ownership overlaps without multiplying totals and only ontime uses the base exception', () => {
  const rows = [
    {
      base: '郑州',
      director: '庞丽娟,张培',
      names: 1,
      summary: 1,
      item: '水饺',
      demand: 100,
      shortage: 10,
      records: 1,
      invalid: 0,
    },
    {
      base: '郑州',
      director: '其他总监',
      names: 1,
      summary: 1,
      item: '馄饨',
      demand: 50,
      shortage: 0,
      records: 1,
      invalid: 0,
    },
  ];
  const result = orderMetricGroups(period('orders', rows), '订单满足率', {
    base: '郑州',
    dimensions: ['director'],
  });
  assert.deepEqual(result.dimensions, ['base', 'director']);
  assert.equal(result.rows.length, 3);
  assert.equal(result.rows.find((row) => row.director === '庞丽娟').current.denominator, 100);
  assert.equal(result.total.denominator, 150);
  assert.equal(result.reconciliation.additive, false);
  assert.equal(directorMetricUsesBase('订单满足率', '庞丽娟', '郑州'), false);
  assert.equal(directorMetricUsesBase('准交率', '庞丽娟', '郑州'), true);
});
test('item and base stock plan scopes follow their respective dashboard denominators', () => {
  const rows = [
    {
      base: '郑州',
      item: '水饺',
      inventory: 100,
      sales_plan: 300,
      transfer_plan: 300,
      source_rows: 1,
      invalid: 0,
      stock_date: '2026-11-12',
      plan_month_offset: 0,
    },
  ];
  const value = period('stock', rows);
  const byBase = orderMetricGroups(value, '周转天数', {
    base: '郑州',
    dimensions: ['base', 'item'],
  });
  const byItem = orderMetricGroups(value, '周转天数', { base: '郑州', dimensions: ['item'] });
  assert.equal(byBase.rows[0].current.denominator, 15);
  assert.equal(byItem.rows[0].current.denominator, 10);
  assert.equal(byItem.total.denominator, 10);
  assert.equal(byBase.rows[0].current.target, '≤12.5天');
  assert.equal(byItem.rows[0].current.target, '<12.5天');
});
test('director cards keep product scope for fulfillment and registered base scope for ontime', () => {
  const value = period('orders', [
    {
      base: '郑州',
      sku: 'A',
      item: '水饺',
      director: '庞丽娟',
      names: 1,
      summary: 1,
      demand: 100,
      shortage: 10,
      invalid: 0,
      records: 1,
    },
    {
      base: '郑州',
      sku: 'B',
      item: '馄饨',
      director: '其他总监',
      names: 1,
      summary: 1,
      demand: 900,
      shortage: 0,
      invalid: 0,
      records: 1,
    },
  ]);
  const mappings = [
    { base: '郑州', sku: 'A', director: '庞丽娟', names: 1 },
    { base: '郑州', sku: 'B', director: '其他总监', names: 1 },
  ];
  value.sections.push(
    { id: 'directors', status: 'ready', rows: mappings },
    {
      id: 'ontime',
      status: 'ready',
      rows: [
        {
          base: '郑州',
          sku: 'B',
          item: '馄饨',
          order_no: 'E1',
          customer: 'C',
          ontime: 0,
          invalid: 0,
        },
      ],
    },
  );
  value.metrics = computeWorkbenchMetrics(value);
  const view = workbenchPresentation({
    selected: 'month',
    complete: true,
    periods: { month: value, week: value },
    directors: { status: 'ready', rows: mappings },
    customers: { rows: [] },
  });
  const row = view.performance['director-performance'].month.find((row) => row[0] === '庞丽娟');
  assert.equal(row[2].raw, 90);
  assert.equal(row[5].raw, 0);
  const groups = orderMetricGroups(value, '准交率', { base: '郑州', dimensions: ['director'] });
  assert.equal(groups.rows.find((row) => row.director === '庞丽娟').current.denominator, 1);
});

test('item stock-day group totals use the same strict national target as their rows', () => {
  const value = period('stock', [
    {
      base: '郑州',
      item: '水饺',
      inventory: 125,
      sales_plan: 300,
      transfer_plan: 0,
      source_rows: 1,
      invalid: 0,
      stock_date: '2026-11-12',
      plan_month_offset: 0,
    },
  ]);
  const group = orderMetricGroups(value, '周转天数', { base: '郑州', dimensions: ['item'] });
  assert.equal(group.total.value, 12.5);
  assert.equal(group.total.target, '<12.5天');
  assert.equal(group.total.status, '严重');
  assert.equal(group.rows[0].current.status, '严重');
  const byBase = orderMetricGroups(value, '周转天数', { base: '郑州', dimensions: ['base'] });
  assert.equal(byBase.total.status, '健康');
});
