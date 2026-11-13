import {
  AGUI_EVENT_TOOL_CALL_ARGS,
  AGUI_EVENT_TOOL_CALL_END,
  AGUI_EVENT_TOOL_CALL_START,
  type AgUiEvent,
  type AgUiToolMessage,
} from './protocol.ts';

export type PageBridgeApplyResult = { applied: boolean; error?: string };

export type PageBridgeApply = (
  args: unknown,
  meta: { toolCallId: string; toolCallName: string },
  signal: AbortSignal,
) => PageBridgeApplyResult | Promise<PageBridgeApplyResult>;

export type PageBridgeClientOptions = {
  endpoint: string;

  request: <T>(endpoint: string, payload: object) => Promise<T>;

  sessionId: string | null;

  apply: PageBridgeApply;

  pollMs?: number;

  initialDelayMs?: number;

  applyTimeoutMs?: number;

  onError?: (error: unknown) => void;

  closeOnDispose?: boolean;

  catalog?: () => unknown;
};

export function startPageBridgeClient(options: PageBridgeClientOptions): () => void {
  if (options.sessionId === null) return () => {};
  const pollMs = options.pollMs ?? 1200;
  const initialDelayMs = options.initialDelayMs ?? 500;
  const applyTimeoutMs = options.applyTimeoutMs ?? 8000;
  const buffers = new Map<string, string>();
  const names = new Map<string, string>();
  const settled = new Set<string>();
  const activeApplies = new Map<string, AbortController>();
  const outbox: AgUiToolMessage[] = [];
  let counter = 0;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout>;
  const closeOnDispose = options.closeOnDispose ?? true;

  const message = (toolCallId: string, result: PageBridgeApplyResult): AgUiToolMessage => ({
    id: `page-bridge-result-${++counter}`,
    role: 'tool',
    toolCallId,
    content: JSON.stringify({ toolCallId, applied: result.applied }),
    ...(result.error ? { error: result.error } : {}),
  });

  const runApply = async (
    toolCallId: string,
    toolCallName: string,
    args: unknown,
  ): Promise<PageBridgeApplyResult> => {
    const controller = new AbortController();
    activeApplies.set(toolCallId, controller);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    try {
      return await Promise.race([
        Promise.resolve(options.apply(args, { toolCallId, toolCallName }, controller.signal)),
        new Promise<PageBridgeApplyResult>((resolve) => {
          controller.signal.addEventListener(
            'abort',
            () => {
              if (!timedOut) resolve({ applied: false, error: 'APPLY_CANCELLED' });
            },
            { once: true },
          );
          timeout = setTimeout(() => {
            timedOut = true;
            controller.abort();
            resolve({ applied: false, error: 'APPLY_TIMEOUT' });
          }, applyTimeoutMs);
        }),
      ]);
    } catch {
      return { applied: false, error: 'APPLY_FAILED' };
    } finally {
      if (timeout) clearTimeout(timeout);
      activeApplies.delete(toolCallId);
    }
  };

  const poll = async (): Promise<void> => {
    const pending = outbox.slice();
    try {
      const result = await options.request<{ events: AgUiEvent[] }>(options.endpoint, {
        sessionId: options.sessionId,
        toolMessages: pending,
        ...(options.catalog ? { catalog: options.catalog() } : {}),
        pageSource: 'self-report',
      });
      if (stopped) return;

      outbox.splice(0, pending.length);
      for (const event of result.events ?? []) {
        if (event.type === AGUI_EVENT_TOOL_CALL_START) {
          buffers.set(event.toolCallId, '');
          names.set(event.toolCallId, event.toolCallName);
          continue;
        }
        if (event.type === AGUI_EVENT_TOOL_CALL_ARGS) {
          buffers.set(event.toolCallId, (buffers.get(event.toolCallId) ?? '') + event.delta);
          continue;
        }
        if (event.type !== AGUI_EVENT_TOOL_CALL_END) continue;
        const raw = buffers.get(event.toolCallId) ?? '';
        const toolCallName = names.get(event.toolCallId) ?? '';
        buffers.delete(event.toolCallId);
        names.delete(event.toolCallId);
        if (settled.has(event.toolCallId)) continue;
        settled.add(event.toolCallId);
        let args: unknown;
        try {
          args = JSON.parse(raw);
        } catch {
          outbox.push(
            message(event.toolCallId, { applied: false, error: 'INVALID_TOOL_ARGUMENTS' }),
          );
          continue;
        }
        const outcome = await runApply(event.toolCallId, toolCallName, args);
        if (stopped) return;
        outbox.push(message(event.toolCallId, outcome));
      }
    } catch (error) {
      if (stopped) return;
      options.onError?.(error);
    }
    if (!stopped) timer = setTimeout(() => void poll(), pollMs);
  };

  timer = setTimeout(() => void poll(), initialDelayMs);
  return () => {
    stopped = true;
    clearTimeout(timer);
    for (const controller of activeApplies.values()) controller.abort();
    activeApplies.clear();

    if (!closeOnDispose || typeof options.sessionId !== 'string') return;
    try {
      void Promise.resolve(
        options.request(options.endpoint, {
          sessionId: options.sessionId,
          toolMessages: [],
          catalog: null,
          pageSource: 'self-report',
        }),
      ).catch(() => {});
    } catch {}
  };
}
