import type { GeaSalesPlanSku } from '../../../bridge.ts';
import type { ApprovalStageId } from '../salesPlanDomain.ts';
/** 已保存节点仍是下一次编辑和后续审批的基线。 */
export declare const salesPlanEditableQuantity: (sku: GeaSalesPlanSku, status: number, typeCode?: string, role?: ApprovalStageId) => string | undefined;
