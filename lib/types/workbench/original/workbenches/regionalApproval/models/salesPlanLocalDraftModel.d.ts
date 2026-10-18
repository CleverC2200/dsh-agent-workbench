/** 改编自 AionUi（Apache-2.0）：已替换为本地导入并使用显式 DSH Host 适配器，见 SOURCE.md。 */
import type { GeaSalesPlanDetail, GeaSalesPlanListItem, GeaSalesPlanSkuAdjustment } from '../../../bridge.ts';
import type { ApprovalStageId } from '../salesPlanDomain.ts';
export type SalesPlanLocalDraft = {
    planId: string;
    versionId: string;
    status: number;
    sourceSnapshot: string;
    adjustments: GeaSalesPlanSkuAdjustment[];
    remark: string;
    /** 草稿里的调整量是相对哪个节点口径算出来的；缺省表示按状态口径。 */
    role?: ApprovalStageId;
};
export type SalesPlanLocalDraftStore = Record<string, SalesPlanLocalDraft>;
/** 只表示本地草稿的新鲜度；绝不作为服务端签发的权威或快照令牌发送。 */
export declare const salesPlanDraftSnapshot: (row: Pick<GeaSalesPlanListItem, "planId" | "versionId" | "status">, detail: GeaSalesPlanDetail) => string | undefined;
export declare const salesPlanDraftMatches: (draft: SalesPlanLocalDraft | undefined, row: Pick<GeaSalesPlanListItem, "planId" | "versionId" | "status"> & Partial<Pick<GeaSalesPlanListItem, "planTypeCode">>, detail: GeaSalesPlanDetail, role?: ApprovalStageId) => draft is SalesPlanLocalDraft;
/** 本地草稿保存只校验数据形状，不回查 GEA，也不代表服务端审批权限。 */
export declare const salesPlanLocalDraftValid: (draft: unknown, planId: string, versionId: string) => draft is SalesPlanLocalDraft;
export declare const readSalesPlanLocalDrafts: (scope: string | undefined) => SalesPlanLocalDraftStore;
/** 本地写入失败必须报告，不能显示虚假的已保存状态。 */
export declare const writeSalesPlanLocalDrafts: (scope: string, drafts: SalesPlanLocalDraftStore) => void;
