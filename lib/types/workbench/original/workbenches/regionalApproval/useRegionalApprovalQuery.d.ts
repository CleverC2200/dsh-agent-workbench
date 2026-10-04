import { type GeaSalesPlanListItem, type GeaSalesPlanPage, type GeaSalesPlanPageQuery, type GeaSalesPlanPeriod, type GeaSalesPlanPeriodQuery } from '../../bridge.ts';
import { type RegionalApprovalQueryScope, type SalesPlanStageTally } from './regionalApprovalQueryModel.ts';
import type { ApprovalStageId } from './regionalApprovalFixture.ts';
import type { SalesPlanApprovalRole } from './models/salesPlanAccessModel.ts';
/** 查询状态按“周期→队列→进度/分析”分层；请求序号和 AbortSignal 防止晚到结果覆盖新选择。 */
export type SalesPlanQueryClient = {
    periods: {
        invoke: (query?: GeaSalesPlanPeriodQuery) => Promise<GeaSalesPlanPage<GeaSalesPlanPeriod>>;
    };
    list: {
        invoke: (query?: GeaSalesPlanPageQuery) => Promise<GeaSalesPlanPage<GeaSalesPlanListItem>>;
    };
    /** 可选：点刷新时重新解析账号角色，拿到管理员刚改过的节点权限。 */
    approvalRoles?: {
        invoke: (input: {
            signal?: AbortSignal;
        }) => Promise<{
            roles: SalesPlanApprovalRole[];
        }>;
    };
};
export type RegionalApprovalQueryError = 'workflow' | 'permission' | 'expired' | 'timeout' | 'unavailable' | 'cancelled' | 'failed';
type QueryState<T> = {
    status: 'idle';
    data?: undefined;
    error?: undefined;
} | {
    status: 'loading';
    data?: T;
    error?: undefined;
} | {
    status: 'success';
    data: T;
    error?: undefined;
} | {
    status: 'error';
    data?: T;
    error: RegionalApprovalQueryError;
};
export type SalesPlanAnalysisSummary = {
    source: 'gea-user-session';
    completeness: 'filtered-scope';
    version: 'current';
    count: number;
    quantity: string;
    amount: string;
    targetAmount: string;
};
export declare const classifyRegionalApprovalQueryError: (error: unknown, timedOut?: boolean) => RegionalApprovalQueryError;
export declare const useRegionalApprovalQuery: ({ client: suppliedClient, page, pageSize, scope, loadStageProgress, loadAnalysisSummary, stageStatuses, stage, roles, }: {
    client?: SalesPlanQueryClient | null;
    page: number;
    pageSize: number;
    scope?: RegionalApprovalQueryScope;
    loadStageProgress?: boolean;
    loadAnalysisSummary?: boolean;
    stageStatuses?: readonly number[];
    stage?: ApprovalStageId;
    roles?: readonly ApprovalStageId[];
}) => {
    analysisSummary: QueryState<SalesPlanAnalysisSummary>;
    analysisRecords: GeaSalesPlanListItem[] | undefined;
    enabled: boolean;
    periodsState: QueryState<GeaSalesPlanPeriod[]>;
    queueState: QueryState<GeaSalesPlanPage<GeaSalesPlanListItem>>;
    progressState: QueryState<Record<ApprovalStageId, number>> & {
        statusTotals?: Partial<Record<number, number>>;
        /** 每个节点的分子/分母，界面悬停百分比时展示；百分比本身就是它算出来的。 */
        tallies?: Record<ApprovalStageId, SalesPlanStageTally>;
    };
    queueSettledPage: number | undefined;
    queueSettledStageKey: string | undefined;
    stageStatusesKey: string;
    periods: GeaSalesPlanPeriod[];
    periodMonths: string[];
    selectedPeriodMonth: string | undefined;
    selectedPeriods: GeaSalesPlanPeriod[];
    selectedPlanTypeCode: string | undefined;
    refreshing: boolean;
    selectPeriodMonth: (periodMonth: string) => void;
    refresh: () => void;
    retryPeriods: () => void;
    retryQueue: () => void;
};
export {};
