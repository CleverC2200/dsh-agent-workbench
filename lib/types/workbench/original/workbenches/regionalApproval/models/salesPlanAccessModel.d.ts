/** 改编自 AionUi（Apache-2.0）：已替换为本地导入并使用显式 DSH Host 适配器，见 SOURCE.md。 */
import { type SalesPlanWorkflowRow } from '../../../salesPlanWorkflow.ts';
import type { GeaSalesPlanActionContext, GeaSalesPlanActionReceipt, GeaSalesPlanActionRequest, GeaSalesPlanDetail, GeaSalesPlanListItem } from '../../../bridge.ts';
import { salesPlanEditableQuantity } from './salesPlanQuantityModel.ts';
import type { ApprovalStageId } from '../regionalApprovalFixture.ts';
export { salesPlanEditableQuantity };
export type SalesPlanApprovalRole = {
    code?: string | null;
    name?: string | null;
};
/** 当前账号能审批哪些节点；只有这几个节点在界面上可点。 */
export declare const salesPlanStagesForRoles: (roles?: readonly SalesPlanApprovalRole[]) => Exclude<ApprovalStageId, "customer">[];
export type SalesPlanAccess = Omit<GeaSalesPlanActionContext, 'snapshotHash'> & {
    snapshotHash?: string;
    approvalRole: Exclude<ApprovalStageId, 'customer'>;
    roleContractSupported: boolean;
};
/**
 * 版本或状态证据已经变化：这属于并发冲突，必须提示刷新，不能报成"你没有权限"。
 * 只判断证据是否还成立，不判断角色权限，权限缺失仍走无权限分支。
 */
export declare const salesPlanVersionEvidenceStale: (detail: GeaSalesPlanDetail | undefined, expected: {
    planId: string;
    versionId: string;
    status: number;
}) => boolean;
/** 能力结果是 UI 入口的保守投影；审批身份只认账号角色推出的节点，写入时仍由 GEA 校验。 */
export declare const salesPlanAccessForRow: (row: Pick<GeaSalesPlanListItem, "planId" | "versionId" | "status"> & Partial<Pick<GeaSalesPlanListItem, "planTypeCode">>, detail: GeaSalesPlanDetail, grantedStages?: readonly ApprovalStageId[], stage?: ApprovalStageId, workflowRows?: readonly SalesPlanWorkflowRow[]) => SalesPlanAccess | undefined;
/** 写入成功回执之后必须读取同一版本，并包含对应审计日志。 */
export declare const verifySavedSalesPlan: (before: GeaSalesPlanDetail, after: GeaSalesPlanDetail, request: GeaSalesPlanActionRequest, receipt: GeaSalesPlanActionReceipt) => boolean;
