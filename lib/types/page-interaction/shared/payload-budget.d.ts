/**
 * 控制每次进入模型的载荷，避免重复携带整页目录和明细。
 * 小载荷原样返回；focus 只筛记录数组，标识与标量列表保留状态。
 * 超预算返回摘要，并标明省略数量和后续取数方式；不丢弃整条上下文。
 * 纯计算不执行查询或业务动作。
 */
/** 单次进模型上下文的默认预算（字节）。 */
export declare const MODEL_PAYLOAD_BUDGET = 12000;
/** 从用户问题/模型给的 focus 里切出关键词；太短的词没有区分度，直接丢。 */
export declare function focusTokens(focus?: string): string[];
export declare const truncateText: (value: string, maxChars: number) => string;
export type CompressedPayload = {
    /** 可以直接交给模型的 JSON 字符串。 */
    json: string;
    /** 有没有压缩过。 */
    compressed: boolean;
    /** 被略过的条目数（行/元素）。 */
    omitted: number;
    /** 需要告诉模型的取数提示；没压缩时为 undefined。 */
    note?: string;
};
/**
 * 压到预算内。
 *
 * 顺序：① 原样（小载荷 + 无 focus）；② 按 focus 收窄；③ 摘要；
 * ④ 仍然超预算就继续减少样本与字段长度，最后至少还有 key 结构。
 */
export declare function compressForModel(payload: unknown, options?: {
    budgetBytes?: number;
    focus?: string;
    maxItems?: number;
    maxChars?: number;
}): CompressedPayload;
