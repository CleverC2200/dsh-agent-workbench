import {
  numeric,
  type InventoryRiskEvidence,
} from '../../../../../../aqkc/web/src/lib/inventory-insight.ts';
import {
  normalizeCurrentOrderBases,
  type CurrentOrderBase,
} from '../../../../../../aqkc/web/src/lib/workbench-current-order.ts';
export interface WorkspaceKpi {
  label: string;
  value: string;
  delta: string;
  tone: 'positive' | 'neutral' | 'negative';
}

export interface WorkspaceVersionSummary {
  currentVersion: string;
  targetMonth: string;
  planScope: string;
  usage: string;
  status: string;
}

export interface WorkspaceRecord {
  id: string;
  base: string;
  baseCode?: string;
  sku: string;
  skuName?: string;
  month: string;
  version: string;
  cycleStock: number;
  safetyStock: number;
  targetStock: number;
  confirmedTargetStock: number;
  currentInventory: number;
  availableInventory?: number;
  turnoverDays: number;
  replenishmentCycle: number;
  dailyDemand: number;
  monthlyDemand?: number;
  transferPlan?: number;
  managementTurnoverDays: number;
  managementTargetStock: number;
  productLabel: string;
  productTag?: string;
  avgSales: number;
  stdDev: number;
  zValue?: number;
  targetFillRate: string;
  serviceLevel: string;
  status: string;
  confirmedBy: string;
  confirmedAt: string;
  lockedBy: string;
  lockedAt: string;
  remark: string;
  riskLevel: 'healthy' | 'warning' | 'critical' | 'unknown';
  gapToConfirmedTarget: number;
  deviationRate?: string;
  ltConfigured?: boolean;
  abnormalTransfer?: boolean;
}

export interface WorkspaceComparisonVersion {
  version: string;
  value: number;
  status: string;
}

export interface WorkspaceComparison {
  versions: WorkspaceComparisonVersion[];
  delta: number;
}

export interface WorkspaceTable {
  columns: { key: string; label: string }[];
  rows: Record<string, string | number>[];
  pagination?: WorkspaceTablePagination;
}

export interface WorkspaceTablePagination {
  offset: number;
  pageSize: number;
  hasNext: boolean;
  total?: number;
}

export interface WorkspaceAction {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
}

export interface WorkspaceSurfaceBlock {
  type: string;
  [key: string]: unknown;
}

export type WorkspacePresentation =
  | 'chart'
  | 'bar'
  | 'pie'
  | 'table'
  | 'fixed_workbench'
  | 'fixed_workbench_no_data';

export interface FixedSafetyStockWorkbench {
  status: 'ready' | 'no_data';
  statusDescription: string;
  overallAnalysis: string;
  noData?: {
    targetMonth: string;
    inventoryVersion: string;
    base: string;
    filter: string;
  };
  cards?: FixedWorkbenchCard[];
  currentOrders?: CurrentOrderBase[];
  inventoryInsight?: InventoryRiskEvidence;
}

export interface FixedWorkbenchCard {
  title: string;
  coverage?: string;
  value: string;
  helpers: { label: string; value: string }[];
  tone: 'neutral' | 'red';
}

export interface TargetStockReportMetricRow {
  label: string;
  base?: string;
  productLabel?: string;
  recordCount: number;
  currentInventory: number;
  targetInventory: number;
  finalTargetInventory: number;
  gap: number;
  gapRate: number | null;
  currentTurnoverDays: number;
  finalTargetTurnoverDays: number;
  turnoverGapDays: number;
  turnoverAvailable: boolean;
}

export type TargetStockReportDimension =
  | 'base'
  | 'product_category'
  | 'product_label_abc_rus'
  | 'base_product_category'
  | 'base_product_label';

export interface TargetStockAnalysisReport {
  kind: 'target_stock_analysis_report';
  title: string;
  scope: {
    label: string;
    targetMonth: string;
    inventoryVersion: string;
    planVersion: string;
    refreshDate: string;
    selectionRule: string;
  };
  overview: Omit<TargetStockReportMetricRow, 'label' | 'base' | 'productLabel'>;
  enabledDimensions: TargetStockReportDimension[];
  baseRows: TargetStockReportMetricRow[];
  category: { available: boolean; notice: string };
  categoryRows: TargetStockReportMetricRow[];
  productLabelRows: TargetStockReportMetricRow[];
  baseCategoryMatrix: { available: boolean; notice: string };
  baseCategoryRows: TargetStockReportMetricRow[];
  baseProductLabelRows: TargetStockReportMetricRow[];
  ageRisk: {
    available: boolean;
    notice: string;
    rows: TargetStockReportAgeRow[];
  };
  orderFulfillment: {
    available: boolean;
    notice: string;
    rows: TargetStockReportOrderRow[];
  };
  sectionSummaries: {
    overview: string;
    base: string;
    category: string;
    label: string;
    baseCategory: string;
    baseLabel: string;
    ageRisk: string;
    orderFulfillment: string;
  };
  analysisPoints: {
    base: TargetStockReportAnalysisPoint[];
    category: TargetStockReportAnalysisPoint[];
    label: TargetStockReportAnalysisPoint[];
    baseCategory: TargetStockReportAnalysisPoint[];
    baseLabel: TargetStockReportAnalysisPoint[];
  };
  dataQualityNotes: string[];
  eventContext: { available: boolean; notice: string };
  findings: {
    tone: 'red' | 'green' | 'gray';
    title: string;
    description: string;
  }[];
  actionCandidates: {
    type: string;
    scope: string;
    reason: string;
    boundary: string;
  }[];
}

export interface TargetStockReportAnalysisPoint {
  tone: 'red' | 'green' | 'gray';
  title: string;
  description: string;
}

export interface TargetStockReportAgeRow {
  base: string;
  avgAgeDays: number;
  maxAgeDays: number;
  overAgeSkuCount: number;
  overAgeInventory: number;
}

export interface TargetStockReportOrderRow {
  base: string;
  fulfillmentRate: number;
  monthOverMonthChange: number | null;
  yearOverYearChange: number | null;
  orderQuantity: number;
  shortageQuantity: number;
  shippedQuantity: number;
}

export interface WorkspaceState {
  title: string;
  description: string;
  assistantBrief?: string;
  chartType: 'bar' | 'pie';
  metric: string;
  groupBy: string;
  viewMode: 'detail' | 'comparison' | 'distribution';
  filters: Record<string, string>;
  kpis: WorkspaceKpi[];
  chartData: { label: string; value: number }[];
  insights: string[];
  versionSummary: WorkspaceVersionSummary;
  record: WorkspaceRecord;
  comparison: WorkspaceComparison | null;
  table: WorkspaceTable;
  actions: WorkspaceAction[];
  lastAction: string;
  surface: WorkspaceSurfaceBlock[];
  analysisReport?: TargetStockAnalysisReport | null;
  presentation: WorkspacePresentation;
  workbench?: FixedSafetyStockWorkbench | null;
}

type WorkspaceLike = Partial<WorkspaceState> & Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isWorkspaceLike(value: Record<string, unknown>): value is WorkspaceLike {
  return (
    'title' in value ||
    'description' in value ||
    'assistantBrief' in value ||
    'metric' in value ||
    'groupBy' in value ||
    'viewMode' in value ||
    'filters' in value ||
    'kpis' in value ||
    'chartData' in value ||
    'insights' in value ||
    'chartType' in value ||
    'versionSummary' in value ||
    'record' in value ||
    'comparison' in value ||
    'table' in value ||
    'actions' in value ||
    'lastAction' in value ||
    'surface' in value ||
    'analysisReport' in value ||
    'presentation' in value ||
    'workbench' in value
  );
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asChartType(value: unknown): 'bar' | 'pie' {
  return value === 'pie' ? 'pie' : 'bar';
}

function asViewMode(value: unknown): 'detail' | 'comparison' | 'distribution' {
  if (value === 'comparison' || value === 'distribution') {
    return value;
  }
  return 'detail';
}

function normalizeFilters(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      typeof item === 'string' ? item : String(item ?? ''),
    ]),
  );
}

function normalizeKpis(value: unknown): WorkspaceKpi[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord).map((item) => ({
    label: asString(item.label),
    value: asString(item.value),
    delta: asString(item.delta),
    tone:
      item.tone === 'negative' || item.tone === 'neutral' || item.tone === 'positive'
        ? item.tone
        : 'neutral',
  }));
}

function normalizeChartData(value: unknown): { label: string; value: number }[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isRecord)
    .map((item) => ({
      label: asString(item.label),
      value: typeof item.value === 'number' ? item.value : Number(item.value ?? 0),
    }))
    .filter((item) => Number.isFinite(item.value));
}

function normalizeInsights(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => asString(item)).filter(Boolean);
}

function asNumber(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeVersionSummary(value: unknown): WorkspaceVersionSummary {
  const record = isRecord(value) ? value : {};
  return {
    currentVersion: asString(record.currentVersion),
    targetMonth: asString(record.targetMonth),
    planScope: asString(record.planScope),
    usage: asString(record.usage),
    status: asString(record.status),
  };
}

function normalizeRecord(value: unknown): WorkspaceRecord {
  const record = isRecord(value) ? value : {};
  return {
    id: asString(record.id),
    base: asString(record.base),
    baseCode: asString(record.baseCode),
    sku: asString(record.sku),
    skuName: asString(record.skuName),
    month: asString(record.month),
    version: asString(record.version),
    cycleStock: asNumber(record.cycleStock),
    safetyStock: asNumber(record.safetyStock),
    targetStock: asNumber(record.targetStock),
    confirmedTargetStock: asNumber(record.confirmedTargetStock),
    currentInventory: asNumber(record.currentInventory),
    availableInventory: asNumber(record.availableInventory),
    turnoverDays: asNumber(record.turnoverDays),
    replenishmentCycle: asNumber(record.replenishmentCycle),
    dailyDemand: asNumber(record.dailyDemand),
    monthlyDemand: asNumber(record.monthlyDemand),
    transferPlan: asNumber(record.transferPlan),
    managementTurnoverDays: asNumber(record.managementTurnoverDays),
    managementTargetStock: asNumber(record.managementTargetStock),
    productLabel: asString(record.productLabel),
    productTag: asString(record.productTag),
    avgSales: asNumber(record.avgSales),
    stdDev: asNumber(record.stdDev),
    zValue: asNumber(record.zValue),
    targetFillRate: asString(record.targetFillRate),
    serviceLevel: asString(record.serviceLevel),
    status: asString(record.status),
    confirmedBy: asString(record.confirmedBy),
    confirmedAt: asString(record.confirmedAt),
    lockedBy: asString(record.lockedBy),
    lockedAt: asString(record.lockedAt),
    remark: asString(record.remark),
    riskLevel:
      record.riskLevel === 'warning' ||
      record.riskLevel === 'critical' ||
      record.riskLevel === 'unknown'
        ? record.riskLevel
        : 'healthy',
    gapToConfirmedTarget: asNumber(record.gapToConfirmedTarget),
    deviationRate: asString(record.deviationRate),
    ltConfigured: Boolean(record.ltConfigured),
    abnormalTransfer: Boolean(record.abnormalTransfer),
  };
}

function normalizeComparison(value: unknown): WorkspaceComparison | null {
  if (!isRecord(value) || !Array.isArray(value.versions)) {
    return null;
  }

  return {
    versions: value.versions.filter(isRecord).map((item) => ({
      version: asString(item.version),
      value: asNumber(item.value),
      status: asString(item.status),
    })),
    delta: asNumber(value.delta),
  };
}

function normalizeTable(value: unknown): WorkspaceTable {
  if (!isRecord(value)) {
    return { columns: [], rows: [] };
  }

  const columns = Array.isArray(value.columns)
    ? value.columns.filter(isRecord).map((item) => ({
        key: asString(item.key),
        label: asString(item.label),
      }))
    : [];

  const rows = Array.isArray(value.rows)
    ? value.rows
        .filter(isRecord)
        .map((item) =>
          Object.fromEntries(
            Object.entries(item).map(([key, cell]) => [
              key,
              typeof cell === 'number' ? cell : asString(cell),
            ]),
          ),
        )
    : [];

  const rawPagination = isRecord(value.pagination) ? value.pagination : null;
  const offset = rawPagination ? Number(rawPagination.offset) : NaN;
  const pageSize = rawPagination ? Number(rawPagination.pageSize) : NaN;
  const total = rawPagination ? Number(rawPagination.total) : NaN;
  const pagination =
    Number.isInteger(offset) &&
    offset >= 0 &&
    Number.isInteger(pageSize) &&
    pageSize >= 1 &&
    pageSize <= 100
      ? {
          offset,
          pageSize,
          hasNext: rawPagination?.hasNext === true,
          ...(Number.isSafeInteger(total) && total >= offset ? { total } : {}),
        }
      : undefined;

  return { columns, rows, pagination };
}

function normalizeActions(value: unknown): WorkspaceAction[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord).map((item) => ({
    id: asString(item.id),
    label: asString(item.label),
    description: asString(item.description),
    enabled: Boolean(item.enabled),
  }));
}

function normalizeSurface(value: unknown): WorkspaceSurfaceBlock[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (item): item is WorkspaceSurfaceBlock => isRecord(item) && typeof item.type === 'string',
    )
    .map((item) => ({ ...item }));
}

function normalizePresentation(value: unknown): WorkspacePresentation {
  if (
    value === 'bar' ||
    value === 'pie' ||
    value === 'table' ||
    value === 'fixed_workbench' ||
    value === 'fixed_workbench_no_data'
  ) {
    return value;
  }
  return 'chart';
}

function normalizeInventoryRiskEvidence(value: unknown): InventoryRiskEvidence | undefined {
  if (
    !isRecord(value) ||
    !isRecord(value.metrics) ||
    !isRecord(value.sources) ||
    value.sources.consumerCode !== 'base-safety-stock'
  )
    return undefined;
  const metrics = value.metrics,
    sources = value.sources;
  const strings = (items: unknown) =>
    Array.isArray(items) ? items.filter((item): item is string => typeof item === 'string') : [];
  const top = Array.isArray(value.top)
    ? value.top.filter(isRecord).map((row) => ({
        base: asString(row.base),
        category: asString(row.category),
        current: numeric(row.current),
        target: numeric(row.target),
        gap: numeric(row.gap),
        shortage: numeric(row.shortage),
        age60: numeric(row.age60),
        future7: numeric(row.future7),
        future14: numeric(row.future14),
        dailyDemand: numeric(row.dailyDemand),
        last30d: numeric(row.last30d),
      }))
    : [];
  return {
    text: asString(value.text),
    ranking: asString(value.ranking),
    top,
    completeRanking: value.completeRanking === true,
    completeAge: value.completeAge === true,
    missing: strings(value.missing),
    metrics: {
      current: numeric(metrics.current),
      target: numeric(metrics.target),
      gap: numeric(metrics.gap),
      shortage: numeric(metrics.shortage),
      age60: numeric(metrics.age60),
      future7: numeric(metrics.future7),
      future14: numeric(metrics.future14),
      fulfillment: numeric(metrics.fulfillment),
      dailyDemand: numeric(metrics.dailyDemand),
      last30d: numeric(metrics.last30d),
    },
    sources: {
      consumerCode: 'base-safety-stock',
      bases: strings(sources.bases),
      targetMonth: asString(sources.targetMonth),
      targetVersions: strings(sources.targetVersions),
      targetSnapshots: strings(sources.targetSnapshots),
      inventorySnapshots: strings(sources.inventorySnapshots),
      orderSnapshots: strings(sources.orderSnapshots),
    },
  };
}

function normalizeFixedWorkbench(value: unknown): FixedSafetyStockWorkbench | null {
  if (!isRecord(value)) {
    return null;
  }
  const noData = isRecord(value.noData)
    ? {
        targetMonth: asString(value.noData.targetMonth),
        inventoryVersion: asString(value.noData.inventoryVersion),
        base: asString(value.noData.base),
        filter: asString(value.noData.filter),
      }
    : undefined;
  const cards = Array.isArray(value.cards)
    ? value.cards.filter(isRecord).map((card) => ({
        title: asString(card.title),
        coverage: asString(card.coverage),
        value: asString(card.value),
        helpers: Array.isArray(card.helpers)
          ? card.helpers.filter(isRecord).map((helper) => ({
              label: asString(helper.label),
              value: asString(helper.value),
            }))
          : [],
        tone: card.tone === 'red' ? ('red' as const) : ('neutral' as const),
      }))
    : undefined;
  return {
    status: value.status === 'no_data' ? 'no_data' : 'ready',
    statusDescription: asString(value.statusDescription),
    overallAnalysis: asString(value.overallAnalysis),
    inventoryInsight: normalizeInventoryRiskEvidence(value.inventoryInsight),
    ...(noData ? { noData } : {}),
    ...(cards ? { cards } : {}),
    ...(Array.isArray(value.currentOrders)
      ? { currentOrders: normalizeCurrentOrderBases(value.currentOrders) }
      : {}),
  };
}

function normalizeReportMetricRow(value: unknown): TargetStockReportMetricRow | null {
  if (!isRecord(value)) {
    return null;
  }
  return {
    label: asString(value.label, '未分类'),
    base: asString(value.base),
    productLabel: asString(value.productLabel),
    recordCount: asNumber(value.recordCount),
    currentInventory: asNumber(value.currentInventory),
    targetInventory: asNumber(value.targetInventory),
    finalTargetInventory: asNumber(value.finalTargetInventory),
    gap: asNumber(value.gap),
    gapRate: value.gapRate === null ? null : asNumber(value.gapRate),
    currentTurnoverDays: asNumber(value.currentTurnoverDays),
    finalTargetTurnoverDays: asNumber(value.finalTargetTurnoverDays),
    turnoverGapDays: asNumber(value.turnoverGapDays),
    turnoverAvailable: Boolean(value.turnoverAvailable),
  };
}

function normalizeTargetStockAnalysisReport(value: unknown): TargetStockAnalysisReport | null {
  if (!isRecord(value) || value.kind !== 'target_stock_analysis_report') {
    return null;
  }
  const overview = normalizeReportMetricRow(value.overview);
  const scope = isRecord(value.scope) ? value.scope : {};
  const category = isRecord(value.category) ? value.category : {};
  const baseCategoryMatrix = isRecord(value.baseCategoryMatrix) ? value.baseCategoryMatrix : {};
  const eventContext = isRecord(value.eventContext) ? value.eventContext : {};
  const sectionSummaries = isRecord(value.sectionSummaries) ? value.sectionSummaries : {};
  const analysisPoints = isRecord(value.analysisPoints) ? value.analysisPoints : {};
  const ageRisk = isRecord(value.ageRisk) ? value.ageRisk : {};
  const orderFulfillment = isRecord(value.orderFulfillment) ? value.orderFulfillment : {};
  if (!overview) {
    return null;
  }
  const rows = (items: unknown) =>
    Array.isArray(items)
      ? items
          .map(normalizeReportMetricRow)
          .filter((item): item is TargetStockReportMetricRow => item !== null)
      : [];
  const ageRows = (items: unknown): TargetStockReportAgeRow[] =>
    Array.isArray(items)
      ? items.filter(isRecord).map((item) => ({
          base: asString(item.base),
          avgAgeDays: asNumber(item.avgAgeDays),
          maxAgeDays: asNumber(item.maxAgeDays),
          overAgeSkuCount: asNumber(item.overAgeSkuCount),
          overAgeInventory: asNumber(item.overAgeInventory),
        }))
      : [];
  const orderRows = (items: unknown): TargetStockReportOrderRow[] =>
    Array.isArray(items)
      ? items.filter(isRecord).map((item) => ({
          base: asString(item.base),
          fulfillmentRate: asNumber(item.fulfillmentRate),
          monthOverMonthChange: asNullableNumber(item.monthOverMonthChange),
          yearOverYearChange: asNullableNumber(item.yearOverYearChange),
          orderQuantity: asNumber(item.orderQuantity),
          shortageQuantity: asNumber(item.shortageQuantity),
          shippedQuantity: asNumber(item.shippedQuantity),
        }))
      : [];
  const points = (items: unknown): TargetStockReportAnalysisPoint[] =>
    Array.isArray(items)
      ? items.filter(isRecord).map((item) => ({
          tone: item.tone === 'green' || item.tone === 'gray' ? item.tone : 'red',
          title: asString(item.title),
          description: asString(item.description),
        }))
      : [];
  const reportDimensions: TargetStockReportDimension[] = [
    'base',
    'product_category',
    'product_label_abc_rus',
    'base_product_category',
    'base_product_label',
  ];
  const enabledDimensions = Array.isArray(value.enabledDimensions)
    ? value.enabledDimensions.filter(
        (dimension): dimension is TargetStockReportDimension =>
          typeof dimension === 'string' &&
          reportDimensions.includes(dimension as TargetStockReportDimension),
      )
    : reportDimensions;
  return {
    kind: 'target_stock_analysis_report',
    title: asString(value.title),
    scope: {
      label: asString(scope.label),
      targetMonth: asString(scope.targetMonth),
      inventoryVersion: asString(scope.inventoryVersion),
      planVersion: asString(scope.planVersion, asString(scope.inventoryVersion)),
      refreshDate: asString(scope.refreshDate, '-'),
      selectionRule: asString(scope.selectionRule),
    },
    enabledDimensions,
    overview: {
      recordCount: overview.recordCount,
      currentInventory: overview.currentInventory,
      targetInventory: overview.targetInventory,
      finalTargetInventory: overview.finalTargetInventory,
      gap: overview.gap,
      gapRate: overview.gapRate,
      currentTurnoverDays: overview.currentTurnoverDays,
      finalTargetTurnoverDays: overview.finalTargetTurnoverDays,
      turnoverGapDays: overview.turnoverGapDays,
      turnoverAvailable: overview.turnoverAvailable,
    },
    baseRows: rows(value.baseRows),
    category: {
      available: Boolean(category.available),
      notice: asString(category.notice),
    },
    categoryRows: rows(value.categoryRows),
    productLabelRows: rows(value.productLabelRows),
    baseCategoryMatrix: {
      available: Boolean(baseCategoryMatrix.available),
      notice: asString(baseCategoryMatrix.notice),
    },
    baseCategoryRows: rows(value.baseCategoryRows),
    baseProductLabelRows: rows(value.baseProductLabelRows),
    ageRisk: {
      available: Boolean(ageRisk.available),
      notice: asString(ageRisk.notice),
      rows: ageRows(ageRisk.rows),
    },
    orderFulfillment: {
      available: Boolean(orderFulfillment.available),
      notice: asString(orderFulfillment.notice),
      rows: orderRows(orderFulfillment.rows),
    },
    sectionSummaries: {
      overview: asString(sectionSummaries.overview),
      base: asString(sectionSummaries.base),
      category: asString(sectionSummaries.category),
      label: asString(sectionSummaries.label),
      baseCategory: asString(sectionSummaries.baseCategory),
      baseLabel: asString(sectionSummaries.baseLabel),
      ageRisk: asString(sectionSummaries.ageRisk),
      orderFulfillment: asString(sectionSummaries.orderFulfillment),
    },
    analysisPoints: {
      base: points(analysisPoints.base),
      category: points(analysisPoints.category),
      label: points(analysisPoints.label),
      baseCategory: points(analysisPoints.baseCategory),
      baseLabel: points(analysisPoints.baseLabel),
    },
    dataQualityNotes: normalizeInsights(value.dataQualityNotes),
    eventContext: {
      available: Boolean(eventContext.available),
      notice: asString(eventContext.notice),
    },
    findings: Array.isArray(value.findings)
      ? value.findings.filter(isRecord).map((item) => ({
          tone: item.tone === 'green' || item.tone === 'gray' ? item.tone : 'red',
          title: asString(item.title),
          description: asString(item.description),
        }))
      : [],
    actionCandidates: Array.isArray(value.actionCandidates)
      ? value.actionCandidates.filter(isRecord).map((item) => ({
          type: asString(item.type),
          scope: asString(item.scope),
          reason: asString(item.reason),
          boundary: asString(item.boundary),
        }))
      : [],
  };
}

export function normalizeWorkspaceState(value: unknown): WorkspaceState | null {
  if (!isRecord(value) || !isWorkspaceLike(value)) {
    return null;
  }

  return {
    title: asString(value.title),
    description: asString(value.description),
    assistantBrief: asString(value.assistantBrief),
    chartType: asChartType(value.chartType),
    metric: asString(value.metric),
    groupBy: asString(value.groupBy),
    viewMode: asViewMode(value.viewMode),
    filters: normalizeFilters(value.filters),
    kpis: normalizeKpis(value.kpis),
    chartData: normalizeChartData(value.chartData),
    insights: normalizeInsights(value.insights),
    versionSummary: normalizeVersionSummary(value.versionSummary),
    record: normalizeRecord(value.record),
    comparison: normalizeComparison(value.comparison),
    table: normalizeTable(value.table),
    actions: normalizeActions(value.actions),
    lastAction: asString(value.lastAction),
    surface: normalizeSurface(value.surface),
    analysisReport: normalizeTargetStockAnalysisReport(value.analysisReport),
    presentation: normalizePresentation(value.presentation),
    workbench: normalizeFixedWorkbench(value.workbench),
  };
}
