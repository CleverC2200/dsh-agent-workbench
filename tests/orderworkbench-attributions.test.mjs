import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  workbenchQueries,
  addWorkbenchQueries,
} from '../business/inventory-orderworkbench/queries.mjs';
import { applyPeriodAttributions } from '../prototypes/inventory-orderworkbench/period-attributions.mjs';

test('attributions remain scoped to the period and base/SKU, reject ambiguity and use business items', () => {
  const db = new DatabaseSync(':memory:');
  try {
    for (const table of ['agents_scm_execute_detail_d', 'agents_scm_execute_detail_hourly_d'])
      db.exec(
        `CREATE TABLE ${table}(belong_base,material_code,director,product_item,header_addtime)`,
      );
    db.exec(`CREATE TABLE agents_scm_stock_detail_d(belong_base,material_code,product_item,the_date);
      CREATE TABLE agents_order_execute_isontime_mi(belong_base,new_material_code,pinxiang,fromorderno_month);
      INSERT INTO agents_scm_execute_detail_d VALUES
        ('华东','A','旧负责人','水饺','2026-09-10'),
        ('华东','A','新负责人','休闲','2026-10-10'),
        ('华东','B','甲','水饺','2026-10-10'),
        ('华南','A','南方负责人','汤圆','2026-10-10');
      INSERT INTO agents_scm_execute_detail_hourly_d VALUES
        ('华东','B','乙','汤圆','2026-10-11'),
        ('华东','C','小时负责人','面点','2026-10-11');
      INSERT INTO agents_scm_stock_detail_d VALUES ('华东','D','馄饨','2026-10-01');
      INSERT INTO agents_order_execute_isontime_mi VALUES ('华东','E','粽子','2026-10-02');`);
    const sql = workbenchQueries.directors.sql;
    const read = (start, end) => db.prepare(sql).all({ gea_p1: start, gea_p2: end });
    const current = read('2026-10-01', '2026-11-01');
    const historical = read('2026-09-01', '2026-10-01');
    assert.equal(historical.find((r) => r.sku === 'A').director, '旧负责人');
    assert.equal(current.find((r) => r.base === '华东' && r.sku === 'A').director, '新负责人');
    assert.equal(current.find((r) => r.sku === 'B').names, 2);
    assert.equal(current.find((r) => r.sku === 'B').item, null);
    const sections = [
      {
        id: 'ages',
        rows: ['A', 'B', 'C', 'D', 'E', 'missing'].map((sku) => ({
          base: '华东',
          sku,
          item: '物料组非品项',
          stock_qty: 10,
          aged_qty: 2,
        })),
      },
    ];
    const quantities = sections[0].rows.map((r) => [r.stock_qty, r.aged_qty]);
    applyPeriodAttributions(sections, current);
    assert.deepEqual(
      sections[0].rows.map((r) => r.item),
      ['休闲', null, '面点', '馄饨', '粽子', null],
    );
    assert.deepEqual(
      sections[0].rows.map((r) => r.names),
      [1, 0, 1, 0, 0, 0],
    );
    assert.deepEqual(
      sections[0].rows.map((r) => [r.stock_qty, r.aged_qty]),
      quantities,
    );
    const previous = [
      {
        id: 'ages',
        rows: [
          { base: '华东', sku: 'A' },
          { base: '华东', sku: 'C' },
        ],
      },
    ];
    applyPeriodAttributions(previous, historical);
    assert.equal(previous[0].rows[0].director, '旧负责人');
    assert.equal(previous[0].rows[1].director, null);
    const globalItems = db
      .prepare(workbenchQueries.items.sql)
      .all({ gea_p1: '2026-10-01', gea_p2: '2026-11-01' });
    const crossBase = [
      {
        id: 'ages',
        rows: [
          { base: '华南', sku: 'D' },
          { base: '华南', sku: 'B' },
        ],
      },
    ];
    applyPeriodAttributions(crossBase, current, globalItems);
    assert.equal(crossBase[0].rows[0].item, '馄饨');
    assert.equal(crossBase[0].rows[0].director, null);
    assert.equal(crossBase[0].rows[1].item, null);
    const historicalItems = db
      .prepare(workbenchQueries.items.sql)
      .all({ gea_p1: '2026-09-01', gea_p2: '2026-10-01' });
    applyPeriodAttributions(previous, historical, historicalItems);
    assert.equal(previous[0].rows[1].item, null);
    const config = addWorkbenchQueries({ queries: {} });
    const scoped = config.queries['workbench.directors'].request.sql;
    const rows = db
      .prepare(scoped)
      .all({
        gea_p1: '2026-10-01',
        gea_p2: '2026-11-01',
        gea_p900: '华东',
        gea_p1001: 200,
        gea_p1002: 0,
      });
    assert.ok(rows.every((r) => r.base === '华东'));
    const scopedItems = db
      .prepare(config.queries['workbench.items'].request.sql)
      .all({
        gea_p1: '2026-10-01',
        gea_p2: '2026-11-01',
        gea_p900: '华南',
        gea_p1001: 200,
        gea_p1002: 0,
      });
    assert.ok(!scopedItems.some((r) => r.sku === 'D'));
  } finally {
    db.close();
  }
});
