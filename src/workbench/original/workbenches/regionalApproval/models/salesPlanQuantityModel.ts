import { SALES_PLAN_ROLES, salesPlanWorkflow } from '../../../salesPlanWorkflow.ts';
import type { GeaSalesPlanSku } from '../../../bridge.ts';
import type { ApprovalStageId } from '../salesPlanDomain.ts';

export const salesPlanEditableQuantity = (
  sku: GeaSalesPlanSku,
  status: number,
  typeCode = 'Y',
  role?: ApprovalStageId,
): string | undefined => {
  const fields = {
    customer: 'qty',
    region: 'regionConfirmedQty',
    province: 'provinceConfirmedQty',
    area: 'areaConfirmedQty',
    category: 'categoryConfirmedQty',
  } as const;
  const flow = salesPlanWorkflow(typeCode);
  const roles = role
    ? SALES_PLAN_ROLES.slice(0, SALES_PLAN_ROLES.indexOf(role) + 1)
        .toReversed()
        .filter((r) => r === role || flow.pending(r) !== undefined)
    : flow.confirmationRoles(status);
  for (const candidate of roles) {
    const value = sku[fields[candidate]];
    if (value !== null && value !== undefined) return String(value);
  }
  return undefined;
};

export const roundPlanQuantity = (value: string): string => {
  const match = value.trim().match(/^([+-]?)(\d+)(?:\.(\d+))?$/);
  if (!match) return value;
  const rounded = BigInt(match[2]) + ((match[3]?.[0] ?? '0') >= '5' ? 1n : 0n);
  return `${match[1] === '-' && rounded !== 0n ? '-' : ''}${rounded}`;
};

export const salesPlanDecimalValue = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  const match = text.match(/^([+-]?)(\d+)(?:\.(\d+))?$/);
  if (!match) return text;
  const integer = match[2].replace(/^0+(?=\d)/, '');
  const fraction = (match[3] ?? '').replace(/0+$/, '');
  const sign = match[1] === '-' && (integer !== '0' || fraction) ? '-' : '';
  return `${sign}${integer}${fraction ? `.${fraction}` : ''}`;
};
