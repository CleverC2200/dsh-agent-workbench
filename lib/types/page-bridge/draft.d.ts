/**
 * 页面草稿动作共用限流、超时、确认和回执。
 * 页面声明元素，执行由调用者提供；本模块不写业务数据。
 */
export type DraftEffect = 'view' | 'draft' | 'submit' | 'approve';
export type DraftRequest = {
    sessionId: string;
    /** 页面标识（能力契约里的 surface）。 */
    surface: string;
    /** 通用动词：setValue / invoke / select / clear。 */
    kind: string;
    targets: readonly string[];
    effect: DraftEffect;
    reason?: string;
};
export type DraftReceiptOutcome = 'pending' | 'applied' | 'rejected' | 'timeout' | 'failed';
export type DraftReceipt = {
    id: string;
    at: number;
    sessionId: string;
    surface: string;
    kind: string;
    targets: string[];
    effect: DraftEffect;
    reason?: string;
    outcome: DraftReceiptOutcome;
    error?: string;
    durationMs?: number;
};
export type DraftBeginResult = {
    ok: true;
    receiptId: string;
} | {
    ok: false;
    code: string;
    reason: string;
};
export type DraftLayerOptions = {
    /** 统计窗口，默认 1 分钟。 */
    windowMs?: number;
    /** 单个会话在窗口内最多改多少次，默认 30。 */
    maxPerWindow?: number;
    /** 保留多少条回执供追溯，默认 200。 */
    maxReceipts?: number;
    now?: () => number;
    id?: () => string;
};
export type DraftLayer = {
    begin(request: DraftRequest): DraftBeginResult;
    finish(receiptId: string, outcome: {
        applied: boolean;
        error?: string;
        timedOut?: boolean;
    }): DraftReceipt | undefined;
    /** 最近的回执（新到旧），用来回答"刚才那次改动到底怎么了"。 */
    receipts(): readonly DraftReceipt[];
    /** 某会话最近一条回执。 */
    lastFor(sessionId: string): DraftReceipt | undefined;
};
export declare function createDraftLayer(options?: DraftLayerOptions): DraftLayer;
