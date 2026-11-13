import {
  SALES_PLAN_ROLES,
  salesPlanWorkflow,
  type SalesPlanWorkflowRow,
} from '../../../salesPlanWorkflow.ts';
import type {
  GeaSalesPlanActionContext,
  GeaSalesPlanActionReceipt,
  GeaSalesPlanActionRequest,
  GeaSalesPlanDetail,
  GeaSalesPlanListItem,
} from '../../../bridge.ts';
import { addExactDecimals, multiplyExactDecimals } from '../regionalApprovalQueryModel.ts';
import { salesPlanSkusMatchVersion } from './salesPlanDetailModel.ts';
import { salesPlanApprovalNodeForStatus } from './salesPlanActionModel.ts';
import { salesPlanEditableQuantity } from './salesPlanQuantityModel.ts';
import type { ApprovalStageId } from '../salesPlanDomain.ts';
export { salesPlanEditableQuantity };

const NODE_ROLES: readonly [Exclude<ApprovalStageId, 'customer'>, string, string][] = [
  ['region', 'sales_plan_region_approver', '区域审批'],
  ['province', 'sales_plan_province_approver', '省区审批'],
  ['area', 'sales_plan_area_approver', '大区审批'],
  ['category', 'sales_plan_category_approver', '品类审批'],
];

export type SalesPlanApprovalRole = { code?: string | null; name?: string | null };

export const salesPlanStagesForRoles = (
  roles: readonly SalesPlanApprovalRole[] = [],
): Exclude<ApprovalStageId, 'customer'>[] =>
  NODE_ROLES.filter(([, code, name]) =>
    roles.some((role) => {
      const roleCode = (role?.code ?? '').trim().toLowerCase();
      const roleName = (role?.name ?? '').trim();
      return (
        (roleCode.length > 0 && roleCode === code) || (roleName.length > 0 && roleName === name)
      );
    }),
  ).map(([stage]) => stage);

export type SalesPlanAccess = Omit<GeaSalesPlanActionContext, 'snapshotHash'> & {
  snapshotHash?: string;
  approvalRole: Exclude<ApprovalStageId, 'customer'>;
  roleContractSupported: boolean;
};

export const salesPlanVersionEvidenceStale = (
  detail: GeaSalesPlanDetail | undefined,
  expected: { planId: string; versionId: string; status: number },
): boolean => {
  const v = detail?.currentVersion;
  if (!v) return true;
  if (v.planId !== expected.planId || v.id !== expected.versionId || v.effective !== true)
    return true;
  if (v.status !== expected.status || ![1, 2, 3, 4, 6, 7, 8, 9].includes(v.status)) return true;
  const context = detail?.actionContext;
  return Boolean(
    context &&
    (context.versionId !== v.id ||
      context.status !== v.status ||
      !/^[a-f0-9]{64}$/.test(context.snapshotHash) ||
      !Array.isArray(context.allowedActions)),
  );
};

export const salesPlanAccessForRow = (
  row: Pick<GeaSalesPlanListItem, 'planId' | 'versionId' | 'status'> &
    Partial<Pick<GeaSalesPlanListItem, 'planTypeCode'>>,
  detail: GeaSalesPlanDetail,
  grantedStages: readonly ApprovalStageId[] = [],
  stage?: ApprovalStageId,
  workflowRows?: readonly SalesPlanWorkflowRow[],
): SalesPlanAccess | undefined => {
  const v = detail.currentVersion,
    context = detail.actionContext;
  const typeCode = row.planTypeCode ?? v.planTypeCode;
  const flow = salesPlanWorkflow(typeCode, workflowRows);
  if (
    v.id !== row.versionId ||
    v.planId !== row.planId ||
    !v.effective ||
    v.status !== row.status ||
    ![1, 2, 3, 4, 6, 7, 8, 9].includes(row.status) ||
    (row.planTypeCode !== undefined && row.planTypeCode !== v.planTypeCode)
  )
    return undefined;
  const supported = context?.policy === 'role-visible-v1';
  if (
    context &&
    (context.versionId !== v.id ||
      context.status !== v.status ||
      !/^[a-f0-9]{64}$/.test(context.snapshotHash) ||
      !Array.isArray(context.allowedActions))
  )
    return undefined;
  const knownActions = (actions: readonly string[]) =>
    actions.every((a) => ['SAVE', 'APPROVE', 'REJECT'].includes(a));
  if (context && !knownActions(context.allowedActions)) return undefined;
  if (
    supported &&
    (!Array.isArray(context.roleActions) ||
      context.roleActions.some(
        (entry) =>
          !entry ||
          !['region', 'province', 'area', 'category'].includes(entry.role) ||
          !Array.isArray(entry.allowedActions) ||
          !knownActions(entry.allowedActions),
      ) ||
      new Set(context.roleActions.map((entry) => entry.role)).size !== context.roleActions.length)
  )
    return undefined;

  const roles = [...new Set(grantedStages)].filter((role) => role !== 'customer');

  const role = stage ?? (roles.length === 1 ? roles[0] : undefined);
  if (!role || role === 'customer' || !roles.includes(role)) return undefined;
  const roleEntry = supported
    ? context.roleActions!.find((entry) => entry.role === role)
    : undefined;
  const nodeOrder = SALES_PLAN_ROLES.indexOf(role) + 1;

  const grantedRoleActions = ['APPROVE', 'REJECT'] as const;
  const allowedActions = supported
    ? [...new Set([...grantedRoleActions, ...(roleEntry?.allowedActions ?? [])])]
    : context && (context.nodeOrder === nodeOrder || context.allowedActions.length === 0)
      ? context.allowedActions
      : (['APPROVE', 'REJECT'] as const);
  return {
    versionId: v.id,
    status: v.status,
    nodeOrder,
    approvalRole: role,
    allowedActions: [...allowedActions].filter(
      (action) =>
        (row.status < 6 || action === 'REJECT') &&
        (action !== 'REJECT' || flow.pending(role) !== undefined),
    ),
    ...(context?.snapshotHash ? { snapshotHash: context.snapshotHash } : {}),
    roleContractSupported: supported,
  };
};

export const verifySavedSalesPlan = (
  before: GeaSalesPlanDetail,
  after: GeaSalesPlanDetail,
  request: GeaSalesPlanActionRequest,
  receipt: GeaSalesPlanActionReceipt,
): boolean => {
  const version = before.currentVersion;
  if (
    request.action !== 'SAVE' ||
    request.expectedStatus !== version.status ||
    !version.effective ||
    !salesPlanSkusMatchVersion(version.id, before.skus) ||
    receipt.planId !== version.planId ||
    receipt.versionId !== version.id ||
    receipt.fromStatus !== version.status ||
    receipt.toStatus !== version.status ||
    after.currentVersion.id !== version.id ||
    after.currentVersion.planId !== version.planId ||
    after.currentVersion.status !== version.status ||
    after.currentVersion.seq !== version.seq ||
    after.currentVersion.planTypeCode !== version.planTypeCode ||
    !after.currentVersion.effective ||
    !salesPlanSkusMatchVersion(version.id, after.skus) ||
    before.skus.length !== after.skus.length ||
    !after.logs.some(
      (log) =>
        `sales-plan-log:${log.id}` === receipt.auditId &&
        log.planId === version.planId &&
        log.requestId === receipt.requestId &&
        log.traceId === receipt.traceId &&
        log.actionCode === 'SAVE' &&
        log.versionId === version.id &&
        log.fromStatus === version.status &&
        log.toStatus === version.status,
    )
  )
    return false;
  const deltas = new Map(
    (request.adjustments ?? []).map((item) => [String(item.skuCode), String(item.adjustQty)]),
  );
  const sourceCodes = new Set(before.skus.map((sku) => String(sku.skuCode)));
  if (
    deltas.size !== request.adjustments?.length ||
    [...deltas.keys()].some((code) => !sourceCodes.has(code))
  )
    return false;
  return before.skus.every((sku) => {
    const code = String(sku.skuCode);
    const saved = after.skus.find((item) => String(item.skuCode) === code);
    const baseline = salesPlanEditableQuantity(
      sku,
      version.status,
      version.planTypeCode,
      request.approvalRole,
    );
    const actual =
      saved &&
      salesPlanEditableQuantity(saved, version.status, version.planTypeCode, request.approvalRole);
    if (baseline === undefined || actual === undefined) return false;
    const expected = addExactDecimals([baseline, deltas.get(code) ?? '0']);
    const node = request.approvalRole
      ? SALES_PLAN_ROLES.indexOf(request.approvalRole) + 1
      : salesPlanApprovalNodeForStatus(version.status, version.planTypeCode);
    const amount =
      node === 5
        ? saved?.categoryConfirmedAmount
        : node === 4
          ? saved?.areaConfirmedAmount
          : node === 3
            ? saved?.provinceConfirmedAmount
            : saved?.regionConfirmedAmount;
    const expectedAmount = multiplyExactDecimals(expected, String(sku.price));
    const equal = (left: unknown, right: string) =>
      /^0(?:\.0+)?$/.test(addExactDecimals([String(left), `-${right}`]));
    return (
      expected !== '—' &&
      expectedAmount !== undefined &&
      equal(actual, expected) &&
      equal(saved?.price, String(sku.price)) &&
      equal(amount, expectedAmount)
    );
  });
};
