/**
 * 页面桥协议层：AG-UI「前端工具」链路用到的事件与消息形状。
 *
 * 这里刻意不放任何业务词（不含 GEA、审批、销售计划）：它只描述
 * 「agent 发起前端工具调用 -> 页面执行 -> 用 tool 消息回填结果」这一次往返。
 * 业务方负责告诉桥"工具叫什么、参数长什么样、怎么执行"。
 *
 * 协议依据：AG-UI 的前端工具调用生命周期与 ToolMessage 类型。
 *
 * 类型与事件字段按 AG-UI 契约声明；本层不加载额外协议运行时。
 */
/** agent -> 页面：工具调用开始。 */
export declare const AGUI_EVENT_TOOL_CALL_START: "TOOL_CALL_START";
/** agent -> 页面：工具参数增量（AG-UI 是流式的；一次发完也合法）。 */
export declare const AGUI_EVENT_TOOL_CALL_ARGS: "TOOL_CALL_ARGS";
/** agent -> 页面：工具调用结束，参数已完整。 */
export declare const AGUI_EVENT_TOOL_CALL_END: "TOOL_CALL_END";
export type AgUiToolCallStartEvent = {
    type: typeof AGUI_EVENT_TOOL_CALL_START;
    toolCallId: string;
    toolCallName: string;
};
export type AgUiToolCallArgsEvent = {
    type: typeof AGUI_EVENT_TOOL_CALL_ARGS;
    toolCallId: string;
    delta: string;
};
export type AgUiToolCallEndEvent = {
    type: typeof AGUI_EVENT_TOOL_CALL_END;
    toolCallId: string;
};
export type AgUiEvent = AgUiToolCallStartEvent | AgUiToolCallArgsEvent | AgUiToolCallEndEvent;
/**
 * 页面 -> agent：工具结果，也就是 AG-UI 的 tool 消息。
 * 失败必须带 error，否则协议里"失败"和"成功"分不出来。
 */
export type AgUiToolMessage = {
    id: string;
    role: "tool";
    toolCallId: string;
    content: string;
    error?: string;
};
/** 桥自己的防护上限；业务参数上限由业务方自己定义。 */
export declare const PAGE_BRIDGE_LIMITS: {
    /** 单个会话最多同时挂起多少条待执行的前端工具调用。 */
    readonly maxQueued: 20;
    /** 命令在页面取走前的最长存活时间。 */
    readonly ttlMs: 60000;
    /** 工具名与各类 id 的最大长度。 */
    readonly maxIdLength: 128;
    /** 单条工具结果 content 的最大长度。 */
    readonly maxMessageLength: 4096;
};
/** 页面上报的工具结果按不可信数据处理：只认 AG-UI 的 tool 消息形状。 */
export declare function validateToolMessages(value: unknown): AgUiToolMessage[];
