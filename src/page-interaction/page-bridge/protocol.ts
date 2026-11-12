export const AGUI_EVENT_TOOL_CALL_START = 'TOOL_CALL_START' as const;

export const AGUI_EVENT_TOOL_CALL_ARGS = 'TOOL_CALL_ARGS' as const;

export const AGUI_EVENT_TOOL_CALL_END = 'TOOL_CALL_END' as const;

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

export type AgUiToolMessage = {
  id: string;
  role: 'tool';
  toolCallId: string;
  content: string;
  error?: string;
};

export const PAGE_BRIDGE_LIMITS = {
  maxQueued: 20,

  ttlMs: 60_000,

  maxIdLength: 128,

  maxMessageLength: 4096,
} as const;

function bridgeObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('INVALID_PAGE_BRIDGE_MESSAGE');
  return value as Record<string, unknown>;
}

function bridgeText(value: unknown, max: number): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > max)
    throw new Error('INVALID_PAGE_BRIDGE_MESSAGE');
  return value;
}

export function validateToolMessages(value: unknown): AgUiToolMessage[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > PAGE_BRIDGE_LIMITS.maxQueued)
    throw new Error('INVALID_PAGE_BRIDGE_MESSAGE');
  return value.map((candidate) => {
    const message = bridgeObject(candidate);
    if (
      Object.keys(message).some(
        (key) =>
          key !== 'id' &&
          key !== 'role' &&
          key !== 'toolCallId' &&
          key !== 'content' &&
          key !== 'error',
      )
    )
      throw new Error('INVALID_PAGE_BRIDGE_MESSAGE');
    if (message.role !== 'tool') throw new Error('INVALID_PAGE_BRIDGE_MESSAGE');
    if (
      typeof message.content !== 'string' ||
      message.content.length > PAGE_BRIDGE_LIMITS.maxMessageLength
    )
      throw new Error('INVALID_PAGE_BRIDGE_MESSAGE');
    return {
      id: bridgeText(message.id, PAGE_BRIDGE_LIMITS.maxIdLength),
      role: 'tool' as const,
      toolCallId: bridgeText(message.toolCallId, PAGE_BRIDGE_LIMITS.maxIdLength),
      content: message.content,
      ...(message.error === undefined ? {} : { error: bridgeText(message.error, 512) }),
    };
  });
}
