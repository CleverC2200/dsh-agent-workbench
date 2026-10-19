import sqlConfiguration from '../../../sql.config.json';
import { sqlTemplate as configuredSql } from '../../../../shared/sql-config.ts';
// Transfer complete rows in bounded packets; keep business filtering and calculations unchanged.
type Database = { query(sql: string, values?: unknown[]): Promise<{ rows: any[] }> };
type Packing = { order: string[]; timestamps?: string[] };
function columnsFor(sql: string): string[] | undefined {
  if (
    sql.includes(
      configuredSql(
        sqlConfiguration,
        'fragments.source.inventory-light-plugins.src.fc-transfer.ts.1',
      ),
    )
  )
    return 'plan_snapshot_date target_month plan_version plan_source plan_status material_code material_name product_categ_name current_inventory_qty replenishment_cycle_days cycle_rule_source bi_target_amount bi_target_status target_growth_rate reference_shipment_qty history_same_period_growth_rate recent_three_month_growth_rate branch_growth_rate shipment_plan_qty transfer_plan_qty expected_month_end_inventory_qty updated_time'.split(
      ' ',
    );
  if (
    sql.includes('AS shipped_qty') &&
    sql.includes(
      configuredSql(
        sqlConfiguration,
        'fragments.source.inventory-light-plugins.src.fc-transfer.ts.2',
      ),
    ) &&
    sql.includes(
      configuredSql(sqlConfiguration, 'inline.source.inventory-light-plugins.src.fc-transfer.ts.1'),
    )
  )
    return ['sku', 'shipped_qty'];
  if (
    sql.includes(
      configuredSql(
        sqlConfiguration,
        'fragments.source.inventory-light-plugins.src.fc-transfer.ts.3',
      ),
    )
  )
    return 'source_snapshot_time executeorderno material_code order_qty preparing_qty preparing_allocated_qty cust_name cust_code required_delivery_at allocated_qty legacy_count updated_time'.split(
      ' ',
    );
  if (
    sql.includes(
      configuredSql(
        sqlConfiguration,
        'fragments.source.inventory-light-plugins.src.fc-transfer.ts.4',
      ),
    )
  )
    return 'base_finish_date warehouse_group_id warehouse_group_name base_name material_code planned_qty updated_time'.split(
      ' ',
    );
  if (
    sql.includes(
      configuredSql(
        sqlConfiguration,
        'fragments.source.inventory-light-plugins.src.fc-transfer.ts.5',
      ),
    ) &&
    sql.includes(
      configuredSql(
        sqlConfiguration,
        'fragments.source.inventory-light-plugins.src.fc-transfer.ts.6',
      ),
    )
  )
    return 'snapshot_date material_code material_name product_categ_name prod_date live_qty available_qty updated_time'.split(
      ' ',
    );
  if (sql.includes('o.metric_group') && sql.includes('AS metric_value'))
    return 'snapshot_date period_month business_date metric_group metric_name material_code material_name base_group_id base_group_name metric_value updated_time'.split(
      ' ',
    );
}
export function packetSql(sql: string, packing: Packing) {
  if (
    !packing.order.length ||
    [...packing.order, ...(packing.timestamps ?? [])].some((k) => !/^[a-z][a-z0-9_]*$/.test(k))
  )
    throw Error('分仓传输排序无效');
  const order = packing.order.map((k) => `"${k}"`).join(',');
  const columns = columnsFor(sql);
  const row = columns
    ? configuredSql(
        sqlConfiguration,
        'inline.source.inventory-light-plugins.src.fc-transfer.ts.2',
        [
          columns
            .map((k) =>
              (packing.timestamps ?? []).includes(k)
                ? configuredSql(
                    sqlConfiguration,
                    'inline.source.inventory-light-plugins.src.fc-transfer.ts.3',
                    [k],
                  )
                : `s.${k}`,
            )
            .join(','),
        ],
      )
    : configuredSql(
        sqlConfiguration,
        'inline.source.inventory-light-plugins.src.fc-transfer.ts.4',
      ) +
      (packing.timestamps ?? [])
        .map((k) =>
          configuredSql(
            sqlConfiguration,
            'inline.source.inventory-light-plugins.src.fc-transfer.ts.5',
            [k, k],
          ),
        )
        .join('');
  return configuredSql(sqlConfiguration, 'inventory-light-plugins.src.fc-transfer.1', [
    sql,
    order,
    columns
      ? configuredSql(
          sqlConfiguration,
          'fragments.source.inventory-light-plugins.src.fc-transfer.ts.7',
          [JSON.stringify(columns)],
        )
      : '',
    row,
  ]);
}
export function unpackPackets(groups: any[]) {
  const rows: any[] = [];
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    if (
      Number(g.dsh_packet) !== i ||
      (typeof g.dsh_rows === 'string' && g.dsh_rows.length > 20000000)
    )
      throw Error('分仓传输分组无效');
    let part = typeof g.dsh_rows === 'string' ? JSON.parse(g.dsh_rows) : g.dsh_rows;
    if (g.dsh_columns !== undefined) {
      const columns = typeof g.dsh_columns === 'string' ? JSON.parse(g.dsh_columns) : g.dsh_columns;
      if (
        !Array.isArray(columns) ||
        !columns.length ||
        new Set(columns).size !== columns.length ||
        columns.some((k) => typeof k !== 'string' || !/^[a-z][a-z0-9_]*$/.test(k)) ||
        !Array.isArray(part) ||
        part.some((r) => !Array.isArray(r) || r.length !== columns.length)
      )
        throw Error('分仓传输字段不完整');
      part = part.map((r) => Object.fromEntries(columns.map((k, j) => [k, r[j]])));
    }
    if (
      !Array.isArray(part) ||
      !part.length ||
      part.length > 100 ||
      part.length !== Number(g.dsh_count) ||
      (i < groups.length - 1 && part.length !== 100) ||
      part.some((r) => !r || typeof r !== 'object' || Array.isArray(r))
    )
      throw Error('分仓传输明细不完整');
    rows.push(...part);
    if (rows.length > 100000) throw Error('分仓完整明细超过读取上限');
  }
  return { rows };
}
function packingFor(sql: string): Packing | undefined {
  if (
    sql.includes(
      configuredSql(
        sqlConfiguration,
        'fragments.source.inventory-light-plugins.src.fc-transfer.ts.8',
      ),
    )
  )
    return { order: ['target_month', 'material_code'], timestamps: ['updated_time'] };
  if (
    sql.includes('AS shipped_qty') &&
    sql.includes(
      configuredSql(
        sqlConfiguration,
        'fragments.source.inventory-light-plugins.src.fc-transfer.ts.9',
      ),
    ) &&
    sql.includes(
      configuredSql(sqlConfiguration, 'inline.source.inventory-light-plugins.src.fc-transfer.ts.6'),
    )
  )
    return { order: ['sku'] };
  if (
    sql.includes(
      configuredSql(
        sqlConfiguration,
        'fragments.source.inventory-light-plugins.src.fc-transfer.ts.10',
      ),
    ) &&
    sql.includes(
      configuredSql(
        sqlConfiguration,
        'fragments.source.inventory-light-plugins.src.fc-transfer.ts.11',
      ),
    )
  )
    return { order: ['executeorderno', 'material_code'], timestamps: ['updated_time'] };
  if (
    sql.includes(
      configuredSql(
        sqlConfiguration,
        'fragments.source.inventory-light-plugins.src.fc-transfer.ts.12',
      ),
    ) &&
    sql.includes('AS planned_qty')
  )
    return {
      order: ['base_finish_date', 'warehouse_group_name', 'material_code', 'warehouse_group_id'],
      timestamps: ['updated_time'],
    };
}
export function createFcDatabase(source: Database) {
  const packed = async (sql: string, values: unknown[], packing: Packing) =>
    unpackPackets((await source.query(packetSql(sql, packing), values)).rows);
  return {
    query(sql: string, values: unknown[] = []) {
      const packing = packingFor(sql);
      return packing ? packed(sql, values, packing) : source.query(sql, values);
    },
    queryPackedRows(sql: string, values: unknown[], packing: Packing) {
      return packed(sql, values, packing);
    },
  };
}
