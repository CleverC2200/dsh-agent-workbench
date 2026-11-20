import { createContext, useContext } from 'react';
import type { SalesPlanLocalDraft } from './workbenches/regionalApproval/models/salesPlanLocalDraftModel.ts';
import type { SalesPlanApprovalRole } from './workbenches/regionalApproval/models/salesPlanAccessModel.ts';

import type * as Api from './contracts.ts';

export type * from './contracts.ts';

export interface WorkbenchHost {
  salesPlan: {
    draft?: {
      invoke(params: {
        planId: string;
        versionId: string;
        approvalRole?: string;
        draft?: SalesPlanLocalDraft;
        detailLoadId?: string;
        signal?: AbortSignal;
        priority?: 'low';
      }): Promise<{
        draft: SalesPlanLocalDraft | null;
        sourceSnapshot?: string;
        savedAt?: string;
        stale?: boolean;
      }>;
    };
    periods: {
      invoke(
        query?: Api.GeaSalesPlanPeriodQuery,
      ): Promise<Api.GeaSalesPlanPage<Api.GeaSalesPlanPeriod>>;
    };
    list: {
      invoke(
        query?: Api.GeaSalesPlanPageQuery,
        onPlanPage?: (page: Api.GeaSalesPlanPage<Api.GeaSalesPlanListItem>) => void,
      ): Promise<Api.GeaSalesPlanPage<Api.GeaSalesPlanListItem>>;
    };
    detail: {
      invoke(
        query: Api.GeaSalesPlanResourceQuery & { priority?: 'low' },
      ): Promise<Api.GeaSalesPlanDetail>;
    };
    versions: { invoke(query: Api.GeaSalesPlanResourceQuery): Promise<Api.GeaSalesPlanVersion[]> };
    logs: { invoke(query: Api.GeaSalesPlanResourceQuery): Promise<Api.GeaSalesPlanApprovalLog[]> };
    versionSkus: {
      invoke(
        query: Api.GeaSalesPlanVersionSkuQuery & { priority?: 'low' },
      ): Promise<Api.GeaSalesPlanSku[]>;
    };
    skuReview?: {
      invoke(query: {
        planId: string;
        versionId: string;
        detailLoadId?: string;
        signal?: AbortSignal;
      }): Promise<Api.GeaSalesPlanSkuReview>;
    };
    skuQuotes?: {
      invoke(query: Api.GeaSalesPlanSkuQuoteQuery): Promise<Api.GeaSalesPlanSkuQuote[]>;
    };
    reportFacts?: {
      invoke(query: {
        planId: string;
        versionId: string;
        resolveAreaName?: true;
        signal?: AbortSignal;
      }): Promise<Api.GeaSalesPlanReportFacts>;
    };
    compare: {
      invoke(query: Api.GeaSalesPlanCompareQuery): Promise<Api.GeaSalesPlanSkuDiff[]>;
    };
    action: {
      invoke(params: Api.GeaSalesPlanActionParams): Promise<Api.GeaSalesPlanActionReceipt>;
    };
    submit: {
      invoke(params: Api.GeaSalesPlanSubmitParams): Promise<Api.GeaSalesPlanSubmitReceipt>;
    };

    approvalRoles?: {
      invoke(input: { signal?: AbortSignal }): Promise<{ roles: SalesPlanApprovalRole[] }>;
    };
  };
  modelInference: {
    invoke(params: { question: string; signal?: AbortSignal }): Promise<{
      status: 'ok' | 'noAnswer' | 'toolsRequired' | 'timeout' | 'failed';
      provider_id: string;
      model: string;
      answer?: string;
    }>;
  };
}

const WorkbenchHostContext = createContext<WorkbenchHost | null>(null);
export const WorkbenchHostProvider = WorkbenchHostContext.Provider;
export function useWorkbenchHost(): WorkbenchHost {
  const host = useContext(WorkbenchHostContext);
  if (!host) throw Error('WORKBENCH_HOST_REQUIRED');
  return host;
}
