import { openBranchDms } from './html-dms-navigation.ts';
import type { PageExecutionConnection, WorkbenchPageExecution } from './frame.ts';
import { startPageBridgeClient } from './page-interaction/page-bridge/client.ts';

/** One owned HTML port/lease. Switching identity or reference destroys this exact connection. */
export function connectHtmlFrame(
  frame: HTMLIFrameElement,
  connection: PageExecutionConnection,
  execution: WorkbenchPageExecution,
  theme: () => {
    active: { colorScheme: string; tokens: Record<string, string> };
    fontSize: number;
  },
  signal: AbortSignal,
  failed: (error: unknown) => void,
): { (): void; sendTheme(): void } {
  const lifetime = new AbortController();
  const channel = new MessageChannel();
  const tasks = new Map<string, AbortController>();
  const applies = new Map<string, (result: { applied: boolean; error?: string }) => void>();
  let connected = false,
    themeRequested = false;
  let elements: unknown[] | null = null;
  let pollTimer: ReturnType<typeof setTimeout> | undefined;
  const context = { plugin: connection.page.pluginId, session: connection.sessionId };
  const alive = () => !lifetime.signal.aborted && !signal.aborted;
  const call = (method: string, parameters: unknown, requestSignal = lifetime.signal) =>
    execution.call(
      connection,
      method,
      parameters,
      AbortSignal.any([signal, lifetime.signal, requestSignal]),
    );
  const sendTheme = () => {
    if (!alive() || !connected || !themeRequested) return;
    const snapshot = theme();
    channel.port1.postMessage({
      type: 'theme',
      context,
      version: '1.1.1',
      colorScheme: snapshot.active.colorScheme,
      fontSize: snapshot.fontSize,
      tokens: snapshot.active.tokens,
    });
  };
  const ready = (event: MessageEvent) => {
    if (
      !alive() ||
      event.source !== frame.contentWindow ||
      event.data?.protocol !== 'gea-html-v2' ||
      event.data.type !== 'ready' ||
      connected
    )
      return;
    connected = true;
    frame.contentWindow?.postMessage({ protocol: 'gea-html-v2', type: 'connect', context }, '*', [
      channel.port2,
    ]);
  };
  window.addEventListener('message', ready);
  const pageBridge = startPageBridgeClient({
    endpoint: 'page-bridge',
    request: (_endpoint, payload) => call('page-bridge', payload),
    sessionId: connection.sessionId,
    catalog: () => (elements === null ? null : { elements }),
    apply: (args, meta, applySignal) =>
      new Promise((resolve) => {
        const settle = (result: { applied: boolean; error?: string }) => {
          applies.delete(meta.toolCallId);
          applySignal.removeEventListener('abort', cancel);
          resolve(result);
        };
        const cancel = () => {
          channel.port1.postMessage({
            type: 'cancel',
            session: connection.sessionId,
            toolCallId: meta.toolCallId,
          });
          settle({ applied: false, error: 'PAGE_ACTION_CANCELLED' });
        };
        applies.set(meta.toolCallId, settle);
        if (!alive() || applySignal.aborted) return cancel();
        applySignal.addEventListener('abort', cancel, { once: true });
        channel.port1.postMessage({
          type: 'apply',
          session: connection.sessionId,
          toolCallId: meta.toolCallId,
          toolCallName: meta.toolCallName,
          args,
        });
      }),
  });
  channel.port1.onmessage = async (event) => {
    if (!alive()) return;
    const message = event.data;
    if (!message || typeof message !== 'object') return;
    try {
      if (
        [
          'request',
          'register',
          'invoked',
          'catalog',
          'applied',
          'cancel',
          'theme:subscribe',
        ].includes(message.type) &&
        message.session !== connection.sessionId
      )
        throw Error('PAGE_SESSION_CHANGED');
      if (message.type === 'theme:subscribe') {
        themeRequested = true;
        sendTheme();
        return;
      }
      if (message.type === 'catalog') {
        elements =
          Array.isArray(message.elements) && message.elements.length ? message.elements : null;
        return;
      }
      if (message.type === 'applied') {
        applies.get(message.toolCallId)?.({
          applied: message.applied === true,
          ...(typeof message.error === 'string' ? { error: message.error } : {}),
        });
        return;
      }
      if (message.type === 'cancel') {
        tasks.get(message.id)?.abort();
        return;
      }
      if (message.type === 'register') {
        await call('register', { name: message.name, description: message.description });
        return;
      }
      if (message.type === 'invoked') {
        await call('reply', message);
        return;
      }
      if (message.type !== 'request' || typeof message.id !== 'string') return;
      const task = new AbortController();
      tasks.set(message.id, task);
      try {
        let result: unknown;
        if (message.method === 'draft') {
          const input = message.parameters;
          if (
            !input ||
            Object.keys(input).some((key) => key !== 'text') ||
            typeof input.text !== 'string' ||
            !input.text.trim() ||
            input.text.length > 10000
          )
            throw Error('INVALID_PAGE_DRAFT');
          await execution.draft(
            connection,
            input.text,
            AbortSignal.any([signal, lifetime.signal, task.signal]),
          );
          result = { drafted: true };
        } else if (message.method === 'branch-dms-open') {
          result = await openBranchDms(
            connection.page.id,
            message.parameters,
            () => call('branch-dms', { operation: 'login' }, task.signal),
            () => alive() && !task.signal.aborted,
            (url) => {
              window.open(url, '_blank', 'noopener,noreferrer');
            },
          );
        } else if (message.method === 'conversation') {
          const text = message.parameters?.text;
          if (
            typeof text !== 'string' ||
            !text.trim() ||
            text.length > 10000 ||
            JSON.stringify(message.parameters?.context ?? {}).length > 100000
          )
            throw Error('INVALID_PAGE_QUESTION');
          await call('context', message.parameters?.context, task.signal);
          if (!alive() || task.signal.aborted) return;
          await execution.prompt(
            connection,
            text,
            AbortSignal.any([signal, lifetime.signal, task.signal]),
          );
          result = { sent: true };
        } else if (
          [
            'sql',
            'workspace',
            'access',
            'context',
            'branch-dms',
            'insight',
            'branch-storage',
          ].includes(message.method)
        )
          result = await call(message.method, message.parameters, task.signal);
        else throw Error('HTML_METHOD_NOT_ALLOWED');
        if (alive() && !task.signal.aborted)
          channel.port1.postMessage({ type: 'response', id: message.id, result });
      } finally {
        tasks.delete(message.id);
      }
    } catch (error) {
      if (alive())
        channel.port1.postMessage({
          type: 'response',
          id: message.id,
          error: error instanceof Error ? error.message : String(error),
        });
    }
  };
  channel.port1.start();
  frame.contentWindow?.postMessage({ protocol: 'gea-html-v2', type: 'request-ready' }, '*');
  const poll = async () => {
    try {
      const events = await call('events', undefined);
      if (alive()) for (const event of events) channel.port1.postMessage(event);
    } catch (error) {
      if (alive()) {
        failed(error);
        dispose();
      }
    }
    if (alive()) pollTimer = setTimeout(poll, 1000);
  };
  const dispose = () => {
    if (lifetime.signal.aborted) return;
    lifetime.abort();
    signal.removeEventListener('abort', dispose);
    pageBridge();
    if (pollTimer) clearTimeout(pollTimer);
    for (const task of tasks.values()) task.abort();
    tasks.clear();
    for (const settle of Array.from(applies.values()))
      settle({ applied: false, error: 'PAGE_ACTION_CANCELLED' });
    channel.port1.postMessage({ type: 'context', context: null });
    window.removeEventListener('message', ready);
    channel.port1.close();
    channel.port2.close();
  };
  signal.addEventListener('abort', dispose, { once: true });
  if (signal.aborted) dispose();
  else void poll();
  // Theme updates are sent through the same owned port, never a second identity channel.
  return Object.assign(dispose, { sendTheme });
}
