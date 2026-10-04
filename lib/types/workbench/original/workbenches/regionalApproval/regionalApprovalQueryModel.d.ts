/** 改编自 AionUi（Apache-2.0）：已替换为本地导入并使用显式 DSH Host 适配器，见 SOURCE.md。 */
import type { TFunction } from 'i18next';
import type { GeaSalesPlanListItem, GeaSalesPlanPageQuery, GeaSalesPlanPeriod, GeaSalesPlanSku } from '../../bridge.ts';
import type { ApprovalDimension, ApprovalStageId } from './regionalApprovalFixture.ts';
export declare const SALES_PLAN_STATUS_BY_STAGE: Record<ApprovalStageId, number>;
export declare const approvalStageForSalesPlanStatus: (status: number, typeCode?: string) => ApprovalStageId | undefined;
export declare const VISIBLE_SALES_PLAN_STATUSES_BY_STAGE: Record<ApprovalStageId, number[]>;
export declare const SALES_PLAN_PROGRESS_STATUSES: readonly [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
/** 状态可见性会与服务端管理的组织/版本范围取交集，绝不代表授权。 */
export declare const salesPlanVisibleStatuses: (typeCode: string, roles: readonly ApprovalStageId[]) => number[];
/** 一个节点的分子/分母：界面上悬停百分比时直接展示这两个数，不必再靠人肉对照口径。 */
export type SalesPlanStageTally = {
    /** 分子：该范围内"已经过这个节点"的计划单数。 */
    completed: number;
    /** 分母：该范围内全部状态的计划单数；月度把 Y/DC/FC… 各条流程分别统计后相加。 */
    total: number;
};
/** 分母为 0 记 0%；没全完成时封顶 99%，避免四舍五入被读成"已经全审完"。 */
export declare const salesPlanStagePercent: ({ completed, total }: SalesPlanStageTally) => number;
/** 单条工作流的分子/分母；哪些状态算哪个节点已完成见 tests/approval-visibility 的口径矩阵。 */
export declare const salesPlanStageTalliesForWorkflow: (period: {
    total: number;
    statusTotals: Readonly<Partial<Record<number, number>>>;
    planTypeCode: string;
}) => Record<ApprovalStageId, SalesPlanStageTally>;
export declare const approvalStageProgressForSalesPlanStatusTotals: (total: number, statusTotals: Readonly<Partial<Record<number, number>>>, typeCode?: string) => Record<ApprovalStageId, number>;
/** 月度分子/分母：先把该月每条工作流分别算出来，再按节点相加。 */
export declare const salesPlanStageTallies: (periods: readonly {
    total: number;
    statusTotals: Readonly<Partial<Record<number, number>>>;
    planTypeCode: string;
}[]) => Record<ApprovalStageId, SalesPlanStageTally>;
export declare const approvalStageProgressForSalesPlanPeriods: (periods: readonly {
    total: number;
    statusTotals: Readonly<Partial<Record<number, number>>>;
    planTypeCode: string;
}[]) => Record<ApprovalStageId, number>;
export type RegionalApprovalQueryScope = Pick<GeaSalesPlanPageQuery, 'dealerCode' | 'areaCode' | 'provinceCode' | 'orgCode' | 'baseName' | 'status'>;
export type RegionalApprovalLiveRow = GeaSalesPlanListItem & {
    source: 'gea';
    approvalState: 'pending' | 'approved' | 'returned';
    channelCode?: string;
};
export declare const toRegionalApprovalLiveRow: (row: GeaSalesPlanListItem) => RegionalApprovalLiveRow;
export type RegionalApprovalLiveDimensionProjection = {
    name?: string;
    context: string[];
    customerCode?: string;
};
export type RegionalApprovalLiveCategorySummary = {
    categoryName: string;
    skuCount: number;
    quantity: string;
    amount: string;
    baseQuantity: string;
    baseAmount: string;
    quantityDelta: string;
    amountDelta: string;
    quantityProgress?: number;
    amountProgress?: number;
};
export declare const projectRegionalApprovalLiveDimension: (row: RegionalApprovalLiveRow, dimension: ApprovalDimension) => RegionalApprovalLiveDimensionProjection;
export declare const chooseInitialSalesPlanPeriod: (periods: readonly GeaSalesPlanPeriod[]) => GeaSalesPlanPeriod | undefined;
/** 用户只选择月份；Y/DC 等流程类型留在同月各计划内部用于审批判断。 */
export declare const salesPlanPeriodMonths: (periods: readonly GeaSalesPlanPeriod[]) => string[];
export declare const salesPlanPeriodsForMonth: (periods: readonly GeaSalesPlanPeriod[], periodMonth: string | undefined) => GeaSalesPlanPeriod[];
export declare const salesPlanPeriodOptionLabel: (periodMonth: string) => string;
/** 聚合展示总数，但不把多个计划版本变成可写对象。 */
export declare const groupRegionalApprovalLiveRows: (rows: readonly RegionalApprovalLiveRow[], dimension: ApprovalDimension) => {
    key: string;
    members: RegionalApprovalLiveRow[];
    summary: RegionalApprovalLiveRow;
}[];
export declare const isOpenSalesPlanPeriod: (period: GeaSalesPlanPeriod | undefined) => boolean;
export declare const addExactDecimals: (values: readonly string[]) => string;
export declare const subtractExactDecimals: (left: string | number, right: string | number) => string;
export declare const regionalApprovalLiveProgress: (row: RegionalApprovalLiveRow) => {
    amount: number | undefined;
    quantity: number | undefined;
};
export declare const aggregateRegionalApprovalLiveCategories: (skus: readonly GeaSalesPlanSku[]) => RegionalApprovalLiveCategorySummary[];
export declare const formatExactDecimal: (value: string | number) => string;
export declare const clampSalesPlanPageNumber: (value: number, fallback?: number) => number;
export declare const multiplyExactDecimals: (left: string, right: string, targetScale?: number) => string | undefined;
/** 未知角色映射保留原始代码，不虚构 Y 链审批标签。 */
export declare const salesPlanStatusText: (status: number, typeCode: string, t: TFunction) => string;
/** 队列、筛选、导出及详情使用同一状态名称，不随所选审批节点变化。 */
export declare const salesPlanQueueStatusText: (status: number, typeCode: string, stage: ApprovalStageId, t: TFunction) => string;
