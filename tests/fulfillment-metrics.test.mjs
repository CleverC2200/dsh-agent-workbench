import test from 'node:test';
import assert from 'node:assert/strict';
import {
  attachExecutionTrace,
  assessTraceArrivals,
} from '../prototypes/inventory-orderfulfillment/execution-trace.mjs';
import {
  computeOrderMetrics,
  lineQuantities,
  deadlineStatus,
  shanghaiTime,
  nodeMetrics,
  comparisonMetrics,
} from '../prototypes/inventory-orderfulfillment/order-metrics.mjs';
const line = {
  executeorderno: 'E1',
  executeorderlineno: '1',
  fromorderno: 'F1',
  fromorderlineno: 'L1',
  cust_order_no: 'O1',
  cust_code: 'C1',
  material_code: 'M1',
  belong_base: '郑州',
  detailstatus: 10,
  is_stat: 1,
  prapare_order_status: '备单中',
  packingunitmain: 'CS',
  packingunitconvertrate: 8,
  order_qty: 100,
  adjust_order_qty: 80,
  qtyallocated: 400,
  pack_unitqty: 50,
  qtyshipped: 160,
  delivery_qty: 20,
  originalqtybak: 100,
  lastbillingdate: '2026-10-22 16:00:00',
};

test('trace header facts enrich only matching execution/customer and never replace SKU quantities', () => {
  const source = {
    executeorderno: 'E1',
    cust_code: 'C1',
    fromorderno: 'F1',
    carrier_name: '承运商A',
    oms_order_qty: 900,
    order_qty_convert: 999,
    delivery_qty: 888,
    source_rows: 2,
  };
  const facts = { rows: [line, { ...line, executeorderlineno: '2', material_code: 'M2' }] };
  const enriched = attachExecutionTrace(facts, { rows: [source] });
  assert.equal(enriched.rows.length, 2);
  assert.equal(enriched.rows[0].order_qty, 100);
  assert.equal(enriched.rows[0].delivery_qty, 20);
  assert.equal(enriched.rows[0].logistics_provider, '承运商A');
  assert.equal(
    attachExecutionTrace(facts, { rows: [{ ...source, cust_code: 'OTHER' }] }).rows[0]
      .prapare_order_status,
    '备单中',
  );
  assert.equal(
    attachExecutionTrace(facts, { rows: [source, source] }).rows[0].prapare_order_status,
    '备单中',
  );
  assert.equal(
    attachExecutionTrace(facts, { rows: [source], rejectedColumns: ['carrier_name'] }).rows[0]
      .logistics_provider,
    undefined,
  );
  assert.equal(
    attachExecutionTrace(facts, { rows: [{ ...source, carrier_name_conflict: 1 }] }).rows[0]
      .logistics_provider,
    undefined,
  );
  assert.equal(attachExecutionTrace(facts, null).rows[0].prapare_order_status, '备单中');
});

test('main status is preserved across cards, detail, comparison and incomplete trace enrichment', () => {
  const facts = { rows: [line] };
  const rows = attachExecutionTrace(facts, {
    rows: [
      {
        executeorderno: 'E1',
        cust_code: 'C1',
        order_stage: '派车中',
        odo_order_status: '已开未派',
        paiche_status: '派车正常',
      },
    ],
  }).rows;
  assert.equal(rows[0].prapare_order_status, '备单中');
  const m = computeOrderMetrics(rows),
    c = comparisonMetrics(rows, 'belong_base')[0];
  assert.deepEqual(m.orderCounts, {
    valid_orders: 1,
    preparing_orders: 1,
    opened_orders: 0,
    unclassified_orders: 0,
  });
  assert.equal(m.quantities[0].business_stage, '备单中');
  assert.equal(c.preparing, 1);
  assert.equal(c.stages.find((s) => s.name === '备单中').total, 1);
  assert.deepEqual(c.stages.find((s) => s.name === '备单中').orders, ['O1']);
  const absent = attachExecutionTrace(facts, { rows: [] }).rows;
  assert.equal(computeOrderMetrics(absent).orderCounts.unclassified_orders, 0);
  assert.equal(computeOrderMetrics(absent).orderCounts.preparing_orders, 1);
  const conflict = attachExecutionTrace(facts, {
    rows: [
      { executeorderno: 'E1', cust_code: 'C1', order_stage: '派车中', order_stage_conflict: 1 },
    ],
  }).rows;
  assert.equal(computeOrderMetrics(conflict).orderCounts.preparing_orders, 1);
  const completed = attachExecutionTrace(facts, {
    rows: [
      { executeorderno: 'E1', cust_code: 'C1', order_stage: '已完成', odo_order_status: '已完成' },
    ],
  }).rows;
  assert.equal(computeOrderMetrics(completed).orderCounts.preparing_orders, 1);
  assert.equal(
    comparisonMetrics(completed, 'belong_base')[0].stages.find((s) => s.name === '备单中').total,
    1,
  );
  const split = {
    rows: [line, { ...line, executeorderno: 'E2', executeorderlineno: '2', material_code: 'M2' }],
  };
  const partial = attachExecutionTrace(split, {
    rows: [{ executeorderno: 'E1', cust_code: 'C1', order_stage: '备单中' }],
  }).rows;
  assert.ok(partial.every((r) => r.prapare_order_status === '备单中'));
  assert.equal(computeOrderMetrics(partial).orderCounts.unclassified_orders, 0);
  assert.equal(
    computeOrderMetrics(
      attachExecutionTrace({ rows: [{ ...line, prapare_order_status: '已发货' }] }, null).rows,
    ).orderCounts.opened_orders,
    1,
  );
});

test('trace node flags are stage-specific; conflicts and completed orders are not overdue', () => {
  const now = shanghaiTime('2026-10-22 18:00:00');
  const traced = {
    ...line,
    prapare_order_status: '已开未派',
    latestarrivaldate: '2026-10-22 20:00:00',
    execution_trace: {
      order_stage: '派车中',
      paiche_status: '派车超时',
      peidan_status: '备单正常',
    },
  };
  assert.equal(nodeMetrics([traced], now).overdue, 1);
  assert.equal(nodeMetrics([{ ...traced, trace_stage_conflict: true }], now).overdue, 1);
  assert.equal(
    nodeMetrics(
      [{ ...traced, prapare_order_status: '已完成', execution_trace: { order_stage: '已完成' } }],
      now,
    ).overdue,
    0,
  );
  assert.equal(
    nodeMetrics(
      [
        {
          ...traced,
          trace_conflicts: ['paiche_status'],
          execution_trace: { order_stage: '派车中' },
        },
      ],
      now,
    ).unknown,
    1,
  );
});

test('authorized node trace supplements metrics without replacing main status or accepting other keys', () => {
  const t = { execute_no: 'E1', customer_code: 'C1', order_no: 'O1', prepare_status: '备单预警' };
  const facts = { rows: [line] };
  const enriched = attachExecutionTrace(facts, null, { rows: [t] }).rows;
  assert.equal(enriched[0].prapare_order_status, '备单中');
  assert.equal(enriched[0].order_qty, 100);
  assert.equal(nodeMetrics(enriched, shanghaiTime('2026-10-22 12:00:00')).warning, 1);
  for (const change of [
    { customer_code: 'OTHER' },
    { execute_no: 'OTHER' },
    { order_no: 'OTHER' },
  ]) {
    assert.equal(
      attachExecutionTrace(facts, null, { rows: [{ ...t, ...change }] }).rows[0].execution_trace,
      undefined,
    );
  }
  assert.equal(
    attachExecutionTrace(facts, null, { rows: [t], rejectedColumns: ['prepare_status'] }).rows[0]
      .execution_trace,
    undefined,
  );
  const conflict = attachExecutionTrace(facts, null, {
    rows: [t, { ...t, prepare_status: '备单超时' }],
  }).rows[0];
  assert.ok(conflict.trace_conflicts.includes('peidan_status'));
  const primary = { rows: [{ executeorderno: 'E1', cust_code: 'C1', peidan_status: '备单正常' }] };
  assert.equal(
    attachExecutionTrace(facts, primary, { rows: [t] }).rows[0].execution_trace.peidan_status,
    '备单正常',
  );
});

test('arrival assessment uses destination GPS first, all three promises plus twelve hours and order deduplication', () => {
  const t = {
    order_stage: '已完成',
    requireddeliverytimebak: '2026-10-22 08:00:00',
    requireddeliverytime: '2026-10-22 09:00:00',
    expected_deliv_time: '2026-10-22 10:00:00',
    gpsisinraildate_to: '2026-10-22 21:00:00',
    arriveconfirm_time: '2026-10-23 01:00:00',
  };
  const rows = [
    { ...line, execution_trace: t },
    { ...line, executeorderlineno: '2', material_code: 'M2', execution_trace: t },
  ];
  const a = assessTraceArrivals(rows, { start: '2026-10-22', end: '2026-10-23' });
  assert.equal(a.assessed, 1);
  assert.equal(a.onTime, 1);
  assert.equal(a.rate, 100);
  assert.equal(
    assessTraceArrivals([{ ...line, execution_trace: { ...t, gpsisinraildate_to: null } }], {
      start: '2026-10-22',
      end: '2026-10-23',
    }).outsidePeriod,
    1,
  );
  assert.equal(
    assessTraceArrivals([{ ...line, execution_trace: { ...t, expected_deliv_time: null } }])
      .unknown,
    1,
  );
  assert.equal(
    assessTraceArrivals([{ ...line, delivery_qty: null, execution_trace: t }]).rate,
    null,
  );
});
test('EA conversion, demand-based rates and distinct quantity formulas', () => {
  const q = lineQuantities(line);
  assert.equal(q.allocated, 50);
  assert.equal(q.shipped, 20);
  assert.equal(q.currentShort, 50);
  assert.equal(q.rawShort, 30);
  assert.equal(q.skuRate, 50);
  assert.equal(q.allocationRate, 62.5);
  assert.equal(lineQuantities({ ...line, pack_unitqty: 49 }).allocated, null);
  assert.equal(lineQuantities({ ...line, packingunitmain: null }).skuRate, null);
  assert.equal(lineQuantities({ ...line, pack_unitqty: 110, qtyallocated: 880 }).skuRate, 90);
  assert.equal(lineQuantities({ ...line, pack_unitqty: 110, qtyallocated: 880 }).currentShort, 10);
  assert.equal(lineQuantities({ ...line, order_qty: 0 }).skuRate, null);
});
test('whole-order allocation is quantity weighted, not an average of SKU percentages', () => {
  const result = computeOrderMetrics([
    line,
    {
      ...line,
      executeorderlineno: '2',
      material_code: 'M2',
      order_qty: 300,
      adjust_order_qty: 300,
      pack_unitqty: 300,
      qtyallocated: 2400,
    },
  ]);
  assert.equal(result.quantities[0].order_allocation_rate, 87.5);
  assert.equal(result.quantities[1].order_allocation_rate, 87.5);
  assert.equal(result.pendingAllocationRate, 87.5);
});

test('latest glossary keeps pending demand distinct from adjusted demand and computes opened shipment rate', () => {
  assert.equal(computeOrderMetrics([line]).pendingAllocationRate, 50);
  const shipped = { ...line, prapare_order_status: '运输中' };
  assert.equal(computeOrderMetrics([shipped]).openedShipmentRate, 20);
  assert.equal(
    computeOrderMetrics([{ ...shipped, qtyshipped: null, delivery_qty: null }]).openedShipmentRate,
    null,
  );
  assert.equal(computeOrderMetrics([shipped, shipped]).openedShipmentRate, null);
  const now = shanghaiTime('2026-10-22 15:00:00');
  assert.equal(
    nodeMetrics(
      [{ ...line, prapare_order_status: '厂外候车', latestsendcardate: '2026-10-22 14:00:00' }],
      now,
    ).stages.loading.overdue,
    1,
  );
});
test('duplicate execution keys and ambiguous split demand do not become partial totals', () => {
  assert.equal(computeOrderMetrics([line, line]).pendingAllocationRate, null);
  assert.equal(computeOrderMetrics([line, line]).duplicateExecutionKeys, 1);
  const repeatedDemand = computeOrderMetrics([line, { ...line, executeorderno: 'E2' }]);
  assert.equal(repeatedDemand.quantities[0].original_qty, 100);
  assert.equal(repeatedDemand.quantities[0].allocated_qty, 100);
  assert.equal(repeatedDemand.pendingAllocationRate, 100);
  assert.equal(
    computeOrderMetrics([line, { ...line, executeorderno: 'E2', fromorderlineno: 'L2' }])
      .pendingAllocationRate,
    null,
  );
  const split = computeOrderMetrics([
    line,
    { ...line, executeorderno: 'E2', order_qty: 200, adjust_order_qty: 160 },
  ]);
  assert.equal(split.quantities[0].original_qty, null);
  assert.equal(split.pendingAllocationRate, null);
  assert.equal(computeOrderMetrics([{ ...line, detailstatus: 20 }]).pendingAllocationRate, null);
});
test('documented two-hour/night windows, exact deadlines and unknown timestamps', () => {
  const at = (text) => shanghaiTime(text);
  assert.equal(deadlineStatus('2026-10-22 16:00:00', at('2026-10-22 13:59:59')), 'normal');
  assert.equal(deadlineStatus('2026-10-22 16:00:00', at('2026-10-22 14:00:00')), 'warning');
  assert.equal(deadlineStatus('2026-10-22 16:00:00', at('2026-10-22 16:00:00')), 'warning');
  assert.equal(deadlineStatus('2026-10-22 16:00:00', at('2026-10-22 16:00:01')), 'overdue');
  assert.equal(deadlineStatus('2026-10-23 08:00:00', at('2026-10-22 14:00:00')), 'warning');
  assert.equal(deadlineStatus(null, Date.now()), 'unknown');
  assert.equal(shanghaiTime('2026-02-30 12:00:00'), null);
});
test('node deadlines use the documented fields and latest stage per order', () => {
  const now = shanghaiTime('2026-10-22 15:00:00');
  const complete = {
    ...line,
    latestarrivaldate: '2026-10-22 14:00:00',
    latestsendcardate: '2026-10-22 16:00:00',
    requireddeliverytime: '2026-10-22 17:30:00',
  };
  const result = nodeMetrics(
    [
      complete,
      { ...complete, prapare_order_status: '已派未到' },
      { ...complete, cust_order_no: 'O2', prapare_order_status: '装车中' },
      { ...complete, cust_order_no: 'O3', prapare_order_status: '运输中' },
      {
        ...complete,
        cust_order_no: 'O4',
        prapare_order_status: '运输中',
        requireddeliverytime: null,
      },
      { ...complete, cust_order_no: 'O5', prapare_order_status: '已发货' },
    ],
    now,
  );
  assert.equal(result.states.length, 5);
  assert.equal(result.stages.allocation.total, 0);
  assert.equal(result.stages.dispatch.overdue, 1);
  assert.equal(result.stages.loading.warning, 1);
  assert.equal(result.states.find((row) => row.order === 'O3').status, 'normal');
  assert.equal(result.unknown, 2);
  assert.equal(result.overdue, 1);
});
test('base/province comparisons use complete quantities and disjoint order buckets, preserving missing shortage coverage', () => {
  const rows = [
    { ...line, province_region_name: '河南', sales_person: null },
    {
      ...line,
      executeorderlineno: '2',
      material_code: 'M2',
      order_qty: 300,
      adjust_order_qty: 300,
      pack_unitqty: 300,
      qtyallocated: 2400,
      province_region_name: '河南',
    },
    {
      ...line,
      executeorderno: 'E2',
      cust_order_no: 'O2',
      province_region_name: '河南',
      order_qty: 100,
      adjust_order_qty: null,
    },
    {
      ...line,
      executeorderno: 'E3',
      cust_order_no: 'VOID',
      detailstatus: 20,
      province_region_name: '河南',
    },
  ];
  const [base] = comparisonMetrics(rows, 'belong_base', [
    { execution_order: 'E1', sku: 'M1', source_rows: 1, after_inventory_short_qty: 12 },
  ]);
  assert.equal(base.source_orders, 2);
  assert.equal(base.source_order_count, 3);
  assert.equal(base.preparing, 2);
  assert.equal(base.rate_coverage, 2);
  assert.deepEqual(base.buckets, [1, 0, 1, 0, 0]);
  assert.equal(base.allocation_rate, 80);
  assert.equal(base.shortage_qty, 12);
  assert.equal(base.shortage_coverage, 1);
  assert.equal(base.shortage_total, 3);
  assert.equal(comparisonMetrics(rows, 'province_region_name', null)[0].shortage_qty, null);
  assert.equal(
    comparisonMetrics([{ ...line, packingunitmain: null }], 'belong_base')[0].allocation_rate,
    null,
  );
  const partial = comparisonMetrics(
    [line, { ...line, executeorderno: 'E2', cust_order_no: 'O2', order_qty: null }],
    'belong_base',
  )[0];
  assert.equal(partial.rate_total, 2);
  assert.equal(partial.rate_coverage, 1);
  assert.equal(
    partial.buckets.reduce((sum, count) => sum + count, 0),
    1,
  );
  assert.equal(partial.allocation_rate, null);
  assert.equal(partial.known_allocation_rate,100*Math.abs(line.order_qty-line.pack_unitqty)/line.order_qty);
  assert.equal(partial.quantity_coverage,1);
  assert.equal(partial.quantity_total,2);
  const withVoidSku = comparisonMetrics(
    [
      line,
      {
        ...line,
        executeorderlineno: 'VOID',
        material_code: 'VOID',
        detailstatus: 20,
        order_qty: null,
      },
    ],
    'belong_base',
  )[0];
  assert.equal(withVoidSku.allocation_rate, 50);
  assert.equal(withVoidSku.rate_coverage, 1);
});
