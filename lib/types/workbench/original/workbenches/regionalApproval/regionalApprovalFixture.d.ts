/** 改编自 AionUi（Apache-2.0）：已替换为本地导入并使用显式 DSH Host 适配器，见 SOURCE.md。 */
export type ApprovalStageId = 'customer' | 'region' | 'province' | 'area' | 'category';
export type ApprovalHealth = 'healthy' | 'attention' | 'warning';
export type ApprovalState = 'pending' | 'approved' | 'future';
export type ApprovalVersion = 'current' | 'previous' | 'initial';
export type ApprovalDimension = 'area' | 'province' | 'region' | 'base' | 'customer';
export type ApprovalPermission = 'writable' | 'read-only' | 'denied';
export type ApprovalAreaKey = 'north' | 'east' | 'central' | 'southwest';
export type ApprovalBranchKey = 'beijing' | 'hebei' | 'zhejiang' | 'henan' | 'sichuan';
export type ApprovalDepartmentKey = 'beijing-sales' | 'shijiazhuang' | 'hangzhou' | 'zhengzhou' | 'chengdu';
export type ApprovalCustomerKey = 'northstar' | 'yanzhao' | 'qiantang' | 'zhongyuan' | 'rongcheng';
/** 区域计划评估是展示节点，沿用计划的未提交、待回写和已回写状态。 */
export declare const REGIONAL_PLAN_EVALUATION_STATUSES: readonly [0, 5, 10];
export type ApprovalStageFixture = {
    id: ApprovalStageId;
    progress: number;
};
export type RegionalApprovalRow = {
    id: string;
    organizationKey: 'north' | 'east' | 'central' | 'southwest' | 'hebei';
    level: 'area' | 'province';
    areaKey: ApprovalAreaKey;
    branchKey: ApprovalBranchKey;
    departmentKey: ApprovalDepartmentKey;
    customerKey: ApprovalCustomerKey;
    customerCode: string;
    category: 'frozen-pastry' | 'rice-noodle';
    provinceKey: 'hebei' | 'zhejiang' | 'henan' | 'sichuan';
    customers: number;
    quantity: number;
    amount: number;
    previousQuantity: number;
    previousAmount: number;
    quantityProgress: number;
    amountProgress: number;
    adjustmentQuantity: number;
    adjustmentAmount: number;
    health: ApprovalHealth;
    approvalState: ApprovalState;
    permission: ApprovalPermission;
    returnReason?: string;
    aiOpinionKey: 'north' | 'east' | 'central' | 'southwest' | 'hebei';
    reachedStage: ApprovalStageId;
};
export declare const APPROVAL_STAGE_FIXTURES: readonly ApprovalStageFixture[];
export declare const REGIONAL_APPROVAL_ROWS: readonly RegionalApprovalRow[];
export declare const isApprovalStageId: (value: unknown) => value is ApprovalStageId;
export declare const approvalRowsForStage: (rows: readonly RegionalApprovalRow[], stage: ApprovalStageId) => RegionalApprovalRow[];
export declare const APPROVAL_DIMENSIONS_BY_STAGE: Record<ApprovalStageId, readonly ApprovalDimension[]> & Record<'evaluation', readonly ApprovalDimension[]>;
