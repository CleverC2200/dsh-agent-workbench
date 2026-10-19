import { salesPlanActionReceiptMatches } from './salesPlanActionModel.ts';
import { salesPlanAccessForRow } from './salesPlanAccessModel.ts';
import { Decimal } from 'decimal.js';
import { z } from 'zod';
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
export function correctionDecision(
  sku: CorrectionSku,
  status: number,
  typeCode: string,
  includeCurrent = true,
  workflowRows?: readonly SalesPlanWorkflowRow[],
  selectedRole?: CorrectionNode,
): string {
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
  return value('AdjAddQty').minus(value('AdjCutQty')).toFixed();
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

const decisionDecimal = z
  .string()
  .regex(/^[+-]?\d+(?:\.\d+)?$/)
  .nullable();
const correctionLogSchema = z.array(
  z.object({
    skuCode: z.string().min(1),
    adjAddQty: decisionDecimal,
    adjCutQty: decisionDecimal,
    adjAddAmount: decisionDecimal,
    adjCutAmount: decisionDecimal,
    confirmedQty: decisionDecimal,
    confirmedAmount: decisionDecimal,
  }),
);

export function correctionLogDecisions(
  json: unknown,
):
  | { kind: 'missing' }
  | { kind: 'invalid' }
  | { kind: 'available'; decisions: z.infer<typeof correctionLogSchema> } {
  if (json == null) return { kind: 'missing' };
  if (typeof json !== 'string') return { kind: 'invalid' };
  if (!json.trim()) return { kind: 'missing' };
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return { kind: 'invalid' };
  }
  const result = correctionLogSchema.safeParse(value);
  return result.success ? { kind: 'available', decisions: result.data } : { kind: 'invalid' };
}

import type {
  GeaSalesPlanDetail,
  GeaSalesPlanActionRequest,
  GeaSalesPlanActionReceipt,
  GeaSalesPlanListItem,
} from '../../../contracts.ts';

import type { ApprovalStageId } from '../salesPlanDomain.ts';

export function correctionListItem(row: GeaSalesPlanListItem): GeaSalesPlanListItem {
  const monthly = row.orderType !== 'Z';
  const monthlyApproved = row.monthlyApproved ?? (!monthly || row.status >= 10);
  return {
    ...row,
    monthlyApproved,
    hasCorrection: row.hasCorrection ?? !monthly,
    ...(monthly && monthlyApproved
      ? {
          mPlanAmount: row.mPlanAmount === undefined ? row.currentAmount : row.mPlanAmount,
          mPlanQty: row.mPlanQty === undefined ? row.currentQty : row.mPlanQty,
        }
      : {}),
  };
}

export function correctionListSummary(rows: GeaSalesPlanListItem[]) {
  const sum = (values: (string | null | undefined)[]) => {
    try {
      return values
        .reduce<Decimal>((n, value) => n.plus(correctionDecimal(value)), new Exact(0))
        .toFixed();
    } catch {
      return null;
    }
  };
  const targetAmount = sum(rows.map((row) => row.targetAmount));
  const planAmount = sum(
    rows.map((row) =>
      row.monthlyApproved === false
        ? null
        : row.corrPlanAmount === undefined
          ? row.currentAmount
          : row.corrPlanAmount,
    ),
  );
  const planQty = sum(
    rows.map((row) =>
      row.monthlyApproved === false
        ? null
        : row.corrPlanQty === undefined
          ? row.currentQty
          : row.corrPlanQty,
    ),
  );
  return {
    targetAmount: targetAmount ?? '',
    planAmount,
    planQty,
    diffAmount:
      targetAmount != null && planAmount != null
        ? correctionDecimal(planAmount).minus(targetAmount).toFixed()
        : null,
  };
}

export function correctionReadDetail(detail: GeaSalesPlanDetail): GeaSalesPlanDetail {
  if (detail.currentVersion.orderType === 'Z' || detail.correctionContext?.hasCorrection === false)
    return detail;
  if (detail.currentVersion.status < 10) throw new Error('月初计划尚未终审');
  return {
    ...detail,
    skus: detail.skus.map((sku) => ({
      ...sku,
      qty: correctionDecimal(sku.categoryConfirmedQty).toFixed(),
      corrBaseQty: correctionDecimal(sku.categoryConfirmedQty).toFixed(),
      amt: correctionDecimal(sku.categoryConfirmedAmount).toFixed(2),
    })),
  };
}

export function correctionListDetail(
  row: GeaSalesPlanListItem,
  detail: GeaSalesPlanDetail,
): GeaSalesPlanListItem {
  const version = detail.currentVersion;
  if (
    version.id !== row.versionId ||
    version.planId !== row.planId ||
    version.orderType !== 'Z' ||
    !version.effective ||
    (row.skuCount > 0 && detail.skus.length === 0) ||
    detail.skus.some((sku) => sku.versionId !== version.id)
  )
    throw new Error('纠偏版本已变化');
  const sum = (values: string[]) =>
    values.reduce((n, value) => n.plus(correctionDecimal(value)), new Exact(0)).toFixed();
  const deltas = detail.skus.map((sku) =>
    correctionDecimal(correctionDecision(sku, version.status, version.planTypeCode, false)),
  );
  const target = correctionDecimal(row.targetAmount);
  return {
    ...row,
    mPlanQty:
      row.mPlanQty === undefined
        ? sum(detail.skus.map((sku) => sku.corrBaseQty ?? sku.qty))
        : row.mPlanQty,
    mPlanAmount:
      row.mPlanAmount === undefined ? sum(detail.skus.map((sku) => sku.amt)) : row.mPlanAmount,
    prevAdjAddQty:
      row.prevAdjAddQty === undefined
        ? deltas.reduce((n, value) => n.plus(value.gt(0) ? value : 0), new Exact(0)).toFixed()
        : row.prevAdjAddQty,
    prevAdjCutQty:
      row.prevAdjCutQty === undefined
        ? deltas
            .reduce((n, value) => n.plus(value.lt(0) ? value.negated() : 0), new Exact(0))
            .toFixed()
        : row.prevAdjCutQty,
    correctionProgress:
      row.correctionProgress === undefined && target.gt(0)
        ? correctionDecimal(row.currentAmount).div(target).times(100).toFixed(1)
        : row.correctionProgress,
  };
}

export function correctionAccess(
  detail: GeaSalesPlanDetail,
  workflowRows?: readonly SalesPlanWorkflowRow[],
  selectedRole?: CorrectionNode,
  stages: readonly ApprovalStageId[] = [],
) {
  const v = detail.currentVersion;
  const flow = salesPlanWorkflow(v.planTypeCode, workflowRows);
  const actor = flow.actor(v.status);
  const role = selectedRole ?? actor;
  if (
    v.orderType !== 'Z' ||
    !v.effective ||
    detail.correctionContext?.monthlyApproved === false ||
    detail.correctionContext?.approvalOpen === false ||
    !role ||
    role === 'customer' ||
    role !== actor ||
    !stages.includes(role)
  )
    return undefined;
  return salesPlanAccessForRow(
    { planId: v.planId, versionId: v.id, status: v.status, planTypeCode: v.planTypeCode },
    detail,
    stages,
    role,
    workflowRows,
  );
}

/** 构造全部绝对决策，包括未变化的继承值和显式零值。 */
export function correctionAdjustments(
  detail: GeaSalesPlanDetail,
  edits: Record<string, string>,
  workflowRows?: readonly SalesPlanWorkflowRow[],
  selectedRole?: CorrectionNode,
) {
  return detail.skus.flatMap((sku) => {
    const delta =
      edits[sku.skuCode] ??
      (sku.nodeAdjAddQty != null && sku.nodeAdjCutQty != null
        ? correctionDecimal(sku.nodeAdjAddQty).minus(sku.nodeAdjCutQty).toFixed()
        : undefined) ??
      correctionDecision(
        sku,
        detail.currentVersion.status,
        detail.currentVersion.planTypeCode,
        true,
        workflowRows,
        selectedRole,
      );
    const line = correctionLine(sku, delta);
    return [{ skuCode: sku.skuCode, adjustQty: line.delta }];
  });
}

/** 回读同时检查节点数据、状态以及匹配的动作日志。 */
export function verifyCorrectionAction(
  before: GeaSalesPlanDetail,
  after: GeaSalesPlanDetail,
  request: GeaSalesPlanActionRequest,
  receipt: GeaSalesPlanActionReceipt,
): boolean {
  // 读回不仅核对状态，还核对同一版本的 SKU、节点字段和审计日志，避免假成功。
  const v = before.currentVersion,
    a = after.currentVersion;
  const flow = salesPlanWorkflow(v.planTypeCode),
    role = request.approvalRole ?? flow.actor(v.status);
  if (
    !role ||
    role === 'customer' ||
    a.id !== v.id ||
    a.planId !== v.planId ||
    a.seq !== v.seq ||
    !a.effective ||
    a.orderType !== 'Z' ||
    !salesPlanActionReceiptMatches(
      {
        planId: v.planId,
        versionId: v.id,
        planTypeCode: v.planTypeCode,
        request,
        serverRoleResult: request.approvalPolicy === 'role-visible-v1',
      },
      receipt.requestId,
      receipt,
    ) ||
    receipt.planId !== v.planId ||
    receipt.versionId !== v.id ||
    receipt.fromStatus !== v.status ||
    receipt.toStatus !== a.status ||
    !after.logs.some(
      (l) =>
        l.requestId === receipt.requestId &&
        l.versionId === v.id &&
        l.planId === v.planId &&
        l.actionCode === request.action &&
        l.fromStatus === v.status &&
        l.toStatus === a.status &&
        `sales-plan-log:${l.id}` === receipt.auditId,
    )
  )
    return false;
  const decisions = new Map((request.adjustments ?? []).map((x) => [x.skuCode, x.adjustQty]));
  if (
    new Set(after.skus.map((x) => x.skuCode)).size !== after.skus.length ||
    after.skus.some(
      (x) => x.versionId !== v.id || !before.skus.some((s) => s.skuCode === x.skuCode),
    )
  )
    return false;
  const equal = (x: unknown, y: unknown) => {
    try {
      return correctionDecimal(x).eq(correctionDecimal(y));
    } catch {
      return x == null && y == null;
    }
  };
  return before.skus.every((sku) => {
    const saved = after.skus.find((x) => x.skuCode === sku.skuCode);
    const delta = decisions.get(sku.skuCode);
    if (
      !saved ||
      !equal(saved.qty, sku.qty) ||
      !equal(saved.price, sku.price) ||
      !equal(saved.amt, sku.amt) ||
      !equal(saved.corrBaseQty, sku.corrBaseQty) ||
      !equal(saved.adjAddQty, sku.adjAddQty) ||
      !equal(saved.adjCutQty, sku.adjCutQty) ||
      !equal(saved.adjAddAmount, sku.adjAddAmount) ||
      !equal(saved.adjCutAmount, sku.adjCutAmount)
    )
      return false;
    for (const other of ['region', 'province', 'area', 'category'] as const) {
      for (const suffix of [
        'AdjAddQty',
        'AdjCutQty',
        'AdjAddAmount',
        'AdjCutAmount',
        'ConfirmedQty',
        'ConfirmedAmount',
      ] as const) {
        if (other !== role || (request.action === 'SAVE' && suffix.startsWith('Confirmed'))) {
          if (!equal(saved[`${other}${suffix}`], sku[`${other}${suffix}`])) return false;
        }
      }
    }
    if (request.action === 'REJECT')
      return [
        'AdjAddQty',
        'AdjCutQty',
        'AdjAddAmount',
        'AdjCutAmount',
        'ConfirmedQty',
        'ConfirmedAmount',
      ].every((s) => saved[`${role}${s}` as keyof GeaSalesPlanSku] == null);
    if (delta == null) return false;
    const expected = correctionLine(sku, delta);
    if (
      !expected.participates &&
      sku[`${role}AdjAddQty`] == null &&
      sku[`${role}AdjCutQty`] == null
    )
      return [
        'AdjAddQty',
        'AdjCutQty',
        'AdjAddAmount',
        'AdjCutAmount',
        'ConfirmedQty',
        'ConfirmedAmount',
      ].every((suffix) =>
        equal(
          saved[`${role}${suffix}` as keyof GeaSalesPlanSku],
          sku[`${role}${suffix}` as keyof GeaSalesPlanSku],
        ),
      );
    return (
      equal(saved[`${role}AdjAddQty`], expected.addQty) &&
      equal(saved[`${role}AdjCutQty`], expected.cutQty) &&
      ((request.adjustmentMode !== 'ABSOLUTE_NET' && saved[`${role}AdjAddAmount`] === undefined) ||
        equal(saved[`${role}AdjAddAmount`], expected.addAmount)) &&
      ((request.adjustmentMode !== 'ABSOLUTE_NET' && saved[`${role}AdjCutAmount`] === undefined) ||
        equal(saved[`${role}AdjCutAmount`], expected.cutAmount)) &&
      (request.action === 'SAVE' ||
        (equal(saved[`${role}ConfirmedQty`], expected.qty) &&
          equal(saved[`${role}ConfirmedAmount`], expected.amount)))
    );
  });
}
