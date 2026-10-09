import { sqlQueryError } from './query-error.js';
let context;
let channel,
  sequence = 0;
const pending = new Map(),
  handlers = new Map();
let appliedThemeTokens = [];
const pageGroups = new Map();
const applying = new Map();
const invoking = new Map();
function cancelActions() {
  for (const task of applying.values()) task.abort();
  for (const task of invoking.values()) task.controller.abort();
}
function reportCatalog() {
  if (!channel || !context?.session) return;
  channel.postMessage({
    type: 'catalog',
    session: context.session,
    elements: [...pageGroups.values()].flatMap((group) => group.elements),
  });
}
/** Page components supply visible elements and state callbacks; no DOM discovery. */
export function reportElements(key, elements, apply) {
  const group = { elements, apply };
  pageGroups.set(key, group);
  reportCatalog();
  return () => {
    if (pageGroups.get(key) !== group) return;
    pageGroups.delete(key);
    reportCatalog();
  };
}
let readyResolve;
export const ready = new Promise((resolve) => {
  readyResolve = resolve;
});
/** Read the current Host-owned Session projection, including after a reconnect. */
export function currentSessionId() {
  return context?.session;
}
function parentOrigin() {
  try {
    const url = new URL(document.referrer || window.location.href);
    if (!url.host) return undefined;
    // Electron serializes the current registered dsh-app origin with its host.
    if (url.origin !== 'null') return url.origin;
    return url.protocol === 'dsh-app:' && url.host === 'app' ? 'dsh-app://app' : undefined;
  } catch {
    return undefined;
  }
}
window.addEventListener('message', (event) => {
  if (
    event.source === window.parent &&
    event.data?.protocol === 'gea-html-v2' &&
    event.data.type === 'request-ready'
  ) {
    window.parent.postMessage({ protocol: 'gea-html-v2', type: 'ready' }, '*');
    return;
  }
  if (
    event.source !== window.parent ||
    event.origin !== parentOrigin() ||
    typeof event.data?.context?.session !== 'string' ||
    typeof event.data?.context?.plugin !== 'string' ||
    event.data?.protocol !== 'gea-html-v2' ||
    event.data?.type !== 'connect' ||
    !event.ports[0] ||
    (channel && context?.session === event.data.context.session)
  )
    return;
  if (channel) {
    window.dispatchEvent(new Event('gea-session-changing'));
    channel.close();
    cancelActions();
    for (const item of pending.values()) {
      clearTimeout(item.timer);
      item.cleanup?.();
      item.reject(Error('页面会话已切换，请重新操作'));
    }
    pending.clear();
  }
  context = event.data.context;
  channel = event.ports[0];
  channel.onmessage = (event) => {
    const message = event.data;
    if (message.type === 'context') {
      const previousSession = context?.session;
      if (previousSession && previousSession !== message.context?.session) {
        window.dispatchEvent(new Event('gea-session-changing'));
        for (const [id, item] of pending) {
          clearTimeout(item.timer);
          item.cleanup?.();
          item.reject(Error('页面会话已切换，请重新操作'));
          channel.postMessage({ type: 'cancel', id, session: previousSession });
        }
        pending.clear();
      }
      cancelActions();
      context = message.context;
      reportCatalog();
      if (context?.session)
        channel.postMessage({
          type: 'theme:subscribe',
          session: context.session,
        });
      if (context?.session && previousSession !== context.session)
        window.dispatchEvent(new Event('gea-session-changed'));
    }
    if (
      message.type === 'theme' &&
      context &&
      message.context?.session === context.session &&
      message.context?.plugin === context.plugin
    ) {
      if (
        message.version !== '1.1.1' ||
        !['light', 'dark'].includes(message.colorScheme) ||
        !message.tokens ||
        !Number.isInteger(message.fontSize) ||
        message.fontSize < 12 ||
        message.fontSize > 17 ||
        Object.entries(message.tokens).some(
          ([name, value]) =>
            !/^--dsw-[a-z0-9-]+$/.test(name) || typeof value !== 'string' || value.length > 500,
        )
      ) {
        document.getElementById('app').textContent = '共享样式版本不兼容，请重新打开页面';
        return;
      }
      for (const name of appliedThemeTokens) document.body.style.removeProperty(name);
      appliedThemeTokens = Object.keys(message.tokens);
      for (const [name, value] of Object.entries(message.tokens))
        document.body.style.setProperty(name, value);
      document.body.style.setProperty('--workbench-font-size', `${message.fontSize}px`);
      document.body.style.setProperty('--dsh-content-font-size', `${message.fontSize}px`);
      document.documentElement.style.colorScheme = message.colorScheme;
      document.body.toggleAttribute('data-ds-dark-theme', message.colorScheme === 'dark');
    }
    if (message.type === 'response') {
      const item = pending.get(message.id);
      if (!item) return;
      pending.delete(message.id);
      clearTimeout(item.timer);
      item.cleanup?.();
      if (message.error) {
        const error =
          item.method === 'sql' ? sqlQueryError(Error(message.error)) : Error(message.error);
        if (item.method === 'sql' || item.method === 'workspace')
          window.dispatchEvent(
            new CustomEvent('gea-query-warning', {
              detail: { message: error.message.slice(0, 600) },
            }),
          );
        item.reject(error);
      } else item.resolve(message.result);
    }
    if (message.type === 'cancel' && message.session === context?.session) {
      applying.get(message.toolCallId)?.abort();
      invoking.get(message.id)?.controller.abort();
    }
    if (message.type === 'apply' && message.session === context?.session) {
      const session = context.session;
      const task = new AbortController();
      applying.set(message.toolCallId, task);
      Promise.resolve()
        .then(async () => {
          const args = message.args;
          const targets = args?.targets ?? [args?.target];
          if (!Array.isArray(targets) || !targets.length) throw Error('MISSING_TARGET');
          for (const target of targets) {
            task.signal.throwIfAborted();
            if (context?.session !== session) throw Error('PAGE_SESSION_CHANGED');
            const group = [...pageGroups.values()].find((group) =>
              group.elements.some((element) => element.id === target),
            );
            const element = group?.elements.find((element) => element.id === target);
            if (!element || !group.apply) throw Error('ELEMENT_GONE');
            if (args.kind === 'setValue' && !element.editable) throw Error('ELEMENT_READ_ONLY');
            if (args.kind === 'invoke' && !element.actions?.includes(args.action ?? 'invoke'))
              throw Error('ACTION_NOT_ALLOWED');
            if (!['setValue', 'invoke', 'select', 'clear'].includes(args.kind))
              throw Error('INVALID_PAGE_ACTION');
            await group.apply({ ...args, target }, task.signal);
          }
          task.signal.throwIfAborted();
          if (context?.session !== session) throw Error('PAGE_SESSION_CHANGED');
          return { applied: true };
        })
        .catch((error) => ({ applied: false, error: error.message }))
        .then((result) => {
          applying.delete(message.toolCallId);
          channel.postMessage({
            type: 'applied',
            toolCallId: message.toolCallId,
            session,
            ...result,
          });
          reportCatalog();
        });
    }
    if (message.type === 'invoke' && message.session === context?.session) {
      const handler = handlers.get(message.name);
      const session = context.session,
        ownerChannel = channel;
      const controller = new AbortController();
      invoking.set(message.id, { controller, handler });
      Promise.resolve()
        .then(async () => {
          if (!handler) throw Error('页面未注册该操作');
          controller.signal.throwIfAborted();
          const result = await handler(message.arguments, { signal: controller.signal });
          controller.signal.throwIfAborted();
          if (context?.session !== session) throw Error('PAGE_SESSION_CHANGED');
          return result;
        })
        .then(
          (result) =>
            ownerChannel.postMessage({ type: 'invoked', id: message.id, session, result }),
          (error) =>
            ownerChannel.postMessage({
              type: 'invoked',
              id: message.id,
              session,
              error: error.message,
            }),
        )
        .finally(() => {
          if (invoking.get(message.id)?.controller === controller) invoking.delete(message.id);
        });
    }
    if (message.type === 'identity-changed') {
      cancelActions();
      context = null;
      for (const item of pending.values()) {
        clearTimeout(item.timer);
        item.cleanup?.();
        item.reject(Error('登录身份已变化，请重新加载'));
      }
      pending.clear();
      window.dispatchEvent(new Event('gea-identity-changed'));
    }
  };
  channel.start();
  reportCatalog();
  channel.postMessage({ type: 'theme:subscribe', session: context.session });
  readyResolve(event.data.context);
  window.dispatchEvent(new Event('gea-session-changed'));
});
window.parent.postMessage({ protocol: 'gea-html-v2', type: 'ready' }, '*');
export async function call(method, parameters = {}, options = {}) {
  options.signal?.throwIfAborted();
  if (!channel || !context?.session) throw Error('页面已显示，请先登录并连接页面能力。');
  const session = context.session;
  const id = String(++sequence);
  return new Promise((resolve, reject) => {
    const cleanup = () => options.signal?.removeEventListener('abort', abort);
    const abort = () => {
      if (!pending.delete(id)) return;
      clearTimeout(timer);
      cleanup();
      channel.postMessage({ type: 'cancel', id, session });
      reject(options.signal.reason ?? Error('请求已取消'));
    };
    const timer = setTimeout(() => {
      pending.delete(id);
      cleanup();
      channel.postMessage({ type: 'cancel', id, session });
      const error = Error('业务请求超时');
      reject(method === 'sql' ? sqlQueryError(error) : error);
    }, 120000);
    pending.set(id, { resolve, reject, timer, method, cleanup });
    options.signal?.addEventListener('abort', abort, { once: true });
    channel.postMessage({
      type: 'request',
      id,
      method,
      parameters,
      session,
    });
  });
}
export function action(name, description, handler) {
  handlers.set(name, handler);
  const release =
    name === 'refresh'
      ? reportElements(
          'refresh',
          [{ id: 'control:refresh', role: 'control', label: description, actions: ['invoke'] }],
          (args, signal) => {
            if (args.kind !== 'invoke') throw Error('ACTION_NOT_ALLOWED');
            return handler({}, { signal });
          },
        )
      : undefined;
  void ready.then(() => {
    if (handlers.get(name) === handler && context?.session)
      channel.postMessage({ type: 'register', name, description, session: context.session });
  });
  return () => {
    if (handlers.get(name) === handler) handlers.delete(name);
    for (const task of invoking.values()) if (task.handler === handler) task.controller.abort();
    release?.();
  };
}
export function ask(text, context, options) {
  return call('conversation', { text, context }, options);
}
export function publish(context, options) {
  return call('context', context, options);
}

/** Insert unsent text through the current owned Core input. No model or business write. */
export function draft(text, options) {
  return call('draft', { text }, options);
}
