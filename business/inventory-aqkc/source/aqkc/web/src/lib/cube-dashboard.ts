import {
  readConfiguredStockSummary,
  readConfiguredHealthSummary,
  readConfiguredStockPage,
  type StockPageInput,
} from '../../../../inventory-light-plugins/src/configured-stock';
import { buildInventoryInsight, numeric } from './inventory-insight';
import type { WorkspaceState } from '../../../../inventory-light-plugins/src/pages/aqkc/components/analytics/workspace-normalizer';
import { dashboardTabQueryPlan, type DashboardTabName } from './dashboard-tab-request-plan';
import { resolveInitialSafetyStockScope } from './safety-stock-scope';
import { queryStock } from '../../../../inventory-light-plugins/src/data';
import { usesConfiguredSql } from '../../../../../../shared/sql-config';
import { coveredStockComparison } from 'dsh-agent-manage/inventory-compute/covered-stock-comparison';
type GatewayOperationContext = unknown;
import type { WorkbenchSqlQuery } from './workbench-sql-types';
import {
  currentOrderBases,
  currentOrderCard,
  shippedOrderMetricHelpers,
} from './workbench-current-order';
import { safetyStockRowsForBase, workbenchSql } from './workbench-sql';

type CubeRow = Record<string, string | number | null | undefined>;

const coveredComparison = (rows: CubeRow[]) =>
  coveredStockComparison(
    rows.map((row) => ({
      inventory: numeric(row['safety_stock.current_inventory']),
      target: targetInventoryOutput(row),
      demand: numeric(row['safety_stock.planned_daily_demand']),
    })),
  );
const coveredDays = (days: number | null, partial: boolean) =>
  days === null ? '-' : partialTargetDisplay(`${days.toFixed(1)}天`, partial);

/** Current stock comes exclusively from the same rows as the age tab.
 * Keep target-only SKUs, and include age-only SKUs without inventing targets.
 */
export function alignAgeInventory(targetRows: CubeRow[], ageRows: CubeRow[]): CubeRow[] {
  // ai_db has a daily base stock fact independently of its unavailable batch ages.
  if (usesConfiguredSql()) return targetRows.map((row) => ({ ...row }));
  const keyOf = (row: CubeRow, prefix: string) =>
    `${String(row[`${prefix}.base_name`] ?? '').trim()}\u0000${String(row[`${prefix}.material_code`] ?? '').trim()}`;
  const age = new Map<string, CubeRow>();
  for (const row of ageRows) {
    const key = keyOf(row, 'inventory_age');
    const quantity = row['inventory_age.current_inventory'];
    if (quantity == null || quantity === '' || !Number.isFinite(Number(quantity))) {
      throw new Error('货龄库存量缺失，无法计算当前库存，请检查数据返回权限');
    }
    const previous = age.get(key);
    age.set(key, {
      ...row,
      'inventory_age.current_inventory':
        Number(quantity) + Number(previous?.['inventory_age.current_inventory'] ?? 0),
    });
  }
  const bases = new Set(ageRows.map((row) => String(row['inventory_age.base_name'] ?? '').trim()));
  const seen = new Set<string>();
  const result: CubeRow[] = targetRows.map((row) => {
    const key = keyOf(row, 'safety_stock');
    const base = String(row['safety_stock.base_name'] ?? '').trim();
    if (!bases.has(base)) throw new Error(`基地${base}暂无货龄库存数据，无法计算当前库存`);
    // Missing SKU quantities remain unknown; never reuse a plan snapshot.
    const quantity = seen.has(key)
      ? 0
      : (age.get(key)?.['inventory_age.current_inventory'] ?? null);
    seen.add(key);
    return { ...row, 'safety_stock.current_inventory': quantity };
  });
  for (const [key, row] of age) {
    if (seen.has(key)) continue;
    result.push({
      'safety_stock.id': `age:${key}`,
      'safety_stock.source': 'age-only',
      'safety_stock.base_name': row['inventory_age.base_name'],
      'safety_stock.material_code': row['inventory_age.material_code'],
      'safety_stock.material_name': row['inventory_age.material_name'],
      'safety_stock.product_categ_name': row['inventory_age.product_categ_name'],
      'safety_stock.current_inventory': row['inventory_age.current_inventory'],
      'safety_stock.record_count': 1,
    });
  }
  return result;
}

export function missingSafetyStockTargetBases(targetRows: CubeRow[], ageRows: CubeRow[]): string[] {
  const targetBases = new Set(
    targetRows.map((row) => String(row['safety_stock.base_name'] ?? '').trim()),
  );
  return [
    ...new Set(ageRows.map((row) => String(row['inventory_age.base_name'] ?? '').trim())),
  ].filter((base) => base && !targetBases.has(base));
}

type DetailFilters = Record<string, string>;

export type SafetyStockDetailPage = {
  columns: { key: string; label: string }[];
  rows: Record<string, string | number>[];
  pagination: {
    offset: number;
    pageSize: number;
    hasNext: boolean;
    total?: number;
  };
};

export type InventoryDashboardTabData = Record<
  '品类结构' | '货龄结构',
  {
    columns: { key: string; label: string }[];
    rows: Record<string, string | number>[];
    notice?: string;
  }
>;

const measures = [
  'safety_stock.record_count',
  'safety_stock.current_inventory',
  'safety_stock.target_inventory',
  'safety_stock.management_target_inventory',
  'safety_stock.final_target_inventory',
  'safety_stock.safety_stock_amount',
  'safety_stock.turnover_inventory',
  'safety_stock.inventory_gap_to_final_target',
  'safety_stock.planned_daily_demand',
  'safety_stock.average_current_turnover_days',
  'safety_stock.average_target_fill_rate',
];

// The header and the age-structure tab both describe the same 60+ day stock.
const WORKBENCH_OVER_AGE_DAYS = 60;

type WorkbenchBusinessSummary = {
  age: {
    available: boolean;
    avg: number | null;
    overAgeSku: number;
    overAgeInventory: number;
  };
  ageByBase: Record<string, number>;
  order: {
    available: boolean;
    rate: number | null;
  };
  orderByBase: Record<string, { rate: number | null }>;
};

function workbenchBusinessSummaryFromRows(rows: CubeRow[]): WorkbenchBusinessSummary {
  const summary: WorkbenchBusinessSummary = {
    age: { available: false, avg: null, overAgeSku: 0, overAgeInventory: 0 },
    ageByBase: {},
    order: { available: false, rate: null },
    orderByBase: {},
  };
  const ageRows = rows.filter((row) => row['workbench.domain'] === 'age');
  const totalWeightedAge = ageRows.reduce(
    (sum, row) => sum + numberOf(row['workbench.weighted_age_total']),
    0,
  );
  const totalAgeInventory = ageRows.reduce(
    (sum, row) => sum + numberOf(row['workbench.inventory_quantity']),
    0,
  );
  const averageAge = totalAgeInventory === 0 ? null : totalWeightedAge / totalAgeInventory;
  summary.age = {
    available: averageAge !== null && Number.isFinite(averageAge) && averageAge > 0,
    avg: averageAge,
    overAgeSku: ageRows.reduce(
      (sum, row) => sum + numberOf(row['workbench.over_age_record_count']),
      0,
    ),
    overAgeInventory: ageRows.reduce(
      (sum, row) => sum + numberOf(row['workbench.over_age_inventory']),
      0,
    ),
  };
  summary.ageByBase = Object.fromEntries(
    ageRows.flatMap((row) => {
      const base = String(row['workbench.base'] ?? '');
      const inventory = numberOf(row['workbench.inventory_quantity']);
      if (!base || inventory === 0) return [];
      return [
        [base, numberOf(row['workbench.weighted_age_total']) / inventory] as [string, number],
      ];
    }),
  );

  const orderRows = rows.filter((row) => row['workbench.domain'] === 'order');
  const validOrders = (values: CubeRow[]) =>
    !usesConfiguredSql() ||
    values.every(
      (row) =>
        Number(row['workbench.invalid']) === 0 &&
        numeric(row['workbench.need_quantity']) !== null &&
        numeric(row['workbench.shortage_quantity']) !== null,
    );
  summary.orderByBase = Object.fromEntries(
    orderRows.flatMap((row) => {
      const base = String(row['workbench.base'] ?? '');
      if (!base) return [];
      const need = numberOf(row['workbench.need_quantity']);
      const shortage = numberOf(row['workbench.shortage_quantity']);
      return [
        [
          base,
          {
            rate: need === 0 || !validOrders([row]) ? null : 1 - shortage / need,
          },
        ] as [string, { rate: number | null }],
      ];
    }),
  );
  const totalNeed = orderRows.reduce(
    (sum, row) => sum + numberOf(row['workbench.need_quantity']),
    0,
  );
  const totalShortage = orderRows.reduce(
    (sum, row) => sum + numberOf(row['workbench.shortage_quantity']),
    0,
  );
  const orderRate =
    totalNeed === 0 || !validOrders(orderRows) ? null : 1 - totalShortage / totalNeed;
  summary.order = {
    available: orderRate !== null && Number.isFinite(orderRate),
    rate: orderRate,
  };
  return summary;
}

function displayDailyMovement(value: number, partial = false) {
  return (
    new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(value) +
    (partial ? '（部分）' : '')
  );
}

function numberOf(value: CubeRow[string]) {
  const valueAsNumber = Number(value ?? 0);
  return Number.isFinite(valueAsNumber) ? valueAsNumber : 0;
}

function displayNumber(value: number) {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(value);
}

const FIXED_WORKBENCH_COLUMNS = [
  { key: 'level', label: '层级' },
  { key: 'warning', label: '预警标志' },
  { key: 'current', label: '当前库存' },
  { key: 'target', label: '目标库存' },
  { key: 'gap', label: '库存差额' },
  { key: 'currentTurnover', label: '周转天数' },
  { key: 'targetTurnover', label: '目标天数' },
  { key: 'dailyDemand', label: '日均计划量' },
  { key: 'last30d', label: '日均动销' },
  { key: 'age', label: '平均货龄' },
  { key: 'orderFillRate', label: '当月订单满足率' },
  { key: 'orderQuantity', label: '当前订单量' },
  { key: 'shortageQuantity', label: '缺货量' },
  { key: 'allocatedQuantity', label: '占用量' },
  { key: 'skuCount', label: 'SKU个数' },
];
const sourceColumns = (columns: { key: string; label: string }[]) =>
  usesConfiguredSql()
    ? columns.map((column) =>
        column.key === 'last30d' ? { ...column, label: '近30日均销量' } : column,
      )
    : columns;

function fixedWorkbenchWarning(current: number, target: number, demand: number) {
  if (target <= 0 && current > 0) return { label: '目标为0但有库存，暂不比较', tone: 'gray' };
  if (target <= 0) return { label: '目标为0，不适用', tone: 'gray' };
  // 受控阈值尚未配置，不能把库存差异直接判为超储或缺货风险。
  if (current < target) return { label: '库存低于目标', tone: 'gray' };
  if (current > target) return { label: '库存高于目标', tone: 'gray' };
  if (demand <= 0) return { label: '计划日均需求为0，周转不适用', tone: 'gray' };
  return { label: '正常', tone: 'gray' };
}

/**
 * 当前处于端午节后规则期。目标库存必须在 SKU 粒度调整后才能汇总，不能
 * 因为用户没有在问题里提“粽子”而回退到宽表的 final_target_inventory。
 * 仅完整“粽子”可命中，避免把“粽味”等无关商品误归为节令品。
 */
export function targetInventoryOutput(row: CubeRow): number | null {
  // An age-only SKU has no published target row. In particular, the seasonal
  // rule below must not turn its absent demand into a fabricated zero target.
  if (
    row['safety_stock.source'] === 'age-only' ||
    row['safety_stock.source'] === 'ai-db-stock-only'
  )
    return null;
  const productCategory = String(row['safety_stock.product_categ_name'] ?? '').trim();
  const productLabel = String(row['safety_stock.product_label'] ?? '');
  const materialName = String(row['safety_stock.material_name'] ?? '');
  const isZongzi =
    productCategory === '粽子' || productLabel.includes('粽子') || materialName.includes('粽子');
  if (!isZongzi) {
    const rawTarget = row['safety_stock.final_target_inventory'];
    return rawTarget === null || rawTarget === undefined || rawTarget === ''
      ? null
      : numberOf(rawTarget);
  }
  if (
    usesConfiguredSql() &&
    (numeric(row['safety_stock.planned_daily_demand']) === null ||
      (numberOf(row['safety_stock.planned_daily_demand']) > 0 &&
        numeric(row['safety_stock.turnover_inventory']) === null))
  )
    return null;
  return numberOf(row['safety_stock.planned_daily_demand']) > 0
    ? numberOf(row['safety_stock.turnover_inventory'])
    : 0;
}

function targetInventoryDisplay(total: number, available: boolean, missing: boolean) {
  return available ? partialTargetDisplay(displayNumber(total), missing) : '-';
}

function partialTargetDisplay(value: string, _partial: boolean) {
  return value;
}

function categoryName(value: unknown) {
  return String(value ?? '').trim() || '未分类';
}

function skuRisk(current: number, target: number | null) {
  return target === null
    ? '缺失目标'
    : current < target
      ? '库存偏低'
      : current > target
        ? '库存偏高'
        : '正常';
}

// 纠偏版优先，但目标库存计算链路中的空值和 0 值不是有效的“纠偏结果”。
// 同月月初版存在有效值时，只回退这些业务字段；当前库存等快照事实允许为 0，
// 不参与回退，避免把真实零库存误写成月初库存。
const TARGET_FIELD_FALLBACK_MEMBERS = [
  'safety_stock.target_inventory',
  'safety_stock.management_target_inventory',
  'safety_stock.final_target_inventory',
  'safety_stock.safety_stock_amount',
  'safety_stock.turnover_inventory',
  'safety_stock.planned_daily_demand',
  'safety_stock.average_current_turnover_days',
  'safety_stock.average_target_fill_rate',
] as const;

function normalizedInventoryVersion(value: unknown) {
  const version = String(value ?? '')
    .replace(/\s+/g, '')
    .replaceAll('版', '');
  if (version.includes('纠偏')) return '纠偏';
  if (version.includes('月初')) return '月初';
  if (version.includes('滚动')) return '滚动';
  return version;
}

function hasUsableTargetValue(value: CubeRow[string]) {
  if (value === null || value === undefined || value === '') return false;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0;
}

function skuVersionKey(row: CubeRow) {
  return [
    String(row['safety_stock.base_name'] ?? ''),
    String(row['safety_stock.material_code'] ?? ''),
  ].join('\u0000');
}

function versionsWithMonthStartFallback(versions: string[]) {
  return versions.some((version) => normalizedInventoryVersion(version) === '纠偏')
    ? [...new Set([...versions, '月初'])]
    : versions;
}

function applyCorrectionFieldFallback(rows: CubeRow[]) {
  const correctionRows = new Map<string, CubeRow>();
  const monthStartRows = new Map<string, CubeRow>();
  const otherRows: CubeRow[] = [];

  for (const row of rows) {
    const version = normalizedInventoryVersion(row['safety_stock.inventory_version']);
    if (version === '纠偏') correctionRows.set(skuVersionKey(row), row);
    else if (version === '月初') monthStartRows.set(skuVersionKey(row), row);
    else otherRows.push(row);
  }

  if (!correctionRows.size) return { rows, fallbackFieldCount: 0 };

  let fallbackFieldCount = 0;
  const mergedRows = [...correctionRows.entries()].map(([key, correction]) => {
    const monthStart = monthStartRows.get(key);
    if (!monthStart) return correction;
    const merged: CubeRow = { ...correction };
    for (const member of TARGET_FIELD_FALLBACK_MEMBERS) {
      if (!hasUsableTargetValue(correction[member]) && hasUsableTargetValue(monthStart[member])) {
        merged[member] = monthStart[member];
        fallbackFieldCount += 1;
      }
    }
    return merged;
  });

  // 某 SKU 没有纠偏行时，整行使用同月月初版；这是“没有纠偏取月初”的
  // SKU 级表达，不会跨目标月份。
  for (const [key, monthStart] of monthStartRows) {
    if (!correctionRows.has(key)) {
      mergedRows.push(monthStart);
      fallbackFieldCount += TARGET_FIELD_FALLBACK_MEMBERS.length;
    }
  }
  return { rows: [...mergedRows, ...otherRows], fallbackFieldCount };
}

function aggregateSkuRowsByBase(rows: CubeRow[]) {
  const byBase = new Map<string, CubeRow>();
  for (const row of rows) {
    const base = String(row['safety_stock.base_name'] ?? '未分类');
    const aggregate = byBase.get(base) ?? {
      'safety_stock.base_name': base,
      'safety_stock.record_count': 0,
      'safety_stock.current_inventory': 0,
      'safety_stock.target_inventory': 0,
      'safety_stock.management_target_inventory': 0,
      'safety_stock.final_target_inventory': 0,
      'safety_stock.safety_stock_amount': 0,
      'safety_stock.turnover_inventory': 0,
      'safety_stock.planned_daily_demand': 0,
    };
    for (const member of measures) {
      aggregate[member] = numberOf(aggregate[member]) + numberOf(row[member]);
    }
    byBase.set(base, aggregate);
  }
  return [...byBase.values()].sort((left, right) =>
    String(left['safety_stock.base_name'] ?? '').localeCompare(
      String(right['safety_stock.base_name'] ?? ''),
      'zh-CN',
    ),
  );
}

async function loadWorkbenchSqlQuery(
  gatewayContextRef: string | undefined,
  query: WorkbenchSqlQuery,
  operation?: GatewayOperationContext,
  signal?: AbortSignal,
  _geaOnly = false,
) {
  const rows = await queryStock(query, signal);
  // Apply the published base scope before version selection, aggregation or
  // pagination, including national queries that carry no user base filter.
  return rows
    .filter((row) => {
      if (String(row['safety_stock.product_categ_name'] ?? '').trim() === '饺鲜说') return false;
      if (row['workbench.domain'] === 'order_total') return true;
      const baseKey = ['safety_stock.base_name', 'inventory_age.base_name', 'workbench.base'].find(
        (key) => key in row,
      );
      // The scope query has no base dimension; its fixed SQL uses the same scope.
      return baseKey === undefined || KNOWN_BASES.has(String(row[baseKey] ?? ''));
    })
    .map((row) => {
      const result = { ...row };
      for (const key of [
        'safety_stock.product_categ_name',
        'inventory_age.product_categ_name',
        'workbench.category',
      ]) {
        if (key in result) result[key] = categoryName(result[key]);
      }
      return result;
    });
}

function safetyStockMonth(value: CubeRow[string]) {
  return String(value ?? '').match(/20\d{2}-\d{2}/)?.[0] ?? '';
}

function inSafetyStockScope(row: CubeRow, month: string, versions?: string[]) {
  const monthMatches =
    safetyStockMonth(row['safety_stock.target_month']) === safetyStockMonth(month);
  return (
    monthMatches &&
    (!versions || versions.includes(String(row['safety_stock.inventory_version'] ?? '')))
  );
}

const DETAIL_COLUMNS: SafetyStockDetailPage['columns'] = [
  { key: 'base', label: '基地' },
  { key: 'materialCode', label: '物料编码' },
  { key: 'materialName', label: '物料名称' },
  { key: 'productCategory', label: '产品大类' },
  { key: 'label', label: '产品标签' },
  { key: 'version', label: '版本' },
  { key: 'current', label: '当前库存' },
  { key: 'target', label: '目标库存' },
  { key: 'gap', label: '库存差额' },
  { key: 'safety', label: '安全库存' },
];

const KNOWN_BASES = new Set(['华东', '华南', '西南', '遂平', '郑州']);
const MONTH_LABEL = /^(20\d{2})年(1[0-2]|0?[1-9])月$/;
const MATERIAL_CODE = /^[A-Za-z0-9_-]{1,64}$/;
const DEFAULT_DETAIL_ORDER = {
  'safety_stock.base_name': 'asc',
  'safety_stock.material_code': 'asc',
  'safety_stock.inventory_version': 'asc',
  'safety_stock.id': 'asc',
} as const;
const DETAIL_SORT_ORDERS = {
  '库存差额:asc': { 'safety_stock.inventory_gap_to_final_target': 'asc', 'safety_stock.id': 'asc' },
  '库存差额:desc': {
    'safety_stock.inventory_gap_to_final_target': 'desc',
    'safety_stock.id': 'asc',
  },
  '当前库存:asc': { 'safety_stock.current_inventory': 'asc', 'safety_stock.id': 'asc' },
  '当前库存:desc': { 'safety_stock.current_inventory': 'desc', 'safety_stock.id': 'asc' },
  '目标库存:asc': { 'safety_stock.final_target_inventory': 'asc', 'safety_stock.id': 'asc' },
  '目标库存:desc': { 'safety_stock.final_target_inventory': 'desc', 'safety_stock.id': 'asc' },
  '安全库存:asc': { 'safety_stock.safety_stock_amount': 'asc', 'safety_stock.id': 'asc' },
  '安全库存:desc': { 'safety_stock.safety_stock_amount': 'desc', 'safety_stock.id': 'asc' },
  '周转库存:asc': { 'safety_stock.turnover_inventory': 'asc', 'safety_stock.id': 'asc' },
  '周转库存:desc': { 'safety_stock.turnover_inventory': 'desc', 'safety_stock.id': 'asc' },
} as const;

function detailMonth(value: string | undefined) {
  const match = MONTH_LABEL.exec(value?.trim() ?? '');
  if (!match) {
    throw new Error('明细查询缺少有效目标月份');
  }
  return `${match[1]}-${match[2].padStart(2, '0')}-01`;
}

function detailBases(value: string | undefined) {
  if (!value || value === '全部基地') return [];
  const bases = value
    .split('、')
    .map((item) => item.replace(/基地/g, '').trim())
    .filter(Boolean);
  if (!bases.length || bases.some((base) => !KNOWN_BASES.has(base))) {
    throw new Error('明细查询包含不支持的基地范围');
  }
  return [...new Set(bases)];
}

function detailVersions(value: string | undefined) {
  const versions = (value ?? '')
    .split('、')
    .map((item) => item.trim())
    .filter(Boolean);
  if (!versions.length || versions.some((version) => !/^(纠偏|月初|滚动)(版)?$/.test(version))) {
    throw new Error('明细查询缺少有效库存版本');
  }
  return [...new Set(versions)];
}

function detailMaterialCode(value: string | undefined) {
  if (!value || value === '全部SKU') return null;
  const materialCode = value.trim();
  if (!MATERIAL_CODE.test(materialCode)) {
    throw new Error('明细查询包含无效物料编码');
  }
  return materialCode;
}

function detailProductCategory(value: string | undefined) {
  if (!value || value === '全部产品大类') return null;
  const category = value.trim();
  if (
    !category ||
    category.length > 80 ||
    Array.from(category).some((char) => char.charCodeAt(0) < 0x20)
  ) {
    throw new Error('明细查询包含无效产品大类');
  }
  return category;
}

function detailProductCategorySearch(value: string | undefined) {
  const category = value?.trim() ?? '';
  if (!category) return null;
  if (category.length > 80 || Array.from(category).some((char) => char.charCodeAt(0) < 0x20)) {
    throw new Error('产品大类搜索条件无效');
  }
  return category;
}

function detailOrder(value: string | undefined) {
  if (!value) return DEFAULT_DETAIL_ORDER;
  const order = DETAIL_SORT_ORDERS[value as keyof typeof DETAIL_SORT_ORDERS];
  if (!order) {
    throw new Error('明细查询包含不支持的排序条件');
  }
  return order;
}

function detailFilters(filters: DetailFilters) {
  return {
    targetMonth: detailMonth(filters.month),
    versions: versionsWithMonthStartFallback(detailVersions(filters.version)),
    bases: detailBases(filters.base),
    materialCode: detailMaterialCode(filters.sku),
    productCategory: detailProductCategory(filters.category),
    productCategorySearch: detailProductCategorySearch(filters.categorySearch),
  };
}

function sortDetailRows(rows: CubeRow[], sort: string | undefined) {
  if (!sort) {
    return [...rows].sort((left, right) =>
      skuVersionKey(left).localeCompare(skuVersionKey(right), 'zh-CN'),
    );
  }
  // Keep the existing API validation boundary. Sorting happens after SKU-level
  // fallback so the order and page membership match the values users see.
  detailOrder(sort);
  const [label, direction] = sort.split(':');
  const valueOf = (row: CubeRow) => {
    if (label === '当前库存') return numberOf(row['safety_stock.current_inventory']);
    if (label === '目标库存') return targetInventoryOutput(row) ?? Number.NEGATIVE_INFINITY;
    if (label === '库存差额') {
      const target = targetInventoryOutput(row);
      return target === null
        ? Number.NEGATIVE_INFINITY
        : numberOf(row['safety_stock.current_inventory']) - target;
    }
    if (label === '安全库存') return numberOf(row['safety_stock.safety_stock_amount']);
    if (label === '周转库存') return numberOf(row['safety_stock.turnover_inventory']);
    return 0;
  };
  return [...rows].sort((left, right) => {
    const delta = valueOf(left) - valueOf(right);
    if (delta) return direction === 'asc' ? delta : -delta;
    return skuVersionKey(left).localeCompare(skuVersionKey(right), 'zh-CN');
  });
}

/** Fetch one bounded, fallback-aware detail page. */
export async function loadSafetyStockDetailPage(
  gatewayContextRef: string | undefined,
  filters: DetailFilters,
  offset: number,
  pageSize: number,
  operation?: GatewayOperationContext,
  signal?: AbortSignal,
): Promise<SafetyStockDetailPage> {
  // Page size is bounded to protect each request; offset deliberately has no
  // total-record ceiling so users can continue through every matching SKU.
  const safeOffset = Number.isSafeInteger(offset) && offset >= 0 ? offset : 0;
  const safePageSize = Number.isInteger(pageSize) ? Math.min(Math.max(pageSize, 1), 100) : 10;
  const scoped = detailFilters(filters);
  // User filters are applied after the fixed SQL query so no request value is
  // concatenated into executable SQL.
  const data = (
    await loadWorkbenchSqlQuery(gatewayContextRef, workbenchSql.safetyStockRows, operation, signal)
  ).filter((row) => {
    if (!inSafetyStockScope(row, scoped.targetMonth, scoped.versions)) return false;
    const base = String(row['safety_stock.base_name'] ?? '');
    const materialCode = String(row['safety_stock.material_code'] ?? '');
    const category = String(row['safety_stock.product_categ_name'] ?? '');
    return (
      (!scoped.bases.length || scoped.bases.includes(base)) &&
      (!scoped.materialCode || scoped.materialCode === materialCode) &&
      (!scoped.productCategory || scoped.productCategory === category) &&
      (!scoped.productCategorySearch || category.includes(scoped.productCategorySearch))
    );
  });
  const ageRows = await loadWorkbenchSqlQuery(
    gatewayContextRef,
    workbenchSql.ageStructure(WORKBENCH_OVER_AGE_DAYS),
    operation,
    signal,
  ).catch((error) => {
    if (!usesConfiguredSql() || signal?.aborted) throw error;
    return [];
  });
  const aligned = alignAgeInventory(
    applyCorrectionFieldFallback(data).rows,
    ageRows.filter((row) => {
      const base = String(row['inventory_age.base_name'] ?? '');
      const material = String(row['inventory_age.material_code'] ?? '');
      const category = String(row['inventory_age.product_categ_name'] ?? '');
      return (
        (!scoped.bases.length || scoped.bases.includes(base)) &&
        (!scoped.materialCode || scoped.materialCode === material) &&
        (!scoped.productCategory || scoped.productCategory === category) &&
        (!scoped.productCategorySearch || category.includes(scoped.productCategorySearch))
      );
    }),
  );
  const mergedRows = sortDetailRows(aligned, filters.sort);
  const pageRows = mergedRows.slice(safeOffset, safeOffset + safePageSize);
  const rows = pageRows.map((row) => {
    const target = targetInventoryOutput(row);
    return {
      id: String(row['safety_stock.id'] ?? ''),
      base: String(row['safety_stock.base_name'] ?? '-'),
      materialCode: String(row['safety_stock.material_code'] ?? '-'),
      materialName: String(row['safety_stock.material_name'] ?? '-'),
      productCategory: String(row['safety_stock.product_categ_name'] ?? '-'),
      label: String(row['safety_stock.product_label'] ?? '-'),
      version: String(row['safety_stock.inventory_version'] ?? '-'),
      current:
        row['safety_stock.current_inventory'] == null
          ? '-'
          : displayNumber(numberOf(row['safety_stock.current_inventory'])),
      target: target === null ? '-' : displayNumber(target),
      gap:
        target === null || row['safety_stock.current_inventory'] == null
          ? '-'
          : displayNumber(numberOf(row['safety_stock.current_inventory']) - target),
      safety:
        usesConfiguredSql() && numeric(row['safety_stock.safety_stock_amount']) === null
          ? '-'
          : displayNumber(numberOf(row['safety_stock.safety_stock_amount'])),
    };
  });
  return {
    columns: DETAIL_COLUMNS,
    rows,
    pagination: {
      offset: safeOffset,
      pageSize: safePageSize,
      hasNext: safeOffset + safePageSize < mergedRows.length,
      total: mergedRows.length,
    },
  };
}

const CATEGORY_COLUMNS = FIXED_WORKBENCH_COLUMNS;
const AGE_COLUMNS = [
  { key: 'level', label: '对象' },
  { key: 'warning', label: '预警标志' },
  { key: 'current', label: '当前库存' },
  { key: 'averageAge', label: '平均货龄' },
  { key: 'age0To30', label: '0-30天量/占比' },
  { key: 'age31To40', label: '31-40天量/占比' },
  { key: 'age41To60', label: '41-60天量/占比' },
  { key: 'age60Plus', label: '60+天量/占比' },
  { key: 'future7', label: '未来7日预计超龄' },
  { key: 'future14', label: '未来14日预计超龄' },
  { key: 'last30d', label: '日均动销' },
  { key: 'skuCount', label: 'SKU个数' },
];

function drillMetricKey(
  base: string,
  category: string,
  materialCode: string,
  groupBy: 'base' | 'category' | 'sku',
) {
  return groupBy === 'base'
    ? base
    : groupBy === 'category'
      ? category
      : `${base}\u0000${category}\u0000${materialCode}`;
}

function aggregateDrillMetricRows(
  safetyRows: CubeRow[],
  ageRows: CubeRow[] | null,
  orderRows: CubeRow[] | null,
  groupBy: 'base' | 'category' | 'sku',
  pendingRows: CubeRow[] | null,
) {
  if (ageRows === null && !usesConfiguredSql()) throw new Error('货龄库存数据读取失败，请刷新重试');
  safetyRows = alignAgeInventory(safetyRows, ageRows ?? []);
  const pendingBySku = new Map(
    (pendingRows ?? [])
      .filter((row) => row['workbench.domain'] === 'pending_sku')
      .map((row) => [`${row['workbench.base']}\u0000${row['workbench.material_code']}`, row]),
  );
  const pendingBases = new Set(
    (pendingRows ?? [])
      .filter(
        (row) =>
          row['workbench.domain'] === 'pending_base' && row['workbench.order_quantity'] != null,
      )
      .map((row) => String(row['workbench.base'])),
  );
  const pendingByLevel = new Map<
    string,
    { order: number | null; shortage: number | null; allocated: number | null }
  >();
  const seenPending = new Set<string>();
  for (const row of safetyRows) {
    const base = String(row['safety_stock.base_name']);
    const material = String(row['safety_stock.material_code']);
    const key = drillMetricKey(
      base,
      categoryName(row['safety_stock.product_categ_name']),
      material,
      groupBy,
    );
    const skuKey = `${base}\u0000${material}`;
    const seenKey = `${key}\u0000${skuKey}`;
    if (seenPending.has(seenKey)) continue;
    seenPending.add(seenKey);
    const pending = pendingBySku.get(skuKey);
    const aggregate = pendingByLevel.get(key) ?? { order: 0, shortage: 0, allocated: 0 };
    for (const [field, member] of [
      ['order', 'order_quantity'],
      ['shortage', 'shortage_quantity'],
      ['allocated', 'allocated_quantity'],
    ] as const) {
      const raw = pending?.[`workbench.${member}`];
      aggregate[field] =
        aggregate[field] === null ||
        !pendingBases.has(base) ||
        (pending && (raw === null || raw === undefined || raw === ''))
          ? null
          : aggregate[field]! + numberOf(raw);
    }
    pendingByLevel.set(key, aggregate);
  }
  const ageByLevel = new Map<string, { weightedAge: number; inventory: number }>();
  for (const row of ageRows ?? []) {
    const base = String(row['inventory_age.base_name'] ?? '未分类').trim() || '未分类';
    const category = String(row['inventory_age.product_categ_name'] ?? '未分类').trim() || '未分类';
    const materialCode = String(row['inventory_age.material_code'] ?? '-').trim() || '-';
    const key = drillMetricKey(base, category, materialCode, groupBy);
    const aggregate = ageByLevel.get(key) ?? { weightedAge: 0, inventory: 0 };
    aggregate.weightedAge += numberOf(row['inventory_age.weighted_age_total']);
    aggregate.inventory += numberOf(row['inventory_age.current_inventory']);
    ageByLevel.set(key, aggregate);
  }

  const orderByLevel = new Map<string, { need: number; shortage: number; invalid: boolean }>();
  for (const row of orderRows ?? []) {
    const base = String(row['workbench.base'] ?? '未分类').trim() || '未分类';
    const category = String(row['workbench.category'] ?? '未分类').trim() || '未分类';
    const materialCode = String(row['workbench.material_code'] ?? '-').trim() || '-';
    const key = drillMetricKey(base, category, materialCode, groupBy);
    const aggregate = orderByLevel.get(key) ?? { need: 0, shortage: 0, invalid: false };
    aggregate.need += numberOf(row['workbench.need_quantity']);
    aggregate.shortage += numberOf(row['workbench.shortage_quantity']);
    aggregate.invalid ||=
      usesConfiguredSql() &&
      (Number(row['workbench.invalid']) !== 0 ||
        numeric(row['workbench.need_quantity']) === null ||
        numeric(row['workbench.shortage_quantity']) === null);
    orderByLevel.set(key, aggregate);
  }

  const byLevel = new Map<
    string,
    {
      level: string;
      current: number;
      target: number;
      currentMissing: boolean;
      currentPresent: number;
      targetMissing: boolean;
      targetAvailable: boolean;
      targetMissingCount: number;
      demand: number;
      demandAvailable: boolean;
      demandMissing: boolean;
      observedDaily: number;
      observedDailyPresent: number;
      observedDailyMissing: boolean;
      last30d: number;
      last30dAvailable: boolean;
      last30dMissing: boolean;
      skus: Set<string>;
      sourceRows: CubeRow[];
    }
  >();
  for (const row of safetyRows) {
    const base = String(row['safety_stock.base_name'] ?? '未分类').trim() || '未分类';
    const category = String(row['safety_stock.product_categ_name'] ?? '未分类').trim() || '未分类';
    const materialCode = String(row['safety_stock.material_code'] ?? '-').trim() || '-';
    const materialName = String(row['safety_stock.material_name'] ?? '-').trim() || '-';
    const key = drillMetricKey(base, category, materialCode, groupBy);
    const level =
      groupBy === 'base'
        ? base
        : groupBy === 'category'
          ? category
          : `${materialCode} ${materialName}`;
    const aggregate = byLevel.get(key) ?? {
      level,
      current: 0,
      target: 0,
      currentMissing: false,
      currentPresent: 0,
      targetMissing: false,
      targetAvailable: false,
      targetMissingCount: 0,
      demand: 0,
      demandAvailable: false,
      demandMissing: false,
      observedDaily: 0,
      observedDailyPresent: 0,
      observedDailyMissing: false,
      last30d: 0,
      last30dAvailable: false,
      last30dMissing: false,
      skus: new Set<string>(),
      sourceRows: [],
    };
    const target = targetInventoryOutput(row);
    const rawDemand = row['safety_stock.planned_daily_demand'];
    const rawLast30d = row['safety_stock.last_30d_shipment_quantity'];
    aggregate.current += numberOf(row['safety_stock.current_inventory']);
    aggregate.currentMissing ||=
      row['safety_stock.current_inventory'] == null || row['safety_stock.current_inventory'] === '';
    if (numeric(row['safety_stock.current_inventory']) !== null) aggregate.currentPresent++;
    aggregate.target += target ?? 0;
    aggregate.targetMissing ||= target === null;
    aggregate.targetAvailable ||= target !== null;
    aggregate.targetMissingCount += target === null ? 1 : 0;
    aggregate.demand += numberOf(rawDemand);
    aggregate.demandAvailable ||= rawDemand !== null && rawDemand !== undefined && rawDemand !== '';
    aggregate.demandMissing ||= numeric(rawDemand) === null || numberOf(rawDemand) < 0;
    const observedDaily = numeric(row['safety_stock.observed_daily_sales']);
    if (observedDaily !== null && observedDaily >= 0) {
      aggregate.observedDaily += observedDaily;
      aggregate.observedDailyPresent++;
    } else aggregate.observedDailyMissing = true;
    aggregate.last30d += numberOf(rawLast30d);
    aggregate.last30dAvailable ||=
      rawLast30d !== null && rawLast30d !== undefined && rawLast30d !== '';
    aggregate.last30dMissing ||= rawLast30d == null || rawLast30d === '';
    aggregate.skus.add(materialCode);
    aggregate.sourceRows.push(row);
    byLevel.set(key, aggregate);
  }

  return [...byLevel.entries()]
    .filter(
      ([, value]) =>
        groupBy !== 'sku' ||
        !(
          !value.targetMissing &&
          value.target === 0 &&
          !value.currentMissing &&
          value.current === 0 &&
          !value.last30dMissing &&
          value.last30d === 0
        ),
    )
    .map(([key, value]) => {
      const age = ageByLevel.get(key);
      const order = orderByLevel.get(key);
      const gap = value.current - value.target;
      const pending = pendingByLevel.get(key);
      const direct = usesConfiguredSql();

      const covered = coveredComparison(value.sourceRows);
      const inventoryAvailable = direct ? !value.currentMissing : Boolean(age);
      const comparable = inventoryAvailable && (!direct || !value.targetMissing);
      const risk =
        direct && value.currentMissing
          ? '-'
          : skuRisk(value.current, value.targetMissing ? null : value.target);
      return {
        level: value.level,
        risk,
        warning:
          groupBy === 'sku'
            ? risk
            : value.targetAvailable && (!direct || comparable)
              ? fixedWorkbenchWarning(value.current, value.target, value.demand).label
              : '-',
        current: direct
          ? value.currentPresent
            ? partialTargetDisplay(displayNumber(value.current), value.currentMissing)
            : '-'
          : !age
            ? '-'
            : displayNumber(value.current),
        target: targetInventoryDisplay(value.target, value.targetAvailable, value.targetMissing),
        gap: direct
          ? covered.gap === null
            ? '-'
            : partialTargetDisplay(displayNumber(covered.gap), covered.gapPartial)
          : comparable && value.targetAvailable
            ? displayNumber(gap)
            : '-',
        currentTurnover: direct
          ? coveredDays(covered.turnover, covered.turnoverPartial)
          : !inventoryAvailable
            ? '-'
            : value.demandAvailable && value.demand > 0
              ? `${(value.current / value.demand).toFixed(1)}天`
              : '不适用',
        targetTurnover: direct
          ? coveredDays(covered.targetTurnover, covered.turnoverPartial)
          : !value.targetAvailable
            ? '-'
            : value.demandAvailable && value.demand > 0
              ? partialTargetDisplay(
                  `${(value.target / value.demand).toFixed(1)}天`,
                  value.targetMissing,
                )
              : '不适用',
        dailyDemand: value.demandAvailable
          ? partialTargetDisplay(displayNumber(value.demand), direct && value.demandMissing)
          : '-',
        last30d: direct
          ? value.observedDailyPresent
            ? partialTargetDisplay(
                displayDailyMovement(value.observedDaily),
                value.observedDailyMissing,
              )
            : '-'
          : value.last30dAvailable
            ? displayDailyMovement(value.last30d / 30, value.last30dMissing)
            : '-',
        age: age && age.inventory > 0 ? `${(age.weightedAge / age.inventory).toFixed(1)}天` : '-',
        orderFillRate:
          order && !order.invalid
            ? order.need > 0
              ? `${((1 - order.shortage / order.need) * 100).toFixed(1)}%`
              : '不适用'
            : '-',
        orderQuantity: pending?.order == null ? '-' : displayNumber(pending.order),
        shortageQuantity: pending?.shortage == null ? '-' : displayNumber(pending.shortage),
        allocatedQuantity: pending?.allocated == null ? '-' : displayNumber(pending.allocated),
        skuCount: displayNumber(value.skus.size),
        rawGap: value.targetAvailable ? gap : value.current,
      };
    })
    .sort((left, right) => Math.abs(Number(right.rawGap)) - Math.abs(Number(left.rawGap)));
}

function emptyDashboardTabs(notice: string): InventoryDashboardTabData {
  return {
    品类结构: { columns: CATEGORY_COLUMNS, rows: [], notice },
    货龄结构: { columns: AGE_COLUMNS, rows: [], notice },
  };
}

function displayQuantityShare(quantity: number, total: number) {
  return `${displayNumber(quantity)} / ${total > 0 ? `${((quantity / total) * 100).toFixed(1)}%` : '0.0%'}`;
}

/** Daily stock supports current and 60+ quantities, independently of absent batch ages. */
function dailyAgeRows(rows: CubeRow[], groupBy: 'base' | 'category' | 'sku') {
  const groups = new Map<string, CubeRow[]>();
  for (const row of rows) {
    if (
      row['safety_stock.stock_source_rows'] != null &&
      Number(row['safety_stock.stock_source_rows']) === 0
    )
      continue;
    const base = String(row['safety_stock.base_name'] ?? '未分类');
    const category = categoryName(row['safety_stock.product_categ_name']);
    const sku = String(row['safety_stock.material_code'] ?? '-');
    const key = drillMetricKey(base, category, sku, groupBy);
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => {
    const known = (field: string, nonnegative = false) => {
      const values = group
        .map((row) => numeric(row[field]))
        .filter((value): value is number => value !== null && (!nonnegative || value >= 0));
      return {
        quantity: values.reduce((total, value) => total + value, 0),
        present: values.length,
        partial: values.length < group.length,
      };
    };
    const current = known('safety_stock.current_inventory');
    const over60 = known('safety_stock.over60_quantity', true);
    const daily = known('safety_stock.observed_daily_sales', true);
    const first = group[0];
    const ratio =
      !current.partial &&
      !over60.partial &&
      current.quantity > 0 &&
      over60.quantity <= current.quantity
        ? ((over60.quantity / current.quantity) * 100).toFixed(1) + '%'
        : '-';
    return {
      level:
        groupBy === 'base'
          ? String(first['safety_stock.base_name'])
          : groupBy === 'category'
            ? categoryName(first['safety_stock.product_categ_name'])
            : `${first['safety_stock.material_code']} ${first['safety_stock.material_name'] ?? ''}`,
      warning: '-',
      current: current.present
        ? partialTargetDisplay(displayNumber(current.quantity), current.partial)
        : '-',
      averageAge: '-',
      age0To30: '-',
      age31To40: '-',
      age41To60: '-',
      age60Plus: over60.present
        ? `${partialTargetDisplay(displayNumber(over60.quantity), over60.partial)} / ${ratio}`
        : '-',
      future7: '-',
      future14: '-',
      last30d: daily.present
        ? partialTargetDisplay(displayDailyMovement(daily.quantity), daily.partial)
        : '-',
      skuCount: displayNumber(new Set(group.map((row) => row['safety_stock.material_code'])).size),
    };
  });
}

function aggregateAgeStructureRows(rows: CubeRow[], groupBy: 'base' | 'category' | 'sku') {
  const aggregates = new Map<
    string,
    {
      current: number;
      weightedAge: number;
      age0To30: number;
      age31To40: number;
      age41To60: number;
      age60Plus: number;
      future7: number;
      future14: number;
      last30d: number;
      last30dAvailable: boolean;
      skus: Set<string>;
    }
  >();
  for (const row of rows) {
    const base = String(row['inventory_age.base_name'] ?? '未分类');
    const category = categoryName(row['inventory_age.product_categ_name']);
    const materialCode = String(row['inventory_age.material_code'] ?? '-');
    const materialName = String(row['inventory_age.material_name'] ?? '-');
    const key =
      groupBy === 'base'
        ? base
        : groupBy === 'category'
          ? category
          : `${materialCode} ${materialName}`;
    const aggregate = aggregates.get(key) ?? {
      current: 0,
      weightedAge: 0,
      age0To30: 0,
      age31To40: 0,
      age41To60: 0,
      age60Plus: 0,
      future7: 0,
      future14: 0,
      last30d: 0,
      last30dAvailable: false,
      skus: new Set<string>(),
    };
    aggregate.current += numberOf(row['inventory_age.current_inventory']);
    aggregate.weightedAge += numberOf(row['inventory_age.weighted_age_total']);
    aggregate.age0To30 += numberOf(row['inventory_age.age_0_30']);
    aggregate.age31To40 += numberOf(row['inventory_age.age_31_40']);
    aggregate.age41To60 += numberOf(row['inventory_age.age_41_60']);
    aggregate.age60Plus += numberOf(row['inventory_age.age_60_plus']);
    aggregate.future7 += numberOf(row['inventory_age.future_7_overage']);
    aggregate.future14 += numberOf(row['inventory_age.future_14_overage']);
    aggregate.last30d += numberOf(row['inventory_age.last_30d_sales']);
    aggregate.last30dAvailable ||= row['inventory_age.last_30d_sales'] != null;
    aggregate.skus.add(materialCode);
    aggregates.set(key, aggregate);
  }
  return [...aggregates.entries()]
    .map(([level, value]) => ({
      level,
      warning: value.future14 > 0 ? '预警' : '正常',
      current: displayNumber(value.current),
      averageAge: value.current > 0 ? `${(value.weightedAge / value.current).toFixed(1)}天` : '-',
      age0To30: displayQuantityShare(value.age0To30, value.current),
      age31To40: displayQuantityShare(value.age31To40, value.current),
      age41To60: displayQuantityShare(value.age41To60, value.current),
      age60Plus: displayQuantityShare(value.age60Plus, value.current),
      future7: displayNumber(value.future7),
      future14: displayNumber(value.future14),
      last30d: value.last30dAvailable ? displayNumber(Math.ceil(value.last30d / 30)) : '-',
      skuCount: displayNumber(value.skus.size),
      rawRisk: value.future14,
    }))
    .sort((left, right) => Number(right.rawRisk) - Number(left.rawRisk));
}

/** Read-only tab aggregates. Every row is calculated from fixed GEA SQL results. */
export async function loadInventoryDashboardTabs(
  gatewayContextRef?: string,
  base?: string,
  category?: string,
  requestedTab?: DashboardTabName,
  operation?: GatewayOperationContext,
  signal?: AbortSignal,
  categoryLevel?: 'base',
): Promise<InventoryDashboardTabData> {
  const normalizedCategory = category === undefined ? '' : categoryName(category);
  if (
    normalizedCategory.length > 80 ||
    Array.from(normalizedCategory).some((char) => char.charCodeAt(0) < 0x20)
  ) {
    throw new Error('看板查询包含无效产品大类');
  }
  const requestedBases = (base ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (requestedBases.some((item) => !KNOWN_BASES.has(item))) {
    throw new Error('看板查询包含不支持的基地范围');
  }
  const selectedBases = [...new Set(requestedBases)];
  const selectedBase = selectedBases.length === 1 ? selectedBases[0] : '';
  const queryPlan = dashboardTabQueryPlan(requestedTab);
  const direct = usesConfiguredSql();
  if (
    direct &&
    queryPlan.category &&
    !queryPlan.age &&
    !(selectedBase && normalizedCategory && categoryLevel !== 'base')
  ) {
    const groupBy = normalizedCategory ? 'base' : 'category';
    const [{ groups }, orderRows] = await Promise.all([
      readConfiguredStockSummary(selectedBases, {
        signal,
        structure: { groupBy, category: normalizedCategory },
      }),
      loadWorkbenchSqlQuery(
        gatewayContextRef,
        { ...workbenchSql.orderStructure, name: 'workbench-order-groups' },
        operation,
        signal,
      ).catch((error) => {
        if (signal?.aborted) throw error;
        return null;
      }),
    ]);
    const rows = groups
      .map((r: any) => {
        const orders = orderRows?.filter(
          (o) =>
            (!selectedBases.length || selectedBases.includes(String(o['workbench.base']))) &&
            (!normalizedCategory || categoryName(o['workbench.category']) === normalizedCategory) &&
            (groupBy === 'base'
              ? o['workbench.base'] === r.level
              : categoryName(o['workbench.category']) === r.level),
        );
        const invalid =
          !orders?.length ||
          orders.some(
            (o) =>
              Number(o['workbench.invalid']) !== 0 ||
              numeric(o['workbench.need_quantity']) === null ||
              numeric(o['workbench.shortage_quantity']) === null,
          );
        const need = orders?.reduce((v, o) => v + numberOf(o['workbench.need_quantity']), 0) ?? 0;
        const shortage =
          orders?.reduce((v, o) => v + numberOf(o['workbench.shortage_quantity']), 0) ?? 0;
        const show = (f: string) => (r[f + '_count'] > 0 ? displayNumber(r[f]) : '-');
        const risk =
          r.inventory_count < r.row_count
            ? '-'
            : skuRisk(r.inventory, r.target_count === r.row_count ? r.target : null);
        return {
          level: r.level,
          risk,
          warning:
            r.inventory_count === r.row_count && r.target_count === r.row_count
              ? fixedWorkbenchWarning(r.inventory, r.target, r.daily_demand ?? 0).label
              : '-',
          current: show('inventory'),
          target: show('target'),
          gap: r.gap_count ? displayNumber(r.gap) : '-',
          currentTurnover: coveredDays(
            r.turn_demand > 0 ? r.turn_inventory / r.turn_demand : null,
            false,
          ),
          targetTurnover: coveredDays(
            r.turn_demand > 0 ? r.turn_target / r.turn_demand : null,
            false,
          ),
          dailyDemand: show('daily_demand'),
          last30d: r.stock_avg_30d_sale_valid_count
            ? displayDailyMovement(r.stock_avg_30d_sale_valid)
            : '-',
          age: '-',
          orderFillRate: invalid
            ? '-'
            : need > 0
              ? `${((1 - shortage / need) * 100).toFixed(1)}%`
              : '不适用',
          orderQuantity: '-',
          shortageQuantity: '-',
          allocatedQuantity: '-',
          skuCount: displayNumber(r.sku_count),
          rawGap: (r.inventory ?? 0) - (r.target ?? 0),
        };
      })
      .sort((a: any, b: any) => Math.abs(b.rawGap) - Math.abs(a.rawGap))
      .map(({ rawGap: _rawGap, ...r }: any) => r);
    return {
      品类结构: {
        columns: sourceColumns(CATEGORY_COLUMNS),
        rows,
        notice: rows.length ? undefined : '当前范围没有品类汇总数据。',
      },
      货龄结构: { columns: sourceColumns(AGE_COLUMNS), rows: [], notice: '货龄数据尚未加载。' },
    };
  }
  if (direct && queryPlan.age && !queryPlan.category && !(selectedBase && normalizedCategory)) {
    const { groups } = await readConfiguredStockSummary(selectedBases, {
      signal,
      structure: {
        groupBy: selectedBase ? 'category' : 'base',
        category: normalizedCategory,
        stockOnly: true,
      },
    });
    const rows = groups.map((r: any) => {
      const ratio =
        r.inventory_count === r.row_count &&
        r.over60_valid_count === r.row_count &&
        r.inventory > 0 &&
        r.over60_valid <= r.inventory
          ? ((r.over60_valid / r.inventory) * 100).toFixed(1) + '%'
          : '-';
      return {
        level: r.level,
        warning: '-',
        current: r.inventory_count ? displayNumber(r.inventory) : '-',
        averageAge: '-',
        age0To30: '-',
        age31To40: '-',
        age41To60: '-',
        age60Plus: r.over60_valid_count ? `${displayNumber(r.over60_valid)} / ${ratio}` : '-',
        future7: '-',
        future14: '-',
        last30d: r.stock_avg_30d_sale_valid_count
          ? displayDailyMovement(r.stock_avg_30d_sale_valid)
          : '-',
        skuCount: displayNumber(r.sku_count),
      };
    });
    return {
      品类结构: {
        columns: sourceColumns(CATEGORY_COLUMNS),
        rows: [],
        notice: '品类数据尚未加载。',
      },
      货龄结构: {
        columns: sourceColumns(AGE_COLUMNS),
        rows,
        notice:
          '已接日库存实存与超60天数量；其余货龄分桶、平均货龄及未来7/14天推演缺少批次事实，保持未知。',
      },
    };
  }
  const needsSafetyRows = queryPlan.category || (direct && queryPlan.age);
  const needsCategoryMetrics = queryPlan.category;
  const [scopeRows, rawAgeRows, rawOrderRows, rawPendingRows] = await Promise.all([
    loadWorkbenchSqlQuery(
      gatewayContextRef,
      needsSafetyRows ? workbenchSql.safetyStockRows : workbenchSql.scope,
      operation,
      signal,
    ),
    !direct && (queryPlan.age || needsCategoryMetrics)
      ? loadWorkbenchSqlQuery(
          gatewayContextRef,
          workbenchSql.ageStructure(WORKBENCH_OVER_AGE_DAYS),
          operation,
          signal,
        ).catch(() => null)
      : Promise.resolve(null),
    needsCategoryMetrics
      ? loadWorkbenchSqlQuery(
          gatewayContextRef,
          workbenchSql.orderStructure,
          operation,
          signal,
        ).catch(() => null)
      : Promise.resolve(null),
    needsCategoryMetrics
      ? loadWorkbenchSqlQuery(
          gatewayContextRef,
          workbenchSql.currentOrderSkus,
          operation,
          signal,
        ).catch(() => null)
      : Promise.resolve(null),
  ]);
  const scope = resolveInitialSafetyStockScope(scopeRows);
  if (!scope.published) return emptyDashboardTabs('当前没有已发布的目标月份数据。');
  const allSafetyRows = needsSafetyRows ? scopeRows : [];
  const inSelectedDimension = (row: CubeRow) => {
    const rowBase = String(row['safety_stock.base_name'] ?? '');
    const rowCategory = String(row['safety_stock.product_categ_name'] ?? '');
    return (
      (!selectedBases.length || selectedBases.includes(rowBase)) &&
      (!normalizedCategory || normalizedCategory === rowCategory)
    );
  };
  const sourceRows = allSafetyRows.filter(
    (row) =>
      inSafetyStockScope(row, scope.targetMonth, versionsWithMonthStartFallback(scope.versions)) &&
      inSelectedDimension(row),
  );
  const effectiveRows = applyCorrectionFieldFallback(sourceRows).rows;
  const categoryGroupBy = normalizedCategory
    ? selectedBase && categoryLevel !== 'base'
      ? 'sku'
      : 'base'
    : 'category';
  const categoryMetricScope = (rows: CubeRow[] | null, baseKey: string, categoryKey: string) =>
    rows?.filter(
      (row) =>
        (!selectedBases.length || selectedBases.includes(String(row[baseKey] ?? ''))) &&
        (!normalizedCategory || normalizedCategory === String(row[categoryKey] ?? '')),
    ) ?? null;
  const categoryRows = queryPlan.category
    ? aggregateDrillMetricRows(
        effectiveRows,
        categoryMetricScope(
          rawAgeRows,
          'inventory_age.base_name',
          'inventory_age.product_categ_name',
        ),
        categoryMetricScope(rawOrderRows, 'workbench.base', 'workbench.category'),
        categoryGroupBy,
        rawPendingRows,
      )
    : [];

  let ageRows: Record<string, string | number>[] = [];
  let ageNotice: string | undefined;
  if (queryPlan.age) {
    if (direct) {
      const groupBy =
        selectedBase && normalizedCategory ? 'sku' : selectedBase ? 'category' : 'base';
      ageRows = dailyAgeRows(effectiveRows, groupBy);
      ageNotice =
        '已接日库存实存与超60天数量；其余货龄分桶、平均货龄及未来7/14天推演缺少批次事实，保持未知。';
    } else if (rawAgeRows) {
      const scopedAgeRows = rawAgeRows.filter((row) => {
        const rowBase = String(row['inventory_age.base_name'] ?? '');
        const rowCategory = String(row['inventory_age.product_categ_name'] ?? '');
        return (
          (!selectedBases.length || selectedBases.includes(rowBase)) &&
          (!normalizedCategory || normalizedCategory === rowCategory)
        );
      });
      const groupBy =
        selectedBase && normalizedCategory ? 'sku' : selectedBase ? 'category' : 'base';
      ageRows = aggregateAgeStructureRows(scopedAgeRows, groupBy).map(
        ({ rawRisk: _rawRisk, ...row }) => row,
      );
    } else {
      ageNotice = '货龄数据暂不可用，未使用其他指标替代。';
    }
  } else {
    ageNotice = '货龄数据尚未加载。';
  }
  const categoryNotice = categoryRows.length
    ? undefined
    : normalizedCategory
      ? `当前范围没有${normalizedCategory}的基地库存汇总数据。`
      : '当前范围没有品类汇总数据。';
  return {
    品类结构: {
      columns:
        categoryGroupBy === 'sku'
          ? CATEGORY_COLUMNS.filter((c) => c.key !== 'skuCount').map((c) =>
              c.key === 'last30d' ? { ...c, label: direct ? '近30日均销量' : '日均动销' } : c,
            )
          : sourceColumns(CATEGORY_COLUMNS),
      rows: categoryRows.map(({ rawGap: _rawGap, ...row }) => row),
      notice: categoryNotice,
    },
    货龄结构: {
      columns:
        selectedBase && normalizedCategory
          ? sourceColumns(AGE_COLUMNS.filter((c) => c.key !== 'skuCount'))
          : sourceColumns(AGE_COLUMNS),
      rows: ageRows,
      notice: ageNotice ?? (ageRows.length ? undefined : '当前范围没有货龄汇总数据。'),
    },
  };
}

export function dashboardBaseFilter(value: string | null): string[] | undefined {
  if (value === null) return undefined;
  const bases = [...new Set(value.split(',').map((base) => base.trim()))];
  if (!bases.length || bases.some((base) => !KNOWN_BASES.has(base))) {
    throw new Error('看板查询包含不支持的基地范围');
  }
  return bases;
}

/** Share the reviewed target selection with read-only reports, before aggregation. */
export function selectWorkbenchTargetRows(allRows: CubeRow[], now = new Date()) {
  const rows = allRows.filter((row) =>
    KNOWN_BASES.has(String(row['safety_stock.base_name'] ?? '')),
  );
  const scope = resolveInitialSafetyStockScope(rows, now);
  const selected = scope.published
    ? rows.filter((row) =>
        inSafetyStockScope(row, scope.targetMonth, versionsWithMonthStartFallback(scope.versions)),
      )
    : [];
  return { scope, ...applyCorrectionFieldFallback(selected) };
}

export async function loadInitialDashboard(
  gatewayContextRef?: string,
  operation?: GatewayOperationContext,
  signal?: AbortSignal,
  selectedBases?: string[],
  geaOnly = false,
): Promise<WorkspaceState> {
  if (
    selectedBases !== undefined &&
    (!selectedBases.length || selectedBases.some((base) => !KNOWN_BASES.has(base)))
  ) {
    throw new Error('看板查询包含不支持的基地范围');
  }
  if (usesConfiguredSql())
    return loadConfiguredSummaryDashboard(gatewayContextRef, operation, signal, selectedBases);
  // 安全库存、当月履约与当前待发订单并行读取，各自保留来源口径。
  const [allSafetyRows, supportRows, pendingRows, insightOrders, sourceHealth] = await Promise.all([
    loadWorkbenchSqlQuery(
      gatewayContextRef,
      workbenchSql.safetyStockRows,
      operation,
      signal,
      geaOnly,
    ),
    loadWorkbenchSqlQuery(
      gatewayContextRef,
      workbenchSql.supportByBase(WORKBENCH_OVER_AGE_DAYS),
      operation,
      signal,
      geaOnly,
    ).catch((error) => {
      if (geaOnly) throw error;
      return [];
    }),
    loadWorkbenchSqlQuery(
      gatewayContextRef,
      workbenchSql.currentOrders,
      operation,
      signal,
      geaOnly,
    ).catch((error) => {
      if (geaOnly) throw error;
      return [];
    }),
    loadWorkbenchSqlQuery(
      gatewayContextRef,
      workbenchSql.currentOrderSkus,
      operation,
      signal,
      geaOnly,
    ).catch(() => null),
    usesConfiguredSql()
      ? readConfiguredHealthSummary(selectedBases, signal).catch((error) => {
          if (signal?.aborted) throw error;
          return { error: error.message };
        })
      : Promise.resolve(null),
  ]);
  // 工作台与对话共用目标月份和版本规则：同月纠偏→月初→滚动；
  // 21 日后仅在次月已发布时切换，否则继续使用当月最新已发布版本。
  const scope = resolveInitialSafetyStockScope(allSafetyRows);
  if (!scope.published) {
    return unavailableWorkspace();
  }

  // 目标字段回退必须发生在 SKU 粒度、且早于基地汇总与节令规则。否则一条
  // 纠偏记录中的 0 会把同基地月初有效值一起聚合掉。
  const sourceSkuRows = allSafetyRows.filter(
    (row) =>
      inSafetyStockScope(row, scope.targetMonth, versionsWithMonthStartFallback(scope.versions)) &&
      (selectedBases === undefined ||
        selectedBases.includes(String(row['safety_stock.base_name']))),
  );
  if (!sourceSkuRows.length) throw new Error('GEA 数据查询未返回可用于计算目标库存的SKU明细');
  const ageInventoryRows = usesConfiguredSql()
    ? []
    : await loadWorkbenchSqlQuery(
        gatewayContextRef,
        workbenchSql.ageStructure(WORKBENCH_OVER_AGE_DAYS),
        operation,
        signal,
        geaOnly,
      ).catch((error) => {
        if (!usesConfiguredSql() || signal?.aborted) throw error;
        return [];
      });
  const selectedAgeRows = ageInventoryRows.filter(
    (row) =>
      selectedBases === undefined || selectedBases.includes(String(row['inventory_age.base_name'])),
  );
  // A large all-base transfer can omit an entire base while the independently
  // queried age rows still contain it. Retry only those bases via the same GEA
  // consumer; never substitute local DB data or infer missing target values.
  const missingBaseRows = missingSafetyStockTargetBases(sourceSkuRows, selectedAgeRows);
  const ageBases = [
    ...new Set(selectedAgeRows.map((row) => String(row['inventory_age.base_name'] ?? '').trim())),
  ];
  const omittedBases = [
    ...new Set([
      ...missingBaseRows,
      ...ageBases.filter((base) => {
        const baseRows = sourceSkuRows.filter(
          (row) => String(row['safety_stock.base_name'] ?? '').trim() === base,
        );
        return (
          baseRows.length > 0 &&
          baseRows.every(
            (row) =>
              row['safety_stock.final_target_inventory'] === null ||
              row['safety_stock.final_target_inventory'] === undefined ||
              row['safety_stock.final_target_inventory'] === '',
          )
        );
      }),
    ]),
  ];
  const recoveryFailures: string[] = [];
  if (omittedBases.length) {
    const recovered = await Promise.allSettled(
      omittedBases.map((base) =>
        loadWorkbenchSqlQuery(
          gatewayContextRef,
          safetyStockRowsForBase(base),
          operation,
          signal,
          geaOnly,
        ),
      ),
    );
    for (let index = 0; index < omittedBases.length; index++) {
      const result = recovered[index];
      const base = omittedBases[index];
      if (result.status === 'rejected') {
        recoveryFailures.push(
          `${base}：${result.reason instanceof Error ? result.reason.message : '查询失败'}`,
        );
        continue;
      }
      const rows = result.value.filter(
        (row) =>
          String(row['safety_stock.base_name'] ?? '').trim() === base &&
          inSafetyStockScope(
            row,
            scope.targetMonth,
            versionsWithMonthStartFallback(scope.versions),
          ),
      );
      if (
        rows.some(
          (row) =>
            row['safety_stock.final_target_inventory'] !== null &&
            row['safety_stock.final_target_inventory'] !== undefined &&
            row['safety_stock.final_target_inventory'] !== '',
        )
      ) {
        for (let rowIndex = sourceSkuRows.length - 1; rowIndex >= 0; rowIndex--) {
          if (String(sourceSkuRows[rowIndex]['safety_stock.base_name'] ?? '').trim() === base)
            sourceSkuRows.splice(rowIndex, 1);
        }
        sourceSkuRows.push(...rows);
      }
    }
  }
  const correctionFallback = applyCorrectionFieldFallback(sourceSkuRows);
  const missingTargetBases = missingSafetyStockTargetBases(
    correctionFallback.rows,
    selectedAgeRows,
  );
  const completeTargetCoverage = missingTargetBases.length === 0;
  const skuRows = alignAgeInventory(correctionFallback.rows, selectedAgeRows);
  const last30dByBase = new Map<string, number | null>();
  const partialMovementBases = new Set<string>();
  for (const row of skuRows) {
    const base = String(row['safety_stock.base_name']);
    const raw = row['safety_stock.last_30d_shipment_quantity'];
    const previous = last30dByBase.get(base);
    if (raw == null || raw === '') {
      partialMovementBases.add(base);
      if (!last30dByBase.has(base)) last30dByBase.set(base, null);
    } else last30dByBase.set(base, (previous ?? 0) + numberOf(raw));
  }
  const rows = aggregateSkuRowsByBase(skuRows);
  if (!rows.length) throw new Error('GEA 数据查询未返回安全库存数据');
  const targetByBase = new Map<
    string,
    {
      total: number;
      presentCount: number;
      missingCount: number;
      demandAvailable: boolean;
      demandMissing: boolean;
      inventoryPresent: number;
      inventoryMissing: number;
      dailySales: number;
      dailySalesPresent: number;
      dailySalesMissing: boolean;
    }
  >();
  skuRows.forEach((row) => {
    const base = String(row['safety_stock.base_name'] ?? '未分类');
    const prior = targetByBase.get(base) ?? {
      total: 0,
      presentCount: 0,
      missingCount: 0,
      demandAvailable: false,
      demandMissing: false,
      inventoryPresent: 0,
      inventoryMissing: 0,
      dailySales: 0,
      dailySalesPresent: 0,
      dailySalesMissing: false,
    };
    const target = targetInventoryOutput(row);
    const rawDemand = row['safety_stock.planned_daily_demand'];
    const inventory = numeric(row['safety_stock.current_inventory']);
    const dailySales = numeric(row['safety_stock.observed_daily_sales']);
    targetByBase.set(base, {
      total: prior.total + (target ?? 0),
      presentCount: prior.presentCount + (target === null ? 0 : 1),
      missingCount: prior.missingCount + (target === null ? 1 : 0),
      demandMissing: prior.demandMissing || numeric(rawDemand) === null || numberOf(rawDemand) < 0,
      inventoryPresent: prior.inventoryPresent + (inventory === null ? 0 : 1),
      inventoryMissing: prior.inventoryMissing + (inventory === null ? 1 : 0),
      dailySales: prior.dailySales + (dailySales !== null && dailySales >= 0 ? dailySales : 0),
      dailySalesPresent: prior.dailySalesPresent + (dailySales !== null && dailySales >= 0 ? 1 : 0),
      dailySalesMissing: prior.dailySalesMissing || dailySales === null || dailySales < 0,
      demandAvailable:
        prior.demandAvailable ||
        (rawDemand !== null && rawDemand !== undefined && rawDemand !== ''),
    });
  });
  const rowsWithTargetOutput = rows.map((row) => {
    const base = String(row['safety_stock.base_name'] ?? '未分类');
    const target = targetByBase.get(base);
    if (target === undefined) throw new Error(`基地${base}缺少目标库存SKU明细`);
    return {
      source: row,
      targetOutput: target.presentCount > 0 ? target.total : null,
      targetCoverage: target,
      last30dVolume: last30dByBase.get(base) ?? null,
    };
  });
  const _recordCount = rows.reduce(
    (total, row) => total + numberOf(row['safety_stock.record_count']),
    0,
  );
  const total = (member: string) => rows.reduce((sum, row) => sum + numberOf(row[member]), 0);
  const current = total('safety_stock.current_inventory');
  const direct = usesConfiguredSql();
  const healthSummary = sourceHealth?.summary;
  const healthAge =
    Number(healthSummary?.age_valid_count) > 0 ? numeric(healthSummary?.max_age) : null;
  const healthScope = sourceHealth?.error
    ? `仓库货龄读取失败：${sourceHealth.error}`
    : healthSummary
      ? `健康表 ${sourceHealth?.snapshotDate} · ${healthSummary.age_valid_count}/${healthSummary.row_count} 条记录，展示仓库最大库龄，平均货龄仍缺批次明细`
      : '当前无仓库货龄快照';
  const currentPresent = skuRows.filter(
    (row) => numeric(row['safety_stock.current_inventory']) !== null,
  ).length;
  const covered = coveredComparison(skuRows);
  const currentMissing = currentPresent < skuRows.length;
  const demandMissing = skuRows.some(
    (row) =>
      numeric(row['safety_stock.planned_daily_demand']) === null ||
      numberOf(row['safety_stock.planned_daily_demand']) < 0,
  );
  const currentDisplay = direct
    ? currentPresent
      ? partialTargetDisplay(displayNumber(current), currentMissing)
      : '-'
    : displayNumber(current);
  const over60Values = skuRows
    .map((row) => numeric(row['safety_stock.over60_quantity']))
    .filter((value): value is number => value !== null && value >= 0);
  const sourceOver60 = over60Values.length
    ? partialTargetDisplay(
        displayNumber(over60Values.reduce((sum, value) => sum + value, 0)),
        over60Values.length < skuRows.length,
      )
    : '-';
  const sourceOver60Skus = over60Values.length
    ? partialTargetDisplay(
        displayNumber(over60Values.filter((value) => value > 0).length),
        over60Values.length < skuRows.length,
      )
    : '-';
  const visibleBases = [...new Set(rows.map((row) => String(row['safety_stock.base_name'])))];
  // The pending-order SQL contains five scaffold rows even when GEA exposes fewer bases.
  const currentOrders = currentOrderBases(pendingRows).filter((row) =>
    visibleBases.includes(row.base),
  );
  const orderCard = currentOrderCard(currentOrders, visibleBases);
  if (direct) {
    const knownSourceTotal = (key: string) => {
      const values = skuRows
        .map((row) => numeric(row[key]))
        .filter((v): v is number => v !== null && v >= 0);
      return values.length
        ? `${displayNumber(values.reduce((a, b) => a + b, 0))}（${values.length}/${skuRows.length} SKU）`
        : '-';
    };
    orderCard.helpers = [
      { label: '快照未备单订单', value: knownSourceTotal('safety_stock.source_ordered') },
      { label: '快照已备单占用', value: knownSourceTotal('safety_stock.source_allocated') },
    ];
  }
  const orderHelpers = shippedOrderMetricHelpers(
    supportRows.filter((row) => visibleBases.includes(String(row['workbench.base']))),
  );
  const targetMissing = rowsWithTargetOutput.some((row) => row.targetCoverage.missingCount > 0);
  const finalTarget = rowsWithTargetOutput.reduce((sum, row) => sum + (row.targetOutput ?? 0), 0);
  // The user-approved partial policy compares current totals with known targets.
  const knownTarget = rowsWithTargetOutput.reduce((sum, row) => sum + row.targetCoverage.total, 0);
  const targetPresentCount = rowsWithTargetOutput.reduce(
    (sum, row) => sum + row.targetCoverage.presentCount,
    0,
  );
  const targetDisplay = completeTargetCoverage
    ? targetInventoryDisplay(knownTarget, targetPresentCount > 0, targetMissing)
    : '-';
  const dailyDemand = total('safety_stock.planned_daily_demand');
  const targetAvailable = targetPresentCount > 0 && completeTargetCoverage;
  const comparable = !direct || (!currentMissing && !targetMissing);
  const gap = targetAvailable && comparable ? current - finalTarget : null;
  const fillRate = targetAvailable && comparable && finalTarget > 0 ? current / finalTarget : null;
  const turnoverDays =
    completeTargetCoverage && (!direct || (!currentMissing && !demandMissing)) && dailyDemand > 0
      ? current / dailyDemand
      : null;
  const targetTurnoverDays =
    targetAvailable && (!direct || (!targetMissing && !demandMissing)) && dailyDemand > 0
      ? finalTarget / dailyDemand
      : null;
  const gapText =
    gap === null
      ? '-'
      : partialTargetDisplay(
          gap < 0 ? '低于目标库存' : gap > 0 ? '高于目标库存' : '与目标库存持平',
          targetMissing,
        );
  const fallbackDescription =
    correctionFallback.fallbackFieldCount > 0
      ? `${scope.selectionRule}；纠偏版中 ${correctionFallback.fallbackFieldCount} 个目标库存相关字段无有效值，已按同月月初版补齐。`
      : scope.selectionRule;
  const businessSummary = workbenchBusinessSummaryFromRows(
    supportRows.filter((row) => visibleBases.includes(String(row['workbench.base']))),
  );
  const businessFindings: string[] = [];
  if (businessSummary.age.available) {
    businessFindings.push(
      `可见基地平均货龄${businessSummary.age.avg!.toFixed(1)}天，超龄SKU ${businessSummary.age.overAgeSku} 个、超龄库存${displayNumber(businessSummary.age.overAgeInventory)}。`,
    );
  }
  if (businessSummary.order.available) {
    businessFindings.push(
      `可见基地当月订单满足率${(businessSummary.order.rate! * 100).toFixed(1)}%。`,
    );
  }
  businessFindings.push(
    `可见基地已发订单量${orderHelpers[0].value}、发货量${orderHelpers[1].value}。`,
  );
  const ageEntries = Object.entries(businessSummary.ageByBase).filter(([, value]) => value > 0);
  if (ageEntries.length > 0) {
    const [maxAgeBase, maxAge] = ageEntries.reduce((max, entry) =>
      entry[1] > max[1] ? entry : max,
    );
    businessFindings.push(`货龄最高基地：${maxAgeBase}（${maxAge.toFixed(1)}天）。`);
  }
  const rateEntries = Object.entries(businessSummary.orderByBase).flatMap(([base, value]) =>
    value.rate === null ? [] : [[base, value.rate] as const],
  );
  if (rateEntries.length > 0) {
    const [minRateBase, minRate] = rateEntries.reduce((min, entry) =>
      entry[1] < min[1] ? entry : min,
    );
    businessFindings.push(`订单满足率最低基地：${minRateBase}（${(minRate * 100).toFixed(1)}%）。`);
  }
  const shortageEntries = currentOrders
    .flatMap((row) =>
      row.shortageQuantity === null ? [] : [[row.base, row.shortageQuantity] as const],
    )
    .filter(([, shortage]) => shortage > 0);
  if (shortageEntries.length > 0) {
    const [maxShortBase, maxShort] = shortageEntries.reduce((max, entry) =>
      entry[1] > max[1] ? entry : max,
    );
    businessFindings.push(`当前缺货量最大基地：${maxShortBase}（${displayNumber(maxShort)}）。`);
  }
  const workbenchRows = rowsWithTargetOutput.map((row) => {
    const rowCurrent = numberOf(row.source['safety_stock.current_inventory']);
    const rowTarget = row.targetOutput;
    const rowDemand = numberOf(row.source['safety_stock.planned_daily_demand']);
    const rowBase = String(row.source['safety_stock.base_name'] ?? '全国');
    const rowCovered = coveredComparison(
      skuRows.filter((source) => String(source['safety_stock.base_name'] ?? '未分类') === rowBase),
    );
    const warehouseAge = sourceHealth?.rows?.find((r: any) => r.belong_base === rowBase);
    const rowAge = direct
      ? (numeric(warehouseAge?.max_age) ?? undefined)
      : businessSummary.ageByBase[rowBase];
    const rowOrder = businessSummary.orderByBase[rowBase];
    const pending = currentOrders.find((row) => row.base === rowBase);
    const rowPartial = row.targetCoverage.missingCount > 0;
    const rowInventoryAvailable = !direct || row.targetCoverage.inventoryPresent > 0;
    const rowComparable = !direct || (!rowPartial && row.targetCoverage.inventoryMissing === 0);
    const warning =
      rowTarget === null || !rowComparable
        ? { label: '-', tone: 'gray' }
        : fixedWorkbenchWarning(rowCurrent, rowTarget, rowDemand);
    return {
      id: rowBase,
      level: rowBase,
      warning: warning.label,
      warningTone: warning.tone,
      current: rowInventoryAvailable
        ? partialTargetDisplay(displayNumber(rowCurrent), row.targetCoverage.inventoryMissing > 0)
        : '-',
      target: targetInventoryDisplay(
        row.targetCoverage.total,
        row.targetCoverage.presentCount > 0,
        rowPartial,
      ),
      gap: direct
        ? rowCovered.gap === null
          ? '-'
          : partialTargetDisplay(displayNumber(rowCovered.gap), rowCovered.gapPartial)
        : rowTarget === null || !rowComparable
          ? '-'
          : partialTargetDisplay(displayNumber(rowCurrent - rowTarget), rowPartial),
      currentTurnover: direct
        ? coveredDays(rowCovered.turnover, rowCovered.turnoverPartial)
        : rowDemand > 0
          ? `${(rowCurrent / rowDemand).toFixed(1)}天`
          : '不适用',
      targetTurnover: direct
        ? coveredDays(rowCovered.targetTurnover, rowCovered.turnoverPartial)
        : rowTarget === null
          ? '-'
          : rowDemand > 0
            ? partialTargetDisplay(`${(rowTarget / rowDemand).toFixed(1)}天`, rowPartial)
            : '不适用',
      dailyDemand: row.targetCoverage.demandAvailable
        ? partialTargetDisplay(displayNumber(rowDemand), direct && row.targetCoverage.demandMissing)
        : '-',
      last30d: direct
        ? row.targetCoverage.dailySalesPresent
          ? partialTargetDisplay(
              displayDailyMovement(row.targetCoverage.dailySales),
              row.targetCoverage.dailySalesMissing,
            )
          : '-'
        : row.last30dVolume === null
          ? '-'
          : displayDailyMovement(row.last30dVolume / 30, partialMovementBases.has(rowBase)),
      age: rowAge === undefined ? '-' : `${rowAge.toFixed(1)}天`,
      orderFillRate: rowOrder?.rate == null ? '-' : `${(rowOrder.rate * 100).toFixed(1)}%`,
      orderQuantity: pending?.orderQuantity == null ? '-' : displayNumber(pending.orderQuantity),
      shortageQuantity:
        pending?.shortageQuantity == null ? '-' : displayNumber(pending.shortageQuantity),
      allocatedQuantity:
        pending?.allocatedQuantity == null ? '-' : displayNumber(pending.allocatedQuantity),
      skuCount: displayNumber(numberOf(row.source['safety_stock.record_count'])),
    };
  });
  const orderQuantities = currentOrders.map((row) => row.shortageQuantity);
  const insight = buildInventoryInsight({
    skus: skuRows.map((row) => ({
      base: String(row['safety_stock.base_name']),
      category: String(row['safety_stock.product_categ_name'] ?? '未分类'),
      sku: String(row['safety_stock.material_code']),
      current: numeric(row['safety_stock.current_inventory']),
      target: targetInventoryOutput(row),
      dailyDemand: numeric(row['safety_stock.planned_daily_demand']),
      last30d: numeric(row['safety_stock.last_30d_shipment_quantity']),
    })),
    pending:
      insightOrders && insightOrders.length < workbenchSql.currentOrderSkus.maxRows
        ? insightOrders
        : null,
    age:
      !usesConfiguredSql() &&
      ageInventoryRows.length < workbenchSql.ageStructure(WORKBENCH_OVER_AGE_DAYS).maxRows
        ? ageInventoryRows
        : null,
    bases: visibleBases,
    shortage:
      currentOrders.length === visibleBases.length &&
      orderQuantities.every((value) => value !== null)
        ? orderQuantities.reduce<number>((total, value) => total + value!, 0)
        : null,
    fulfillment: businessSummary.order.rate,
    stale: skuRows.some((row) => {
      const time = Date.parse(String(row['safety_stock.snapshot_time'] ?? ''));
      return Number.isFinite(time) && Date.now() - time > 48 * 60 * 60 * 1000;
    }),
  });
  const inventoryDates = [
    ...new Set(
      skuRows.map((row) => String(row['safety_stock.snapshot_time'] ?? '')).filter(Boolean),
    ),
  ].sort();
  const overallAnalysis = direct
    ? insight.text.replace(
        '数据边界：',
        `数据边界：库存快照${inventoryDates.join(' / ') || '未知'}，目标月份${scope.targetMonthLabel}、版本${scope.versionLabel}；差额覆盖${covered.gapCovered}/${covered.total}个基地SKU，周转覆盖${covered.turnoverCovered}/${covered.total}个基地SKU，均只比较同一匹配范围；`,
      )
    : insight.text;

  const workspace: WorkspaceState = {
    title: `${scope.targetMonthLabel}安全库存工作台`,
    description: `${direct ? `日库存与目标月份独立读取；库存覆盖${currentPresent}/${skuRows.length}个基地SKU，目标覆盖${targetPresentCount}/${skuRows.length}个基地SKU。部分范围的数量不代表完整合计，缺值不补0；近30日均销量直接取源日均值；批次货龄与当前待发仍未知。` : '已加载基地安全库存汇总数据。'}${fallbackDescription}${missingTargetBases.length ? `；${missingTargetBases.join('、')}目标库存明细未返回，全国目标指标暂不可完整核算。` : ''}`,
    assistantBrief: `已加载安全库存基地汇总（${scope.targetMonthLabel} ${scope.versionLabel}）。${missingTargetBases.length ? `${missingTargetBases.join('、')}目标库存明细未返回。` : ''}`,
    chartType: 'bar',
    metric: '库存经营监控',
    groupBy: '基地',
    viewMode: 'detail',
    filters: {
      base: '全部基地',
      month: scope.targetMonthLabel,
      sku: '全部SKU',
      label: '全部标签',
      version: scope.versionLabel,
    },
    kpis: [
      {
        label: '当前库存',
        value: currentDisplay,
        delta: '目标库存与库存差额见卡片辅助指标',
        tone: 'neutral',
      },
      {
        label: '周转天数',
        value: turnoverDays === null ? '-' : `${turnoverDays.toFixed(1)}天`,
        delta: '目标周转天数与天数差额见卡片辅助指标',
        tone: 'neutral',
      },
      {
        label: direct ? '最大库龄' : '当前货龄',
        value: direct
          ? healthAge === null
            ? '-'
            : `${healthAge.toFixed(1)}天`
          : businessSummary.age.avg === null
            ? '-'
            : `${businessSummary.age.avg.toFixed(1)}天`,
        delta: businessSummary.age.available
          ? `超龄SKU ${businessSummary.age.overAgeSku} 个、超龄库存${displayNumber(businessSummary.age.overAgeInventory)}`
          : direct
            ? `${healthScope}；日库存源超60天库存${sourceOver60}`
            : '货龄数据暂未接入',
        tone: 'neutral',
      },
      {
        label: '订单满足率',
        value:
          businessSummary.order.rate === null
            ? '-'
            : `${(businessSummary.order.rate * 100).toFixed(1)}%`,
        delta: `已发订单量${orderHelpers[0].value}、发货量${orderHelpers[1].value}`,
        tone: 'neutral',
      },
      {
        label: orderCard.title,
        value: orderCard.value,
        delta: '备单中订单量＋已备单未发货占用量；备单量仅统计备单中订单',
        tone: 'neutral',
      },
    ],
    chartData: rowsWithTargetOutput
      .filter((row) => row.targetOutput !== null)
      .map((row) => ({
        label: String(row.source['safety_stock.base_name'] ?? '未分类'),
        value: row.targetOutput!,
      })),
    insights: [overallAnalysis],
    versionSummary: {
      currentVersion: scope.versionLabel,
      targetMonth: scope.targetMonthLabel,
      planScope: fallbackDescription,
      usage: '安全库存工作台',
      status:
        scope.fallbackUsed || correctionFallback.fallbackFieldCount > 0 ? '使用备选版本' : '只读',
    },
    record: {
      id: 'sql-initial-dashboard',
      base: '全国',
      sku: '全部SKU',
      month: scope.targetMonthLabel,
      version: scope.versionLabel,
      cycleStock: 0,
      safetyStock: total('safety_stock.safety_stock_amount'),
      targetStock: finalTarget,
      confirmedTargetStock: finalTarget,
      currentInventory: current,
      turnoverDays: turnoverDays ?? 0,
      replenishmentCycle: 0,
      dailyDemand,
      managementTurnoverDays: 0,
      managementTargetStock: 0,
      productLabel: '全部标签',
      avgSales: 0,
      stdDev: 0,
      targetFillRate:
        fillRate === null
          ? '-'
          : partialTargetDisplay(`${(fillRate * 100).toFixed(1)}%`, targetMissing),
      serviceLevel: '-',
      status: gapText,
      confirmedBy: '',
      confirmedAt: '',
      lockedBy: '',
      lockedAt: '',
      remark: direct
        ? `日库存覆盖${currentPresent}/${skuRows.length}、目标覆盖${targetPresentCount}/${skuRows.length}；有值的数量可查看，缺值不补0，缺口及周转仅在依赖完整时计算。`
        : missingTargetBases.length
          ? `${missingTargetBases.join('、')}目标库存明细未返回；目标库存数值仅为已返回基地合计，不可用于全国比较`
          : '按当前目标库存规则加载的安全库存汇总',
      riskLevel:
        direct && gap === null ? 'unknown' : gap !== null && gap < 0 ? 'critical' : 'healthy',
      gapToConfirmedTarget: gap ?? 0,
    },
    comparison: null,
    table: {
      columns: sourceColumns(FIXED_WORKBENCH_COLUMNS).map((column) =>
        direct && column.key === 'age' ? { ...column, label: '最大库龄/天' } : column,
      ),
      rows: workbenchRows,
    },
    actions: [],
    lastAction: '',
    surface: [],
    presentation: 'fixed_workbench',
    workbench: {
      status: 'ready',
      statusDescription: `工作台默认展示最新已发布数据：${scope.targetMonthLabel}，优先使用${scope.versionLabel}${correctionFallback.fallbackFieldCount > 0 ? '；纠偏版缺失字段已按同月月初版补齐' : ''}。${missingTargetBases.length ? `${missingTargetBases.join('、')}目标库存明细未返回，需核对 GEA 查询返回范围。` : ''}`,
      overallAnalysis,
      inventoryInsight: {
        text: insight.text,
        ranking: insight.ranking,
        top: insight.top,
        completeRanking: insight.completeRanking,
        completeAge: insight.completeAge,
        metrics: insight.metrics,
        missing: insight.missing,
        sources: {
          consumerCode: 'base-safety-stock',
          bases: visibleBases,
          targetMonth: scope.targetMonth,
          targetVersions: scope.versions,
          targetSnapshots: direct
            ? []
            : [
                ...new Set(
                  sourceSkuRows
                    .map((row) => String(row['safety_stock.snapshot_time'] ?? ''))
                    .filter(Boolean),
                ),
              ],
          inventorySnapshots: direct
            ? inventoryDates
            : [...new Set(currentOrders.map((row) => row.inventorySnapshot).filter(Boolean))],
          orderSnapshots: [
            ...new Set(currentOrders.map((row) => row.orderSnapshot).filter(Boolean)),
          ],
        },
      },
      currentOrders,
      cards: [
        {
          title: '当前库存',
          coverage: direct
            ? `库存 ${currentPresent}/${skuRows.length} · 目标 ${targetPresentCount}/${skuRows.length} · 差额 ${covered.gapCovered}/${covered.total} 个基地SKU`
            : undefined,
          value: currentDisplay,
          helpers: [
            { label: '目标库存', value: targetDisplay },
            {
              label: '库存差额',
              value: direct
                ? covered.gap === null
                  ? '-'
                  : partialTargetDisplay(displayNumber(covered.gap), covered.gapPartial)
                : gap === null
                  ? '-'
                  : partialTargetDisplay(displayNumber(gap), targetMissing),
            },
          ],
          tone: 'neutral',
        },
        {
          title: '周转天数',
          coverage: direct
            ? `同范围 ${covered.turnoverCovered}/${covered.total} 个基地SKU · ${scope.versionLabel}需求`
            : undefined,
          value: direct
            ? coveredDays(covered.turnover, covered.turnoverPartial)
            : turnoverDays === null
              ? '-'
              : `${turnoverDays.toFixed(1)}天`,
          helpers: [
            {
              label: '目标周转天数',
              value: direct
                ? coveredDays(covered.targetTurnover, covered.turnoverPartial)
                : targetTurnoverDays === null
                  ? '-'
                  : partialTargetDisplay(`${targetTurnoverDays.toFixed(1)}天`, targetMissing),
            },
            {
              label: '天数差额',
              value: direct
                ? coveredDays(
                    covered.turnover !== null && covered.targetTurnover !== null
                      ? covered.turnover - covered.targetTurnover
                      : null,
                    covered.turnoverPartial,
                  )
                : turnoverDays === null || targetTurnoverDays === null
                  ? '-'
                  : partialTargetDisplay(
                      `${(turnoverDays - targetTurnoverDays).toFixed(1)}天`,
                      targetMissing,
                    ),
            },
          ],
          tone: 'neutral',
        },
        {
          title: direct ? '最大库龄' : '当前货龄',
          coverage: direct ? `${healthScope}；下列超60天数量仍取日库存快照` : undefined,
          value: direct
            ? healthAge === null
              ? '-'
              : `${healthAge.toFixed(1)}天`
            : businessSummary.age.avg === null
              ? '-'
              : `${businessSummary.age.avg.toFixed(1)}天`,
          helpers: [
            {
              label: direct ? '超60天SKU' : '超龄SKU',
              value: direct
                ? sourceOver60Skus
                : businessSummary.age.available
                  ? String(businessSummary.age.overAgeSku)
                  : '-',
            },
            {
              label: direct ? '超60天库存' : '超龄库存',
              value: direct
                ? sourceOver60
                : businessSummary.age.available
                  ? displayNumber(businessSummary.age.overAgeInventory)
                  : '-',
            },
          ],
          tone: 'neutral',
        },
        {
          title: '订单满足率',
          coverage: direct ? '本月基地履约 · 非当前待发' : undefined,
          value:
            businessSummary.order.rate === null
              ? '-'
              : `${(businessSummary.order.rate * 100).toFixed(1)}%`,
          helpers: orderHelpers,
          tone: 'neutral',
        },
        {
          ...orderCard,
          coverage: direct
            ? '订单辅助项取日库存快照，未备单与占用分别展示，当前待发总量仍未知。'
            : undefined,
        },
      ],
    },
  };
  workspace.surface = [
    { type: 'fixed-workbench', title: workspace.title },
    { type: 'kpi-grid', items: workspace.kpis },
    { type: 'overall-analysis', text: overallAnalysis },
    { type: 'table-panel', title: '全国基地库存经营监控', table: workspace.table },
  ];
  return workspace;
}

function unavailableWorkspace(): WorkspaceState {
  const description = '目标库存版本缺失/未锁定，需复核。';
  return {
    title: '安全库存数据待发布',
    description,
    assistantBrief: '暂无可用于工作台展示的安全库存数据。',
    chartType: 'bar',
    metric: '目标库存',
    groupBy: '基地',
    viewMode: 'detail',
    filters: {
      base: '全部基地',
      month: '暂无数据',
      sku: '全部SKU',
      label: '全部标签',
      version: '待发布',
    },
    kpis: [],
    chartData: [],
    insights: ['工作台默认展示最新已发布的安全库存数据。', description],
    versionSummary: {
      currentVersion: '待发布',
      targetMonth: '暂无数据',
      planScope: '工作台默认展示最新已发布的安全库存数据。',
      usage: '安全库存工作台',
      status: '待发布',
    },
    record: {
      id: 'sql-unpublished-scope',
      base: '全国',
      sku: '全部SKU',
      month: '暂无数据',
      version: '待发布',
      cycleStock: 0,
      safetyStock: 0,
      targetStock: 0,
      confirmedTargetStock: 0,
      currentInventory: 0,
      turnoverDays: 0,
      replenishmentCycle: 0,
      dailyDemand: 0,
      managementTurnoverDays: 0,
      managementTargetStock: 0,
      productLabel: '全部标签',
      avgSales: 0,
      stdDev: 0,
      targetFillRate: '-',
      serviceLevel: '-',
      status: '待发布',
      confirmedBy: '',
      confirmedAt: '',
      lockedBy: '',
      lockedAt: '',
      remark: description,
      riskLevel: 'healthy',
      gapToConfirmedTarget: 0,
    },
    comparison: null,
    table: { columns: [], rows: [] },
    actions: [],
    lastAction: '',
    presentation: 'fixed_workbench_no_data',
    workbench: {
      status: 'no_data',
      statusDescription: '当前未查询到符合条件的数据。',
      overallAnalysis: '目标库存版本缺失/未锁定，需复核。本次不生成正式偏差结论。',
      noData: {
        targetMonth: '暂无数据',
        inventoryVersion: '待发布',
        base: '全部基地',
        filter: '全部SKU',
      },
    },
    surface: [{ type: 'fixed-workbench-no-data', title: '安全库存数据待发布' }],
  };
}

/** The original inline table consumes one server-filtered page; parent totals stay independent. */
export async function loadInventorySkuPage(input: StockPageInput, signal?: AbortSignal) {
  const result = await readConfiguredStockPage(input, { signal });
  const orders = result.facts
    .filter((row: any) => row.order_demand != null || row.order_invalid != null)
    .map((row: any) => ({
      'workbench.base': row.base,
      'workbench.category': row.category,
      'workbench.material_code': row.sku,
      'workbench.need_quantity': row.order_demand,
      'workbench.shortage_quantity': row.order_shortage,
      'workbench.invalid': row.order_invalid,
    }));
  const age = input.tab === '货龄结构';
  const computed = age
    ? dailyAgeRows(result.rows, 'sku')
    : aggregateDrillMetricRows(result.rows, null, orders, 'sku', null);
  // The formatter has legacy ordering; restore the database's stable sort/page order.
  const order = new Map<string, number>(
    result.facts.map((row: any, index: number) => [String(row.sku), index]),
  );
  computed.sort(
    (left, right) =>
      (order.get(String(left.level).split(' ')[0]) ?? 0) -
      (order.get(String(right.level).split(' ')[0]) ?? 0),
  );
  return {
    table: {
      columns: sourceColumns(
        (age ? AGE_COLUMNS : CATEGORY_COLUMNS).filter((c) => c.key !== 'skuCount'),
      ),
      rows: computed,
      notice: age
        ? '批次货龄缺失；已接实存和超60天数量。'
        : '当前待发订单及占用阶段快照缺失；当月满足率按履约来源读取。',
    },
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
    readContext: result.readContext,
  };
}

/** Landing cards and base rows need sufficient statistics, not every SKU.
 * Drill tabs and server-paged SKU details retain their independent exact reads.
 */
async function loadConfiguredSummaryDashboard(
  context?: string,
  operation?: GatewayOperationContext,
  signal?: AbortSignal,
  selectedBases?: string[],
): Promise<WorkspaceState> {
  const [{ groups: sourceGroups, scope, day }, support, health] = await Promise.all([
    readConfiguredStockSummary(selectedBases, { signal }),
    loadWorkbenchSqlQuery(
      context,
      workbenchSql.supportByBase(WORKBENCH_OVER_AGE_DAYS),
      operation,
      signal,
    ).catch((e) => {
      if (signal?.aborted) throw e;
      return [];
    }),
    readConfiguredHealthSummary(selectedBases, signal).catch((e) => {
      if (signal?.aborted) throw e;
      return { error: e.message } as any;
    }),
  ]);
  // Keep the legacy business scope after SQL aggregation as well.
  const groups = sourceGroups
    .filter((r: any) => KNOWN_BASES.has(String(r.base)) && categoryName(r.category) !== '饺鲜说')
    .map((r: any) => ({ ...r, category: categoryName(r.category) }));
  if (!groups.length) throw new Error('GEA 数据查询未返回安全库存数据');
  const stats = (rs: any[]) => {
    const sum = (key: string) => rs.reduce((n, r) => n + (numeric(r[key]) ?? 0), 0);
    const n = sum('row_count'),
      gapCount = sum('gap_count'),
      turnCount = sum('turn_count'),
      den = sum('turn_demand');
    return {
      sum,
      n,
      gapCount,
      turnCount,
      gap: gapCount ? sum('gap') : null,
      turn: den > 0 ? sum('turn_inventory') / den : null,
      targetTurn: den > 0 ? sum('turn_target') / den : null,
    };
  };
  const all = stats(groups),
    bases = [...new Set(groups.map((r: any) => r.base))] as string[];
  const business = workbenchBusinessSummaryFromRows(
    support.filter((r) => bases.includes(String(r['workbench.base']))),
  );
  const helpers = shippedOrderMetricHelpers(
    support.filter((r) => bases.includes(String(r['workbench.base']))),
  );
  const show = (s: ReturnType<typeof stats>, key: string, valid = false) =>
    s.sum(key + (valid ? '_valid_count' : '_count'))
      ? displayNumber(s.sum(key + (valid ? '_valid' : '')))
      : '-';
  const days = (v: number | null) => (v === null ? '-' : `${v.toFixed(1)}天`);
  const healthAge =
    Number(health.summary?.age_valid_count) > 0 ? numeric(health.summary?.max_age) : null;
  const healthScope = health.error
    ? `仓库货龄读取失败：${health.error}`
    : health.summary
      ? `健康表 ${health.snapshotDate} · ${health.summary.age_valid_count}/${health.summary.row_count} 条记录，展示仓库最大库龄`
      : '当前无仓库货龄快照';
  const baseRows = bases.map((base) => {
    const s = stats(groups.filter((r: any) => r.base === base)),
      target = s.sum('target'),
      current = s.sum('inventory'),
      demand = s.sum('daily_demand');
    const warning =
      s.sum('target_count') === s.n && s.sum('inventory_count') === s.n
        ? fixedWorkbenchWarning(current, target, demand)
        : { label: '-', tone: 'gray' };
    const age = numeric(health.rows?.find((r: any) => r.belong_base === base)?.max_age);
    return {
      id: base,
      level: base,
      warning: warning.label,
      warningTone: warning.tone,
      current: show(s, 'inventory'),
      target: show(s, 'target'),
      gap: s.gap === null ? '-' : displayNumber(s.gap),
      currentTurnover: days(s.turn),
      targetTurnover: days(s.targetTurn),
      dailyDemand: show(s, 'daily_demand'),
      last30d: s.sum('stock_avg_30d_sale_valid_count')
        ? displayDailyMovement(s.sum('stock_avg_30d_sale_valid'))
        : '-',
      age: days(age),
      orderFillRate:
        business.orderByBase[base]?.rate == null
          ? '-'
          : `${(business.orderByBase[base].rate! * 100).toFixed(1)}%`,
      orderQuantity: '-',
      shortageQuantity: '-',
      allocatedQuantity: '-',
      skuCount: displayNumber(s.n),
    };
  });
  // Insight ranking only uses base/category totals when pending and batch facts
  // are unavailable. Strict sums preserve the same null propagation as SKU rows.
  const insight = buildInventoryInsight({
    skus: groups.map((r: any) => ({
      base: r.base,
      category: r.category ?? '未分类',
      sku: JSON.stringify([r.base, r.category]),
      current: r.inventory_complete,
      target: r.target_complete,
      dailyDemand: r.daily_demand_complete,
      last30d: null,
    })),
    pending: null,
    age: null,
    bases,
    shortage: null,
    fulfillment: business.order.rate,
    stale: Date.now() - Date.parse(day) > 48 * 60 * 60 * 1000,
  });
  const overall = insight.text.replace(
    '数据边界：',
    `数据边界：库存快照${day}，目标月份${scope.targetMonthLabel}、版本${scope.versionLabel}；差额覆盖${all.gapCount}/${all.n}个基地SKU，周转覆盖${all.turnCount}/${all.n}个基地SKU，均只比较同一匹配范围；`,
  );
  const orderCard = currentOrderCard([], bases);
  orderCard.helpers = [
    {
      label: '快照未备单订单',
      value: all.sum('ordered_valid_count')
        ? `${show(all, 'ordered', true)}（${all.sum('ordered_valid_count')}/${all.n} SKU）`
        : '-',
    },
    {
      label: '快照已备单占用',
      value: all.sum('allocated_valid_count')
        ? `${show(all, 'allocated', true)}（${all.sum('allocated_valid_count')}/${all.n} SKU）`
        : '-',
    },
  ];
  const cards = [
    {
      title: '当前库存',
      value: show(all, 'inventory'),
      coverage: `库存 ${all.sum('inventory_count')}/${all.n} · 目标 ${all.sum('target_count')}/${all.n} · 差额 ${all.gapCount}/${all.n} 个基地SKU`,
      helpers: [
        { label: '目标库存', value: show(all, 'target') },
        { label: '库存差额', value: all.gap === null ? '-' : displayNumber(all.gap) },
      ],
      tone: 'neutral',
    },
    {
      title: '周转天数',
      value: days(all.turn),
      coverage: `同范围 ${all.turnCount}/${all.n} 个基地SKU · ${scope.versionLabel}需求`,
      helpers: [
        { label: '目标周转天数', value: days(all.targetTurn) },
        {
          label: '天数差额',
          value: days(
            all.turn !== null && all.targetTurn !== null ? all.turn - all.targetTurn : null,
          ),
        },
      ],
      tone: 'neutral',
    },
    {
      title: '最大库龄',
      value: days(healthAge),
      coverage: `${healthScope}；下列超60天数量仍取日库存快照`,
      helpers: [
        {
          label: '超60天SKU',
          value: all.sum('over60_valid_count') ? displayNumber(all.sum('over60_skus')) : '-',
        },
        { label: '超60天库存', value: show(all, 'over60', true) },
      ],
      tone: 'neutral',
    },
    {
      title: '订单满足率',
      value: business.order.rate === null ? '-' : `${(business.order.rate * 100).toFixed(1)}%`,
      coverage: '本月基地履约 · 非当前待发',
      helpers,
      tone: 'neutral',
    },
    {
      ...orderCard,
      coverage: '订单辅助项取日库存快照，未备单与占用分别展示，当前待发总量仍未知。',
    },
  ];
  const workspace = unavailableWorkspace();
  Object.assign(workspace, {
    title: `${scope.targetMonthLabel}安全库存工作台`,
    description: `日库存与目标月份独立读取；库存覆盖${all.sum('inventory_count')}/${all.n}个基地SKU，目标覆盖${all.sum('target_count')}/${all.n}个基地SKU。${scope.selectionRule}`,
    assistantBrief: `已加载安全库存基地汇总（${scope.targetMonthLabel} ${scope.versionLabel}）。`,
    metric: '库存经营监控',
    filters: {
      base: '全部基地',
      month: scope.targetMonthLabel,
      sku: '全部SKU',
      label: '全部标签',
      version: scope.versionLabel,
    },
    kpis: cards.map((c) => ({
      label: c.title,
      value: c.value,
      delta: c.coverage,
      tone: 'neutral',
    })),
    chartData: bases.flatMap((base) => {
      const s = stats(groups.filter((r: any) => r.base === base));
      return s.sum('target_count') ? [{ label: base, value: s.sum('target') }] : [];
    }),
    insights: [overall],
    versionSummary: {
      currentVersion: scope.versionLabel,
      targetMonth: scope.targetMonthLabel,
      planScope: scope.selectionRule,
      usage: '安全库存工作台',
      status: scope.fallbackUsed ? '使用备选版本' : '只读',
    },
    table: {
      columns: sourceColumns(FIXED_WORKBENCH_COLUMNS).map((c) =>
        c.key === 'age' ? { ...c, label: '最大库龄/天' } : c,
      ),
      rows: baseRows,
    },
    presentation: 'fixed_workbench',
    workbench: {
      status: 'ready',
      statusDescription: `工作台默认展示最新已发布数据：${scope.targetMonthLabel}，优先使用${scope.versionLabel}。`,
      overallAnalysis: overall,
      currentOrders: [],
      cards,
      inventoryInsight: {
        ...insight,
        sources: {
          consumerCode: 'base-safety-stock',
          bases,
          targetMonth: scope.targetMonth,
          targetVersions: scope.versions,
          targetSnapshots: [],
          inventorySnapshots: [day],
          orderSnapshots: [],
        },
      },
    },
  });
  const complete = all.sum('target_count') === all.n && all.sum('inventory_count') === all.n;
  Object.assign(workspace.record, {
    id: 'sql-initial-dashboard',
    month: scope.targetMonthLabel,
    version: scope.versionLabel,
    safetyStock: all.sum('safety_stock'),
    targetStock: all.sum('target'),
    confirmedTargetStock: all.sum('target'),
    currentInventory: all.sum('inventory'),
    dailyDemand: all.sum('daily_demand'),
    turnoverDays:
      complete && all.sum('daily_demand_count') === all.n && all.sum('daily_demand') > 0
        ? all.sum('inventory') / all.sum('daily_demand')
        : 0,
    targetFillRate:
      complete && all.sum('target') > 0
        ? `${((all.sum('inventory') / all.sum('target')) * 100).toFixed(1)}%`
        : '-',
    status: complete
      ? all.gap! < 0
        ? '低于目标库存'
        : all.gap! > 0
          ? '高于目标库存'
          : '与目标库存持平'
      : '-',
    riskLevel: complete && all.gap !== null ? (all.gap < 0 ? 'critical' : 'healthy') : 'unknown',
    gapToConfirmedTarget: complete ? (all.gap ?? 0) : 0,
    remark: workspace.description,
  });
  workspace.surface = [
    { type: 'fixed-workbench', title: workspace.title },
    { type: 'kpi-grid', items: workspace.kpis },
    { type: 'overall-analysis', text: overall },
    { type: 'table-panel', title: '全国基地库存经营监控', table: workspace.table },
  ];
  return workspace;
}
