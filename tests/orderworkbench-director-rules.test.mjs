import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { workbenchQueries } from '../business/inventory-orderworkbench/queries.mjs';
import { addWorkbenchSummaryQueries } from '../business/inventory-orderworkbench/summary-queries.mjs';
import { applyPeriodAttributions } from '../prototypes/inventory-orderworkbench/period-attributions.mjs';
import { workbenchPresentation } from '../prototypes/inventory-orderworkbench/live-presentation.mjs';
import { computeWorkbenchMetrics } from '../prototypes/inventory-orderworkbench/metric-model.mjs';

test('director rows require orders while inventory-only known and unknown owners do not create rows', () => {
  const mappings = [
    { base: '郑州', sku: 'ordered', director: '订单负责人', names: 1 },
    { base: '郑州', sku: 'stock-only', director: '仅库存负责人', names: 1 },
  ];
  const period = {
    sections: [
      {
        id: 'orders',
        status: 'ready',
        rows: [{ base: '郑州', sku: 'ordered', demand: 10, shortage: 0, invalid: 0 }],
      },
      {
        id: 'stock',
        status: 'ready',
        rows: [
          { base: '郑州', sku: 'stock-only', inventory: 100, invalid: 0 },
          { base: '郑州', sku: 'unmapped-stock-only', inventory: 200, invalid: 0 },
        ],
      },
      {
        id: 'ages',
        status: 'ready',
        rows: [
          {
            base: '华南',
            sku: 'age-only',
            stock_qty: 10,
            aged_qty: 1,
            active_records: 1,
            invalid: 0,
          },
        ],
      },
      { id: 'directors', status: 'ready', rows: mappings },
    ],
  };
  period.metrics = computeWorkbenchMetrics(period);
  const facts = { selected: 'month', periods: { month: period, week: period } };
  const before = workbenchPresentation(facts);
  for (const key of ['month', 'week'])
    assert.deepEqual(
      before.performance['director-performance'][key].map((r) => r[0]),
      ['订单负责人'],
    );
  assert.ok(before.performance['base-performance'].month.some((r) => r[0] === '华南'));
  period.sections[0].rows.push({
    base: '郑州',
    sku: 'unmapped-order',
    demand: 1,
    shortage: 1,
    invalid: 0,
  });
  period.metrics = computeWorkbenchMetrics(period);
  const after = workbenchPresentation(facts);
  for (const key of ['month', 'week']) {
    assert.deepEqual(
      after.performance['director-performance'][key].map((r) => r[0]),
      ['订单负责人'],
    );
    assert.equal(after.performance['director-performance'][key][0][2].raw, 100);
    assert.equal(
      after.performance['base-performance'][key].find((r) => r[0] === '郑州')[7].raw,
      1000 / 11,
    );
    assert.equal(after.performance['item-performance'][key][0][1].raw, 1000 / 11);
  }
  assert.equal(after.cards.find((card) => card.key === '订单满足率').value, '90.91');
  assert.deepEqual(after.cards.slice(4), before.cards.slice(4));
});

test('raw and SQL summaries retain both Zhengzhou owners without combining different shared products or duplicating national quantities', () => {
  const mappings = [
    {
      base: '郑州',
      sku: 'A',
      director: '甲',
      directors: ['甲', '乙'],
      names: 2,
      item: '水饺',
      items: 1,
    },
    { base: '郑州', sku: 'B', director: '丙', directors: ['丙'], names: 1, item: '水饺', items: 1 },
    {
      base: '郑州',
      sku: 'C',
      director: '丙',
      directors: ['丙', '乙'],
      names: 2,
      item: '水饺',
      items: 1,
    },
  ];
  const stocks = ['A', 'B', 'C'].map((sku, index) => ({
    base: '郑州',
    sku,
    category: '食品',
    item: '水饺',
    name: sku,
    stock_date: '2026-10-25',
    plan_month_offset: 0,
    source_rows: 1,
    available: (index + 1) * 100,
    inventory: (index + 1) * 100,
    aged: 0,
    sales_plan: 310,
    transfer_plan: 0,
    daily_demand: null,
    invalid: 0,
    national_inventory: (index + 1) * 100,
    national_sales_plan: 310,
    national_stock_records: 1,
    national_plan_records: 1,
    national_stock_invalid: 0,
    national_plan_invalid: 0,
    base_transfer_plan: 0,
    base_plan_invalid: 0,
  }));
  const db = new DatabaseSync(':memory:');
  try {
    const config = { queries: {} };
    for (const name of ['orders', 'stock', 'ages', 'directors', 'items']) {
      const columns = workbenchQueries[name].columns;
      db.exec(`CREATE TABLE t_${name} (${columns.map((c) => `"${c}"`).join(',')})`);
      const insert = db.prepare(
        `INSERT INTO t_${name} VALUES (${columns.map(() => '?').join(',')})`,
      );
      const rows =
        name === 'stock'
          ? stocks
          : name === 'directors'
            ? mappings
            : name === 'items'
              ? [{ sku: 'A', item: '水饺', names: 1 }]
              : [];
      for (const row of rows)
        insert.run(
          ...columns.map((c) =>
            Array.isArray(row[c]) ? JSON.stringify(row[c]) : (row[c] ?? null),
          ),
        );
      config.queries['workbench.' + name] = {
        request: { sql: `SELECT ${columns.join(',')} FROM t_${name}` },
        parameterSpec: {},
        resultColumns: columns,
      };
    }
    addWorkbenchSummaryQueries(config);
    const summarized = db
      .prepare(config.queries['workbench.stock.summary'].request.sql)
      .all({ gea_p1001: 200, gea_p1002: 0 })
      .map((row) => ({ ...row }));
    assert.equal(summarized.length, 3);
    assert.deepEqual(
      summarized
        .filter((r) => r.names === 0)
        .map((r) => r.sku)
        .sort(),
      ['A', 'C'],
    );
    const raw = [{ id: 'stock', status: 'ready', rows: structuredClone(stocks) }];
    applyPeriodAttributions(raw, mappings);
    const present = (sections) => {
      const period = {
        sections: [
          ...sections,
          {
            id: 'orders',
            status: 'ready',
            rows: stocks.map(({ base, sku }) => ({
              base,
              sku,
              demand: 1,
              shortage: 0,
              invalid: 0,
            })),
          },
          { id: 'directors', status: 'ready', rows: mappings },
        ],
      };
      period.metrics = computeWorkbenchMetrics(period);
      return workbenchPresentation({ selected: 'month', periods: { month: period, week: period } });
    };
    const before = present(raw),
      after = present([{ id: 'stock', status: 'ready', rows: summarized }]);
    assert.deepEqual(
      after.performance['director-performance'],
      before.performance['director-performance'],
    );
    for (const key of ['month', 'week']) {
      const rows = after.performance['director-performance'][key];
      assert.deepEqual(
        rows.map((r) => r[0]),
        ['丙', '乙', '甲'].sort((a, b) => a.localeCompare(b, 'zh')),
      );
      assert.equal(rows.find((r) => r[0] === '甲')[9].raw, 10);
      assert.equal(rows.find((r) => r[0] === '乙')[9].raw, 20);
      assert.equal(rows.find((r) => r[0] === '丙')[9].raw, 25);
    }
    assert.equal(after.cards[5].value, '20.0');
  } finally {
    db.close();
  }
});
