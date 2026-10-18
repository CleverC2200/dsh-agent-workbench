import { Decimal } from 'decimal.js';
import { type SalesPlanWorkflowRow, type SalesPlanRole } from '../../../salesPlanWorkflow.ts';
import type { GeaSalesPlanSku } from '../../../contracts.ts';
/** 纠偏量使用高精度十进制；缺失字段表示继承，显式 0 表示用户确实选择了零。 */
export type CorrectionNode = Exclude<SalesPlanRole, 'customer'>;
export type CorrectionFields = Partial<Record<`${CorrectionNode}AdjAddQty` | `${CorrectionNode}AdjCutQty` | 'adjAddQty' | 'adjCutQty', string | null>>;
export type CorrectionSku = Pick<GeaSalesPlanSku, 'qty' | 'price'> & CorrectionFields;
export declare function correctionDecimal(value: unknown): Decimal;
/** NULL 表示继承；显式的一对零表示已记录的真实决策。 */
export declare function correctionDecision(sku: CorrectionSku, status: number, typeCode: string, includeCurrent?: boolean, workflowRows?: readonly SalesPlanWorkflowRow[], selectedRole?: CorrectionNode): string;
export declare function correctionLine(sku: Pick<GeaSalesPlanSku, 'qty' | 'price'>, input: string): {
    baseQty: string;
    qty: string;
    amount: string;
    delta: string;
    deltaAmount: string;
    addQty: string;
    cutQty: string;
    participates: boolean;
};
export declare function correctionMetrics(row: {
    targetAmount?: string;
    mPlanAmount?: string;
    mPlanQty?: string;
    shipAmount?: string;
    shipQty?: string;
    corrPlanAmount?: string;
}): {
    amountProgress: string | undefined;
    qtyProgress: string | undefined;
    correctionProgress: string | undefined;
    netAmount: string | undefined;
};
import type { GeaSalesPlanDetail, GeaSalesPlanActionRequest, GeaSalesPlanActionReceipt } from '../../../contracts.ts';
import type { ApprovalStageId } from '../salesPlanDomain.ts';
export declare function correctionAccess(detail: GeaSalesPlanDetail, workflowRows?: readonly SalesPlanWorkflowRow[], selectedRole?: CorrectionNode, stages?: readonly ApprovalStageId[]): import("./salesPlanAccessModel.ts").SalesPlanAccess | undefined;
/** 构造全部绝对决策，包括未变化的继承值和显式零值。 */
export declare function correctionAdjustments(detail: GeaSalesPlanDetail, edits: Record<string, string>, workflowRows?: readonly SalesPlanWorkflowRow[], selectedRole?: CorrectionNode): {
    skuCode: string;
    adjustQty: string;
}[];
/** 回读同时检查节点数据、状态以及匹配的动作日志。 */
export declare function verifyCorrectionAction(before: GeaSalesPlanDetail, after: GeaSalesPlanDetail, request: GeaSalesPlanActionRequest, receipt: GeaSalesPlanActionReceipt): boolean;
