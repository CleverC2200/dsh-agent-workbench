import type {
  GeaSalesPlanDetail,
  GeaSalesPlanResourceQuery,
  GeaSalesPlanVersionSkuQuery,
  GeaSalesPlanSku,
} from '../../../bridge.ts';
import type { ApprovalStageId } from '../salesPlanDomain.ts';
import { subtractExactDecimals } from '../regionalApprovalQueryModel.ts';

export type SalesPlanSkuNodeComparison = {
  previousQty: string;
  previousAmount: string;
  currentQty: string;
  currentAmount: string;
  qtyDelta: string;
  amountDelta: string;
};

const decimalText = (value: unknown, fallback = '0'): string =>
  typeof value === 'string'
    ? value
    : typeof value === 'number' && Number.isFinite(value)
      ? String(value)
      : fallback;

const confirmedAt = (
  sku: GeaSalesPlanSku,
  stage: ApprovalStageId,
): { qty?: unknown; amount?: unknown } => {
  if (stage === 'region') return { qty: sku.regionConfirmedQty, amount: sku.regionConfirmedAmount };
  if (stage === 'province')
    return { qty: sku.provinceConfirmedQty, amount: sku.provinceConfirmedAmount };
  if (stage === 'area') return { qty: sku.areaConfirmedQty, amount: sku.areaConfirmedAmount };
  if (stage === 'category')
    return { qty: sku.categoryConfirmedQty, amount: sku.categoryConfirmedAmount };
  return { qty: sku.qty, amount: sku.amt };
};

const previousStages: Record<ApprovalStageId, readonly ApprovalStageId[]> = {
  customer: [],
  region: ['customer'],
  province: ['region', 'customer'],
  area: ['province', 'region', 'customer'],
  category: ['area', 'province', 'region', 'customer'],
};

export const salesPlanSkuNodeComparison = (
  sku: GeaSalesPlanSku,
  stage: ApprovalStageId,
): SalesPlanSkuNodeComparison => {
  const previous = previousStages[stage]
    .map((candidate) => confirmedAt(sku, candidate))
    .find((value) => value.qty != null && value.amount != null) ?? {
    qty: sku.qty,
    amount: sku.amt,
  };
  const current = confirmedAt(sku, stage);
  const previousQty = decimalText(previous.qty, decimalText(sku.qty));
  const previousAmount = decimalText(previous.amount, decimalText(sku.amt));
  const currentQty = decimalText(current.qty, previousQty);
  const currentAmount = decimalText(current.amount, previousAmount);
  return {
    previousQty,
    previousAmount,
    currentQty,
    currentAmount,
    qtyDelta: subtractExactDecimals(currentQty, previousQty),
    amountDelta: subtractExactDecimals(currentAmount, previousAmount),
  };
};

export const salesPlanSkusMatchVersion = (
  versionId: string,
  skus: readonly GeaSalesPlanSku[],
): boolean => skus.every((sku) => sku.versionId === versionId);

export type SalesPlanDetailClient = {
  detail: { invoke: (query: GeaSalesPlanResourceQuery) => Promise<GeaSalesPlanDetail> };
  versionSkus: { invoke: (query: GeaSalesPlanVersionSkuQuery) => Promise<GeaSalesPlanSku[]> };
};
