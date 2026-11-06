import type { GeaSalesPlanSku, GeaSalesPlanSkuReview } from '../../../bridge.ts';
import type { RegionalApprovalLiveRow } from '../regionalApprovalQueryModel.ts';
import { addExactDecimals, multiplyExactDecimals } from '../regionalApprovalQueryModel.ts';
import { salesPlanEditableQuantity, roundPlanQuantity } from './salesPlanQuantityModel.ts';
import type { ApprovalStageId } from '../salesPlanDomain.ts';

export const skuReviewMonths = (month: string): [string, string, string] => {
  const [year, number] = month.split('-').map(Number);
  const shift = (offset: number) => {
    const date = new Date(Date.UTC(year, number - 1 + offset, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  };
  return [shift(-12), shift(-2), shift(-1)];
};

export type SkuReviewSource = {
  plan: RegionalApprovalLiveRow;
  skus: readonly GeaSalesPlanSku[];
  metrics: GeaSalesPlanSkuReview;
};

export type SkuReviewRow = {
  skuCode: string;
  category: string;
  description: string;
  planQty: string;
  planAmount: string;
  confirmedQty: string;
  confirmedAmount: string;
  budgetAmount: string;
  shipments: [string | null, string | null, string | null];
};

const nullableSum = (values: readonly (string | null)[]) =>
  values.some((value) => value === null)
    ? null
    : addExactDecimals(values.filter((value) => value !== null));

export function skuReviewTotal(
  rows: readonly SkuReviewRow[],
): Omit<SkuReviewRow, 'skuCode' | 'category' | 'description'> {
  return {
    planQty: addExactDecimals(rows.map((row) => row.planQty)),
    planAmount: addExactDecimals(rows.map((row) => row.planAmount)),
    confirmedQty: addExactDecimals(rows.map((row) => row.confirmedQty)),
    confirmedAmount: addExactDecimals(rows.map((row) => row.confirmedAmount)),
    budgetAmount: addExactDecimals(rows.map((row) => row.budgetAmount)),
    shipments: [
      nullableSum(rows.map((row) => row.shipments[0])),
      nullableSum(rows.map((row) => row.shipments[1])),
      nullableSum(rows.map((row) => row.shipments[2])),
    ],
  };
}

export function summarizeSkuReview(
  sources: readonly SkuReviewSource[],
  role?: ApprovalStageId,
  pendingValues: Readonly<Record<string, Readonly<Record<string, string>>>> = {},
): SkuReviewRow[] {
  const bySku = new Map<string, SkuReviewRow[]>();
  const versions = new Set<string>();
  const facts = new Set<string>();
  for (const { plan, skus, metrics } of sources) {
    if (
      versions.has(plan.versionId) ||
      skus.length !== plan.skuCount ||
      metrics.versionId !== plan.versionId ||
      skus.some((sku) => sku.versionId !== plan.versionId)
    )
      throw new Error('INCOMPLETE_SKU_REVIEW');
    versions.add(plan.versionId);
    const codes = new Set<string>();
    for (const sku of skus) {
      const code = String(sku.skuCode);
      if (codes.has(code)) throw new Error('DUPLICATE_SKU_REVIEW');
      codes.add(code);
      const metric = metrics.rows.find((row) => row.skuCode === code);
      if (!metric) throw new Error('INCOMPLETE_SKU_REVIEW');
      const factKey = `${plan.dealerCode}\u0000${code}`;
      if (!plan.dealerCode) throw new Error('INCOMPLETE_CUSTOMER_SKU_REVIEW');
      const duplicateFact = facts.has(factKey);
      facts.add(factKey);
      const confirmedQty = roundPlanQuantity(
        pendingValues[plan.planId]?.[code] ??
          salesPlanEditableQuantity(sku, plan.status, plan.planTypeCode, role) ??
          sku.qty,
      );
      const confirmedAmount = multiplyExactDecimals(confirmedQty, sku.price);
      if (confirmedAmount === undefined) throw new Error('INVALID_SKU_REVIEW');
      const row: SkuReviewRow = {
        skuCode: code,
        category: sku.productCategName.trim() || '其他',
        description: sku.materialDescription || sku.skuName || '',
        planQty: sku.baseQty,
        planAmount: sku.amtBase,
        confirmedQty,
        confirmedAmount,
        budgetAmount: sku.amt,
        shipments: duplicateFact ? ['0', '0', '0'] : metric.shipments,
      };
      bySku.set(code, [...(bySku.get(code) ?? []), row]);
    }
  }
  return [...bySku]
    .map(([skuCode, rows]) => {
      if (new Set(rows.map((row) => row.category)).size !== 1)
        throw new Error('CONFLICTING_SKU_CATEGORY');
      return { ...rows[0], ...skuReviewTotal(rows), skuCode };
    })
    .toSorted(
      (a, b) => a.category.localeCompare(b.category, 'zh-CN') || a.skuCode.localeCompare(b.skuCode),
    );
}
