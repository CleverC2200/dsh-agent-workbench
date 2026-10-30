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
      targetInventoryQty: complete ? target : null,
      orderAdjustedAvailableQty: input.localPlanTrial
        ? null
        : number(plan.order_adjusted_available_qty),
      inventoryDeviationQty: complete ? deviation : null,
      inventoryDeviationPercent:
        complete && deviation !== null && comparableTarget !== null && comparableTarget > 0
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
    comparison: {
      scope: complete ? '全范围可比' : '仅同一SKU与分仓交集，不能代表全仓',
      skuLocations: comparable,
      orderAdjustedAvailableQty:
        deviation !== null && comparableTarget !== null ? comparableTarget + deviation : null,
      targetInventoryQty: comparableTarget,
      inventoryDeviationQty: deviation,
      inventoryDeviationPercent:
        deviation !== null && comparableTarget !== null && comparableTarget > 0
          ? (deviation / comparableTarget) * 100
          : null,
    },
    skuIntersections: { missingTargetAndCalculation: null },
    decisionEvidence: {
      slowSalesAndAgingConfirmed: false,
      recommendationAllocatedToUrgentSkus: false,
      allowedActions: ['核对缺失目标的口径', '补齐补货计算要素', '核对紧急SKU的备单与调拨情况'],
    },
    operations: {
      monthlyInbound: {
        value: null,
        status: 'not_queried',
        reason:
          '本页摘要未读取运营观察；仅使用本轮operations上下文或固定运营查询返回的入库量，不从截图或历史回答填入。',
      },
      throughput: {
        value: null,
        status: 'not_queried',
        reason: '仅在运营观察来源读取成功后解释；禁止引用历史对话或截图数值作为当前结果。',
      },
    },
    rankings: { shortage: null, deviation: null, complete: false },
    categoryStructure: null,
    aging: {
      days91PlusQty: null,
      days91PlusPercent: null,
      days60To90Qty: null,
    },
    replenishment: {
      recommendedQty: input.recommendedQty,
      missingCalculationCount: input.missingCalculationCount,
      urgentSkuCount: input.localPlanTrial ? null : number(plan.urgent_sku_count),
      transferPreparingQty: number(plan.known_preparing),
      transferInTransitQty: number(plan.known_in_transit),
      alreadyDeductedFromRecommendation: true,
    },
    baseSupply: {
      direction: '分仓向基地补货；货物由基地发往收货分仓',
      monthlyDemandQty: number(summary('branch-supply').demand),
      monthlyShippedQty: number(summary('branch-supply').shipped),
      monthlyFulfillmentRate: number(summary('branch-supply').fulfillment_rate),
      currentDemandQty: number(summary('branch-supply-current').demand),
      pendingQty: number(summary('branch-supply-current').pending),
      inTransitQty: number(summary('branch-supply-current').in_transit),
      coverage: '执行侧；不含尚未生成执行单的补货申请。当前池跨月保留未发或未收完成行。',
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
        .map(([name, value]) => ({
          source: name,
          message: record(value).error,
        })),
    },
    definitions: {
      inventoryDeviation:
        '高低库存判断只比较comparison中的同一SKU交集：订单扣减后可供库存=该交集目标+差额。totals.currentAvailableQty是全仓可用库存，不能与子集目标、差额或偏差率配对比较。可用库存不含在途。',
      unknown: 'null为缺失，已知可加和量按已知部分汇总并保留缺失计数；不把未知事实当0。',
      ranking: '当前没有全量分仓×品类排名或SKU交集证据，不使用列表当前页排名或解释错配原因。',
      intersections:
        '缺目标个数和缺计算要素个数均为独立计数，没有SKU交集，不能断言集中在相同SKU、相同批次或同一原因，也不能用两计数接近推断重叠。',
      actions:
        '没有动销偏慢且货龄偏长的同范围证据，不建议停补或去化。建议补货是可计算SKU合计，没有分配到紧急SKU的明细，不把合计建议量分配给紧急SKU。缺少这些证据时只建议核对口径、计算要素、备单和调拨情况。',
      aging: '分仓大日期阈值为91天及以上，不使用基地61天阈值，也不使用现有90天汇总冒充91天。',
    },
  };
}
