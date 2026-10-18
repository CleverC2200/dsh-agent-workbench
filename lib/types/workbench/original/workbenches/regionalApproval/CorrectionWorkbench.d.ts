import type { TFunction } from 'i18next';
import React from 'react';
import type { GeaSalesPlanPeriod } from '../../contracts.ts';
import type { SalesPlanQueryClient } from './useRegionalApprovalQuery.ts';
import type { SalesPlanDetailClient } from './hooks/useSalesPlanDetail.ts';
import { type SalesPlanActionClient } from './models/salesPlanActionModel.ts';
import type { ApprovalStageId } from './salesPlanDomain.ts';
/** 纠偏是现有工作台中的一个视图，使用已认证的客户端能力。 */
export declare function CorrectionWorkbench({ headerControls, t, queryClient, detailClient, actionClient, onResubmit, approvalStages, }: {
    headerControls?: React.ReactNode;
    t: TFunction;
    approvalStages?: readonly ApprovalStageId[];
    queryClient?: SalesPlanQueryClient | null;
    detailClient?: SalesPlanDetailClient;
    actionClient?: SalesPlanActionClient;
    onResubmit?: (planId: string, versionId: string, period: GeaSalesPlanPeriod) => void;
}): React.JSX.Element;
