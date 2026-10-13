import { BRANCH_RULESET, calculateTargetInventory } from './rules.ts';

import { isDemoWarehouseId, type DemoWarehouseId, type WarehouseId } from './warehouse.ts';
export { isWarehouseId } from './warehouse.ts';
export type { WarehouseId, WarehouseOption } from './warehouse.ts';

export type InventoryBatch = {
  batchNo: string;
  quantity: number;
  availableQty?: number | null;
  ageDays: number;
  productionDate: string;
};

export type InventoryRow = {
  actualDailyOutboundQty?: number | null;
  batchSummary?: {
    ageBuckets?: [number, number, number, number];
    unknownAgeQty?: number;
    positiveQty: number;
    weightedAge: number;
    bigDateQty: number;
    stagnantQty: number;
    maxAgeDays: number;
    negativeBatchCount: number;
  };
  forecastDailyShipment?: number | null;
  forecastTurnoverDays?: number | null;
  cycleDays?: number | null;
  targetInventoryQty?: number | null;
  recommendedQty?: number | null;
  availableQty?: number | null;
  sku: string;
  productName: string;
  category: string;
  materialGroup: string;
  quantity: number;
  inTransitQty: number | null;
  /** ASN expected quantity, display only; not verified outstanding stock. */
  reportedInTransitQty?: number | null;
  orderedNotShippedQty: number | null;
  shippedNotReceivedQty: number | null;
  turnoverDays: number | null;
  batches: InventoryBatch[];
};

export type ReplenishmentRow = {
  transferReceivedQty?: number | null;
  transferPendingQty?: number | null;
  transferShippedQty?: number | null;
  openTransferQty?: number | null;
  actualDailyOutboundQty?: number | null;
  currentRemainingTransferQty?: number | null;
  shortageQty?: number | null;
  preparingRemainingQty?: number | null;
  orderAdjustedAvailableQty?: number | null;
  targetInventoryGapQty?: number | null;
  pendingOrderCount?: number;
  preparingQty?: number | null;
  currentMonthShippedQty?: number | null;
  transferredQty?: number | null;
  historicalTurnoverDays?: number | null;
  forecastTurnoverDays?: number | null;
  currentOutboundQty?: number | null;
  nextOutboundQty?: number | null;
  currentTransferQty?: number | null;
  nextTransferQty?: number | null;
  currentRemainingOutboundQty?: number | null;
  nextDailyOutboundQty?: number | null;
  expectedMonthEndInventoryQty?: number | null;
  safetyDays?: number;
  safetyStockGapQty?: number | null;
  currentAvailableQty?: number | null;
  planSourceLabel?: string;
  calculationMissing?: string[];
  forecastDailyShipment?: number | null;
  sku: string;
  productName: string;
  category: string;
  materialGroup: string;
  inventoryQty: number;
  availableQty: number;
  inTransitQty: number | null;
  /** ASN expected quantity, display only; not verified outstanding stock. */
  reportedInTransitQty?: number | null;
  monthlyDemand: number;
  plannedDailyShipment: number;
  cycleDays: number;
  cycleRuleLevel: 'sku' | 'material-group' | 'category' | 'warehouse' | 'default';
  targetInventoryQty: number;
  recommendedQty: number | null;
  actualQty: number | null;
  reason: string;
  urgent: boolean;
  dueDate: string;
  baseInventoryQty: number | null;
  baseCapacityQty: number | null;
};

export type OrderLine = {
  preparingAllocatedQty?: number | null;
  preparingQty?: number | null;
  sku: string;
  productName: string;
  orderedQty: number;
  allocatedQty: number;
  shippedQty: number | null;
  shortageQty: number;
};

export type CustomerOrder = {
  orderNo: string;
  customer: string;
  requestedDate: string;
  status: '正常' | '临期' | '缺口';
  lines: OrderLine[];
};

export type PlanRow = {
  currentTransferAvailable?: boolean;
  nextTransferAvailable?: boolean;
  currentAvailable?: boolean;
  nextAvailable?: boolean;
  category?: string;
  materialGroup?: string;
  currentSource?: string;
  nextSource?: string;
  month: string;
  sku: string;
  productName: string;
  currentOutboundQty: number;
  currentTransferQty: number;
  nextOutboundQty: number;
  nextTransferQty: number;
  currentDailyOutboundQty: number;
  nextDailyOutboundQty: number;
  source: 'BI' | 'human' | '历史估算';
  versionKind: 'month-start' | 'rolling';
  versionId: string;
  status: 'confirmed' | 'incomplete';
};

export type OperationsSummary = {
  inboundQty: number | null;
  outboundQty: number | null;
  storageFee: number | null;
  transportFee: number | null;
};

export type AssessmentMetricKey =
  | 'deliveryTimelinessRate'
  | 'coldChainComplianceRate'
  | 'accurateDeliveryRate'
  | 'warehouseTemperatureComplianceRate'
  | 'receiptConfirmationTimelinessRate'
  | 'freshnessRate';

export type AssessmentMetric = {
  key: AssessmentMetricKey;
  label: string;
  value: number | null;
};

export type ThroughputSummary = {
  branchShipQty: number | null;
  provinceShipQty: number | null;
};

export type GrowthSummary = {
  referenceShipmentQty: number;
  targetGrowthRate: number | null;
  historySamePeriodGrowthRate: number | null;
  recentThreeMonthGrowthRate: number | null;
  overallGrowthRate: number | null;
};

export type MonthlyBudget = {
  month: string;
  shippingCode: string;
  shippingName: string;
  budget: number | null;
  previousBudget: number | null;
  lastYearBudget: number | null;
  monthRate: number | null;
  yearRate: number | null;
  recentRate: number | null;
  growthFactor: number | null;
  recentRateCount: number;
  status: string;
};

export type BaseResource = {
  inTransitQty?: number | null;
  dailyProduction?: Array<{ date: string; quantity: number | null }>;
  productionTotal?: number | null;
  stockDate?: string;
  transitDate?: string;
  baseName: string;
  materialGroup: string;
  availableQty: number | null;
  capacityQty: number | null;
  leadTimeDays: number | null;
  status: '充足' | '关注' | '紧张';
};

export type OperationsObservation = {
  id: string;
  severity: '高' | '中' | '低';
  title: string;
  detail: string;
  suggestedAction: string;
};

export type BusinessExceptionMark = {
  sku: string;
  type: 'season-switch' | 'substitution' | 'new-product' | 'activity-large-order' | 'clearance';
  status: 'pending-confirmation' | 'needs-maintenance';
  detail: string;
  automaticPlanChange: false;
};

export type WarehouseMetrics = {
  forecastTurnoverDays?: number | null;
  inventoryQty: number | null;
  inTransitQty: number | null;
  orderedNotShippedQty: number | null;
  shippedNotReceivedQty: number | null;
  turnoverDays: number | null;
  previousTurnoverDays: number | null;
  targetTurnoverDays: number;
  averageAgeDays: number;
  bigDateQty: number;
  bigDateSkuCount: number;
  stagnantQty: number;
  stagnantSkuCount: number;
  orderQty: number | null;
  allocatedQty: number;
  shippedQty: number | null;
  fulfillmentRate: string;
  recommendedQty: number | null;
  replenishmentSkuCount: number | null;
  shortageQty: number;
  shortageSkuCount: number;
};

export type WarehouseSnapshot = {
  dataState?: 'empty';
  replenishmentDetail?: import('./replenishment-detail.ts').ReplenishmentDetail;
  monthlyBudgets?: MonthlyBudget[];
  businessPeriods?: { operationsMonth: string; productionStart: string; productionEnd: string };
  page?: import('./workbench-page.ts').WarehousePageInfo;
  planning?: import('./planning.ts').PlanningState & {
    calculationDate: string;
    formula: 'forecast-gap-v1' | 'forecast-calendar-v2' | 'order-net-gap-v3';
    missingCalculationSkus: string[];
  };
  dataQuality?: {
    inTransit: { status: 'unverified' | 'verified'; rawReportedQty: number | null; reason: string };
    warnings?: string[];
    sourceDates?: Record<string, string>;
    pendingOrders?: { status: 'legacy' | 'verified' | 'empty'; reason: string };
  };
  metricScopes?: { fulfillment: string; pendingOrders: string };
  warehouseId: WarehouseId;
  warehouseName: string;
  region: string;
  snapshotDate: string;
  snapshotTime: string;
  currentMonthLabel: string;
  nextMonthLabel: string;
  dataSource: string;
  version: string;
  previewStatus: 'preview' | 'formal';
  freshness: 'fresh' | 'stale';
  ruleTrace: {
    solidifiedVersion: string;
    businessVersion: string;
    sourcePriority: string;
    planVersion: string;
    planSource: 'BI' | 'human' | '历史估算' | '未提供';
  };
  inventory: InventoryRow[];
  replenishments: ReplenishmentRow[];
  orders: CustomerOrder[];
  plans: PlanRow[];
  baseResources: BaseResource[];
  baseResourceQuery?: { sku: string; dates: string[]; baseNames: string[] };
  operationsSummary: OperationsSummary;
  assessmentMetrics: AssessmentMetric[];
  throughput: ThroughputSummary;
  growth: GrowthSummary;
  operations: OperationsObservation[];
  businessExceptions: BusinessExceptionMark[];
  metrics: WarehouseMetrics;
};

export type SnapshotSummary = {
  warehouseName: string;
  recommendedTotal: number | null;
  actualTotal: number | null;
  exceptionCount: number;
  urgentCount: number;
  shortageSkuCount: number;
};

type WarehouseConfig = {
  name: string;
  region: string;
  factor: number;
  turnoverDelta: number;
  customers: string[];
  bases: string[];
};

const WAREHOUSE_CONFIG: Record<DemoWarehouseId, WarehouseConfig> = {
  changsha: {
    name: '长沙分仓',
    region: '华中',
    factor: 1,
    turnoverDelta: 0,
    customers: ['湖南餐饮事业部', '湘北经销中心', '长沙直营渠道'],
    bases: ['长沙生产基地', '岳阳协同基地'],
  },
  zhengzhou: {
    name: '郑州分仓',
    region: '中原',
    factor: 0.86,
    turnoverDelta: -1.7,
    customers: ['河南省区客户', '郑州重点商超', '豫北经销中心'],
    bases: ['郑州生产基地', '新乡协同基地'],
  },
  'east-china': {
    name: '华东分仓',
    region: '华东',
    factor: 1.23,
    turnoverDelta: 2.2,
    customers: ['上海城市客户', '苏南渠道中心', '浙江餐饮事业部'],
    bases: ['苏州生产基地', '嘉兴协同基地'],
  },
};

const PRODUCTS = [
  { sku: 'SKU-1001', name: '经典牛肉酱 220g', category: '复合调味', group: '酱料' },
  { sku: 'SKU-1002', name: '香辣蘸料 120g', category: '蘸料', group: '粉料' },
  { sku: 'SKU-1003', name: '骨汤火锅底料 500g', category: '火锅底料', group: '底料' },
  { sku: 'SKU-1004', name: '番茄火锅底料 200g', category: '火锅底料', group: '底料' },
  { sku: 'SKU-1005', name: '麻辣小龙虾调料 180g', category: '季节调味', group: '酱料' },
  { sku: 'SKU-1006', name: '酸菜鱼调料 300g', category: '菜式调料', group: '腌料' },
  { sku: 'SKU-1007', name: '鲜香鸡精 400g', category: '基础调味', group: '粉料' },
  { sku: 'SKU-1008', name: '金汤酸菜酱 1kg', category: '餐饮定制', group: '酱料' },
];

function scale(value: number, factor: number, index = 0): number {
  return Math.round(value * factor + index * 3);
}

function zonedParts(now: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
  };
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function addDays(date: string, days: number): string {
  const next = new Date(`${date}T00:00:00+08:00`);
  next.setUTCDate(next.getUTCDate() + days);
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(next);
}

function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const value = year * 12 + (month - 1) + delta;
  return { year: Math.floor(value / 12), month: (value % 12) + 1 };
}

function monthDayCount(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function formatRatio(numerator: number, denominator: number): string {
  if (denominator === 0) return '—';
  return `${((numerator / denominator) * 100).toFixed(2)}%`;
}

export function buildWarehouseSnapshot(
  warehouseId: WarehouseId,
  now = new Date(),
): WarehouseSnapshot {
  if (!isDemoWarehouseId(warehouseId))
    throw new Error('数据库分仓没有演示数据，请加载真实 PG 快照');
  const config = WAREHOUSE_CONFIG[warehouseId];
  const parts = zonedParts(now);
  const snapshotDate = isoDate(parts.year, parts.month, parts.day);
  const nextMonth = addMonths(parts.year, parts.month, 1);
  const inventory = PRODUCTS.map((product, index): InventoryRow => {
    const quantity = scale([710, 430, 820, 665, 390, 515, 760, 710][index], config.factor, index);
    const ages = [18, 34, 46, 67, 93, 111, 29, 78];
    const age = Math.max(5, ages[index] + Math.round(config.turnoverDelta * 2));
    const older = Math.round(quantity * (age >= 90 ? 0.72 : age >= 60 ? 0.36 : 0.12));
    const inTransitQty = scale(
      [320, 240, 460, 380, 520, 330, 410, 340][index],
      config.factor,
      index,
    );
    const orderedNotShippedQty = Math.round(inTransitQty * 0.58);
    return {
      sku: product.sku,
      productName: product.name,
      category: product.category,
      materialGroup: product.group,
      quantity,
      inTransitQty,
      orderedNotShippedQty,
      shippedNotReceivedQty: inTransitQty - orderedNotShippedQty,
      turnoverDays: Number((8.5 + index * 0.9 + config.turnoverDelta).toFixed(1)),
      batches: [
        {
          batchNo: `${warehouseId.slice(0, 2).toUpperCase()}-${parts.year}${String(parts.month).padStart(2, '0')}-${index + 1}A`,
          quantity: quantity - older,
          ageDays: Math.max(3, age - 28),
          productionDate: addDays(snapshotDate, -Math.max(3, age - 28)),
        },
        {
          batchNo: `${warehouseId.slice(0, 2).toUpperCase()}-${parts.year}${String(parts.month).padStart(2, '0')}-${index + 1}B`,
          quantity: older,
          ageDays: age,
          productionDate: addDays(snapshotDate, -age),
        },
      ],
    };
  });

  const replenishments = PRODUCTS.map((product, index): ReplenishmentRow => {
    const inventoryRow = inventory[index];
    const demand = scale([980, 720, 1280, 1050, 860, 940, 760, 1190][index], config.factor, index);
    const recommended = scale(
      [480, 260, 610, 420, 390, 305, 145, 243][index],
      config.factor,
      index,
    );
    const plannedDailyShipment = Math.round(demand / 30);
    const cycleDays = [7, 10, 7, 14, 7, 10, 14, 7][index];
    return {
      sku: product.sku,
      productName: product.name,
      category: product.category,
      materialGroup: product.group,
      inventoryQty: inventoryRow.quantity,
      availableQty: Math.max(
        0,
        inventoryRow.quantity - scale([130, 96, 205, 160, 88, 110, 124, 190][index], config.factor),
      ),
      inTransitQty: inventoryRow.inTransitQty,
      monthlyDemand: demand,
      plannedDailyShipment,
      cycleDays,
      cycleRuleLevel:
        index === 1 ? 'material-group' : index === 3 || index === 6 ? 'category' : 'sku',
      targetInventoryQty: calculateTargetInventory(plannedDailyShipment, cycleDays),
      recommendedQty: recommended,
      actualQty: recommended,
      reason: '',
      urgent: index === 1 || index === 4 || (warehouseId === 'east-china' && index === 7),
      dueDate: addDays(snapshotDate, [2, 1, 4, 6, 2, 5, 8, 3][index]),
      baseInventoryQty: scale([520, 310, 440, 690, 225, 570, 615, 380][index], config.factor),
      baseCapacityQty: scale([1100, 900, 1550, 1260, 980, 1150, 1040, 1370][index], config.factor),
    };
  });

  const orders = config.customers.map((customer, orderIndex): CustomerOrder => {
    const lines = PRODUCTS.slice(orderIndex * 2, orderIndex * 2 + 3).map(
      (product, lineIndex): OrderLine => {
        const orderedQty = scale(520 + orderIndex * 170 + lineIndex * 95, config.factor, lineIndex);
        const shortageQty =
          orderIndex === 1 || lineIndex === 2
            ? scale(26 + orderIndex * 18 + lineIndex * 9, config.factor)
            : 0;
        const allocatedQty = orderedQty - shortageQty;
        return {
          sku: product.sku,
          productName: product.name,
          orderedQty,
          allocatedQty,
          preparingQty: orderedQty,
          preparingAllocatedQty: allocatedQty,
          shippedQty: allocatedQty,
          shortageQty,
        };
      },
    );
    const shortage = lines.reduce((sum, line) => sum + line.shortageQty, 0);
    return {
      orderNo: `${warehouseId === 'changsha' ? 'CS' : warehouseId === 'zhengzhou' ? 'ZZ' : 'HD'}-${parts.year}${String(parts.month).padStart(2, '0')}-${String(orderIndex + 1).padStart(3, '0')}`,
      customer,
      requestedDate: addDays(snapshotDate, orderIndex + 1),
      status: shortage > 50 ? '缺口' : shortage > 0 ? '临期' : '正常',
      lines,
    };
  });

  const planVersion = `month-start-${parts.year}${String(parts.month).padStart(2, '0')}-bi-v1`;
  // The selected version must cover the same SKU universe as replenishment.
  // Otherwise a nominally "whole" human version can silently retain BI values
  // for replenishment rows that were absent from the plan template.
  const plans = PRODUCTS.map((product, index): PlanRow => {
    const currentOutboundQty = scale(900 + index * 115, config.factor, index);
    return {
      month: `${parts.year}-${String(parts.month).padStart(2, '0')}`,
      sku: product.sku,
      productName: product.name,
      currentOutboundQty,
      currentTransferQty: scale(90 + index * 12, config.factor, index),
      nextOutboundQty: scale(960 + index * 120, config.factor, index),
      nextTransferQty: scale(84 + index * 10, config.factor, index),
      currentDailyOutboundQty: Number(
        (currentOutboundQty / monthDayCount(parts.year, parts.month)).toFixed(2),
      ),
      nextDailyOutboundQty: Number(
        (
          scale(960 + index * 120, config.factor, index) /
          monthDayCount(nextMonth.year, nextMonth.month)
        ).toFixed(2),
      ),
      source: 'BI',
      versionKind: 'month-start',
      versionId: planVersion,
      status: 'confirmed',
    };
  });

  const baseResources = config.bases.map((baseName, index): BaseResource => ({
    baseName,
    materialGroup: index === 0 ? '酱料 / 底料' : '粉料 / 腌料',
    availableQty: scale(index === 0 ? 4180 : 2360, config.factor),
    capacityQty: scale(index === 0 ? 7200 : 3900, config.factor),
    leadTimeDays: index === 0 ? 3 : 6,
    status: index === 0 ? '充足' : warehouseId === 'east-china' ? '紧张' : '关注',
  }));

  const operations: OperationsObservation[] = [
    {
      id: `${warehouseId}-op-1`,
      severity: '高',
      title: '紧急补货 SKU 待确认',
      detail: `${replenishments.filter((row) => row.urgent).length} 个 SKU 的可用库存低于近期需求覆盖线。`,
      suggestedAction: '核对基地库存与实际补货量后创建业务待办。',
    },
    {
      id: `${warehouseId}-op-2`,
      severity: '中',
      title: '库龄结构需关注',
      detail: `存在 ${inventory.filter((row) => row.batches.some((batch) => batch.ageDays >= 60)).length} 个大日期 SKU。`,
      suggestedAction: '优先匹配近期订单并复核批次出库策略。',
    },
    {
      id: `${warehouseId}-op-3`,
      severity: '低',
      title: '计划差异已更新',
      detail: `${parts.year}年${parts.month}月计划与确认量已完成本地比对。`,
      suggestedAction: '在分仓计划页签检查负向偏差。',
    },
  ];
  const operationsSummary: OperationsSummary = {
    inboundQty: scale(6320, config.factor),
    outboundQty: scale(5980, config.factor),
    storageFee: scale(8600, config.factor),
    transportFee: scale(32600, config.factor),
  };
  const assessmentMetrics: AssessmentMetric[] = [
    { key: 'deliveryTimelinessRate', label: '交付及时率', value: 0.982 },
    { key: 'coldChainComplianceRate', label: '冷链符合率', value: 0.997 },
    { key: 'accurateDeliveryRate', label: '准确交付率', value: 0.991 },
    { key: 'warehouseTemperatureComplianceRate', label: '库温符合率', value: 0.995 },
    { key: 'receiptConfirmationTimelinessRate', label: '回单确认及时率', value: 0.976 },
    { key: 'freshnessRate', label: '新鲜度占比', value: 0.968 },
  ];
  const throughput: ThroughputSummary = {
    branchShipQty: scale(13800, config.factor),
    provinceShipQty: scale(21500, config.factor),
  };
  const growth: GrowthSummary = {
    referenceShipmentQty: plans.reduce((sum, row) => sum + row.currentOutboundQty, 0),
    targetGrowthRate: null,
    historySamePeriodGrowthRate: 0.08,
    recentThreeMonthGrowthRate: 0.06,
    overallGrowthRate: 0.044,
  };
  const businessExceptions: BusinessExceptionMark[] = [
    {
      sku: 'SKU-1005',
      type: 'season-switch',
      status: 'pending-confirmation',
      detail: '换季影响尚未人工确认，不改变计划或目标。',
      automaticPlanChange: false,
    },
    {
      sku: 'SKU-1006',
      type: 'substitution',
      status: 'needs-maintenance',
      detail: '替代关系缺失，不自动冲抵，需维护后人工确认。',
      automaticPlanChange: false,
    },
    {
      sku: 'SKU-1008',
      type: 'new-product',
      status: 'pending-confirmation',
      detail: '新品仅标记，不自动生成计划。',
      automaticPlanChange: false,
    },
  ];

  const inventoryQty = inventory.reduce((sum, row) => sum + row.quantity, 0);
  const inTransitQty = sumKnownQuantities(inventory.map((row) => row.inTransitQty));
  const orderedNotShippedQty = sumKnownQuantities(inventory.map((row) => row.orderedNotShippedQty));
  const shippedNotReceivedQty = sumKnownQuantities(
    inventory.map((row) => row.shippedNotReceivedQty),
  );
  const weightedAge = inventory.reduce(
    (sum, row) =>
      sum + row.batches.reduce((batchSum, batch) => batchSum + batch.quantity * batch.ageDays, 0),
    0,
  );
  const allBatches = inventory.flatMap((row) =>
    row.batches.map((batch) => ({ ...batch, sku: row.sku })),
  );
  const bigDate = allBatches.filter((batch) => batch.ageDays >= 60);
  const stagnant = allBatches.filter((batch) => batch.ageDays >= 90);
  const orderLines = orders.flatMap((order) => order.lines);
  const orderQty = orderLines.reduce((sum, row) => sum + row.orderedQty, 0);
  const allocatedQty = orderLines.reduce((sum, row) => sum + row.allocatedQty, 0);
  const shippedQty = orderLines.reduce((sum, row) => sum + (row.shippedQty ?? 0), 0);
  const shortageLines = orderLines.filter((row) => row.shortageQty > 0);

  return {
    warehouseId,
    warehouseName: config.name,
    region: config.region,
    snapshotDate,
    snapshotTime: `${snapshotDate} ${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')} CST`,
    currentMonthLabel: `${parts.year}年${parts.month}月`,
    nextMonthLabel: `${nextMonth.year}年${nextMonth.month}月`,
    dataSource: '分仓库存标准结果适配器（演示快照）',
    version: `branch-inventory-${snapshotDate}-v1`,
    previewStatus: 'preview',
    freshness: 'fresh',
    ruleTrace: {
      solidifiedVersion: BRANCH_RULESET.solidifiedVersion,
      businessVersion: BRANCH_RULESET.businessVersion,
      sourcePriority: '标准结果 > 已确认人工版本 > 可见降级',
      planVersion,
      planSource: 'BI',
    },
    inventory,
    replenishments,
    orders,
    plans,
    baseResources,
    operationsSummary,
    assessmentMetrics,
    throughput,
    growth,
    operations,
    businessExceptions,
    metrics: {
      inventoryQty,
      inTransitQty,
      orderedNotShippedQty,
      shippedNotReceivedQty,
      turnoverDays: Number(
        (
          inventory.reduce((sum, row) => sum + (row.turnoverDays ?? 0), 0) / inventory.length
        ).toFixed(2),
      ),
      previousTurnoverDays: Number((11.46 + config.turnoverDelta).toFixed(2)),
      targetTurnoverDays: 11,
      averageAgeDays: Number((weightedAge / inventoryQty).toFixed(1)),
      bigDateQty: bigDate.reduce((sum, batch) => sum + batch.quantity, 0),
      bigDateSkuCount: new Set(bigDate.map((batch) => batch.sku)).size,
      stagnantQty: stagnant.reduce((sum, batch) => sum + batch.quantity, 0),
      stagnantSkuCount: new Set(stagnant.map((batch) => batch.sku)).size,
      orderQty,
      allocatedQty,
      shippedQty,
      fulfillmentRate: formatRatio(shippedQty, orderQty),
      recommendedQty: sumKnownQuantities(replenishments.map((row) => row.recommendedQty)),
      replenishmentSkuCount: replenishments.length,
      shortageQty: shortageLines.reduce((sum, row) => sum + row.shortageQty, 0),
      shortageSkuCount: shortageLines.length,
    },
  };
}

function isPopulatedWarehouseSnapshot(
  candidate: unknown,
  warehouseId: WarehouseId,
): candidate is WarehouseSnapshot {
  if (!candidate || typeof candidate !== 'object') return false;

  const snapshot = candidate as Partial<WarehouseSnapshot>;
  // Inventory-only branches remain real snapshots; an empty plan is a missing
  // business input, not a transport failure. Never relax inventory or identity.
  const requiredCollections = [snapshot.inventory];
  const optionalCollections = [
    snapshot.replenishments,
    snapshot.plans,
    snapshot.orders,
    snapshot.baseResources,
    snapshot.operations,
    snapshot.businessExceptions,
    snapshot.assessmentMetrics,
  ];

  return (
    snapshot.warehouseId === warehouseId &&
    typeof snapshot.warehouseName === 'string' &&
    typeof snapshot.snapshotDate === 'string' &&
    typeof snapshot.snapshotTime === 'string' &&
    typeof snapshot.dataSource === 'string' &&
    typeof snapshot.version === 'string' &&
    requiredCollections.every(
      (collection) =>
        Array.isArray(collection) &&
        (collection.length > 0 ||
          Boolean(
            snapshot.page &&
            Number.isSafeInteger(snapshot.page.pageNumber) &&
            snapshot.page.pageNumber > 0 &&
            Number.isSafeInteger(snapshot.page.totalCount) &&
            snapshot.page.totalCount >= 0 &&
            snapshot.page.overview?.counts.inventory > 0 &&
            Number.isSafeInteger(snapshot.page.overview?.counts.replenishments) &&
            snapshot.page.overview.counts.replenishments >= 0 &&
            Number.isSafeInteger(snapshot.page.overview?.counts.plans) &&
            snapshot.page.overview.counts.plans >= 0,
          )),
    ) &&
    optionalCollections.every((collection) => Array.isArray(collection)) &&
    Boolean(snapshot.operationsSummary && typeof snapshot.operationsSummary === 'object') &&
    Boolean(snapshot.throughput && typeof snapshot.throughput === 'object') &&
    Boolean(snapshot.growth && typeof snapshot.growth === 'object') &&
    Boolean(snapshot.metrics && typeof snapshot.metrics === 'object') &&
    Boolean(snapshot.ruleTrace && typeof snapshot.ruleTrace === 'object')
  );
}

/**
 * Keep the workspace useful while platform data is not connected yet. A complete
 * restored snapshot wins; absent, mismatched, or empty data falls back to the
 * deterministic demo snapshot for the currently selected warehouse.
 */
export function resolveWarehouseSnapshot(
  warehouseId: WarehouseId,
  candidate: unknown,
): WarehouseSnapshot {
  return isPopulatedWarehouseSnapshot(candidate, warehouseId)
    ? candidate
    : isDemoWarehouseId(warehouseId)
      ? buildWarehouseSnapshot(warehouseId)
      : emptyWarehouseSnapshot(warehouseId);
}

/** Non-business placeholder for hooks while a PG-only branch loads; never mock. */
export function emptyWarehouseSnapshot(warehouseId: WarehouseId): WarehouseSnapshot {
  return {
    warehouseId,
    warehouseName: '当前分仓',
    region: '—',
    snapshotDate: '',
    snapshotTime: '',
    currentMonthLabel: '',
    nextMonthLabel: '',
    dataSource: '等待 PG 快照',
    version: 'loading',
    previewStatus: 'preview',
    freshness: 'stale',
    ruleTrace: {
      solidifiedVersion: '',
      businessVersion: '',
      sourcePriority: '',
      planVersion: '',
      planSource: 'BI',
    },
    inventory: [],
    replenishments: [],
    orders: [],
    plans: [],
    baseResources: [],
    assessmentMetrics: [],
    operations: [],
    businessExceptions: [],
    operationsSummary: { inboundQty: 0, outboundQty: 0, storageFee: 0, transportFee: 0 },
    throughput: { branchShipQty: 0, provinceShipQty: 0 },
    growth: {
      referenceShipmentQty: 0,
      targetGrowthRate: null,
      historySamePeriodGrowthRate: null,
      recentThreeMonthGrowthRate: null,
      overallGrowthRate: null,
    },
    metrics: {
      inventoryQty: 0,
      inTransitQty: 0,
      orderedNotShippedQty: 0,
      shippedNotReceivedQty: 0,
      turnoverDays: 0,
      previousTurnoverDays: 0,
      targetTurnoverDays: 0,
      averageAgeDays: 0,
      bigDateQty: 0,
      bigDateSkuCount: 0,
      stagnantQty: 0,
      stagnantSkuCount: 0,
      orderQty: 0,
      allocatedQty: 0,
      shippedQty: 0,
      fulfillmentRate: '—',
      recommendedQty: 0,
      replenishmentSkuCount: 0,
      shortageQty: 0,
      shortageSkuCount: 0,
    },
  };
}

export function hasLiveWarehouseSource(
  snapshot: Pick<WarehouseSnapshot, 'dataSource' | 'version'>,
): boolean {
  const liveSources = [
    'PostgreSQL data_service 分仓库存标准表',
    'GEA SQL data_service 分仓库存标准表',
  ];
  return liveSources.includes(snapshot.dataSource) && snapshot.version.startsWith('pg-');
}

/** 直连 PG 与 GEA SQL 共用真实快照契约；查询失败不得回退为演示数据。 */
export function requireLiveWarehouseSnapshot(
  warehouseId: WarehouseId,
  candidate: unknown,
): WarehouseSnapshot {
  if (!isPopulatedWarehouseSnapshot(candidate, warehouseId)) {
    throw new Error('未收到当前分仓的有效业务快照，请检查数据完整性后重试。');
  }
  if (!hasLiveWarehouseSource(candidate)) {
    throw new Error('接口未返回真实业务数据，请从平台重新进入并检查数据来源。');
  }
  return candidate;
}

export function summarizeSnapshot(snapshot: WarehouseSnapshot): SnapshotSummary {
  if (snapshot.page) return snapshot.page.overview.summary;
  const recommendedTotal = snapshot.replenishments.length
    ? sumKnownQuantities(snapshot.replenishments.map((row) => row.recommendedQty))
    : null;
  const actualTotal = snapshot.replenishments.length
    ? sumKnownQuantities(snapshot.replenishments.map((row) => row.actualQty))
    : null;
  return {
    warehouseName: snapshot.warehouseName,
    recommendedTotal,
    actualTotal,
    exceptionCount: snapshot.replenishments.filter((row) => row.actualQty !== row.recommendedQty)
      .length,
    urgentCount: snapshot.replenishments.filter((row) => row.urgent).length,
    shortageSkuCount: snapshot.orders
      .flatMap((order) => order.lines)
      .filter((line) => line.shortageQty > 0).length,
  };
}

/** Unknown quantities must remain unknown, never implicitly become zero. */
export function sumKnownQuantities(values: Array<number | null>): number | null {
  return values.every((value) => value !== null && Number.isFinite(value))
    ? (values as number[]).reduce((sum, value) => sum + value, 0)
    : null;
}

export function replenishmentIsReady(snapshot: WarehouseSnapshot): boolean {
  if (snapshot.page) return snapshot.page.overview.replenishmentReady;
  if (
    snapshot.planning?.formula === 'forecast-gap-v1' ||
    snapshot.planning?.formula === 'forecast-calendar-v2' ||
    snapshot.planning?.formula === 'order-net-gap-v3'
  )
    return (
      snapshot.replenishments.length > 0 &&
      snapshot.replenishments.every(
        (row) => row.recommendedQty !== null && Number.isFinite(row.recommendedQty),
      )
    );
  return (
    snapshot.dataQuality?.inTransit.status !== 'unverified' &&
    snapshot.replenishments.length > 0 &&
    snapshot.replenishments.every(
      (row) =>
        row.inTransitQty !== null &&
        Number.isFinite(row.inTransitQty) &&
        row.recommendedQty !== null &&
        Number.isFinite(row.recommendedQty),
    )
  );
}

export const WAREHOUSE_OPTIONS = (Object.keys(WAREHOUSE_CONFIG) as DemoWarehouseId[]).map((id) => ({
  id,
  name: WAREHOUSE_CONFIG[id].name,
}));
