import test from 'node:test';
import assert from 'node:assert/strict';
import { fulfillmentPageContext } from '../prototypes/inventory-orderfulfillment/page-context.mjs';

test('large order inputs publish unchanged cards, coverage and filters within the Host limit', () => {
  const rows = Array.from({ length: 500 }, (_, i) => ({
    order: String(i),
    description: 'x'.repeat(900),
  }));
  const filters = { start: '2026-11-02', end_exclusive: '2026-11-03', base: '基地甲' };
  const metrics = [
    { label: '未开订单数', display: '258张1,152,461件', definition: '按去重订单统计' },
  ];
  const source = {
    source: 'gea-governed-sql',
    mock: false,
    consumerCode: 'order01',
    filters,
    metrics,
    fieldCoverage: { totalRows: 500 },
    calculated: {
      quantities: rows,
      nodes: { states: rows, unknown: 9 },
      orderCounts: { valid_orders: 337 },
    },
    comparisons: {
      base: [{ group_name: '基地甲', order_ids: rows, source_orders: 337, shortage_qty: null }],
    },
    parts: {
      facts: { state: 'ready', rows, total: 1000 },
      denied: { state: 'unavailable', code: 'DENIED' },
    },
  };
  assert.ok(JSON.stringify(source).length > 100000);
  const result = fulfillmentPageContext(source);
  assert.ok(JSON.stringify(result).length < 90000);
  assert.deepEqual(result.filters, filters);
  assert.deepEqual(result.metrics, metrics);
  assert.deepEqual(result.fieldCoverage, source.fieldCoverage);
  assert.deepEqual(result.calculated.orderCounts, { valid_orders: 337 });
  assert.equal(result.calculated.nodes.unknown, 9);
  assert.equal(result.comparisons.base[0].shortage_qty, null);
  assert.equal(result.parts.facts.total, 1000);
  assert.equal(result.parts.facts.rows.length, 3);
  assert.equal(result.parts.facts.snapshotRows, 500);
  assert.deepEqual(result.parts.denied, source.parts.denied);
  assert.equal(source.parts.facts.rows.length, 500);
  assert.equal(result.calculated.quantities, undefined);
});

test('oversized individual samples are omitted without changing totals or swallowing essential-context failure', () => {
  const source = {
    filters: { base: '甲' },
    parts: { facts: { state: 'ready', rows: [{ text: 'x'.repeat(100000) }], total: 1 } },
  };
  const result = fulfillmentPageContext(source);
  assert.equal(result.parts.facts.rows.length, 0);
  assert.equal(result.parts.facts.total, 1);
  assert.throws(
    () => fulfillmentPageContext({ metrics: [{ value: 'x'.repeat(100000) }] }),
    /FULFILLMENT_PAGE_CONTEXT_TOO_LARGE/,
  );
  assert.equal(fulfillmentPageContext(null), null);
});

test('count differences remain arithmetic facts without asserting classification membership or causes', () => {
  const source = {
    metricSemantics: { scope: '当前筛选' },
    calculated: {
      orderCounts: {
        valid_orders: 20,
        preparing_orders: 12,
        opened_orders: 5,
        unclassified_orders: 4,
      },
    },
  };
  const result = fulfillmentPageContext(source);
  const reconciliation = result.metricSemantics.countReconciliation;
  assert.equal(reconciliation.residualAfterPreparingAndOpened, 3);
  assert.equal(reconciliation.residualAfterAllReportedCategories, -1);
  assert.deepEqual(reconciliation.publishedCounts, source.calculated.orderCounts);
  assert.match(reconciliation.classificationRelationship, /不提供分类集合成员关系/);
  assert.match(reconciliation.cause, /未查证/);
  assert.match(reconciliation.countDefinitions.unclassified_orders, /节点维度，不是未开\/已开之外/);
  assert.equal(result.metricSemantics.scope, '当前筛选');
  assert.equal(source.metricSemantics.countReconciliation, undefined);
  assert.equal(
    fulfillmentPageContext({ calculated: { orderCounts: { valid_orders: null } } }).metricSemantics
      .countReconciliation,
    undefined,
  );
});
