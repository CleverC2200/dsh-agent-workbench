import { Decimal } from 'decimal.js';
import {
  SALES_PLAN_ROLES,
  salesPlanWorkflow,
  type SalesPlanWorkflowRow,
  type SalesPlanRole,
} from '../../../salesPlanWorkflow.ts';
import type { GeaSalesPlanSku } from '../../../contracts.ts';

const Exact = Decimal.clone({ precision: 60, rounding: Decimal.ROUND_HALF_UP });
/** 纠偏量使用高精度十进制；缺失字段表示继承，显式 0 表示用户确实选择了零。 */
export type CorrectionNode = Exclude<SalesPlanRole, 'customer'>;
export type CorrectionFields = Partial<
  Record<
    | `${CorrectionNode}${'AdjAddQty' | 'AdjCutQty' | 'AdjAddAmount' | 'AdjCutAmount' | 'ConfirmedQty' | 'ConfirmedAmount'}`
    | 'adjAddQty'
    | 'adjCutQty'
    | 'adjAddAmount'
    | 'adjCutAmount',
    string | null
  >
>;
export type CorrectionSku = Pick<GeaSalesPlanSku, 'qty' | 'price'> & CorrectionFields;
export function correctionDecimal(value: unknown): Decimal {
  if (typeof value !== 'string' || !/^[+-]?\d+(?:\.\d+)?$/.test(value))
    throw new Error('纠偏数据缺失或格式错误');
  return new Exact(value);
}

/** NULL 表示继承；显式的一对零表示已记录的真实决策。 */
export function correctionNodeQuantities(
  sku: CorrectionSku,
  status: number,
  typeCode: string,
  includeCurrent = true,
  workflowRows?: readonly SalesPlanWorkflowRow[],
  selectedRole?: CorrectionNode,
): { addQty: string; cutQty: string } {
  const flow = salesPlanWorkflow(typeCode, workflowRows);
  const roles = selectedRole
    ? SALES_PLAN_ROLES.slice(0, SALES_PLAN_ROLES.indexOf(selectedRole) + 1)
        .toReversed()
        .filter((role) => role === selectedRole || flow.pending(role) !== undefined)
    : flow.confirmationRoles(status);
  const selected = includeCurrent ? roles : roles.slice(1);
  const value = (suffix: 'AdjAddQty' | 'AdjCutQty') => {
    for (const role of selected) {
      const candidate =
        role === 'customer'
          ? sku[suffix === 'AdjAddQty' ? 'adjAddQty' : 'adjCutQty']
          : sku[`${role}${suffix}`];
      if (candidate != null) {
        const quantity = correctionDecimal(candidate);
        if (quantity.isNegative()) throw new Error('纠偏追加与追减数量不可为负');
        return quantity;
      }
    }
    return correctionDecimal('0');
  };
  return { addQty: value('AdjAddQty').toFixed(), cutQty: value('AdjCutQty').toFixed() };
}
export function correctionDecision(
  sku: CorrectionSku,
  status: number,
  typeCode: string,
  includeCurrent = true,
  workflowRows?: readonly SalesPlanWorkflowRow[],
  selectedRole?: CorrectionNode,
): string {
  const value = correctionNodeQuantities(
    sku,
    status,
    typeCode,
    includeCurrent,
    workflowRows,
    selectedRole,
  );
  return correctionDecimal(value.addQty).minus(value.cutQty).toFixed();
}
export function correctionLine(
  sku: Pick<GeaSalesPlanSku, 'qty' | 'price' | 'amt' | 'corrBaseQty'>,
  input: string,
) {
  if (!/^[+-]?\d{1,15}(?:\.\d{1,3})?$/.test(input)) throw new Error('调整量最多三位小数');
  const base = correctionDecimal(sku.qty),
    price = correctionDecimal(sku.price),
    delta = correctionDecimal(input);
  const qty = base.plus(delta);
  const addQty = delta.isNegative() ? correctionDecimal('0') : delta;
  const cutQty = delta.isNegative() ? delta.negated() : correctionDecimal('0');
  const addAmount = addQty.times(price).toFixed(2);
  const cutAmount = cutQty.times(price).toFixed(2);
  if (base.isNegative() || price.isNegative() || qty.isNegative())
    throw new Error('纠偏后计划数量不可为负');
  if (qty.gte('1000000000000000')) throw new Error('纠偏后计划数量超出范围');
  return {
    baseQty: base.toFixed(),
    qty: qty.toFixed(),
    amount: correctionDecimal(sku.amt).plus(addAmount).minus(cutAmount).toFixed(2),
    delta: delta.toFixed(),
    deltaAmount: delta.times(price).toFixed(2),
    addQty: addQty.toFixed(),
    cutQty: cutQty.toFixed(),
    addAmount,
    cutAmount,
    participates: !base.isZero() || !delta.isZero(),
  };
}
export function correctionDisplay(value: string | null | undefined, kind: 'money' | 'quantity') {
  try {
    const number = correctionDecimal(value);
    const sign = number.isNegative() && !number.isZero() ? '−' : '';
    const absolute = number.abs();
    const large = absolute.gte(10000);
    const group = (raw: string) => raw.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const numeric = large ? absolute.div(10000).toFixed(2) + '万' : group(absolute.toFixed());
    return {
      display: kind === 'money' ? `${sign}¥${numeric}` : `${sign}${numeric}件`,
      exact:
        kind === 'money'
          ? `${sign}¥${group(absolute.toFixed(2))}`
          : `${sign}${group(absolute.toFixed(3))}件`,
    };
  } catch {
    return { display: '—', exact: '—' };
  }
}
