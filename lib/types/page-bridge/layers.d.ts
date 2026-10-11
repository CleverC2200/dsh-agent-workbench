/**
 * 集中维护能力层的限流、超时、回执、执行确认和写入策略。
 * 页面声明允许的能力层，执行侧使用同一策略；本表不执行业务动作。
 */
/** 影响等级（与契约里的 effect 同一套名字，这里避免反向依赖）。 */
export type LayerEffect = 'view' | 'draft' | 'submit' | 'approve';
export declare const CAPABILITY_LAYERS: readonly ["read", "draft", "submit", "approve", "export"];
export type CapabilityLayer = (typeof CAPABILITY_LAYERS)[number];
export type LayerPolicy = {
    /** 这一层要不要在宿主侧留回执（可追溯"刚才那次到底怎么了"）。 */
    receipt: boolean;
    /** 单次调用超时（毫秒）。 */
    timeoutMs: number;
    /** 同一个会话在这一层每分钟最多多少次。 */
    maxPerMinute: number;
    /** 执行前是否必须复述对象 + 动作 + 依据（写业务数据的两层要）。 */
    confirm: boolean;
    /** 会不会改业务数据（只读与改草稿都不改）。 */
    writes: boolean;
};
export declare const LAYER_POLICY: Record<CapabilityLayer, LayerPolicy>;
export declare function layerRank(layer: CapabilityLayer): number;
/** 元素影响等级 → 能力层。 */
export declare function layerForEffect(effect: LayerEffect): CapabilityLayer;
/**
 * 契约声明"我有哪几层"：
 * - 有页面或可读数据 → 有读层；
 * - 最大影响等级决定 draft / submit / approve 展开到哪一层；
 * - 模块显式声明的层与派生结果取并集（将来模块自己声明时直接生效）。
 */
export declare function layersForContract(input: {
    hasView?: boolean;
    hasData?: boolean;
    maxEffect: LayerEffect;
    declared?: readonly CapabilityLayer[];
}): CapabilityLayer[];
/** 这一层的策略；模块不允许的层不放行（读层永远可用，兜底数据问题）。 */
export declare function layerPolicy(layer: CapabilityLayer): LayerPolicy;
