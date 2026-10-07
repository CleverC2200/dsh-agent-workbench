/**
 * "改草稿"这一层能力的统一实现。
 *
 * 迁移前后的业务页面都要被对话改草稿（改输入框、点按钮、选行），但限流、超时、
 * 确认策略和回执这几件事不该在每个页面里各写一遍：页面只声明"我有这些元素"，
 * 执行就走这一层。这样新页面接入时不用再写执行逻辑，行为也一致。
 *
 * 这一层只记账和把关，不认识任何具体业务，也不碰业务数据。
 */
export type DraftEffect = "view" | "draft" | "submit" | "approve";
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
export type DraftReceiptOutcome = "pending" | "applied" | "rejected" | "timeout" | "failed";
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
