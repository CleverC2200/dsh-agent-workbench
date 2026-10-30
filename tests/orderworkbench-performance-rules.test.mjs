import test from 'node:test';
import assert from 'node:assert/strict';
import {
  shippableDaysState,
  performanceCurrentCell,
  highlightAgePeak,
} from '../prototypes/inventory-orderworkbench/performance-rules.mjs';
import { workbenchPresentation } from '../prototypes/inventory-orderworkbench/live-presentation.mjs';
import { computeWorkbenchMetrics } from '../prototypes/inventory-orderworkbench/metric-model.mjs';

test('national, Zhengzhou and other-base targets retain strict and inclusive boundaries', () => {
  for (const [number, base, state] of [
    [12.499, '', '健康'],
    [12.5, '', '严重'],
    [12.5, '合计', '严重'],
    [12.5, '郑州', '健康'],
    [12.501, '郑州', '严重'],
    [10.999, '华东', '健康'],
    [11, '华东', '严重'],
    [0, '华东', '健康'],
    [null, '', '数据不足'],
    [10, '未映射', '数据不足'],
  ])
    assert.equal(shippableDaysState(number, base), state);
});
test('red status uses unrounded current values and leaves unknown inputs unmarked', () => {
  assert.equal(performanceCurrentCell('订单满足率', 95, '95.00%').state, 'bad');
  assert.equal(performanceCurrentCell('订单满足率', 95.001, '95.00%').state, 'good');
  assert.equal(performanceCurrentCell('准交率', 98.5, '98.50%').state, 'bad');
  assert.equal(performanceCurrentCell('准交率', 98.501, '98.50%').state, 'good');
  assert.equal(performanceCurrentCell('周转天数', 12.5, '12.50', '郑州').state, 'good');
  assert.equal(performanceCurrentCell('周转天数', 11, '11.00', '华东').state, 'bad');
  assert.equal(performanceCurrentCell('周转天数', null, '—'), '—');
});
test('highest age excludes totals and unknowns, preserves ties and never colors comparisons', () => {
  const age = (v) => performanceCurrentCell('货龄（>60天库存占比）', v, `${v}%`);
  const rows = [
    ['甲', age(8), '+30%'],
    ['乙', age(8), '-1%'],
    ['丙', age(3), '+100%'],
    ['丁', '—', '—'],
    ['合计', age(90), '+2%'],
  ];
  highlightAgePeak(rows, 1);
  assert.deepEqual(
    rows.map((r) => r[1]?.state),
    ['warning', 'warning', 'good', undefined, 'good'],
  );
  assert.equal(rows[0][2], '+30%');
});
test('all six live tables carry current-value states and separate monthly and weekly age peaks', () => {
  const make = (reverse) => {
    const p = {
      sections: [
        {
          id: 'stock',
          status: 'ready',
          rows: [
            {
              base: '郑州',
              sku: 'a',
              item: '甲',
              stock_date: '2026-10-25',
              inventory: 125,
              available: 1,
              sales_plan: 310,
              transfer_plan: 0,
              source_rows: 1,
              invalid: 0,
            },
            {
              base: '华东',
              sku: 'b',
              item: '乙',
              stock_date: '2026-10-25',
              inventory: 110,
              available: 1,
              sales_plan: 310,
              transfer_plan: 0,
              source_rows: 1,
              invalid: 0,
            },
          ],
        },
        {
          id: 'ages',
          status: 'ready',
          rows: [
            {
              base: '郑州',
              sku: 'a',
              item: '甲',
              stock_qty: 100,
              aged_qty: reverse ? 1 : 10,
              invalid: 0,
            },
            {
              base: '华东',
              sku: 'b',
              item: '乙',
              stock_qty: 100,
              aged_qty: reverse ? 10 : 1,
              invalid: 0,
            },
          ],
        },
        {
          id: 'orders',
          status: 'ready',
          rows: [{ base: '郑州', sku: 'a', item: '甲', demand: 100, shortage: 6, invalid: 0 }],
        },
        {
          id: 'ontime',
          status: 'ready',
          rows: [
            {
              base: '郑州',
              sku: 'a',
              item: '甲',
              customer: 'c',
              order_no: 'o',
              ontime: 0,
              invalid: 0,
            },
          ],
        },
        {
          id: 'directors',
          status: 'ready',
          rows: [
            { base: '郑州', sku: 'a', director: '张', names: 1 },
            { base: '华东', sku: 'b', director: '李', names: 1 },
          ],
        },
      ],
    };
    p.metrics = computeWorkbenchMetrics(p);
    return p;
  };
  const facts = {
    selected: 'month',
    periods: { month: make(false), week: make(true) },
    directors: { rows: [] },
    customers: { rows: [] },
  };
  const v = workbenchPresentation(facts);
  assert.equal(v.cards.find((c) => c.key === '周转天数').status, '健康');
  for (const [dimension, ageMonth, ageWeek] of [
    ['base-performance', 6, 6],
    ['director-performance', 7, 7],
    ['item-performance', 7, 6],
  ]) {
    const tables = v.performance[dimension];
    assert.equal(tables.month.filter((r) => r[ageMonth]?.state === 'warning').length, 1);
    assert.equal(tables.week.filter((r) => r[ageWeek]?.state === 'warning').length, 1);
    assert.equal(
      tables.month.find((r) => r[ageMonth]?.state === 'warning')[0],
      dimension === 'base-performance'
        ? '郑州'
        : dimension === 'director-performance'
          ? '张'
          : '甲',
    );
    assert.equal(
      tables.week.find((r) => r[ageWeek]?.state === 'warning')[0],
      dimension === 'base-performance'
        ? '华东'
        : dimension === 'director-performance'
          ? '李'
          : '乙',
    );
  }
  const base = v.performance['base-performance'].month;
  assert.equal(base.find((r) => r[0] === '郑州')[1].state, 'bad');
  assert.equal(base.find((r) => r[0] === '郑州')[4].state, 'bad');
  assert.equal(base.find((r) => r[0] === '郑州')[8].state, 'good');
  assert.equal(base.find((r) => r[0] === '华东')[8].state, 'bad');
  assert.equal(v.performance['item-performance'].month.find((r) => r[0] === '甲')[4].state, 'bad');
});
