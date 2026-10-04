// src/page-interaction/page-bridge/protocol.ts
var AGUI_EVENT_TOOL_CALL_START = "TOOL_CALL_START";
var AGUI_EVENT_TOOL_CALL_ARGS = "TOOL_CALL_ARGS";
var AGUI_EVENT_TOOL_CALL_END = "TOOL_CALL_END";
var PAGE_BRIDGE_LIMITS = {
  /** 单个会话最多同时挂起多少条待执行的前端工具调用。 */
  maxQueued: 20,
  /** 命令在页面取走前的最长存活时间。 */
  ttlMs: 6e4,
  /** 工具名与各类 id 的最大长度。 */
  maxIdLength: 128,
  /** 单条工具结果 content 的最大长度。 */
  maxMessageLength: 4096
};
function bridgeObject(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("INVALID_PAGE_BRIDGE_MESSAGE");
  return value;
}
function bridgeText(value, max) {
  if (typeof value !== "string" || value.length === 0 || value.length > max)
    throw new Error("INVALID_PAGE_BRIDGE_MESSAGE");
  return value;
}
function validateToolMessages(value) {
  if (value === void 0) return [];
  if (!Array.isArray(value) || value.length > PAGE_BRIDGE_LIMITS.maxQueued)
    throw new Error("INVALID_PAGE_BRIDGE_MESSAGE");
  return value.map((candidate) => {
    const message = bridgeObject(candidate);
    if (Object.keys(message).some(
      (key) => key !== "id" && key !== "role" && key !== "toolCallId" && key !== "content" && key !== "error"
    ))
      throw new Error("INVALID_PAGE_BRIDGE_MESSAGE");
    if (message.role !== "tool")
      throw new Error("INVALID_PAGE_BRIDGE_MESSAGE");
    if (typeof message.content !== "string" || message.content.length > PAGE_BRIDGE_LIMITS.maxMessageLength)
      throw new Error("INVALID_PAGE_BRIDGE_MESSAGE");
    return {
      id: bridgeText(message.id, PAGE_BRIDGE_LIMITS.maxIdLength),
      role: "tool",
      toolCallId: bridgeText(
        message.toolCallId,
        PAGE_BRIDGE_LIMITS.maxIdLength
      ),
      content: message.content,
      ...message.error === void 0 ? {} : { error: bridgeText(message.error, 512) }
    };
  });
}
export {
  AGUI_EVENT_TOOL_CALL_ARGS,
  AGUI_EVENT_TOOL_CALL_END,
  AGUI_EVENT_TOOL_CALL_START,
  PAGE_BRIDGE_LIMITS,
  validateToolMessages
};
