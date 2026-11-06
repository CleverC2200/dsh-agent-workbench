import type { GeaSalesPlanSku } from '../../../bridge.ts';
import type { ApprovalStageId } from '../salesPlanDomain.ts';
import type { RegionalApprovalLiveRow } from '../regionalApprovalQueryModel.ts';
import { salesPlanEditableQuantity } from './salesPlanQuantityModel.ts';

export type GroupAllocationSource = {
  plan: RegionalApprovalLiveRow;
  skus: readonly GeaSalesPlanSku[];
};

const units = (value: string) => {
  if (!/^\d{1,15}(?:\.\d{1,3})?$/.test(value)) throw new Error('INVALID_GROUP_QUANTITY');
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, '0'));
};

export function allocateGroupSkuQuantity(
  sources: readonly GroupAllocationSource[],
  skuCode: string,
  total: string,
  role?: ApprovalStageId,
): Record<string, Record<string, string>> {
  const target = units(total);
  const members = sources
    .flatMap(({ plan, skus }) => {
      const sku = skus.find((item) => String(item.skuCode) === skuCode);
      return sku
        ? [
            {
              planId: plan.planId,
              weight: units(
                salesPlanEditableQuantity(sku, plan.status, plan.planTypeCode, role) ??
                  String(sku.qty),
              ),
            },
          ]
        : [];
    })
    .toSorted((a, b) => a.planId.localeCompare(b.planId));
  if (!members.length || new Set(members.map((item) => item.planId)).size !== members.length)
    throw new Error('INVALID_GROUP_MEMBERS');
  const originalWeight = members.reduce((sum, item) => sum + item.weight, 0n);
  const weights = members.map((item) => (originalWeight === 0n ? 1n : item.weight));
  const weightSum = weights.reduce((sum, value) => sum + value, 0n);
  return Object.fromEntries(
    members.map((item, index) => [
      item.planId,
      { [skuCode]: String((target * weights[index] + weightSum * 500n) / (weightSum * 1000n)) },
    ]),
  );
}
