/** 改编自 AionUi（Apache-2.0）：已替换为本地导入并使用显式 DSH Host 适配器，见 SOURCE.md。 */
export type ApprovalStageId = 'customer' | 'region' | 'province' | 'area' | 'category';
export type ApprovalHealth = 'healthy' | 'attention' | 'warning';
export type ApprovalState = 'pending' | 'approved' | 'future';
export type ApprovalVersion = 'current' | 'previous' | 'initial';
export type ApprovalDimension = 'area' | 'province' | 'region' | 'base' | 'customer';
/** 区域计划评估是展示节点，沿用计划的未提交、待回写和已回写状态。 */
export declare const REGIONAL_PLAN_EVALUATION_STATUSES: readonly [0, 5, 10];
export declare const APPROVAL_DIMENSIONS_BY_STAGE: Record<ApprovalStageId, readonly ApprovalDimension[]> & Record<'evaluation', readonly ApprovalDimension[]>;
export declare const APPROVAL_STAGES: readonly {
    id: ApprovalStageId;
}[];
export declare const isApprovalStageId: (value: unknown) => value is ApprovalStageId;
