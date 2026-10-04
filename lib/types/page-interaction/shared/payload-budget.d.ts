/**
 * 给模型看的载荷压缩：**不要上下文爆炸**。
 *
 * 线上实测：一张分仓库存页的元素目录 19.8KB 被写进工具说明，每次请求都要付一次；
 * 页面上下文 17KB 还被重复拉了三次。规则改成本文件：小载荷原样过；带 focus 就只留
 * 命中的行/字段；超过预算就退成"摘要（数量 + 字段名 + 极少量样本）"，并如实标注
 * 省略了多少、怎么再取。绝不因为"太大"整条丢掉，也绝不带与问题无关的明细。
 *
 * 纯函数，不认识任何业务。
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
