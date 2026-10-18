import type { GeaSalesPlanPeriod } from '../../contracts.ts';
import type { TFunction } from 'i18next';
import React from 'react';
import { type ApprovalDimension, type ApprovalStageId, type ApprovalState, type ApprovalVersion } from './salesPlanDomain.ts';
import { useRegionalApprovalQuery, type RegionalApprovalQueryError } from './useRegionalApprovalQuery.ts';
import type { PageElement } from '../../../../page-bridge/catalog.ts';
import { type SalesPlanAuthorityContext, type SalesPlanContextApprovalStage } from './models/salesPlanContextModel.ts';
type ApprovalContextFilters = Record<'area' | 'branch' | 'department' | 'customer' | 'approval' | 'health', string>;
export type RegionalApprovalContextEntity = {
    source: 'gea';
    id: string;
    organizationKey: string;
    approvalState: ApprovalState | 'returned';
    health: 'unknown';
    versionId?: string;
    seq?: number;
    status?: number;
    planTypeCode?: string;
    dealerCode?: string;
    orgCode?: string;
    provinceCode?: string;
    areaCode?: string;
    currentQty?: string;
    currentAmount?: string;
    targetQty?: string;
    targetAmount?: string;
    skuCount?: number;
    submitter?: string;
    returnReason?: string;
    customerCode?: string;
    quantity?: string;
    amount?: string;
    previousQuantity?: string;
    previousAmount?: string;
    adjustmentQuantity?: string;
    adjustmentAmount?: string;
};
export type RegionalApprovalWorkbenchContext = {
    analysisSummary?: ReturnType<typeof useRegionalApprovalQuery>['analysisSummary'];
    view: 'regional-approval';
    scope: {
        dimension?: ApprovalDimension;
        categoryComparison?: boolean;
        primaryVersionId?: string;
        versionReferencePlanId?: string;
        currentVersionId?: string;
        compareVersionId?: string;
        planType: string;
        month: string;
        approvalStage: SalesPlanContextApprovalStage;
        authority: 'organization';
        primaryVersion: ApprovalVersion;
        compareVersion: ApprovalVersion;
        appliedFilters: ApprovalContextFilters;
    };
    visibleEntities: RegionalApprovalContextEntity[];
    selectedEntities: RegionalApprovalContextEntity[];
    /** 当前展开的行（实时队列里就是 planId），用于让外部读到"展开了什么"。 */
    expandedPlanIds: string[];
    /** 已展开行里的可编辑字段（SKU 确认计划量）：让外部能回读改后的值。 */
    expandedFields: Array<{
        id: string;
        label: string;
        value: string;
        editable: boolean;
    }>;
    metrics: {
        visibleCount: number;
        pendingCount: number;
        warningCount: number;
        quantity: string;
        amount: string;
        targetQuantity?: string;
        targetAmount?: string;
        savedAdjustmentCount: number;
        localApprovalResultCount: number;
    };
    pagination: {
        page: number;
        pageSize: number;
        total: number;
    };
    evidence: {
        source: 'gea-user-session' | 'unverified';
        permission: 'read-only' | 'user-session-action';
        completeness: 'skeleton' | 'periods-only' | 'paged-queue' | 'none';
        queryState: 'loading' | 'error' | 'empty-periods' | 'empty' | 'success' | 'refreshing' | 'stale-error';
        error?: RegionalApprovalQueryError;
        dataVersion: string;
    };
    authority?: SalesPlanAuthorityContext;
};
declare const RegionalApprovalWorkbench: React.FC<{
    headerControls?: React.ReactNode;
    stateScope: string;
    t: TFunction;
    onContextChange: (context: RegionalApprovalWorkbenchContext, conversationId: string | null) => void;
    liveActionsEnabled?: boolean;
    automaticAnalysisEnabled?: boolean;
    onResubmit?: (planId: string, versionId: string, period: GeaSalesPlanPeriod) => void;
    /** 当前账号可审批的节点：由账号角色映射得出（Host 经网关解析用户角色后传入）。 */
    approvalStages?: readonly ApprovalStageId[];
    /** AG-UI 前端工具调用：agent 让页面改这一屏怎么看。 */
    toolCall?: {
        toolCallId: string;
        command: Record<string, unknown>;
    };
    onToolResult?: (toolCallId: string, applied: boolean, error?: string) => void;
    /** 页面元素清单单独上报：它是页面能力，不属于页面状态快照。 */
    onCatalogChange?: (elements: PageElement[]) => void;
}>;
declare const SalesPlanWorkbench: React.FC<React.ComponentProps<typeof RegionalApprovalWorkbench>>;
export default SalesPlanWorkbench;
