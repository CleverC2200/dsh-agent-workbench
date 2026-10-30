import { randomUUID } from 'node:crypto';
import { LAYER_POLICY } from './page-bridge/layers.ts';

type HtmlAction = {
  name: 'refresh' | 'filter' | 'draft';
  description: string;
};
type Invocation = {
  type: 'invoke';
  session: string;
  id: string;
  name: HtmlAction['name'];
  arguments: unknown;
};
type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};
type HtmlSession = {
  plugin: string;
  session: string;
  context: Record<string, unknown> | null;
  actions: HtmlAction[];
  queue: Invocation[];
  pending: Map<string, Pending>;
  expires: number;
};
/** The Workbench owner token indexes page actions; destruction rejects its pending calls. */
export function createHtmlSessions() {
  const pages = new Map<string, HtmlSession>();
  const destroy = (key: string) => {
    const page = pages.get(key);
    if (!page) return;
    for (const item of page.pending.values()) {
      clearTimeout(item.timer);
      item.reject(Error('页面已关闭或登录已变化'));
    }
    pages.delete(key);
  };
  const get = (lease: string) => {
    const page = pages.get(lease);
    if (!page || page.expires < Date.now()) {
      destroy(lease);
      throw Error('PAGE_LEASE_EXPIRED');
    }
    // This is an idle lease, not a five-minute cap on an actively used page.
    // GEA still validates delegation-token expiry on every business request;
    // logout/identity changes explicitly destroy all leases.
    page.expires = Date.now() + 300000;
    return page;
  };
  return {
    open(plugin: string, session: string, lease: string) {
      if (!/^session-[a-z0-9-]{20,80}$/.test(session)) throw Error('INVALID_CONVERSATION');
      for (const [key, page] of pages)
        if (page.plugin === plugin && page.session === session) destroy(key);
      pages.set(lease, {
        plugin,
        session,
        context: null,
        actions: [],
        queue: [],
        pending: new Map(),
        expires: Date.now() + 300000,
      });
      return lease;
    },
    syncContext(lease: string, context: HtmlSession['context']) {
      get(lease).context = context;
    },
    registerAction(lease: string, name: unknown, description: unknown) {
      if (name !== 'refresh' && name !== 'filter' && name !== 'draft')
        throw Error('ACTION_NOT_ALLOWED');
      const page = get(lease);
      page.actions = page.actions.filter((action) => action.name !== name);
      page.actions.push({ name, description: String(description).slice(0, 300) });
    },
    consume(lease: string) {
      return get(lease).queue.splice(0);
    },
    close: destroy,
    clear() {
      for (const key of pages.keys()) destroy(key);
    },
    async invoke(
      plugin: string,
      session: string,
      name: string,
      args: unknown,
      signal: AbortSignal,
    ) {
      const pair = [...pages].find(
        ([, page]) => page.plugin === plugin && page.session === session,
      );
      if (!pair)
        throw Error('该会话还没有打开业务页面：请先在左侧「功能区」打开对应业务页面再操作');
      const page = get(pair[0]);
      if (name === 'context')
        return {
          context: page.context,
          actions: page.actions,
          source: 'page-observation',
          authority: 'GEA owns data permissions; drafts are not submitted',
        };
      const action = page.actions.find((action) => action.name === name);
      if (!action) throw Error('PAGE_ACTION_NOT_REGISTERED');
      signal.throwIfAborted();
      const id = randomUUID();
      return new Promise<unknown>((resolve, reject) => {
        const abort = () => finish(Error('PAGE_ACTION_CANCELLED'));
        const finish = (error?: Error, value?: unknown) => {
          const item = page.pending.get(id);
          if (!item) return;
          clearTimeout(item.timer);
          page.pending.delete(id);
          page.queue = page.queue.filter((message) => message.id !== id);
          signal.removeEventListener('abort', abort);
          error ? reject(error) : resolve(value);
        };
        const timer = setTimeout(
          () => finish(Error('PAGE_ACTION_TIMEOUT')),
          // 页面动作可能落在提交/审批这两层，超时按能力层策略表走。
          LAYER_POLICY.submit.timeoutMs,
        );
        page.pending.set(id, {
          resolve: (value) => finish(undefined, value),
          reject: (error) => finish(error),
          timer,
        });
        signal.addEventListener('abort', abort, { once: true });
        page.queue.push({
          type: 'invoke',
          session: page.session,
          id,
          name: action.name,
          arguments: args,
        });
      });
    },
    reply(lease: string, message: { id: string; error?: unknown; result?: unknown }) {
      const item = get(lease).pending.get(message.id);
      if (!item) return;
      message.error ? item.reject(Error(String(message.error))) : item.resolve(message.result);
    },
  };
}
