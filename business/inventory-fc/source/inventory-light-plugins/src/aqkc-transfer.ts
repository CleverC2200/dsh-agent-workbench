// Transport only: preserve every authorized row and let the existing business
// engine select the month/version. Each result cell contains at most 100 rows.
const orders: Record<string, string[]> = {
  'workbench-safety-stock-rows': ['safety_stock.base_name','safety_stock.material_code','safety_stock.inventory_version','safety_stock.id'],
  'workbench-order-structure': ['workbench.base','workbench.category','workbench.material_code','workbench.material_name'],
  'workbench-age-structure': ['inventory_age.base_name','inventory_age.product_categ_name','inventory_age.material_code','inventory_age.material_name'],
  'workbench-current-order-skus': ['workbench.domain','workbench.base','workbench.material_code'],
  'daily-report-current-orders': ['workbench.domain','workbench.base','workbench.material_code'],
  'daily-report-age-skus': ['base','material'],
  'daily-report-fulfillment': ['base','material'],
};
export function supportsPackedTransfer(name: string) { return Object.hasOwn(orders, name); }
export function packedSafetyStockSql(sql: string, name = 'workbench-safety-stock-rows') {
  if (!supportsPackedTransfer(name)) throw Error('未知安全库存查询');
  const order = orders[name].map(key => `"${key}" NULLS FIRST`).join(', ');
  // The large safety-stock query has a fixed schema. Send field names once per
  // packet rather than repeating 22 long names in every SKU row.
  const columns = name === 'workbench-safety-stock-rows'
    ? [...sql.matchAll(/AS "(safety_stock\.[a-z0-9_]+)"/g)].map(match => match[1]) : [];
  const compact = columns.length > 0 && new Set(columns).size === columns.length;
  const row = compact ? `JSONB_BUILD_ARRAY(${columns.map(key => `s."${key}"`).join(',')})` : "TO_JSONB(s) - 'dsh_transfer_row'";
  const schema = compact ? `'${JSON.stringify(columns)}'::text AS dsh_columns,` : '';
  return `WITH dsh_stock_source AS (${sql}), dsh_stock_numbered AS (
    SELECT s.*, ROW_NUMBER() OVER (ORDER BY ${order}) AS dsh_transfer_row
    FROM dsh_stock_source s
  ) SELECT FLOOR((dsh_transfer_row - 1) / 100) AS dsh_group,
    COUNT(*) AS dsh_count,
    ${schema}
    JSONB_AGG(${row} ORDER BY dsh_transfer_row)::text AS dsh_rows
    FROM dsh_stock_numbered s GROUP BY FLOOR((dsh_transfer_row - 1) / 100)
    ORDER BY dsh_group`;
}

export function unpackSafetyStock(groups: Record<string, unknown>[], maxRows: number) {
  const rows: Record<string, unknown>[] = [];
  for (let index = 0; index < groups.length; index++) {
    const group = groups[index];
    if (Number(group.dsh_group) !== index) throw Error("安全库存传输分组不连续");
    let packed = typeof group.dsh_rows === "string" ? JSON.parse(group.dsh_rows) : group.dsh_rows;
    if (group.dsh_columns !== undefined) {
      const columns = typeof group.dsh_columns === 'string' ? JSON.parse(group.dsh_columns) : group.dsh_columns;
      if (!Array.isArray(columns) || !columns.length || new Set(columns).size !== columns.length ||
          columns.some(key => typeof key !== 'string' || !/^safety_stock\.[a-z0-9_]+$/.test(key)) ||
          !Array.isArray(packed) || packed.some(row => !Array.isArray(row) || row.length !== columns.length))
        throw Error("安全库存传输字段不完整");
      packed = packed.map(row => Object.fromEntries(columns.map((key, i) => [key, row[i]])));
    }
    if (!Array.isArray(packed) || !packed.length || packed.length > 100 ||
        packed.length !== Number(group.dsh_count) ||
        (index < groups.length - 1 && packed.length !== 100) ||
        packed.some(row => !row || typeof row !== "object" || Array.isArray(row)))
      throw Error("安全库存传输明细不完整");
    rows.push(...packed);
    if (rows.length > maxRows) throw Error("安全库存完整数据超过读取上限");
  }
  return rows;
}
