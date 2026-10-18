/** 改编自 AionUi（Apache-2.0）：已替换为本地导入并使用显式 DSH Host 适配器，见 SOURCE.md。 */
import type { GeaSalesPlanApprovalLog, GeaSalesPlanDetail, GeaSalesPlanSku, GeaSalesPlanSkuDiff, GeaSalesPlanVersion } from '../../../bridge.ts';
import type { ApprovalStageId } from '../salesPlanDomain.ts';
export type SalesPlanSkuNodeComparison = {
    previousQty: string;
    previousAmount: string;
    currentQty: string;
    currentAmount: string;
    qtyDelta: string;
    amountDelta: string;
};
export declare const salesPlanSkuNodeComparison: (sku: GeaSalesPlanSku, stage: ApprovalStageId) => SalesPlanSkuNodeComparison;
export declare const salesPlanOverviewMatches: (planId: string, initialVersionId: string, detail: GeaSalesPlanDetail, versions: readonly GeaSalesPlanVersion[], logs: readonly GeaSalesPlanApprovalLog[]) => boolean;
export declare const salesPlanSkusMatchVersion: (versionId: string, skus: readonly GeaSalesPlanSku[]) => boolean;
export declare const salesPlanComparisonMatches: (fromVersionId: string, toVersionId: string, differences: readonly GeaSalesPlanSkuDiff[]) => boolean;
