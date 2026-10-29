const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : {};
const number = (value: unknown): number | null =>
  (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) &&
  Number.isFinite(Number(value))
    ? Number(value)
    : null;

/** Whole-scope summaries only. Page rows must never become rankings or inventory totals. */
export function branchDashboardEvidence(input: {
  warehouseCode: string;
  warehouseName: string;
  asOf: string;
  cycleDays: number;
  parts: unknown;
  localPlanTrial: boolean;
  recommendedQty: number | null;
  missingCalculationCount: number;
  currentOrderShortageQty: number | null;
}) {
  const parts = record(input.parts);
  const source = (name: string) => record(parts[name]);
  const summary = (name: string): Record<string, unknown> => {
    const value = source(name);
    return value.error ? {} : record(value.summary);
  };
  const plan = summary('replenishment');
  const stock = summary('branch-stock');
  const shortage = source('current-shortage');
  const available = number(plan.available_qty) ?? number(stock.available_qty);
  const totalRows = number(plan.row_count);
  const comparable = input.localPlanTrial ? null : number(plan.comparable_sku_count);
  const deviation = input.localPlanTrial ? null : number(plan.known_inventory_deviation_qty);
  const comparableTarget = input.localPlanTrial
    ? null
    : number(plan.comparable_target_inventory_qty);
  const target = input.localPlanTrial ? null : number(plan.known_target_inventory_qty);
  const complete = totalRows !== null && totalRows > 0 && comparable === totalRows;
  const missing = [
    '缺口影响订单数',
    '分仓×品类缺口排名',
    '分仓×品类偏差排名',
    '风险品类集合及SKU交集',
    '91天及以上库存与60–90天库存（现有60/90阈值汇总不用于替代）',
    '未来7/14日预计新增超龄',
    ...(available === null ? ['当前可用库存'] : []),
    ...(target === null ? ['目标库存'] : []),
    ...(deviation === null ? ['订单扣减后库存差额'] : []),
  ];
  return {
    scope: {
      warehouseCode: input.warehouseCode || '全部分仓',
      warehouseName: input.warehouseName,
      asOf: input.asOf,
      unit: '件',
    },
    totals: {
      currentAvailableQty: available,
      targetInventoryQty: target,
      orderAdjustedAvailableQty: input.localPlanTrial
        ? null
        : number(plan.order_adjusted_available_qty),
      inventoryDeviationQty: deviation,
      inventoryDeviationPercent:
        deviation !== null && comparableTarget !== null && comparableTarget > 0
          ? (deviation / comparableTarget) * 100
          : null,
      currentOrderShortageQty: shortage.error ? null : input.currentOrderShortageQty,
      shortageSkuCount:
        number(plan.missing_order_adjusted_count) === 0
          ? number(plan.known_shortage_sku_count)
          : null,
      affectedOrderCount: null,
      targetMissingSkuCount: input.localPlanTrial ? null : number(plan.missing_target_count),
    },
    rankings: { shortage: null, deviation: null, complete: false },
    categoryStructure: null,
    aging: { days91PlusQty: null, days91PlusPercent: null, days60To90Qty: null },
    replenishment: {
      recommendedQty: input.recommendedQty,
      missingCalculationCount: input.missingCalculationCount,
      urgentSkuCount: input.localPlanTrial ? null : number(plan.urgent_sku_count),
      transferPreparingQty: number(plan.known_preparing),
      transferInTransitQty: number(plan.known_in_transit),
      alreadyDeductedFromRecommendation: true,
    },
    sales: {
      last30DaysQty: number(plan.rolling_ship_positive),
      last30DaysDailyQty: number(plan.rolling_ship_daily),
    },
    coverage: {
      kind: complete ? '全范围可比' : '仅已核实可比子集，不能判断整体高低库存',
      totalSkuLocations: totalRows,
      comparableSkuLocations: comparable,
      comparableTargetQty: comparableTarget,
      missingOrderAdjustedCount: number(plan.missing_order_adjusted_count),
      inventorySnapshot: source('branch-stock').snapshotDate ?? null,
      planSnapshot: source('replenishment').snapshotDate ?? null,
      orderSnapshot: shortage.snapshotDate ?? null,
      planVersion: source('replenishment').inventoryVersion ?? null,
      planSource: input.localPlanTrial
        ? '人工导入试算；目标口径未进入全量摘要'
        : '分仓同步表及近30日发货依据',
      cycleDays: input.cycleDays,
      missingFields: missing,
      failures: Object.entries(parts)
        .filter(([, value]) => record(value).error)
        .map(([name, value]) => ({ source: name, message: record(value).error })),
    },
    definitions: {
      inventoryDeviation:
        '订单扣减后可供库存减目标库存；仅在相同可比子集计算偏差率。可用库存不含在途。',
      unknown: 'null为缺失，已知可加和量按已知部分汇总并保留缺失计数；不把未知事实当0。',
      ranking: '当前没有全量分仓×品类排名或SKU交集证据，不使用列表当前页排名或解释错配原因。',
      aging: '分仓大日期阈值为91天及以上，不使用基地61天阈值，也不使用现有90天汇总冒充91天。',
    },
  };
}
