import type { Context } from '@deepseek-ai/cordis';
import React, { useSyncExternalStore } from 'react';
import type { SettingsSectionOwnerProps } from '@deepseek-ai/dsh-client-ui-settings/client';
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client';
import { zh, en } from './client/locales.ts';
import { Inbox, type InboxViewState } from './client/inbox.tsx';
import {
  DesktopNavigation,
  createNavigationSelection,
  type ReadyNavigation,
} from './client/desktop-navigation.tsx';
import { ApiLogCenter } from './workbench/api-log-center.tsx';
import nativeCss from './client/native-pages.css';
import apiLogCss from './workbench/api-log.css';
const PANEL = 'gea-proof' as MainPanelId,
  INBOX = 'gea-inbox' as MainPanelId,
  API_LOG_PANEL = 'gea-api-log' as MainPanelId;
export function mountBusinessViews(ctx: Context) {
  ctx.effect(() => ctx.locale.register('geaProof', { zh, en }));
  const t = ctx.locale.bind('geaProof');
  ctx.inject(['businessAccount'], (scope) => {
    const ctx = scope;
    const identity = scope.businessAccount;
    const incoming = createNavigationSelection();
    const inboxViews = new Map<string | null, InboxViewState>();
    const inboxViewListeners = new Set<() => void>();
    const initialInboxView: InboxViewState = { pageNo: 1, readState: '' };
    const subscribeInboxView = (listener: () => void) => {
      inboxViewListeners.add(listener);
      return () => {
        inboxViewListeners.delete(listener);
      };
    };
    ctx.effect(() => () => {
      inboxViews.clear();
      inboxViewListeners.clear();
    });

    function InboxPage() {
      const navigation = useSyncExternalStore(incoming.subscribe, incoming.getSnapshot);
      const accountScope = useSyncExternalStore(identity.subscribe, identity.getSnapshot).scope;
      const view = useSyncExternalStore(
        subscribeInboxView,
        () => inboxViews.get(accountScope) ?? initialInboxView,
      );
      return (
        <section
          className="agent-workbench-ui gea-native-page"
          style={{ height: '100%', overflow: 'auto' }}
        >
          <style>{nativeCss}</style>
          <Inbox
            key={accountScope ?? 'unconfirmed'}
            t={t}
            navigation={navigation?.panel === INBOX ? navigation : null}
            view={view}
            onViewChange={(next) => {
              inboxViews.set(accountScope, next);
              for (const changed of inboxViewListeners) changed();
            }}
          />
        </section>
      );
    }
    function LogPage({ close }: { close?: () => void }) {
      const account = useSyncExternalStore(identity.subscribe, identity.getSnapshot);
      const environment = account.status?.environment;
      if (!environment || !account.scope || !account.status?.authenticated)
        return (
          <section className="agent-workbench-ui gea-native-page">
            {account.error ?? t('loginTip')}
          </section>
        );
      return (
        <section className="agent-workbench-ui gea-native-page" style={{ height: '100%' }}>
          <style>{nativeCss}</style>
          <style>{apiLogCss}</style>
          {account.error ? <p role="alert">{account.error}</p> : null}
          <ApiLogCenter
            key={account.scope ?? 'unconfirmed'}
            environment={environment}
            request={request}
            onClose={close ?? (() => void ctx.agentWorkbench.open(PANEL))}
          />
        </section>
      );
    }

    for (const [id, label, component] of [[API_LOG_PANEL, 'apiLog', LogPage]] as const)
      ctx.slots.inject('main', () => {
        const unregister = ctx.agentWorkbench.register({ id, label: () => t(label) });
        const dispose = ctx.slots.register({ name: 'main', key: id }, component);
        return () => {
          dispose();
          unregister();
        };
      });
    ctx.slots.inject('settings.section', () =>
      ctx.slots.register(
        {
          name: 'settings.section',
          id: API_LOG_PANEL,
          order: 1000,
          label: () => t('geaApiLog'),
          locale: 'geaProof',
        },
        ({ close }: SettingsSectionOwnerProps) => <LogPage close={close} />,
      ),
    );
    ctx.slots.inject('main', () =>
      ctx.agentWorkbench.registerFrame({
        id: INBOX,
        label: () => t('businessInbox'),
        kind: 'local',
        body: InboxPage,
        resourceId: 'gea-readonly',
      }),
    );
    ctx.slots.inject('main', () =>
      ctx.agentWorkbench.registerFrame({
        id: PANEL,
        label: () => t('salesPlan'),
        kind: 'native',
        resourceId: 'gea-readonly',
        src: () =>
          `/api/agent-workbench/native?locale=${encodeURIComponent(ctx.locale.getSnapshot().active)}`,
        visibleRequest: {
          subscribe: incoming.subscribe,
          getSnapshot: () => {
            const navigation = incoming.getSnapshot();
            return navigation?.panel === PANEL ? navigation.receipt : undefined;
          },
        },
        onVisible: (receipt) => {
          const navigation = incoming.getSnapshot();
          if (
            identity.getSnapshot().status?.authenticated &&
            navigation?.panel === PANEL &&
            navigation.receipt === receipt
          )
            navigation.visible();
        },
      }),
    );
    const openNavigation = async (target: ReadyNavigation, signal: AbortSignal) => {
      if (![PANEL, INBOX].includes(target.panel as MainPanelId))
        throw Error('NAVIGATION_TARGET_UNSUPPORTED');
      signal.throwIfAborted();
      let clear = () => {};
      const arrival = new Promise<void>((resolve, reject) => {
        const cancel = () => {
          if (incoming.getSnapshot()?.receipt === target.receipt) incoming.set(null);
          reject(Error('NAVIGATION_REQUEST_CANCELLED'));
        };
        const timer = setTimeout(() => {
          cancel();
        }, 30000);
        clear = () => {
          clearTimeout(timer);
          signal.removeEventListener('abort', cancel);
        };
        signal.addEventListener('abort', cancel, { once: true });
        incoming.set({ ...target, visible: resolve, failed: reject });
        if (signal.aborted) cancel();
      });
      try {
        await Promise.all([ctx.agentWorkbench.open(target.panel as MainPanelId), arrival]);
        signal.throwIfAborted();
      } finally {
        clear();
      }
    };
    ctx.slots.inject('shell.overlay', () =>
      ctx.slots.register({ name: 'shell.overlay', id: 'gea-desktop-navigation' }, () => (
        <DesktopNavigation
          t={t}
          open={openNavigation}
          login={() => void ctx.agentWorkbench.open(PANEL)}
        />
      )),
    );
  });
}
async function request<T>(
  endpoint: string,
  payload: object = {},
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch('/api/gea-proof/' + endpoint, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });
  const result = await response.json();
  if (!response.ok || result.ok !== true)
    throw Error(result.error?.message ?? 'GEA_REQUEST_FAILED');
  return result.value;
}
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    geaProof: import('./client/locales.ts').CopyKey;
  }
}
