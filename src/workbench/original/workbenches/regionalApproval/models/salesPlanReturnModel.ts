import type {
  GeaSalesPlanDetail,
  GeaSalesPlanListItem,
  GeaSalesPlanSkuAdjustment,
  GeaSalesPlanActionRequest,
  GeaSalesPlanActionReceipt,
} from '../../../bridge.ts';
import type { ApprovalStageId } from '../salesPlanDomain.ts';
import { SALES_PLAN_ROLES } from '../../../salesPlanWorkflow.ts';
import { addExactDecimals, subtractExactDecimals } from '../regionalApprovalQueryModel.ts';
import { salesPlanEditableQuantity, roundPlanQuantity } from './salesPlanQuantityModel.ts';
import { correctionDecimal } from './salesPlanCorrectionModel.ts';

const quantity = /^\d{1,15}(?:\.\d{1,3})?$/;
const receiverQuantity = (sku: GeaSalesPlanDetail['skus'][number], stage: number) => {
  const values = [sku.qty, sku.regionConfirmedQty, sku.provinceConfirmedQty, sku.areaConfirmedQty];
  for (let index = stage - 1; index >= 0; index--)
    if (values[index] != null) return String(values[index]);
  throw new Error('接收节点缺少确认数量，请刷新后核对');
};

export type SalesPlanReturnDestination = {
  versionId: string;
  status: number;
  currentStage: number;
  targetStage: number;
  targetStatus: number;
};

export function salesPlanReturnDestination(
  detail: GeaSalesPlanDetail,
  role: ApprovalStageId,
): SalesPlanReturnDestination {
  const version = detail.currentVersion;
  const currentStage = SALES_PLAN_ROLES.indexOf(role) + 1;
  if (!version.effective || currentStage < 2)
    throw new Error('退回节点或计划版本已变化，请刷新后重试');
  const forward = Number.isInteger(version.status) && version.status >= 1 && version.status <= 4;
  if (
    forward
      ? version.status >= currentStage
      : version.status < 7 || version.status > 9 || version.status !== currentStage + 5
  )
    throw new Error('退回节点或计划版本已变化，请刷新后重试');
  const targets = new Set<number>();
  if (forward) targets.add(version.status);
  else {
    if (currentStage === 2) targets.add(1);
    for (const log of detail.logs ?? []) {
      if (log.versionId !== version.id || log.planId !== version.planId) continue;
      if (
        log.actionCode === 'APPROVE' &&
        log.toStatus === currentStage &&
        log.fromStatus != null &&
        log.fromStatus >= 1 &&
        log.fromStatus < currentStage
      )
        targets.add(log.fromStatus);
      if (
        log.actionCode === 'REJECT' &&
        log.fromStatus === currentStage + 5 &&
        log.toStatus >= 6 &&
        log.toStatus < currentStage + 5
      )
        targets.add(log.toStatus - 5);
    }
  }
  const [targetStage] = targets;
  if (
    targets.size !== 1 ||
    !Number.isInteger(targetStage) ||
    targetStage < 1 ||
    targetStage >= currentStage
  )
    throw new Error('计划详情缺少一致的实际退回节点，请刷新或联系管理员核对审批链');
  return {
    versionId: version.id,
    status: version.status,
    currentStage,
    targetStage,
    targetStatus: targetStage + 5,
  };
}

export function salesPlanReturnAdjustments(
  detail: GeaSalesPlanDetail,
  row: Pick<GeaSalesPlanListItem, 'planId' | 'versionId' | 'status' | 'planTypeCode' | 'orderType'>,
  role: ApprovalStageId,
  context: SalesPlanReturnDestination,
  stored: readonly GeaSalesPlanSkuAdjustment[] = [],
  pending: Readonly<Record<string, string>> = {},
): GeaSalesPlanSkuAdjustment[] {
  if (
    context.versionId !== row.versionId ||
    context.status !== row.status ||
    context.currentStage !== SALES_PLAN_ROLES.indexOf(role) + 1 ||
    !Number.isInteger(context.targetStage) ||
    context.targetStage < 1 ||
    context.targetStage >= context.currentStage ||
    context.targetStatus !== context.targetStage + 5 ||
    detail.currentVersion.id !== row.versionId ||
    detail.currentVersion.planId !== row.planId ||
    detail.currentVersion.status !== row.status ||
    !detail.currentVersion.effective
  )
    throw new Error('退回节点或计划版本已变化，请刷新后重试');
  const changes = new Map(stored.map((item) => [item.skuCode, item.adjustQty]));
  if (
    changes.size !== stored.length ||
    new Set(detail.skus.map((sku) => sku.skuCode)).size !== detail.skus.length ||
    stored.some((item) => !detail.skus.some((sku) => sku.skuCode === item.skuCode)) ||
    Object.keys(pending).some((code) => !detail.skus.some((sku) => sku.skuCode === code))
  )
    throw new Error('SKU 明细已变化，请刷新后重试');
  return detail.skus.map((sku) => {
    if (sku.versionId !== row.versionId) throw new Error('SKU 版本已变化，请刷新后重试');
    const baseline = salesPlanEditableQuantity(sku, row.status, row.planTypeCode, role) ?? sku.qty;
    let final =
      pending[sku.skuCode] ?? addExactDecimals([baseline, changes.get(sku.skuCode) ?? '0']);
    if (!quantity.test(final)) throw new Error('确认计划数量不合法，请核对后重试');
    if (row.orderType === 'M' || row.orderType === 'Z') final = roundPlanQuantity(final);
    const adjustQty = subtractExactDecimals(final, receiverQuantity(sku, context.targetStage));
    if (!/^[+-]?\d{1,15}(?:\.\d{1,3})?$/.test(adjustQty))
      throw new Error('确认计划数量不合法，请核对后重试');
    return { skuCode: sku.skuCode, adjustQty };
  });
}

export function verifyReturnedSalesPlan(
  before: GeaSalesPlanDetail,
  after: GeaSalesPlanDetail,
  request: GeaSalesPlanActionRequest,
  receipt: Pick<GeaSalesPlanActionReceipt, 'planId' | 'versionId' | 'fromStatus' | 'toStatus'>,
): boolean {
  const target = request.expectedReturnTargetStage;
  const role = request.approvalRole;
  if (
    !target ||
    !role ||
    request.action !== 'REJECT' ||
    receipt.toStatus !== target + 5 ||
    receipt.fromStatus !== request.expectedStatus ||
    before.currentVersion.id !== receipt.versionId ||
    before.currentVersion.planId !== receipt.planId ||
    after.currentVersion.id !== receipt.versionId ||
    after.currentVersion.planId !== receipt.planId ||
    after.currentVersion.status !== receipt.toStatus ||
    !after.currentVersion.effective ||
    after.skus.length !== before.skus.length ||
    new Set(after.skus.map((sku) => sku.skuCode)).size !== after.skus.length
  )
    return false;
  const fields = {
    region: ['regionConfirmedQty', 'regionConfirmedAmount', 'regionAdjAddQty', 'regionAdjCutQty'],
    province: [
      'provinceConfirmedQty',
      'provinceConfirmedAmount',
      'provinceAdjAddQty',
      'provinceAdjCutQty',
    ],
    area: ['areaConfirmedQty', 'areaConfirmedAmount', 'areaAdjAddQty', 'areaAdjCutQty'],
    category: [
      'categoryConfirmedQty',
      'categoryConfirmedAmount',
      'categoryAdjAddQty',
      'categoryAdjCutQty',
    ],
  } as const;
  try {
    return before.skus.every((sku) => {
      const actual = after.skus.find(
        (value) => value.skuCode === sku.skuCode && value.versionId === receipt.versionId,
      );
      if (!actual || fields[role].some((field) => actual[field] != null)) return false;
      const adjustment = request.adjustments?.find((item) => item.skuCode === sku.skuCode);
      if (!adjustment) return true;
      const expected = correctionDecimal(receiverQuantity(sku, target)).plus(adjustment.adjustQty);
      const received = [
        actual.qty,
        actual.regionConfirmedQty,
        actual.provinceConfirmedQty,
        actual.areaConfirmedQty,
      ][target - 1];
      const amount = [
        actual.amt,
        actual.regionConfirmedAmount,
        actual.provinceConfirmedAmount,
        actual.areaConfirmedAmount,
      ][target - 1];
      return (
        received != null &&
        amount != null &&
        expected.eq(received) &&
        expected.times(sku.price).toDecimalPlaces(2, 4).eq(amount)
      );
    });
  } catch {
    return false;
  }
}
