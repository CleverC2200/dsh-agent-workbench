import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { addWorkbenchSummaryQueries } from '../business/inventory-orderworkbench/summary-queries.mjs';
import { workbenchQueries } from '../business/inventory-orderworkbench/queries.mjs';
import { model } from './orderworkbench-data.test.mjs';

test('gateway-compatible stock join preserves the full-join result including unmatched and NULL keys', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`CREATE TABLE agents_scm_stock_detail_d (
      belong_base,material_code,product_item,material_name,the_date,
      main_sales_plan_adj,main_sales_plan_v1,transfer_out_plan_adj,transfer_out_plan_v1);
      CREATE TABLE agents_scm_inventory_sku_data_d (
      belong_base,material_code,material_name,month_date,available_qty,live_qty,
      warehouse_classify,warehouse_classify_name);
      CREATE TABLE agents_scm_material_in_out_summary_d (
      material_code,product_categ_name,material_group_name);
      INSERT INTO agents_scm_stock_detail_d VALUES
      ('郑州','matched','item','a','2026-10-25',0,310,0,0),
      ('郑州','plan-only','item','b','2026-10-25',0,620,0,0),
      (NULL,'null-key','item','c','2026-10-25',0,31,0,0);
      INSERT INTO agents_scm_inventory_sku_data_d VALUES
      ('郑州','matched','a','20261025',100,100,'01','工厂成品仓'),
      ('郑州','stock-only','b','20261025',50,50,'02','工厂外租库'),
      (NULL,'null-key','c','20261025',10,10,'01','工厂成品仓'),
      ('郑州','missing-quantity','d','20261025',0,NULL,'01','工厂成品仓');`);
    const sql = workbenchQueries.stock.sql;
    assert.doesNotMatch(sql, /FULL\s+(?:OUTER\s+)?JOIN|<=>/i);
    const firstArm = sql.split(' UNION ALL ')[0];
    const original = firstArm.replace(') s LEFT JOIN (', ') s FULL OUTER JOIN (');
    assert.notEqual(firstArm, original);
    const params = { gea_p1: '2026-10-19', gea_p2: '2026-10-26' };
    const read = (query) =>
      db
        .prepare(query)
        .all(params)
        .map((row) => JSON.stringify(row))
        .sort();
    assert.deepEqual(read(sql), read(original));
    assert.equal(read(sql).length, 6);
  } finally {
    db.close();
  }
});

test('SQL summary keeps independent nationwide contributions from stock-only and plan-only SKUs', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const config = { queries: {} };
    for (const name of ['orders', 'stock', 'ages', 'directors', 'items']) {
      const columns = workbenchQueries[name].columns;
      db.exec(
        'CREATE TABLE independent_' +
          name +
          ' (' +
          columns.map((column) => '"' + column + '"').join(',') +
          ')',
      );
      config.queries['workbench.' + name] = {
        request: {
          sql:
            'SELECT ' + columns.join(',') + ' FROM independent_' + name + ' ORDER BY ' + columns[0],
        },
        resultColumns: columns,
        parameterSpec: {},
      };
    }
    const rows = [
      {
        sku: 'stock-only',
        national_inventory: 100,
        national_stock_records: 1,
        national_plan_records: 0,
        inventory: 100,
        invalid: 1,
      },
      {
        sku: 'plan-only',
        national_sales_plan: 310,
        national_stock_records: 0,
        national_plan_records: 1,
        sales_plan: 310,
        source_rows: 1,
        invalid: 1,
      },
      {
        sku: 'both',
        national_inventory: 50,
        national_sales_plan: 310,
        national_stock_records: 1,
        national_plan_records: 1,
        inventory: 50,
        sales_plan: 310,
        source_rows: 1,
        invalid: 0,
      },
    ].map((row) => ({
      base: '郑州',
      category: '食品',
      item: '水饺',
      stock_date: '2026-10-25',
      national_stock_invalid: 0,
      national_plan_invalid: 0,
      ...row,
    }));
    const columns = workbenchQueries.stock.columns;
    const insert = db.prepare(
      'INSERT INTO independent_stock VALUES (' + columns.map(() => '?').join(',') + ')',
    );
    for (const row of rows) insert.run(...columns.map((column) => row[column] ?? null));
    addWorkbenchSummaryQueries(config);
    const summary = db
      .prepare(config.queries['workbench.stock.summary'].request.sql)
      .all({ gea_p1001: 200, gea_p1002: 0 });
    assert.equal(summary.length, 1);
    assert.equal(summary[0].inventory, null, 'paired detail totals remain incomplete');
    assert.equal(model.nationalStockDays(summary), 7.5);
    assert.equal(model.nationalStockDays(summary), model.nationalStockDays(rows));
  } finally {
    db.close();
  }
});
test('SQL summaries preserve NULL, zero, duplicate-stock guards and every visible dimension', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const owners = [
      { base: '郑州', sku: 'A', director: '张、李', names: 1, item: '汤圆', items: 1 },
      { base: '郑州', sku: 'B', director: '张', names: 1, item: '汤圆', items: 1 },
      { base: '郑州', sku: 'C', director: '赵', names: 2, item: '水饺', items: 1 },
    ];
    const source = {
      orders: [
        {
          base: '郑州',
          sku: 'A',
          category: '汤圆',
          item: '汤圆',
          name: 'A',
          demand: 10,
          shortage: 3,
          records: 2,
          invalid: 0,
          ontime: 1,
          judged: 2,
          unjudged: 0,
          invalid_judgment: 0,
        },
        {
          base: '郑州',
          sku: 'B',
          category: '汤圆',
          item: '汤圆',
          name: 'B',
          demand: 20,
          shortage: 0,
          records: 3,
          invalid: 0,
          ontime: 2,
          judged: 3,
          unjudged: 0,
          invalid_judgment: 0,
        },
      ],
      stock: [
        {
          base: '郑州',
          sku: 'A',
          category: '汤圆',
          item: '汤圆',
          name: 'A',
          stock_date: '2026-10-20',
          source_rows: 1,
          available: null,
          inventory: 5,
          aged: 0,
          sales_plan: null,
          transfer_plan: 0,
          daily_demand: null,
          invalid: 1,
        },
        {
          base: '郑州',
          sku: 'B',
          category: '汤圆',
          item: '汤圆',
          name: 'B',
          stock_date: '2026-10-20',
          source_rows: 1,
          available: 5,
          inventory: 5,
          aged: 1,
          sales_plan: 30,
          transfer_plan: 0,
          daily_demand: 2,
          invalid: 0,
        },
        {
          base: '郑州',
          sku: 'C',
          category: '水饺',
          item: '水饺',
          name: 'C',
          stock_date: '2026-10-20',
          source_rows: 2,
          available: 10,
          inventory: 10,
          aged: 0,
          sales_plan: 20,
          transfer_plan: 0,
          daily_demand: 1,
          invalid: 0,
        },
      ],
      ages: [
        {
          base: '郑州',
          sku: 'A',
          category: '汤圆',
          item: '旧标签',
          snapshot_date: '20261020',
          stock_qty: 5,
          aged_qty: 1,
          records: 2,
          excluded: 0,
          invalid: 0,
        },
        {
          base: '郑州',
          sku: 'B',
          category: '汤圆',
          item: '旧标签',
          snapshot_date: '20261020',
          stock_qty: 3,
          aged_qty: 0,
          records: 1,
          excluded: 0,
          invalid: 0,
        },
        {
          base: '郑州',
          sku: 'D',
          category: '仅货龄',
          item: '旧标签',
          snapshot_date: '20261020',
          stock_qty: 5,
          aged_qty: 0,
          records: 1,
          excluded: 0,
          invalid: 0,
        },
        {
          base: '郑州',
          sku: 'E',
          category: '仅货龄',
          item: '旧标签',
          snapshot_date: '20261020',
          stock_qty: -5,
          aged_qty: 0,
          records: 1,
          excluded: 0,
          invalid: 0,
        },
      ],
      directors: owners,
      items: owners.map((row) => ({ sku: row.sku, item: row.item, names: row.items })),
    };
    for (const row of source.stock)
      Object.assign(row, {
        national_inventory: row.inventory,
        national_sales_plan: row.sales_plan,
        national_stock_records: 1,
        national_plan_records: 1,
        national_stock_invalid: row.inventory === null ? 1 : 0,
        national_plan_invalid: row.sales_plan === null || row.source_rows !== 1 ? 1 : 0,
      });
    const config = { queries: {} };
    for (const [name, rows] of Object.entries(source)) {
      const columns = workbenchQueries[name].columns;
      db.exec('CREATE TABLE t_' + name + ' (' + columns.map((c) => '"' + c + '"').join(',') + ')');
      const insert = db.prepare(
        'INSERT INTO t_' + name + ' VALUES (' + columns.map(() => '?').join(',') + ')',
      );
      for (const row of rows) insert.run(...columns.map((c) => row[c] ?? null));
      config.queries['workbench.' + name] = {
        request: {
          sql:
            'SELECT ' +
            columns.join(',') +
            ' FROM t_' +
            name +
            " WHERE (:gea_p900='' OR " +
            (name === 'items' ? "'郑州'" : 'base') +
            '=:gea_p900) ORDER BY ' +
            columns[0],
        },
        parameterSpec: {
          gea_p900: { name: 'report_base' },
          gea_p1001: { name: 'page_size' },
          gea_p1002: { name: 'offset' },
        },
        resultColumns: columns,
      };
    }
    addWorkbenchSummaryQueries(config);
    const aggregated = {};
    for (const name of ['orders', 'stock', 'ages'])
      aggregated[name] = db
        .prepare(config.queries['workbench.' + name + '.summary'].request.sql)
        .all({ gea_p900: '郑州', gea_p1001: 200, gea_p1002: 0 })
        .map((row) => ({ ...row }));
    const make = (data, summary) => {
      const period = {
        kind: 'month',
        start: '2026-10-01',
        end: '2026-10-21',
        sections: ['orders', 'stock', 'ages', 'changes', 'directors'].map((id) => ({
          id,
          status: 'ready',
          rows: data[id] ?? [],
        })),
      };
      period.metrics = model.computeWorkbenchMetrics(period);
      return {
        selected: 'month',
        sqlSummary: summary,
        complete: true,
        periods: Object.fromEntries(
          ['month', 'week', 'previousMonth', 'yearMonth', 'previousWeek', 'yearWeek'].map((k) => [
            k,
            period,
          ]),
        ),
        directors: { status: 'ready', rows: owners },
        customers: { rows: [] },
      };
    };
    const raw = structuredClone(source);
    for (const row of raw.ages)
      row.item = raw.orders.find((r) => r.base === row.base && r.sku === row.sku)?.item ?? null;
    const before = make(raw, false),
      after = make(aggregated, true);
    for (const dimension of [
      'base-performance',
      'director-performance',
      'item-performance',
      'category-fill',
      'category-days',
      'base-category',
      'base-category-days',
      'region-change',
    ]) {
      const a = model.workbenchPresentation(before, { dimension }),
        b = model.workbenchPresentation(after, { dimension });
      assert.deepEqual(
        b.cards.map((c) => [c.key, c.value, ...c.comparison]),
        a.cards.map((c) => [c.key, c.value, ...c.comparison]),
        dimension + ' cards',
      );
      assert.deepEqual(b.performance, a.performance, dimension);
      assert.deepEqual(b.dimensions, a.dimensions, dimension + ' dimensions');
    }
  } finally {
    db.close();
  }
});
