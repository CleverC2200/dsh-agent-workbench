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
    return [
      ...new Set(
        addresses.flatMap((address) => {
          const text = String(address?.cust_name ?? '');
          const location = text.match(/[（(]([^）)]+)[）)]\s*卸货地/)?.[1] ?? '';
          const city = location.match(/^(.+?市)/)?.[1];
          return city ? [city] : [];
        }),
      ),
    ].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  } catch {
    return [];
  }
}

export function buildCustomerHierarchy(rows) {
  const regions = new Map();
  for (const row of rows) {
    if (!regions.has(row.region)) regions.set(row.region, new Map());
    const provinces = regions.get(row.region);
    if (!provinces.has(row.province)) provinces.set(row.province, new Set());
    for (const city of row.cities ?? []) provinces.get(row.province).add(city);
  }
  return [...regions].map(([region, provinces]) => ({
    value: region,
    label: region,
    children: [...provinces].map(([province, cities]) => ({
      value: province,
      label: province,
      children: [...cities].map((city) => ({ value: city, label: city })),
    })),
  }));
}

export function completeCustomerPath(role, path, hierarchy) {
  const depth = { region: 1, province: 2, city: 3 }[role] ?? 0;
  const result = [];
  let options = hierarchy;
  for (let index = 0; index < depth; index++) {
    const node = options?.find((item) => item.value === path?.[index]) ?? options?.[0];
    if (!node) break;
    result.push(node.value);
    options = node.children;
  }
  return result;
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
    const planSameDate = row.plan_snapshot_date === rowSnapshot;
    const completePlanTransit = planSameDate && finite(row.plan_sku_rows) > 0 && finite(row.plan_transit_coverage) === finite(row.plan_sku_rows);
    const inTransit = complete('transit_coverage') ? finite(row.in_transit_qty)
      : completePlanTransit ? finite(row.plan_in_transit_qty) : null;
    // SKU discrepancies are diagnostics, not a business-risk rule or a reason
    // to discard a customer's otherwise calculable aggregate.
    const largeDateQty = complete('large_date_coverage') ? finite(row.large_date_qty) : null;
    const largeDateInvalid =
      largeDateQty < 0 || (largeDateQty !== null && quantity !== null && largeDateQty > quantity);
    const largeDateRatio =
      !largeDateInvalid && largeDateQty !== null && quantity > 0
        ? (largeDateQty / quantity) * 100
        : null;
    // The confirmed customer target metrics come from the dealer-side target
    // calculation. Do not derive a substitute from recent sales while that
    // governed source has no rows.
    const planComplete = (field) => finite(row.plan_sku_rows) > 0 && finite(row[field]) === finite(row.plan_sku_rows);
    const targetQty = planComplete('target_coverage') ? finite(row.target_qty) : null;
    const targetValue = null;
    const cities = parseDeliveryCities(row.dealer_receive_addr);
    return {
      key: code,
      code,
      name,
      region: String(row.region_name ?? '区域未知'),
      province: String(row.province_name ?? '省区未知'),
      city: cities[0] ?? '卸货城市未知',
      cities,
      manager: '负责人未接入',
      value: valueAmount === null ? null : valueAmount / 10000,
      targetValue: targetValue === null ? null : targetValue / 10000,
      quantity,
      targetQty,
      targetTurnover: planComplete('standard_coverage') && finite(row.minimum_standard_days) === finite(row.maximum_standard_days)
        ? finite(row.minimum_standard_days) : null,
      planSnapshot: row.plan_snapshot_date ?? null,
      targetCoverage: finite(row.target_coverage),
      standardCoverage: finite(row.standard_coverage),
      ageCoverage: finite(row.age_coverage),
      controlSkuCount: planComplete('age_coverage') ? finite(row.control_sku_count) : null,
      sourcePreorderQty: planComplete('preorder_coverage') ? finite(row.source_preorder_qty) : null,
      monthlyPlanQty: planComplete('monthly_plan_qty_coverage') ? finite(row.monthly_plan_qty) : null,
      shippedQty: planComplete('shipped_qty_coverage') ? finite(row.shipped_qty) : null,
      unshippedQty: planComplete('unshipped_qty_coverage') ? finite(row.unshipped_qty) : null,
      budgetAmount: planComplete('budget_amount_coverage') ? finite(row.budget_amount) : null,
      shippedAmount: planComplete('shipped_amount_coverage') ? finite(row.shipped_amount) : null,
      unshippedAmount: planComplete('unshipped_amount_coverage') ? finite(row.unshipped_amount) : null,
      cifPriceMin: finite(row.cif_price_min),
      cifPriceMax: finite(row.cif_price_max),
      cifPriceCoverage: finite(row.cif_price_coverage),
      skuCount: skuRows,
      planSkuCount: finite(row.plan_sku_rows),
      planFieldCoverage: Object.fromEntries(['monthly_plan_qty','shipped_qty','unshipped_qty','budget_amount','shipped_amount','unshipped_amount'].map(field => [field, finite(row[field + '_coverage'])])),
      inventoryGap: null,
      sales30,
      dailySales: sales30 === null ? null : sales30 / 30,
      inTransit,
      turnoverEstimated: inTransit === null,
      structureScore: finite(row.structure_score),
      structureIssues: structureIssues(row),
      normalRatio: largeDateRatio !== null ? 100 - largeDateRatio : null,
      turnover:
        sales30 !== null &&
        sales30 > 0 &&
        quantity !== null &&
        quantity >= 0 &&
        (inTransit === null || inTransit >= 0)
          ? (quantity + (inTransit ?? 0)) / (sales30 / 30)
          : null,
      largeDateQty,
      largeDateRatio,
      largeDateEstimated: false,
      largeDateInvalid,
      largeDateSkuIssueCount: finite(row.large_date_invalid_sku) ?? 0,
      largeDateMessage: largeDateInvalid
        ? '大日期数量与库存不一致，占比及新鲜度暂不计算'
        : largeDateQty === null
          ? '大日期数量缺失'
          : quantity === null
            ? '库存数据缺失，无法计算占比'
            : quantity === 0
              ? '库存总量为0，无法计算占比'
              : '',
      shortageSku: finite(row.shortage_sku),
      expirySku: null,
      noSalesSku: finite(row.no_sales_sku),
    };
  });
  return { snapshot, rows: mapped };
}

/** Preserve book balances; incomplete or anomalous inputs cannot establish healthy KPIs. */
export function summarizeCustomerInventory(rows) {
  const sum = (field) => {
    const available = rows.filter((row) => Number.isFinite(row[field]));
    return available.length ? available.reduce((total, row) => total + row[field], 0) : null;
  };
  const quantity = sum('quantity');
  const sales30 = sum('sales30');
  const anomalous = quantity < 0 || sum('value') < 0;
  const largeDateRows = rows.filter(
    (row) => Number.isFinite(row.largeDateQty) && Number.isFinite(row.quantity),
  );
  const largeDateQty = sum('largeDateQty');
  const coveredLargeDateQty = largeDateRows.reduce((total, row) => total + row.largeDateQty, 0);
  const largeDateQuantity = largeDateRows.reduce((total, row) => total + row.quantity, 0);
  const turnoverRows = rows.filter((row) => Number.isFinite(row.turnover));
  const turnoverSales = turnoverRows.reduce((total, row) => total + row.sales30, 0);
  const structureRows = rows.filter((row) => Number.isFinite(row.structureScore));
  return {
    totalValue: sum('value'),
    customerCodes: rows.map((row) => row.code).filter(Boolean),
    quantity,
    sales30,
    targetValue: sum('targetValue'),
    targetQty: sum('targetQty'),
    dailySales: sales30 === null ? null : sales30 / 30,
    inTransit: sum('inTransit'),
    structureScore: structureRows.length
      ? structureRows.reduce((total, row) => total + row.structureScore, 0) / structureRows.length
      : null,
    structureCoverageCount: structureRows.length,
    structureMessage: structureUnavailableMessage(rows),
    largeDateQty,
    largeDateRatio:
      largeDateQuantity > 0 && coveredLargeDateQty >= 0 && coveredLargeDateQty <= largeDateQuantity
        ? (coveredLargeDateQty / largeDateQuantity) * 100
        : null,
    largeDateEstimated: false,
    largeDateCoverageCount: rows.filter((row) => Number.isFinite(row.largeDateQty)).length,
    largeDateRatioCoverageCount: largeDateRows.length,
    largeDateInvalidCount: rows.filter((row) => row.largeDateInvalid).length,
    largeDateSkuIssueCount: rows.reduce(
      (total, row) => total + (row.largeDateSkuIssueCount ?? 0),
      0,
    ),
    normalRatio:
      largeDateQuantity > 0 && coveredLargeDateQty >= 0 && coveredLargeDateQty <= largeDateQuantity
        ? (1 - coveredLargeDateQty / largeDateQuantity) * 100
        : null,
    turnover:
      !anomalous && turnoverSales > 0
        ? turnoverRows.reduce((total, row) => total + row.quantity + (row.inTransit ?? 0), 0) /
          (turnoverSales / 30)
        : null,
    turnoverCoverageCount: turnoverRows.length,
    turnoverEstimated: turnoverRows.some((row) => row.turnoverEstimated),
    transitCoverageCount: turnoverRows.filter((row) => !row.turnoverEstimated).length,
    riskCount: rows.filter((row) =>
      ['risk', 'attention', 'anomaly'].includes(customerInventoryStatus(row)),
    ).length,
    highRiskCount: rows.filter((row) => ['risk', 'anomaly'].includes(customerInventoryStatus(row)))
      .length,
    attentionCount: rows.filter((row) => customerInventoryStatus(row) === 'attention').length,
    unknownCount: rows.filter((row) => customerInventoryStatus(row) === 'unknown').length,
    lowCoverageCount: rows.filter(
      (row) => row.sales30 > 0 && Number.isFinite(row.turnover) && row.turnover < 60,
    ).length,
    shortageSku: sum('shortageSku'),
    largeDateRiskCount: rows.filter(
      (row) => Number.isFinite(row.largeDateRatio) && row.largeDateRatio >= 5,
    ).length,
    anomalous,
    missingQuantityCount: rows.filter((row) => !Number.isFinite(row.quantity)).length,
    missingValueCount: rows.filter((row) => !Number.isFinite(row.value)).length,
    abnormalCustomerCount: rows.filter((row) => row.quantity < 0 || row.value < 0).length,
    normalCoverageCount: largeDateRows.length,
  };
}

/** Only use thresholds defined in the latest customer knowledge document. */
export function structureStatus(row) {
  return !Number.isFinite(row.structureScore)
    ? 'unknown'
    : row.structureScore >= 80
      ? 'healthy'
      : row.structureScore >= 65
        ? 'attention'
        : 'risk';
}

/** Preserve source diagnostics rather than calling every unscored customer incomplete. */
function structureIssues(row) {
  if (finite(row.structure_score) !== null) return [];
  const issues = [];
  if (finite(row.structure_negative_sales) > 0) issues.push('销量存在负值');
  if (finite(row.structure_negative_stock) > 0) issues.push('库存存在负值');
  if (finite(row.structure_missing_sku) > 0) issues.push('SKU编码缺失');
  if (finite(row.stock_coverage) !== finite(row.sku_rows)) issues.push('SKU库存数据缺失');
  if (finite(row.sales_coverage) !== finite(row.sku_rows)) issues.push('SKU销量数据缺失');
  if (!issues.length && finite(row.stock_qty) === 0) issues.push('库存总量为0');
  if (!issues.length && finite(row.sales_qty_30days) === 0) issues.push('近30日销量为0');
  return issues.length ? issues : ['结构分计算所需数据缺失'];
}

export function structureUnavailableMessage(rows) {
  const unscored = rows.filter((row) => !Number.isFinite(row.structureScore));
  if (!unscored.length) return '';
  const reasons = [
    ...new Set(unscored.flatMap((row) => row.structureIssues ?? ['结构分计算所需数据缺失'])),
  ];
  return `${reasons.join('；')}，${unscored.length === rows.length ? '结构分暂不计算' : `${unscored.length}家客户未评分`}`;
}
export function largeDateStatus(row) {
  return !Number.isFinite(row.largeDateRatio)
    ? 'unknown'
    : row.largeDateRatio >= 5
      ? 'attention'
      : 'healthy';
}
export function turnoverStatus(row) {
  // No upper turnover warning threshold is defined; do not retain demo 30.7/100.7 lines.
  return !Number.isFinite(row.turnover) ? 'unknown' : 'unassessed';
}
export function customerInventoryStatus(row) {
  const states = [structureStatus(row), largeDateStatus(row)];
  if (states.includes('risk')) return 'risk';
  if (states.includes('attention')) return 'attention';
  return states.every((state) => state === 'healthy') ? 'healthy' : 'unknown';
}
