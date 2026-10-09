/** 改编自 AionUi（Apache-2.0）：已替换为本地导入并使用显式 DSH Host 适配器，见 SOURCE.md。 */
import { type SalesPlanWorkflowRow } from '../../../salesPlanWorkflow.ts';
import type { GeaSalesPlanDetail, GeaSalesPlanPeriod, GeaSalesPlanSku, GeaSalesPlanSubmitParams, GeaSalesPlanSubmitReceipt, GeaSalesPlanSubmitRequest } from '../../../bridge.ts';
export type SalesPlanCurrentUser = {
    id: string;
    username: string;
};
export type SalesPlanSubmitClient = {
    detail: {
        invoke: (query: {
            planId: string;
            signal?: AbortSignal;
        }) => Promise<GeaSalesPlanDetail>;
    };
    versionSkus: {
        invoke: (query: {
            versionId: string;
            signal?: AbortSignal;
        }) => Promise<GeaSalesPlanSku[]>;
    };
    currentUser: {
        invoke: () => Promise<SalesPlanCurrentUser>;
    };
    submit: {
        invoke: (params: GeaSalesPlanSubmitParams) => Promise<GeaSalesPlanSubmitReceipt>;
    };
};
export type SalesPlanResubmitSource = {
    period: GeaSalesPlanPeriod;
    planId: string;
    versionId: string;
    detail: GeaSalesPlanDetail;
    skus: GeaSalesPlanSku[];
    currentUser: SalesPlanCurrentUser;
    channelCode?: string;
};
export type SalesPlanSubmitInput = {
    request: GeaSalesPlanSubmitRequest;
    sourceSummary: {
        skuCount: number;
        submittedQty: string;
        submittedAmount: string;
    };
    expected: {
        planId: string;
        previousVersionId: string;
        nextSeq: number;
        nextStatus: number;
    };
};
export type SalesPlanSubmitErrorKind = 'validation' | 'sourceMismatch' | 'authentication' | 'permission' | 'conflict' | 'rateLimited' | 'serviceUnavailable' | 'retryExhausted' | 'unavailable' | 'failed';
export declare class SalesPlanSubmitError extends Error {
    readonly kind: SalesPlanSubmitErrorKind;
    readonly retrySameIntent: boolean;
    readonly retryAfterMs?: number | undefined;
    constructor(kind: SalesPlanSubmitErrorKind, retrySameIntent: boolean, retryAfterMs?: number | undefined, options?: ErrorOptions);
}
export declare const salesPlanChannelCodeForPlanId: (planId: string, periodMonth: string) => string | undefined;
/** 重提请求必须由当前 GEA 来源重建，并用精确整数刻度校验数量、金额和边界。 */
export declare const prepareSalesPlanResubmit: (source: SalesPlanResubmitSource, rows?: readonly SalesPlanWorkflowRow[]) => SalesPlanSubmitInput;
export declare const classifySalesPlanSubmitError: (error: unknown) => SalesPlanSubmitError;
export declare const salesPlanSubmitReceiptMatches: (input: SalesPlanSubmitInput, requestId: string, receipt: GeaSalesPlanSubmitReceipt) => boolean;
export declare class SalesPlanSubmitAttempt {
    private readonly client;
    private readonly createId;
    private static readonly MAX_CALLS;
    private command?;
    private input?;
    private inFlight?;
    private receipt?;
    private failure?;
    private callCount;
    constructor(client: Pick<SalesPlanSubmitClient, 'submit'>, createId?: () => string);
    submit(input: SalesPlanSubmitInput): Promise<GeaSalesPlanSubmitReceipt>;
    retry(): Promise<GeaSalesPlanSubmitReceipt>;
    private invoke;
    private exhausted;
}
/** 刷新队列前确认新的生效版本及其重提日志。 */
export declare const salesPlanResubmitReadbackMatches: (previousVersionId: string, receipt: GeaSalesPlanSubmitReceipt, detail: GeaSalesPlanDetail, request?: GeaSalesPlanSubmitRequest) => boolean;
