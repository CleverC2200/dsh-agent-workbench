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
const quantity = (value: bigint) => {
  const fraction = String(value % 1000n)
    .padStart(3, '0')
    .replace(/0+$/, '');
  return `${value / 1000n}${fraction ? `.${fraction}` : ''}`;
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
  const allocated = members.map((item, index) => ({
    ...item,
    quantity: (target * weights[index]) / weightSum,
    remainder: (target * weights[index]) % weightSum,
  }));
  const remaining = target - allocated.reduce((sum, item) => sum + item.quantity, 0n);
  const ranked = allocated.toSorted((a, b) =>
    a.remainder === b.remainder
      ? a.planId.localeCompare(b.planId)
      : a.remainder > b.remainder
        ? -1
        : 1,
  );
  for (let index = 0; BigInt(index) < remaining; index++) ranked[index].quantity += 1n;
  return Object.fromEntries(
    allocated.map((item) => [item.planId, { [skuCode]: quantity(item.quantity) }]),
  );
}
