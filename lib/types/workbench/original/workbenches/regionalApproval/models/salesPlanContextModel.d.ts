/** 改编自 AionUi（Apache-2.0）：已替换为本地导入并使用显式 DSH Host 适配器，见 SOURCE.md。 */
import type { GeaSalesPlanActionReceipt, GeaSalesPlanListItem } from '../../../bridge.ts';
import type { ApprovalStageId } from '../regionalApprovalFixture.ts';
export type SalesPlanContextApprovalStage = ApprovalStageId | 'all';
export type SalesPlanContextSource = 'fixture' | 'gea-user-session-query' | 'gea-user-session-action';
export type SalesPlanContextFilterSummary = {
    periodMonth?: string;
    planTypeCode?: string;
    approvalStage: SalesPlanContextApprovalStage;
    queueMode: 'approval';
    organizationFilterCount: number;
};
export type SalesPlanAuthorityContext = {
    source: SalesPlanContextSource;
    filterSummary: SalesPlanContextFilterSummary;
    planId?: string;
    versionId?: string;
    seq?: number;
    status?: number;
};
type SalesPlanAuthorityRow = Pick<GeaSalesPlanListItem, 'planId' | 'versionId' | 'seq' | 'status'>;
export declare const buildSalesPlanFilterSummary: ({ periodMonth, planTypeCode, approvalStage, queueMode, appliedFilters, }: {
    periodMonth?: string;
    planTypeCode?: string;
    approvalStage: SalesPlanContextApprovalStage;
    queueMode: "approval";
    appliedFilters: Readonly<Record<string, unknown>>;
}) => SalesPlanContextFilterSummary;
export declare const projectFixtureSalesPlanContext: (filterSummary: SalesPlanContextFilterSummary) => SalesPlanAuthorityContext;
export declare const projectSalesPlanQueryContext: (row: SalesPlanAuthorityRow | undefined, filterSummary: SalesPlanContextFilterSummary) => SalesPlanAuthorityContext | undefined;
export declare const projectSalesPlanActionContext: (row: SalesPlanAuthorityRow, receipt: GeaSalesPlanActionReceipt, filterSummary: SalesPlanContextFilterSummary) => SalesPlanAuthorityContext | undefined;
export {};
