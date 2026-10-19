const finite = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export function parseDeliveryCities(value) {
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const addresses = JSON.parse(value);
    if (!Array.isArray(addresses)) return [];
    return [...new Set(addresses.flatMap((address) => {
      const text = String(address?.cust_name ?? '');
      const location = text.match(/[（(]([^）)]+)[）)]\s*卸货地/)?.[1] ?? '';
      const city = location.match(/^(.+?市)/)?.[1];
      return city ? [city] : [];
    }))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  } catch {
    return [];
  }
}

export function mapCustomerInventoryRows(rows) {
  if (!Array.isArray(rows)) throw Error('CUSTOMER_INVENTORY_RESULT_INVALID');
  let snapshot = null;
  const mapped = rows.map((row) => {
    const rowSnapshot = typeof row.snapshot_date === 'string' ? row.snapshot_date : null;
    if (!rowSnapshot || (snapshot && rowSnapshot !== snapshot))
      throw Error('CUSTOMER_INVENTORY_SNAPSHOT_INCONSISTENT');
    snapshot = rowSnapshot;
    const code = String(row.cust_code ?? '').trim();
    const name = String(row.cust_name ?? '').trim();
    if (!code || !name) throw Error('CUSTOMER_INVENTORY_IDENTITY_MISSING');
    const skuRows = finite(row.sku_rows) ?? 0;
    const complete = (field) => finite(row[field]) === skuRows;
    const quantity = complete('stock_coverage') ? finite(row.stock_qty) : null;
    const valueAmount = complete('value_coverage') ? finite(row.stock_amt) : null;
    const sales30 = complete('sales_coverage') ? finite(row.sales_qty_30days) : null;
    const normalQty = complete('normal_coverage') ? finite(row.normal_stock_qty) : null;
    // The confirmed customer target metrics come from the dealer-side target
    // calculation. Do not derive a substitute from recent sales while that
    // governed source has no rows.
    const targetQty = null;
    const targetValue = null;
    const cities = parseDeliveryCities(row.dealer_receive_addr);
    return {
      key: code, code, name,
      region: String(row.region_name ?? '区域未知'),
      province: String(row.province_name ?? '省区未知'),
      city: cities[0] ?? '卸货城市未知', cities, manager: '负责人未接入',
      value: valueAmount === null ? null : valueAmount / 10000,
      targetValue: targetValue === null ? null : targetValue / 10000,
      quantity,
      targetQty,
      targetTurnover: null,
      inventoryGap: null,
      sales30,
      structureScore: null,
      normalRatio: quantity !== null && quantity > 0 && normalQty !== null ? (normalQty / quantity) * 100 : null,
      turnover: sales30 !== null && sales30 > 0 && quantity !== null && quantity >= 0 ? quantity / (sales30 / 30) : null,
      largeDateQty: null, largeDateRatio: null, shortageSku: null, expirySku: null,
      noSalesSku: finite(row.no_sales_sku),
    };
  });
  return { snapshot, rows: mapped };
}

/** Preserve book balances; incomplete or anomalous inputs cannot establish healthy KPIs. */
export function summarizeCustomerInventory(rows) {
  const sum = (field) => {
    const available = rows.filter(row => Number.isFinite(row[field]));
    return available.length ? available.reduce((total, row) => total + row[field], 0) : null;
  };
  const quantity = sum('quantity');
  const sales30 = sum('sales30');
  const anomalous = quantity < 0 || sum('value') < 0;
  const normalRows = rows.filter(row => row.quantity > 0 && Number.isFinite(row.normalRatio));
  const normalQuantity = normalRows.reduce((total, row) => total + row.quantity, 0);
  return {
    totalValue: sum('value'), quantity, sales30,
    targetValue: sum('targetValue'), targetQty: sum('targetQty'),
    structureScore: null, largeDateQty: null, largeDateRatio: null,
    normalRatio: !anomalous && normalQuantity > 0
      ? normalRows.reduce((total, row) => total + row.quantity * row.normalRatio, 0) / normalQuantity : null,
    turnover: !anomalous && quantity !== null && sales30 > 0 ? quantity / (sales30 / 30) : null,
    anomalous,
    missingQuantityCount: rows.filter(row => !Number.isFinite(row.quantity)).length,
    missingValueCount: rows.filter(row => !Number.isFinite(row.value)).length,
    abnormalCustomerCount: rows.filter(row => row.quantity < 0 || row.value < 0).length,
    normalCoverageCount: normalRows.length,
  };
}
