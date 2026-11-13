import { correctionConfirmedQuantity } from './salesPlanCorrectionModel.ts';
import type { GeaSalesPlanSku } from '../../../bridge.ts';
import type { ApprovalStageId } from '../salesPlanDomain.ts';
import type { RegionalApprovalLiveRow } from '../regionalApprovalQueryModel.ts';
import {
  addExactDecimals,
  multiplyExactDecimals,
  subtractExactDecimals,
} from '../regionalApprovalQueryModel.ts';
import { salesPlanEditableQuantity, roundPlanQuantity } from './salesPlanQuantityModel.ts';

type GroupSkuSource = {
  plan: RegionalApprovalLiveRow;
  skus: readonly GeaSalesPlanSku[];
};

export type GroupSkuSummaryRow = {
  skuCode: string;
  categoryName: string;
  description: string;
  baseQty: string;
  qty: string;
  baseAmount: string;
  amount: string;
  adjustmentQty: string;
  adjustmentAmount: string;
};

const decimal = (value: string) => /^\d+(?:\.\d+)?$/.test(value);

export const summarizeGroupSkus = (
  sources: readonly GroupSkuSource[],
  approvalRole?: ApprovalStageId,
  pendingValues: Readonly<Record<string, Readonly<Record<string, string>>>> = {},
): GroupSkuSummaryRow[] => {
  const grouped = new Map<
    string,
    {
      categories: Set<string>;
      descriptions: Set<string>;
      baseQty: string[];
      qty: string[];
      baseAmount: string[];
      amount: string[];
      adjustmentQty: string[];
      adjustmentAmount: string[];
    }
  >();
  for (const { plan, skus } of sources) {
    if (skus.length !== plan.skuCount || skus.some((sku) => sku.versionId !== plan.versionId))
      throw new Error('INCOMPLETE_GROUP_SKUS');
    const codes = new Set<string>();
    for (const sku of skus) {
      const code = String(sku.skuCode).trim();
      if (!code || codes.has(code)) throw new Error('INCOMPLETE_GROUP_SKUS');
      codes.add(code);
      const originalQty =
        pendingValues[plan.planId]?.[code] ??
        (plan.orderType === 'Z'
          ? correctionConfirmedQuantity(
              sku,
              plan.status,
              plan.planTypeCode,
              approvalRole === 'customer' ? undefined : approvalRole,
            )
          : salesPlanEditableQuantity(sku, plan.status, plan.planTypeCode, approvalRole)) ??
        String(sku.qty);
      const qty = roundPlanQuantity(originalQty);
      const baseQty = String(plan.orderType === 'Z' ? (sku.corrBaseQty ?? sku.qty) : sku.baseQty);
      const baseAmount = String(plan.orderType === 'Z' ? sku.amt : sku.amtBase);
      const amount = multiplyExactDecimals(qty, String(sku.price));
      if (![qty, baseQty, baseAmount].every(decimal) || amount === undefined)
        throw new Error('INCOMPLETE_GROUP_SKUS');
      const item = grouped.get(code) ?? {
        categories: new Set<string>(),
        descriptions: new Set<string>(),
        baseQty: [],
        qty: [],
        baseAmount: [],
        amount: [],
        adjustmentQty: [],
        adjustmentAmount: [],
      };
      item.categories.add(sku.productCategName.trim() || '其他');
      const description = sku.materialDescription?.trim() || sku.skuName?.trim();
      if (description) item.descriptions.add(description);
      item.baseQty.push(baseQty);
      item.qty.push(qty);
      item.baseAmount.push(baseAmount);
      item.amount.push(amount);
      const adjustment = subtractExactDecimals(qty, baseQty);
      item.adjustmentQty.push(adjustment);
      const adjustmentAmount = multiplyExactDecimals(adjustment, String(sku.price));
      if (adjustmentAmount === undefined) throw new Error('INCOMPLETE_GROUP_SKUS');
      item.adjustmentAmount.push(adjustmentAmount);
      grouped.set(code, item);
    }
  }
  return [...grouped]
    .map(([skuCode, item]) => ({
      skuCode,
      categoryName: [...item.categories].join(' / '),
      description: [...item.descriptions].join(' / '),
      baseQty: addExactDecimals(item.baseQty),
      qty: addExactDecimals(item.qty),
      baseAmount: addExactDecimals(item.baseAmount),
      amount: addExactDecimals(item.amount),
      adjustmentQty: addExactDecimals(item.adjustmentQty),
      adjustmentAmount: addExactDecimals(item.adjustmentAmount),
    }))
    .toSorted(
      (left, right) =>
        left.categoryName.localeCompare(right.categoryName, 'zh-CN') ||
        left.skuCode.localeCompare(right.skuCode),
    );
};
