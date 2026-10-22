import { mountReferenceMessages } from './page-interaction/reference-message.tsx';
import { mountBusinessViews } from './business-views.tsx';
import type { Context } from '@deepseek-ai/cordis';
import React from 'react';
import type {} from '@deepseek-ai/dsh-client-ui-layout/client';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client';
import type {} from '@deepseek-ai/dsh-client-ui-theme/client';
import type {} from '@deepseek-ai/dsh-client-locale/client';
import {
  resourceWorkspace,
  mountNativeResourceSelection,
  openNativeAgentSession,
  type NativeResourceSelection,
} from './resource-selection.ts';
import { mountCompanyUI } from './company/ui.tsx';
import type {} from '@deepseek-ai/dsh-api-session-controller/client';
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client';
import {
  WorkbenchController,
  WORKBENCH_PRESENTATION_KEY,
  type WorkbenchPresentation,
  type AgentWorkbench,
} from './workbench.ts';
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store';
import type { HtmlPage } from './html-pages.ts';
import css from '../theme/tokens.css';
import referenceStyles from './page-interaction/reference-message.css';

// The existing client builder publishes CSS modules beside the bundled contribution.
declare const WORKBENCH_MODULE_STYLES: string;
import { mountFramePresentation } from './frame-presenter.tsx';

export const inject = [
  'slots',
  'layout',
  'locale',
  'theme',
  'uiWorkspace',
  'sessions',
  'workspaces',
];
const zh = {
  failed: '页面目录读取失败',
  retry: '重试',
  pageConnect: '连接页面与原生对话',
  pageNewChat: '开始新的页面对话',
  pageAssistantTitle: 'AI工作台',
  pageHistory: '查看历史对话',
  pageWorking: '正在连接…',
  pageChanged: '登录身份已变化，请重新选用页面能力。',
  pageHint: '业务读取需登录并选用页面能力。',
  pageWait: '页面能力尚未就绪，请稍后重试。',
  pageLogin: '请先登录 GEA，再连接页面能力。',
  pageSessionUnavailable: '页面原生会话未就绪。',
  pageStaticHint: '选择历史对话、新建对话，或关联当前对话。',
  pageCreating: '正在创建原生对话…',
  pageInterpreter: '选择解读能力',
  pageIdentityFailed: '无法确认 GEA 身份，请稍后重试。',
};
const en = {
  failed: 'Page directory unavailable',
  retry: 'Retry',
  pageConnect: 'Connect page and Conversation',
  pageNewChat: 'Start a new page chat',
  pageAssistantTitle: 'AI workspace',
  pageHistory: 'View conversation history',
  pageWorking: 'Connecting…',
  pageChanged: 'Your identity changed. Select this page resource again.',
  pageHint: 'Business reads require login and a selected page resource.',
  pageWait: 'Page capability is not ready. Please retry shortly.',
  pageLogin: 'Sign in to GEA before connecting this page.',
  pageSessionUnavailable: 'The page Conversation is unavailable.',
  pageStaticHint:
    'Choose history, start a new conversation, or associate the current conversation.',
  pageCreating: 'Creating a native conversation…',
  pageInterpreter: 'Choose Interpreter',
  pageIdentityFailed: 'Unable to confirm the GEA identity. Please try again later.',
};

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    agentWorkbench: keyof typeof zh;
  }
}

/** Keep the official frame, workspace browser and Conversation. Only contribute public seats. */
export function apply(ctx: Context): void {
  mountReferenceMessages(ctx);
  ctx.effect(() => ctx.locale.register('agentWorkbench', { zh, en }));
  const t = ctx.locale.bind('agentWorkbench');
  ctx.effect(() => {
    const style = document.createElement('style');
    style.dataset.plugin = '@cleverc2200/dsh-agent-workbench';
    style.dataset.agentWorkbenchTheme = '1.1.1';
    style.textContent =
      css +
      referenceStyles +
      (typeof WORKBENCH_MODULE_STYLES === 'undefined' ? '' : WORKBENCH_MODULE_STYLES);
    document.head.append(style);
    return () => style.remove();
  });
  const agentLifetime = new AbortController();
  ctx.effect(() => () => agentLifetime.abort());
  const workbench = new WorkbenchController(
    {
      panel: (id) => ctx.layout.selectPanel(id),
      openAgentSession: async (session) => {
        if (!nativeResources) throw Error('WORKBENCH_AGENT_UNAVAILABLE');
        const signal = AbortSignal.any([ctx.layout.beginNavigation(), agentLifetime.signal]);
        await openNativeAgentSession(nativeResources, session, signal, () =>
          workbench.leaveDocument(),
        );
      },
      startAgent: async (preset) => {
        const host = nativeResources;
        if (!host) throw Error('WORKBENCH_AGENT_UNAVAILABLE');
        const signal = AbortSignal.any([ctx.layout.beginNavigation(), agentLifetime.signal]);
        signal.throwIfAborted();
        const sessions = ctx.sessions.list.getSnapshot();
        if (sessions.phase !== 'ready') throw Error('WORKBENCH_WORKSPACE_UNAVAILABLE');
        const current = Object.values(sessions.byId).find(
          (row) => (row.retainedBy.mainView ?? 0) > 0,
        );
        const cwd = await resourceWorkspace(host.fetch, signal, current?.cwd, host.pickDirectory);
        signal.throwIfAborted();
        const { workspaceId, path } = await host.workspace(cwd);
        signal.throwIfAborted();
        const sessionId = await host.create({ workspaceId });
        signal.throwIfAborted();
        await host.select(sessionId, preset);
        signal.throwIfAborted();
        await host.open(sessionId, undefined, signal, (projection) => {
          if (projection.preset !== preset) throw Error('PAGE_SESSION_PRESET_UNAVAILABLE');
          if (projection.cwd !== path) throw Error('PAGE_SESSION_RECOVERY_MISMATCH');
          workbench.leaveDocument();
        });
      },
      hasPanel: (id) => ctx.slots.entries('main').some((entry) => entry.options.key === id),
      document: (id) => {
        if (id) ctx.uiWorkspace.openSession(id);
        else ctx.layout.selectPanel(null);
      },
    },
    createSnapshotStore<WorkbenchPresentation>(
      { version: 2, selections: [], views: [] },
      { persist: { name: WORKBENCH_PRESENTATION_KEY } },
    ),
  );
  ctx.provide('agentWorkbench', workbench);
  ctx.effect(() => () => workbench.dispose());

  let nativeResources: NativeResourceSelection | undefined;
  mountNativeResourceSelection(ctx, (host) => {
    nativeResources = host;
  });
  const restorePageSession = mountFramePresentation(
    ctx,
    () => nativeResources,
    (key) => t(key),
    workbench,
  );

  mountCompanyUI(ctx, workbench, restorePageSession);
  mountBusinessViews(ctx);
  let discoveryError = '';
  let discoveryRevision = 0;
  const listeners = new Set<() => void>();
  let retry = () => {};
  const notify = () => {
    discoveryRevision++;
    for (const listener of listeners) listener();
  };
  function DiscoveryNotice() {
    React.useSyncExternalStore(
      (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      () => discoveryRevision,
    );
    return discoveryError
      ? React.createElement(
          'p',
          { role: 'alert' },
          t('failed') + ': ' + discoveryError,
          ' ',
          React.createElement('button', { onClick: () => retry() }, t('retry')),
        )
      : null;
  }
  ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register({ name: 'shell.overlay', id: 'workbench-page-discovery' }, DiscoveryNotice),
  );
  ctx.effect(() => {
    const controller = new AbortController();
    const registered = new Set<string>();
    const cleanup: Array<() => void> = [];
    let loading = false;
    const discover = async () => {
      if (loading || controller.signal.aborted) return;
      loading = true;
      try {
        const response = await fetch('/api/agent-workbench/pages', {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) throw Error(`HTTP ${response.status}`);
        const pages: HtmlPage[] = await response.json();
        controller.signal.throwIfAborted();
        for (const page of pages) {
          if (registered.has(page.id)) continue;
          registered.add(page.id);
          const dispose = workbench.registerFrame({
            id: page.id as MainPanelId,
            label: page.name,
            src: page.url,
            kind: 'html',
            pluginId: page.pluginId,
            resourceId: page.resourceId,
          });
          cleanup.push(dispose);
        }
        discoveryError = '';
      } catch (error) {
        if (!controller.signal.aborted)
          discoveryError = error instanceof Error ? error.message : String(error);
      } finally {
        loading = false;
        if (!controller.signal.aborted) notify();
      }
    };
    retry = () => {
      void discover();
    };
    void discover();
    return () => {
      controller.abort();
      retry = () => {};
      for (const dispose of cleanup) dispose();
    };
  });
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    agentWorkbench: AgentWorkbench;
  }
}
export type { AgentWorkbench, WorkbenchPage } from './workbench.ts';

declare module '@deepseek-ai/dsh-api-session-controller/client' {
  interface SessionReferenceSourceMap {
    agentResourceSelection: unknown;
  }
}

export type { WorkbenchFramePage } from './frame.ts';
export type { BusinessAccount } from './company/account.ts';

export type { NavigationView } from './client/desktop-navigation.tsx';
export { pluginPackageVersion } from './plugin-package-version.ts';
