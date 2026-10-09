/** 改编自 AionUi（Apache-2.0）：已替换为本地导入并使用显式 DSH Host 适配器，见 SOURCE.md。 */
import { type SalesPlanWorkflowRow } from '../../../salesPlanWorkflow.ts';
import type { GeaSalesPlanActionParams, GeaSalesPlanActionReceipt, GeaSalesPlanActionRequest, GeaSalesPlanSku, GeaSalesPlanVersionSkuQuery } from '../../../bridge.ts';
export type SalesPlanActionClient = {
    action: {
        invoke: (params: GeaSalesPlanActionParams) => Promise<GeaSalesPlanActionReceipt>;
    };
    versionSkus?: {
        invoke: (query: GeaSalesPlanVersionSkuQuery) => Promise<GeaSalesPlanSku[]>;
    };
};
export type SalesPlanActionInput = {
    planId: string;
    versionId: string;
    request: GeaSalesPlanActionRequest;
    serverWorkflowResult?: boolean;
    serverRoleResult?: boolean;
    planTypeCode?: string;
};
export type SalesPlanActionErrorKind = 'validation' | 'authentication' | 'permission' | 'conflict' | 'rateLimited' | 'unavailable' | 'failed';
/** 动作模型同时负责输入白名单、状态转换、回执一致性和“是否可重试”分类。 */
export declare class SalesPlanActionError extends Error {
    readonly kind: SalesPlanActionErrorKind;
    readonly retrySameIntent: boolean;
    readonly retryAfterMs?: number | undefined;
    constructor(kind: SalesPlanActionErrorKind, retrySameIntent: boolean, retryAfterMs?: number | undefined, options?: ErrorOptions);
}
/** 节点顺序表示角色身份（customer=1、region=2……），绝不是计划状态。 */
export declare const salesPlanApprovalNodeForStatus: (status: number, typeCode?: string, workflowRows?: readonly SalesPlanWorkflowRow[]) => number | undefined;
export declare const salesPlanActionTargetStatus: (action: GeaSalesPlanActionRequest["action"], status: number, typeCode?: string, workflowRows?: readonly SalesPlanWorkflowRow[]) => number | undefined;
export declare const validateSalesPlanActionInput: (input: SalesPlanActionInput, workflowRows?: readonly SalesPlanWorkflowRow[]) => void;
export declare const businessSafeErrorMessage: (message: unknown) => string | undefined;
/** 技术细节只进日志，并返回一个可口头转述的错误编号，供用户报给管理员核对。 */
export declare const reportSalesPlanError: (scope: string, detail: unknown) => string;
export declare const classifySalesPlanActionError: (error: unknown) => SalesPlanActionError;
export declare const salesPlanActionReceiptMatches: (input: SalesPlanActionInput, requestId: string, receipt: GeaSalesPlanActionReceipt) => boolean;
export declare class SalesPlanActionAttempt {
    private readonly client;
    private readonly createId;
    private command?;
    private input?;
    private inFlight?;
    private receipt?;
    private failure?;
    constructor(client: SalesPlanActionClient, createId?: () => string);
    submit(input: SalesPlanActionInput): Promise<GeaSalesPlanActionReceipt>;
    retry(): Promise<GeaSalesPlanActionReceipt>;
    private invoke;
}
