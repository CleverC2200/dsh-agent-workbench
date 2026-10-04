import { type GeaSalesPlanApprovalLog, type GeaSalesPlanDetail, type GeaSalesPlanResourceQuery, type GeaSalesPlanSku, type GeaSalesPlanSkuDiff, type GeaSalesPlanVersion, type GeaSalesPlanVersionSkuQuery, type GeaSalesPlanCompareQuery } from '../../../bridge.ts';
/** 详情、SKU 和版本比较是三个独立状态机；每次选择变化都校验归属并取消上一轮请求。 */
export type SalesPlanDetailError = 'permission' | 'expired' | 'missing' | 'versionMismatch' | 'timeout' | 'unavailable' | 'cancelled' | 'failed';
export type SalesPlanDetailState<T> = {
    status: 'idle';
    data?: undefined;
    error?: undefined;
} | {
    status: 'loading';
    data?: undefined;
    error?: undefined;
} | {
    status: 'success';
    data: T;
    error?: undefined;
} | {
    status: 'error';
    data?: undefined;
    error: SalesPlanDetailError;
};
export type SalesPlanDetailClient = {
    detail: {
        invoke: (query: GeaSalesPlanResourceQuery) => Promise<GeaSalesPlanDetail>;
    };
    versions: {
        invoke: (query: GeaSalesPlanResourceQuery) => Promise<GeaSalesPlanVersion[]>;
    };
    logs: {
        invoke: (query: GeaSalesPlanResourceQuery) => Promise<GeaSalesPlanApprovalLog[]>;
    };
    versionSkus: {
        invoke: (query: GeaSalesPlanVersionSkuQuery) => Promise<GeaSalesPlanSku[]>;
    };
    compare: {
        invoke: (query: GeaSalesPlanCompareQuery) => Promise<GeaSalesPlanSkuDiff[]>;
    };
};
type SalesPlanOverview = {
    detail: GeaSalesPlanDetail;
    versions: GeaSalesPlanVersion[];
    logs: GeaSalesPlanApprovalLog[];
};
export declare const classifySalesPlanDetailError: (error: unknown, timedOut?: boolean) => SalesPlanDetailError;
export declare const useSalesPlanDetail: ({ client: suppliedClient, planId, initialVersionId, initialFromVersionId, initialToVersionId, }: {
    client?: SalesPlanDetailClient;
    planId?: string;
    initialVersionId?: string;
    initialFromVersionId?: string;
    initialToVersionId?: string;
}) => {
    overviewState: SalesPlanDetailState<SalesPlanOverview>;
    skuState: SalesPlanDetailState<GeaSalesPlanSku[]>;
    compareState: SalesPlanDetailState<GeaSalesPlanSkuDiff[]>;
    selectedVersionId: string | undefined;
    fromVersionId: string | undefined;
    toVersionId: string | undefined;
    selectVersion: import("react").Dispatch<import("react").SetStateAction<string | undefined>>;
    selectFromVersion: import("react").Dispatch<import("react").SetStateAction<string | undefined>>;
    selectToVersion: import("react").Dispatch<import("react").SetStateAction<string | undefined>>;
    retryOverview: () => void;
    retrySkus: () => void;
    retryCompare: () => void;
};
export {};
