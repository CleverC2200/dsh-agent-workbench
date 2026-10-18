import type { GeaSalesPlanSku } from '../../../bridge.ts';
import type { ApprovalStageId } from '../salesPlanDomain.ts';
import type { RegionalApprovalLiveRow } from '../regionalApprovalQueryModel.ts';
type GroupSkuSource = {
    plan: RegionalApprovalLiveRow;
    skus: readonly GeaSalesPlanSku[];
};
export type GroupSkuSummaryRow = {
    skuCode: string;
    categoryName: string;
    description: string;
    baseQty: string;
    qty: string;
    baseAmount: string;
    amount: string;
};
/** 只有每个版本的 SKU 都完整时才汇总，金额按各计划自己的价格逐行计算后相加。 */
export declare const summarizeGroupSkus: (sources: readonly GroupSkuSource[], approvalRole?: ApprovalStageId, pendingValues?: Readonly<Record<string, Readonly<Record<string, string>>>>) => GroupSkuSummaryRow[];
export {};
