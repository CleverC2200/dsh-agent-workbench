import type {
  GeaSalesPlanListItem,
  GeaSalesPlanPage,
  GeaSalesPlanSku,
} from '../../../contracts.ts';
import type { WorkbenchHost } from '../../../bridge.ts';
import { multiplyExactDecimals } from '../regionalApprovalQueryModel.ts';
import { roundPlanQuantity } from './salesPlanQuantityModel.ts';

export const SALES_PLAN_MONTHLY_REPORT_HEADERS = [
  '分级',
  '所属基地',
  '库存组织',
  '大区',
  '省区',
  '区域名称',
  '客户类型',
  '客户组名称',
  '客户编码',
  '客户名称',
  '产品大类',
  '产品档次',
  '物料组编码',
  '物料组名称',
  '产品编码',
  '产品名称',
  '状态',
  '纠偏状态',
  '月份',
  '月初计划',
  '纠偏计划',
  '共识计划',
  '纠偏后计划',
  '月初计划额',
  '纠偏后计划额',
] as const;

export type SalesPlanMonthlyReportSource = {
  plan: GeaSalesPlanListItem;
  skus: readonly GeaSalesPlanSku[];
};

export type SalesPlanReportMonthSource = SalesPlanMonthlyReportSource & { month: string };

export type SalesPlanMonthlyReportFacts = {
  grading: string | null;
  inventoryOrganization: string | null;
  customerType: string | null;
  customerGroup: string | null;
  productGrade: string | null;
  materialGroupCode: string | null;
  materialGroupName: string | null;
  correctionPlanQty?: string | null;
  consensusPlanQty?: string | null;
  correctedPlanQty?: string | null;
};

export type SalesPlanMonthlyReportRow = readonly (string | number)[];
export type SalesPlanMonthlyReportFactsReader = (
  dealerCode: string,
  skuCode: string,
) => SalesPlanMonthlyReportFacts | undefined;

export class SalesPlanMonthlyReportError extends Error {
  constructor(
    readonly code: string,
    readonly columns: readonly string[] = [],
  ) {
    super(columns.length ? `${code}: ${columns.join('、')}` : code);
    this.name = 'SalesPlanMonthlyReportError';
  }
}

async function readPages<T>(
  read: (pageNo: number) => Promise<GeaSalesPlanPage<T>>,
  signal: AbortSignal,
): Promise<T[]> {
  const records: T[] = [];
  let total: number | undefined;
  let size: number | undefined;
  for (let pageNo = 1; ; pageNo++) {
    signal.throwIfAborted();
    const page = await read(pageNo);
    signal.throwIfAborted();
    if (
      !Array.isArray(page.records) ||
      !Number.isSafeInteger(page.total) ||
      page.total < 0 ||
      !Number.isSafeInteger(page.size) ||
      page.size < 1 ||
      page.current !== pageNo ||
      (total !== undefined && page.total !== total) ||
      (size !== undefined && page.size !== size) ||
      (page.pages !== Math.ceil(page.total / page.size) &&
        !(page.total === 0 && page.pages === 1)) ||
      page.records.length !== Math.min(page.size, page.total - records.length)
    )
      throw new SalesPlanMonthlyReportError('INCOMPLETE_REPORT_PAGE');
    total = page.total;
    size = page.size;
    records.push(...page.records);
    if (records.length === total) return records;
  }
}

const planSnapshot = (plan: GeaSalesPlanListItem | undefined) =>
  plan &&
  JSON.stringify([
    plan.planId,
    plan.versionId,
    plan.periodId,
    plan.seq,
    plan.planTypeCode,
    plan.orderType,
    plan.dealerCode,
    plan.dealerName,
    plan.status,
    plan.skuCount,
    plan.currentQty,
    plan.currentAmount,
    plan.updatedAt,
    plan.baseName,
    plan.areaCode,
    plan.areaName,
    plan.provinceCode,
    plan.provinceName,
    plan.orgCode,
    plan.orgName,
  ]);

type ReportClient = Pick<WorkbenchHost['salesPlan'], 'periods' | 'list' | 'versionSkus'>;

export async function readSalesPlanMonthlyReportSources(
  client: ReportClient,
  { month, signal }: { month: string; signal: AbortSignal },
): Promise<SalesPlanReportMonthSource[]> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    throw new SalesPlanMonthlyReportError('INVALID_REPORT_MONTH');
  return readSalesPlanReportSources(client, { month, signal });
}

export function readAllSalesPlanMonthlyReportSources(
  client: ReportClient,
  { signal }: { signal: AbortSignal },
): Promise<SalesPlanReportMonthSource[]> {
  return readSalesPlanReportSources(client, { signal });
}

async function readSalesPlanReportSources(
  client: ReportClient,
  { month, signal }: { month?: string; signal: AbortSignal },
): Promise<SalesPlanReportMonthSource[]> {
  const cancellation = new AbortController();
  const active = AbortSignal.any([signal, cancellation.signal]);
  const scan = async () => {
    const periods = await readPages(
      (pageNo) =>
        client.periods.invoke({
          ...(month ? { periodMonth: month } : {}),
          pageNo,
          pageSize: 200,
          signal: active,
        }),
      active,
    );
    const periodMonths = new Map<string, string>();
    for (const period of periods) {
      if (
        !/^\d{4}-(0[1-9]|1[0-2])$/.test(period.periodMonth) ||
        (month !== undefined && period.periodMonth !== month) ||
        !period.periodId ||
        periodMonths.has(period.periodId)
      )
        throw new SalesPlanMonthlyReportError('INVALID_REPORT_PERIOD');
      periodMonths.set(period.periodId, period.periodMonth);
    }
    const plans = new Map<string, GeaSalesPlanListItem>();
    const versions = new Set<string>();
    for (const periodId of periodMonths.keys()) {
      for (const orderType of ['M', 'Z'] as const) {
        const page = await readPages(
          (pageNo) =>
            client.list.invoke({ periodId, orderType, pageNo, pageSize: 200, signal: active }),
          active,
        );
        for (const plan of page) {
          if (
            !plan.planId ||
            !plan.versionId ||
            !plan.dealerCode ||
            plan.periodId !== periodId ||
            plan.orderType !== orderType ||
            plans.has(plan.planId) ||
            versions.has(plan.versionId)
          )
            throw new SalesPlanMonthlyReportError('INVALID_REPORT_PLAN_IDENTITY');
          plans.set(plan.planId, { ...plan });
          versions.add(plan.versionId);
        }
      }
    }
    return { periodMonths, plans };
  };
  const before = await scan();
  const plans = [...before.plans.values()];
  const sources: SalesPlanReportMonthSource[] = [];
  let next = 0;
  const workers = Array.from({ length: Math.min(4, plans.length) }, async () => {
    while (next < plans.length) {
      active.throwIfAborted();
      const index = next++;
      const plan = plans[index];
      const skus = await client.versionSkus.invoke({ versionId: plan.versionId, signal: active });
      active.throwIfAborted();
      if (
        !Array.isArray(skus) ||
        !Number.isSafeInteger(plan.skuCount) ||
        plan.skuCount < 0 ||
        skus.length !== plan.skuCount ||
        new Set(skus.map((sku) => sku.id)).size !== skus.length ||
        new Set(skus.map((sku) => sku.skuCode)).size !== skus.length ||
        skus.some((sku) => !sku.id || !sku.skuCode || sku.versionId !== plan.versionId)
      )
        throw new SalesPlanMonthlyReportError('INCOMPLETE_REPORT_SKUS');
      const sourceMonth = before.periodMonths.get(plan.periodId);
      if (!sourceMonth) throw new SalesPlanMonthlyReportError('INVALID_REPORT_PERIOD');
      sources[index] = { month: sourceMonth, plan, skus: skus.map((sku) => ({ ...sku })) };
    }
  });
  try {
    await Promise.all(workers);
  } catch (error) {
    cancellation.abort(error);
    await Promise.allSettled(workers);
    throw error;
  }
  const after = await scan();
  if (
    JSON.stringify([...before.periodMonths].sort()) !==
      JSON.stringify([...after.periodMonths].sort()) ||
    before.plans.size !== after.plans.size ||
    [...before.plans].some(([id, plan]) => planSnapshot(plan) !== planSnapshot(after.plans.get(id)))
  )
    throw new SalesPlanMonthlyReportError('REPORT_VERSION_CHANGED');
  return sources;
}

export function salesPlanAllMonthlyReportRows(
  sources: readonly SalesPlanReportMonthSource[],
  readFacts: (
    month: string,
    dealerCode: string,
    skuCode: string,
  ) => SalesPlanMonthlyReportFacts | undefined,
  statusText: (plan: GeaSalesPlanListItem) => string,
): SalesPlanMonthlyReportRow[] {
  const byMonth = new Map<string, SalesPlanMonthlyReportSource[]>();
  for (const source of sources) {
    const group = byMonth.get(source.month) ?? [];
    group.push(source);
    byMonth.set(source.month, group);
  }
  return [...byMonth]
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([month, items]) =>
      salesPlanMonthlyReportRows(
        month,
        items,
        (dealerCode, skuCode) => readFacts(month, dealerCode, skuCode),
        statusText,
      ),
    );
}

const numeric = (value: unknown, column: string, nonnegative = true): string => {
  if (value === undefined)
    throw new SalesPlanMonthlyReportError('UNCONFIRMED_REPORT_FIELDS', [column]);
  if (
    typeof value !== 'string' ||
    !/^-?\d+(?:\.\d+)?$/.test(value) ||
    (nonnegative && value.startsWith('-') && !/^-0(?:\.0+)?$/.test(value))
  )
    throw new SalesPlanMonthlyReportError('INVALID_REPORT_FIELD', [column]);
  return value;
};

const factQuantity = (value: string | null | undefined, column: string, nonnegative = true) =>
  numeric(value === null ? '0' : value, column, nonnegative);

const text = (value: unknown, column: string): string | 0 => {
  if (value === null) return 0;
  if (typeof value !== 'string')
    throw new SalesPlanMonthlyReportError('UNCONFIRMED_REPORT_FIELDS', [column]);
  return value.trim() ? value : 0;
};

const quantity = (sku: GeaSalesPlanSku): string => {
  const value =
    sku.categoryConfirmedQty ??
    sku.areaConfirmedQty ??
    sku.provinceConfirmedQty ??
    sku.regionConfirmedQty ??
    sku.qty;
  return roundPlanQuantity(numeric(value, '月初计划'));
};

const amount = (qty: string, sku: GeaSalesPlanSku): string => {
  const result = multiplyExactDecimals(qty, numeric(sku.price, '有效版本单价'));
  if (result === undefined) throw new SalesPlanMonthlyReportError('INVALID_REPORT_AMOUNT');
  return result;
};

type Line = { plan: GeaSalesPlanListItem; sku: GeaSalesPlanSku };
type Pair = { monthly?: Line; correction?: Line };

export function salesPlanMonthlyReportRows(
  month: string,
  sources: readonly SalesPlanMonthlyReportSource[],
  readFacts: SalesPlanMonthlyReportFactsReader,
  statusText: (plan: GeaSalesPlanListItem) => string,
): SalesPlanMonthlyReportRow[] {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    throw new SalesPlanMonthlyReportError('INVALID_REPORT_MONTH');
  const pairs = new Map<string, Pair>();
  for (const { plan, skus } of sources) {
    if (
      !plan.dealerCode ||
      !plan.versionId ||
      !plan.planId ||
      !['M', 'Z'].includes(plan.orderType ?? '') ||
      !Number.isSafeInteger(plan.skuCount) ||
      plan.skuCount < 0 ||
      skus.length !== plan.skuCount
    )
      throw new SalesPlanMonthlyReportError('INCOMPLETE_REPORT_SOURCE');
    const codes = new Set<string>();
    for (const sku of skus) {
      if (!sku.id || !sku.skuCode || sku.versionId !== plan.versionId || codes.has(sku.skuCode))
        throw new SalesPlanMonthlyReportError('INVALID_REPORT_SKU_IDENTITY');
      codes.add(sku.skuCode);
      const key = JSON.stringify([plan.dealerCode, sku.skuCode]);
      const pair = pairs.get(key) ?? {};
      const kind = plan.orderType === 'M' ? 'monthly' : 'correction';
      if (pair[kind]) throw new SalesPlanMonthlyReportError('AMBIGUOUS_CUSTOMER_SKU_MONTH');
      pair[kind] = { plan, sku };
      pairs.set(key, pair);
    }
  }
  return [...pairs.values()]
    .map(({ monthly, correction }) => {
      const line = monthly ?? correction;
      if (!line) throw new SalesPlanMonthlyReportError('INCOMPLETE_REPORT_SOURCE');
      const { plan, sku } = line;
      const facts = readFacts(plan.dealerCode!, sku.skuCode);
      if (!facts)
        throw new SalesPlanMonthlyReportError('UNCONFIRMED_REPORT_FIELDS', [
          '分级',
          '库存组织',
          '客户类型',
          '客户组名称',
          '产品档次',
          '物料组编码',
          '物料组名称',
          ...(correction ? ['纠偏计划', '共识计划', '纠偏后计划'] : []),
        ]);
      const monthlyQty = monthly ? quantity(monthly.sku) : '0';
      const correctionQty = correction
        ? factQuantity(facts.correctionPlanQty, '纠偏计划', false)
        : '0';
      const consensusQty = correction
        ? factQuantity(facts.consensusPlanQty, '共识计划', false)
        : '0';
      const correctedQty = correction
        ? factQuantity(facts.correctedPlanQty, '纠偏后计划')
        : monthlyQty;
      return [
        text(facts.grading, '分级'),
        text(plan.baseName, '所属基地'),
        text(facts.inventoryOrganization, '库存组织'),
        text(plan.areaName, '大区'),
        text(plan.provinceName, '省区'),
        text(plan.orgName, '区域名称'),
        text(facts.customerType, '客户类型'),
        text(facts.customerGroup, '客户组名称'),
        plan.dealerCode!,
        text(plan.dealerName, '客户名称'),
        text(sku.productCategName, '产品大类'),
        text(facts.productGrade, '产品档次'),
        text(facts.materialGroupCode, '物料组编码'),
        text(facts.materialGroupName, '物料组名称'),
        sku.skuCode,
        text(sku.materialDescription ?? sku.skuName, '产品名称'),
        monthly ? statusText(monthly.plan) : 0,
        correction ? statusText(correction.plan) : 0,
        month,
        monthlyQty,
        correctionQty,
        consensusQty,
        correctedQty,
        monthly ? amount(monthlyQty, monthly.sku) : '0',
        amount(correctedQty, correction?.sku ?? sku),
      ];
    })
    .toSorted(
      (a, b) =>
        String(a[8]).localeCompare(String(b[8])) || String(a[14]).localeCompare(String(b[14])),
    );
}
