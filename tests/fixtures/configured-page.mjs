import assert from 'node:assert/strict';
import { readFile } from '../helpers/prepared-assets.mjs';
import { injectSqlConfig } from '../../src/sql-config-document.ts';
import { makeRequest } from '../../business/shared/configured-query-client.mjs';
export async function configuredPageHtml(id) {
  const config = JSON.parse(await readFile(`lib/business/inventory-${id}/sql.config.json`, 'utf8'));
  return injectSqlConfig(await readFile(`lib/business/inventory-${id}/index.html`, 'utf8'), config);
}
/** Synthetic external rows for the current config protocol; never shipped or used for authorization. */
export async function configuredWire(id) {
  const config = JSON.parse(await readFile(`lib/business/inventory-${id}/sql.config.json`, 'utf8'));
  return (payload) => {
    assert.deepEqual(
      Object.keys(payload)
        .filter((key) => key !== 'freshAfter')
        .sort(),
      ['parameters', 'queryId'],
    );
    if (payload.freshAfter !== undefined)
      assert.ok(
        Number.isSafeInteger(payload.freshAfter) &&
          payload.freshAfter >= 0 &&
          payload.freshAfter <= Date.now() + 1000,
      );
    const q = config.queries[payload.queryId];
    assert.ok(q, `unregistered fixture query ${payload.queryId}`);
    makeRequest(config, payload.queryId, payload.parameters);
    const p = payload.parameters;
    if (id === 'dealer') assert.ok(!p.customer || p.customer === 'customer-A');
    const columns = q.resultColumns;
    const history = payload.queryId.startsWith('stock_history.');
    const total = history ? 2 : payload.queryId.includes('stock.detail') ? 201 : 1;
    const offset = p.offset ?? 0;
    const date = p.stat_date ?? p.stock_date ?? '2026-09-30';
    const makeRow = (index) =>
      Object.fromEntries(
        columns.map((field) => {
          let value = null;
          if (/^(missing_|negative_|duplicate_)/.test(field)) value = 0;
          if (/^(valid_|known_.*_count$|matched_.*_count$)/.test(field)) value = 201;
          const values = {
            the_date: index === 0 ? '2026-09-28' : '2026-09-30',
            current_stock: index === 0 ? 10 : 0,
            day: /^source\.(stock-date|health-date|branch-stock-date)$/.test(payload.queryId)
              ? p.as_of
              : '2026-09-30',
            total,
            page_scope_total: total,
            page_row_present: 1,
            row_count: 201,
            source_rows: 201,
            customer_count: 1,
            upload_count: 201,
            customer: 'customer-A',
            customer_name: '客户A',
            sku: `sku-A-${String(index).padStart(3, '0')}`,
            material_name: '测试商品',
            category: '汤圆',
            base: '华东',
            belong_base: '华东',
            stat_date: date,
            stock_date: date,
            health_date: date,
            upload_date: date,
            earliest_upload: date,
            latest_upload: date,
            store_count: 10,
            inventory: 12060,
            in_transit: 2412,
            total_inventory: 14472,
            inventory_value: 120600,
            sales7: 5628,
            sales30: 24120,
            cover_days: 18,
            onhand_days: 15,
            known_inventory: 5580,
            total_qty: 5580,
            available_qty: payload.queryId.startsWith('branch-health.') ? 0 : 5500,
            known_available: 5500,
            known_inventory_count: 105,
            known_available_count: 105,
            known_target: 2080,
            matched_target_gap: 3500,
            matched_stock_days: 26.57,
            matched_turnover_inventory: 5580,
            matched_turnover_demand: 210,
            fulfillment_rate: 0.88,
            demand: 100,
            shortage: 12,
            shipped: 88,
          };
          if (Object.hasOwn(values, field)) value = values[field];
          return [field, value];
        }),
      );
    let rows;
    if (payload.queryId.startsWith('source.')) rows = [makeRow(0)];
    else if (/\.(summary|cards|inventory)$/.test(payload.queryId) || columns.includes('total'))
      rows = [makeRow(0)];
    else
      rows = Array.from(
        { length: Math.max(0, Math.min(p.page_size ?? 10, total - offset)) },
        (_, i) => makeRow(offset + i),
      );
    if (payload.queryId.startsWith('category-tree.')) {
      const organization = payload.queryId.endsWith('customer')
        ? '河南省区'
        : payload.queryId.endsWith('branch')
          ? '分仓1'
          : '华东';
      const treeRow = (key, name) =>
        Object.fromEntries(
          columns.map((field) => [
            field,
            {
              ...makeRow(0),
              node_key: key,
              node_name: name,
              age_qty: 100,
              age_sum: 2000,
              risk_rank: 1,
              source_date: date,
              latest_date: date,
            }[field] ?? 0,
          ]),
        );
      rows =
        p.level === 'category'
          ? [treeRow('汤圆', '汤圆')]
          : p.level === 'organization'
            ? [treeRow(organization, organization)]
            : Array.from({ length: Math.min(p.page_size, 12 - offset) }, (_, i) =>
                treeRow(`sku-A-${String(offset + i).padStart(3, '0')}`, '测试商品'),
              );
    }
    if (payload.queryId === 'overview.quick-stock') {
      rows = ['基地', '分仓'].map((location_type) => ({
        ...makeRow(0),
        location_type,
        snapshot_date: p.as_of,
        available_qty: location_type === '分仓' ? 0 : 5500,
      }));
    }
    if (payload.queryId.startsWith('current-shortage.')) {
      const types = ['qll', 'apsplan'].includes(id)
        ? ['基地', '分仓']
        : [id === 'aqkc' ? '基地' : '分仓'];
      rows = types.map((location_type) => ({
        ...makeRow(0),
        location_type,
        location_code: location_type === '基地' ? '华东' : 'W01',
        location_name: location_type === '基地' ? '华东' : '分仓1',
        warehouse_code: location_type === '基地' ? null : 'W01',
        invalid: 0,
        demand: 100,
        allocated: 20,
        remaining: 80,
        available: 70,
        shortage: 10,
      }));
    }
    return { rows, returnedColumns: columns, rejectedColumns: [], configVersion: 'fixture-v1' };
  };
}
