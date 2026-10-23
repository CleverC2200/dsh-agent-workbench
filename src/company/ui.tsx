import { PageUnsentHistory } from './unsent-history.tsx';
import { createConversationStarter } from './new-conversation.ts';
import {
  createPageSessionNavigation,
  type PageSessionRestore,
} from '../page-session-coordination.ts';
import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import type { Context } from '@deepseek-ai/cordis';
import {
  IconPanelLeftOutlineRegular,
  IconNewChatOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives/src/icons/index.tsx';
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client';
import type {
  PropsRuntime,
  PropsRenderSlots,
  PropsRenderFactories,
} from '@deepseek-ai/dsh-client-ui-slots';
import type {} from '@deepseek-ai/dsh-client-ui-settings/client';
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client';
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client';
import type { WorkbenchController } from '../workbench.ts';
import type { BusinessAccount } from './account.ts';
import { LoginDialog } from './login-dialog.tsx';
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots';
import { zh, en, type CopyKey } from './locales.ts';
import { resolveBusinessMenu, localPrototypeMenu } from './navigation.ts';
import { BusinessDomainIcon } from './business-domain-icons.tsx';
import type { BusinessNavigation, BusinessNavigationCatalog } from './business-navigation.ts';
import { AgentWelcome, GeaHomeHero, NavIcon, Chevron } from './formal-components.tsx';
import * as prompts from './conversation-prompts.ts';
import brandLogo from './brand-logo.png';
import css from './shell.css';
import layoutCss from './layout.css';
import loginCss from './login.css';
import staticControlsCss from './formal-static-controls.css';

const INBOX = 'gea-inbox' as MainPanelId;
const agents: Record<string, prompts.ConversationPromptConfig> = {
  'gea-proof': prompts.approvalConversation,
  'gea-regional-plan': prompts.regionalPlanConversation,
  'plan-region-category': prompts.categoryPlanConversation,
  'plan-category-production': prompts.mpsPlanConversation,
  'gea-inbox': prompts.inboxConversation,
  'inventory-dealer': prompts.inventoryConversation,
  'inventory-apsdemand': prompts.demandOpsConversation,
  'inventory-apsdelivery': prompts.deliveryOpsConversation,
  'inventory-aqkc': prompts.safetyStockConversation,
  'inventory-fc': prompts.branchStockConversation,
  'inventory-personal': prompts.inventoryWorkbenchConversation,
  'inventory-qll': prompts.fullChainStockConversation,
  'inventory-apsplan': prompts.supplyCoordinationConversation,
  'inventory-customer': prompts.customerStockConversation,
  'inventory-orderworkbench': prompts.orderManagementConversation,
  'inventory-orderfulfillment': prompts.orderFulfillmentConversation,
};
const unavailableAccount = {
  state: 'unknown',
  scope: null,
  subject: null,
  status: null,
  error: undefined as string | undefined,
};
const noSubscribe = () => () => {};
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    companyWorkbench: CopyKey;
  }
  interface SlotMap {
    'agent-workbench.documents': { kind: 'single'; scope: 'session-maybe' };
  }
}
/** Formal AgentWelcome/GeaHomeHero JSX; only the input action comes from the current public scope. */
export function CompanyWelcome({
  page,
  onFill,
  language = 'zh',
}: {
  page?: string;
  onFill?: (text: string) => void;
  language?: string;
}) {
  const agent = page ? (agents[page] ?? prompts.homeConversation) : undefined;
  const copy = language === 'en' ? en : zh;
  return agent ? (
    <AgentWelcome
      agent={agent}
      orderTemplate={page === 'inventory-orderworkbench' || page === 'inventory-orderfulfillment'}
      onFill={(prompt) => onFill?.(prompt)}
    />
  ) : (
    <GeaHomeHero
      copy={{
        label: copy.geaBusiness,
        eyebrow: copy.homeEyebrow,
        title: copy.homeTitle,
        description: copy.homeDescription,
      }}
    />
  );
}

/** Formal selected UI; Workspace, Session, settings and GEA identity retain their existing authorities. */
export function mountCompanyUI(
  ctx: Context,
  workbench: WorkbenchController,
  restorePageSession: PageSessionRestore = async () => {},
): void {
  ctx.effect(() => ctx.locale.register('companyWorkbench', { zh, en }));
  const t = ctx.locale.bind('companyWorkbench');
  const conversationStarter = createConversationStarter(ctx, () => workbench.leaveDocument());
  function ConversationCreationWarning() {
    const state = useSyncExternalStore(
      conversationStarter.state.subscribe,
      conversationStarter.state.getSnapshot,
      conversationStarter.state.getSnapshot,
    );
    useSyncExternalStore(
      (listener) => ctx.locale.subscribe(listener),
      () => ctx.locale.getSnapshot().active,
      () => ctx.locale.getSnapshot().active,
    );
    return state.kind === 'failed' ? (
      <div role="alert" className="agent-workbench-ui gea-identity-warning">
        <p>
          {t('newConversationFailed')} {state.message}
        </p>
        <button type="button" onClick={() => conversationStarter.state.set({ kind: 'idle' })}>
          {t('close')}
        </button>
      </div>
    ) : null;
  }
  ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register(
      {
        name: 'shell.overlay',
        id: 'gea-conversation-creation-warning',
        locale: 'companyWorkbench',
      },
      ConversationCreationWarning,
    ),
  );
  const SidebarGeometry = React.createContext({ collapsed: false, expand: () => {} });
  ctx.effect(() => {
    const style = document.createElement('style');
    // Loader must not claim this effect-owned sheet for a later materializing plugin.
    style.dataset.plugin = '@cleverc2200/dsh-agent-workbench';
    style.dataset.companyWorkbench = 'formal-508feea';
    style.textContent = staticControlsCss + '\n' + css + '\n' + layoutCss + '\n' + loginCss;
    document.head.append(style);
    return () => style.remove();
  });
  let account: BusinessAccount | undefined;
  let desktopLoginPresented = false;
  let businessNavigation: BusinessNavigation | undefined;
  const navigationListeners = new Set<() => void>();
  const subscribeNavigation = (listener: () => void) => {
    navigationListeners.add(listener);
    return () => {
      navigationListeners.delete(listener);
    };
  };
  ctx.inject(['businessNavigation'], (scope) => {
    businessNavigation = scope.businessNavigation;
    for (const listener of navigationListeners) listener();
    scope.effect(() => () => {
      if (businessNavigation !== scope.businessNavigation) return;
      businessNavigation = undefined;
      for (const listener of navigationListeners) listener();
    });
  });
  const pageSessions = createPageSessionNavigation({
    workbench,
    restore: restorePageSession,
    identity: () => account?.getSnapshot(),
    openSession: (id) => ctx.uiWorkspace.openSession(id),
  });
  const accountListeners = new Set<() => void>();
  ctx.inject(['businessAccount'], (scope) => {
    account = scope.businessAccount;
    for (const listener of accountListeners) listener();
    scope.effect(() => () => {
      if (account === scope.businessAccount) {
        account = undefined;
        for (const listener of accountListeners) listener();
      }
    });
  });
  const subscribeAccount = (listener: () => void) => {
    accountListeners.add(listener);
    return () => {
      accountListeners.delete(listener);
    };
  };
  function IdentityWarning() {
    useSyncExternalStore(
      (listener) => ctx.locale.subscribe(listener),
      () => ctx.locale.getSnapshot().active,
      () => ctx.locale.getSnapshot().active,
    );
    const authority = useSyncExternalStore(
      subscribeAccount,
      () => account,
      () => account,
    );
    const identity = useSyncExternalStore(
      authority?.subscribe ?? noSubscribe,
      authority?.getSnapshot ?? (() => unavailableAccount),
      authority?.getSnapshot ?? (() => unavailableAccount),
    );
    const pending = useRef<AbortController>();
    useEffect(() => () => pending.current?.abort(), [authority]);
    const retry = () => {
      pending.current?.abort();
      const controller = new AbortController();
      pending.current = controller;
      void authority?.refreshIdentity(controller.signal).catch(() => {});
    };
    return identity.error ? (
      <div
        role="alert"
        data-gea-identity-error=""
        className="agent-workbench-ui gea-identity-warning"
      >
        <span>{t('identityObservationFailed')}</span>
        <button type="button" onClick={retry}>
          {t('retry')}
        </button>
      </div>
    ) : null;
  }
  ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register(
      { name: 'shell.overlay', id: 'gea-identity-warning', locale: 'companyWorkbench' },
      IdentityWarning,
    ),
  );
  function Account({
    wide,
    settingsOpen,
    openSettings,
    settingsShortcut,
  }: PropsRuntime<'settings.launcher'>) {
    useSyncExternalStore(
      (listener) => ctx.locale.subscribe(listener),
      () => ctx.locale.getSnapshot().active,
      () => ctx.locale.getSnapshot().active,
    );
    const authority = useSyncExternalStore(
      subscribeAccount,
      () => account,
      () => account,
    );
    const identity = useSyncExternalStore(
      authority?.subscribe ?? noSubscribe,
      authority?.getSnapshot ?? (() => unavailableAccount),
      authority?.getSnapshot ?? (() => unavailableAccount),
    );
    const authenticated =
      identity.state === 'confirmed' &&
      identity.error === undefined &&
      identity.status?.authenticated === true;
    const user = identity.status?.authenticated ? identity.status.user : null;
    const accountLabel = identity.error
      ? t(identity.status ? 'identityUncertain' : 'identityUnavailable')
      : identity.state !== 'confirmed'
        ? t('identityPending')
        : identity.status?.loginState === 'expired'
          ? t('identityExpired')
          : identity.status?.authenticated
            ? user?.name || t('accountSignedIn')
            : t('signedOut');
    const name = user?.name ?? '',
      avatarUrl = user?.avatar ?? '';
    const [failedAvatar, setFailedAvatar] = useState<string | null>(null);
    useEffect(() => {
      setFailedAvatar(null);
    }, [avatarUrl]);
    const menu = useRef<HTMLDivElement>(null),
      trigger = useRef<HTMLButtonElement>(null);
    const [position, setPosition] = useState<{ left: number; bottom: number } | null>(null);
    const [loginOpen, setLoginOpen] = useState(false);
    useEffect(() => {
      if (
        !desktopLoginPresented &&
        'dshDesktop' in window &&
        identity.state === 'confirmed' &&
        identity.error === undefined &&
        identity.status?.authenticated === false &&
        identity.status.loginState === 'signed-out'
      ) {
        desktopLoginPresented = true;
        setLoginOpen(true);
      }
    }, [identity]);
    const closeLogin = useCallback(() => {
      setLoginOpen(false);
      trigger.current?.focus();
    }, []);
    useEffect(() => {
      if (loginOpen && (authenticated || !authority)) closeLogin();
    }, [loginOpen, authenticated, authority, closeLogin]);
    const pending = useRef<AbortController>();
    const [busy, setBusy] = useState(false),
      [failed, setFailed] = useState(false);
    const close = () => {
      pending.current?.abort();
      setBusy(false);
      setPosition(null);
    };
    useEffect(() => () => pending.current?.abort(), [authority]);
    useEffect(() => {
      if (settingsOpen) close();
    }, [settingsOpen]);
    useEffect(() => {
      if (!position) return;
      menu.current?.querySelector<HTMLButtonElement>('button')?.focus();
      const outside = (event: PointerEvent) => {
        if (
          event.target instanceof Node &&
          !menu.current?.contains(event.target) &&
          !trigger.current?.contains(event.target)
        )
          close();
      };
      const resize = () => close();
      const escape = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          close();
          trigger.current?.focus();
        }
      };
      document.addEventListener('pointerdown', outside);
      document.addEventListener('keydown', escape);
      window.addEventListener('resize', resize);
      window.addEventListener('blur', resize);
      return () => {
        document.removeEventListener('pointerdown', outside);
        document.removeEventListener('keydown', escape);
        window.removeEventListener('resize', resize);
        window.removeEventListener('blur', resize);
      };
    }, [position]);
    const logout = async () => {
      if (!authority || busy) return;
      const controller = new AbortController();
      pending.current = controller;
      setBusy(true);
      setFailed(false);
      try {
        await authority.logout(controller.signal);
        controller.signal.throwIfAborted();
        setPosition(null);
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    };
    return (
      <>
        <button
          ref={trigger}
          type="button"
          className="gea-sidebar-tab gea-account-launcher"
          aria-label={t('accountMenu')}
          aria-haspopup="menu"
          aria-expanded={position !== null}
          aria-keyshortcuts={settingsShortcut?.aria}
          onClick={(event) => {
            if (position) {
              close();
              return;
            }
            const rect = event.currentTarget.getBoundingClientRect();
            setPosition({
              left: Math.min(rect.left, window.innerWidth - 212),
              bottom: window.innerHeight - rect.top + 6,
            });
          }}
        >
          <span className="gea-user-avatar" aria-hidden="true">
            {avatarUrl && failedAvatar !== avatarUrl ? (
              <img
                key={avatarUrl}
                src={avatarUrl}
                alt=""
                referrerPolicy="no-referrer"
                onError={() => setFailedAvatar(avatarUrl)}
              />
            ) : (
              name.slice(0, 1) || 'G'
            )}
          </span>
          {wide && <span>{accountLabel}</span>}
        </button>
        {position &&
          createPortal(
            <div
              ref={menu}
              role="menu"
              aria-label={t('accountMenu')}
              className="gea-account-menu"
              style={position}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === 'Escape') {
                  event.preventDefault();
                  close();
                  trigger.current?.focus();
                }
                if (event.key === 'Tab') close();
                if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
                  event.preventDefault();
                  const items = Array.from(
                    menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ??
                      [],
                  );
                  const index = items.indexOf(document.activeElement as HTMLButtonElement);
                  const next =
                    event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? items.length - 1
                        : (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) %
                          items.length;
                  items[next]?.focus();
                }
              }}
            >
              <button
                type="button"
                role="menuitem"
                className="gea-logout-button"
                onClick={() => {
                  close();
                  openSettings();
                }}
              >
                <span aria-hidden="true">⚙</span>
                <span>{t('settings')}</span>
              </button>
              {!authenticated && (
                <button
                  type="button"
                  role="menuitem"
                  className="gea-logout-button"
                  disabled={!authority || identity.state !== 'confirmed' || Boolean(identity.error)}
                  onClick={() => {
                    close();
                    setLoginOpen(true);
                  }}
                >
                  {t('signInGea')}
                </button>
              )}
              {name && (
                <div className="gea-logout-control">
                  <button
                    type="button"
                    role="menuitem"
                    className="gea-logout-button"
                    title={t('logout')}
                    aria-label={t('logout')}
                    disabled={busy}
                    onClick={() => void logout()}
                  >
                    <svg
                      aria-hidden="true"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <path d="M10 4H4v16h6M14 8l4 4-4 4M8 12h10" />
                    </svg>
                    <span>{t(busy ? 'loggingOut' : 'logout')}</span>
                  </button>
                  {failed && <span role="alert">{t('logoutFailed')}</span>}
                </div>
              )}
            </div>,
            document.body,
          )}
        {loginOpen &&
          authority &&
          !authenticated &&
          createPortal(
            <LoginDialog account={authority} t={t} onClose={closeLogin} />,
            document.body,
          )}
      </>
    );
  }
  function Sidebar({
    collapsed,
    width,
    usePanelInfo,
    renderSlot,
  }: PropsRuntime<'sidebar'> &
    PropsRenderSlots<
      | 'sidebar.brand.mark'
      | 'sidebar.brand.name'
      | 'sidebar.toggle.badge'
      | 'sidebar.panellist'
      | 'sidebar.workspaces'
      | 'sidebar.settings'
      | 'sidebar.footer.action'
    >) {
    const creation = useSyncExternalStore(
      conversationStarter.state.subscribe,
      conversationStarter.state.getSnapshot,
      conversationStarter.state.getSnapshot,
    );
    useSyncExternalStore(
      (listener) => ctx.locale.subscribe(listener),
      () => ctx.locale.getSnapshot().active,
      () => ctx.locale.getSnapshot().active,
    );
    const darwin =
      typeof document !== 'undefined' && document.documentElement.dataset.platform === 'darwin';
    const sidebarToggle = (
      <button
        type="button"
        className="gea-inbox-quick-action gea-owned-sidebar-toggle"
        aria-label={t(collapsed ? 'openBusinessNavigation' : 'collapseSidebar')}
        onClick={() => ctx.layout.toggleSidebar()}
      >
        <IconPanelLeftOutlineRegular size={16} />
        {renderSlot('sidebar.toggle.badge', {})}
      </button>
    );
    const documentState = useSyncExternalStore(
      workbench.subscribe,
      workbench.getSnapshot,
      workbench.getSnapshot,
    );
    const layoutPanel = usePanelInfo((value) => value.activePanelId);
    const activePanel = layoutPanel ?? documentState.selectedDocument?.id;
    const business = Boolean(activePanel && activePanel !== 'gea-api-log');
    const [drawer, setDrawer] = useState<'function' | 'workspace' | 'none'>('function');
    const previousBusiness = useRef(business);
    useEffect(() => {
      if (business && !previousBusiness.current) setDrawer('function');
      previousBusiness.current = business;
    }, [business]);
    const [sections, setSections] = useState<Record<string, boolean>>({});
    const authority = useSyncExternalStore(
      subscribeAccount,
      () => account,
      () => account,
    );
    const identity = useSyncExternalStore(
      authority?.subscribe ?? noSubscribe,
      authority?.getSnapshot ?? (() => unavailableAccount),
      authority?.getSnapshot ?? (() => unavailableAccount),
    );
    const provider = useSyncExternalStore(
      subscribeNavigation,
      () => businessNavigation,
      () => businessNavigation,
    );
    const scope =
      identity.state === 'confirmed' && !identity.error && identity.status?.authenticated
        ? identity.scope
        : null;
    const [catalogState, setCatalogState] = useState<
      | { kind: 'loading' }
      | {
          kind: 'ready';
          provider: BusinessNavigation;
          scope: string;
          catalog: BusinessNavigationCatalog;
        }
      | { kind: 'failed'; provider: BusinessNavigation; scope: string; message: string }
    >({ kind: 'loading' });
    const [refresh, setRefresh] = useState(0);
    useEffect(() => {
      setCatalogState({ kind: 'loading' });
      if (!provider || !scope) return;
      const controller = new AbortController();
      void provider
        .read(controller.signal)
        .then((catalog) => {
          if (!controller.signal.aborted)
            setCatalogState({ kind: 'ready', provider, scope, catalog });
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted)
            setCatalogState({
              kind: 'failed',
              provider,
              scope,
              message: error instanceof Error ? error.message : String(error),
            });
        });
      return () => controller.abort();
    }, [provider, scope, refresh]);
    const catalog =
      catalogState.kind === 'ready' &&
      catalogState.provider === provider &&
      catalogState.scope === scope
        ? catalogState.catalog
        : undefined;
    const catalogFailure =
      catalogState.kind === 'failed' &&
      catalogState.provider === provider &&
      catalogState.scope === scope
        ? catalogState.message
        : null;
    let catalogNotice = '';
    if (identity.error) catalogNotice = t('identityObservationFailed');
    else if (identity.state !== 'confirmed') catalogNotice = t('identityPending');
    else if (!identity.status?.authenticated) catalogNotice = t('businessLoginRequired');
    else if (!provider) catalogNotice = t('businessCatalogUnavailable');
    else if (catalogFailure !== null)
      catalogNotice = `${t('businessCatalogFailed')} ${catalogFailure}`;
    else if (!catalog) catalogNotice = t('businessCatalogLoading');
    else if (catalog.agents.length === 0) catalogNotice = t('businessCatalogEmpty');
    const [entries, setEntries] = useState(() => ctx.slots.entries('main'));
    useEffect(() => {
      const refresh = () => setEntries([...ctx.slots.entries('main')]);
      const offs = [
        ctx.slots.subscribe('main', refresh),
        ctx.slots.subscribe('sidebar.panellist', refresh),
        workbench.subscribe(refresh),
      ];
      return () => offs.forEach((off) => off());
    }, []);
    const available = new Map([
      ...entries
        .filter((entry) => entry.options.key)
        .map(
          (entry) =>
            [entry.options.key!, workbench.label(entry.options.key! as MainPanelId)] as const,
        ),
      ...documentState.pages.map((page) => [page.id, workbench.label(page.id)] as const),
    ]);
    const menu = [...resolveBusinessMenu(catalog, available, t), localPrototypeMenu(available, t)];
    const expandSidebar = () => {
      if (collapsed) ctx.layout.toggleSidebar();
    };
    useEffect(
      () =>
        workbench.subscribeHistory(() => {
          setDrawer('workspace');
          expandSidebar();
        }),
      [collapsed],
    );
    const toggleDrawer = (name: 'function' | 'workspace') =>
      setDrawer((value) => (value === name ? 'none' : name));
    const panels = ctx.slots
      .entriesOfSlot('sidebar.panellist')
      .slice()
      .sort((a, b) => (a.options.order ?? 0) - (b.options.order ?? 0));
    return (
      <aside
        className="gea-sidebar-owned"
        data-gea-narrow={collapsed || width <= 100 ? '' : undefined}
        data-sidebar-collapsed={collapsed ? '' : undefined}
        aria-label={t('businessNavigation')}
      >
        {darwin && (
          <div className="gea-sidebar-window-row" data-window-drag>
            {sidebarToggle}
          </div>
        )}
        <SidebarGeometry.Provider value={{ collapsed, expand: expandSidebar }}>
          <div className="gea-sidebar-brand-row">
            <div className="gea-sidebar-brand">
              {renderSlot('sidebar.brand.mark', { size: 38 })}
              {!collapsed && renderSlot('sidebar.brand.name', {})}
            </div>
            {!collapsed && (
              <>
                <button
                  type="button"
                  className="gea-inbox-quick-action"
                  aria-label={t('messageInbox')}
                  title="业务代办"
                  disabled={!available.has(INBOX)}
                  onClick={() => void workbench.open(INBOX)}
                >
                  <NavIcon kind="bell" />
                </button>
              </>
            )}
            {!darwin && sidebarToggle}
          </div>
        </SidebarGeometry.Provider>
        {!collapsed && (
          <button
            type="button"
            className="gea-ai-workbench-entry"
            aria-label={t('newConversation')}
            disabled={creation.kind === 'creating'}
            aria-busy={creation.kind === 'creating'}
            onClick={() => void conversationStarter.start()}
          >
            <span className="gea-ai-entry-icon" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 2C10.8 8.2 8.2 10.8 2 12c6.2 1.2 8.8 3.8 10 10 1.2-6.2 3.8-8.8 10-10-6.2-1.2-8.8-3.8-10-10Z"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className="gea-ai-entry-label">{t('workspaceArea')}</span>
            <svg
              className="gea-ai-entry-plus"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M12 4v16M4 12h16"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        )}
        {panels.map(({ options }) => {
          const id = options.id as MainPanelId;
          const label = resolveSlotLabel(options.label) ?? id;
          const active = activePanel === id;
          return (
            <button
              key={id}
              type="button"
              className={'gea-sidebar-tab gea-plugin-entry' + (active ? ' is-active' : '')}
              aria-label={label}
              title={collapsed ? label : undefined}
              aria-current={active ? 'page' : undefined}
              onClick={() => {
                workbench.leaveDocument();
                ctx.layout.selectPanel(id);
              }}
            >
              {renderSlot('sidebar.panellist', { size: collapsed ? 18 : 16, active }, { only: id })}
              {!collapsed && <span>{label}</span>}
            </button>
          );
        })}
        <div className="gea-sidebar-region" data-gea-drawer={drawer}>
          <div className="gea-sidebar-rail" data-gea-sidebar-rail>
            {(
              [
                [
                  'apps',
                  t('functionArea'),
                  () => {
                    setDrawer('function');
                    expandSidebar();
                  },
                  drawer === 'function',
                ],
                [
                  'folder',
                  t('recentArea'),
                  () => {
                    setDrawer('workspace');
                    expandSidebar();
                  },
                  drawer === 'workspace',
                ],
              ] as const
            ).map(([kind, label, action, selected]) => (
              <button
                key={kind}
                type="button"
                className={'gea-sidebar-rail-item' + (selected ? ' is-active' : '')}
                title={label}
                aria-label={label}
                aria-current={selected ? 'page' : undefined}
                onClick={action}
              >
                <NavIcon kind={kind} />
              </button>
            ))}
          </div>
          <div className="gea-sidebar-drawer gea-drawer-function">
            <button
              type="button"
              className="gea-sidebar-tab"
              aria-expanded={drawer === 'function'}
              aria-controls="gea-panel-function"
              onClick={() => toggleDrawer('function')}
            >
              <span className="gea-drawer-title">{t('functionArea')}</span>
              <Chevron open={drawer === 'function'} />
            </button>
          </div>
          {drawer === 'function' && (
            <div className="gea-sidebar-panel gea-panel-function" id="gea-panel-function">
              <nav className="gea-shell-navigation" aria-label={t('businessNavigation')}>
                <div className="gea-shell-navigation-content">
                  {catalogNotice && (
                    <p role={catalogFailure !== null ? 'alert' : 'status'}>{catalogNotice}</p>
                  )}
                  {provider && scope && (
                    <button
                      type="button"
                      className="gea-shell-nav-child"
                      aria-label={t('businessCatalogRefresh')}
                      onClick={() => {
                        setCatalogState({ kind: 'loading' });
                        setRefresh((value) => value + 1);
                      }}
                    >
                      {t('businessCatalogRefresh')}
                    </button>
                  )}
                  {catalog?.domains.kind === 'unavailable' && (
                    <p role="status">{t('businessClassificationUnavailable')}</p>
                  )}
                  {menu.map((group) => (
                    <div
                      className={'gea-shell-nav-section' + (group.flat ? ' is-flat' : '')}
                      key={group.key}
                      data-gea-menu-group={group.key}
                    >
                      {!group.flat && (
                        <button
                          type="button"
                          className="gea-shell-nav-heading"
                          aria-expanded={sections[group.key] !== false}
                          onClick={() =>
                            setSections((value) => ({
                              ...value,
                              [group.key]: value[group.key] === false,
                            }))
                          }
                        >
                          <BusinessDomainIcon name={group.icon} />
                          <span>{group.title}</span>
                          <Chevron open={sections[group.key] !== false} />
                        </button>
                      )}
                      {(group.flat || sections[group.key] !== false) && (
                        <div className="gea-shell-nav-children">
                          {group.entries.map(({ id, pageId, title, disabled, reason }) => (
                            <button
                              key={id}
                              type="button"
                              disabled={disabled}
                              title={reason}
                              data-gea-business-entry={pageId ?? id}
                              aria-current={activePanel === pageId ? 'page' : undefined}
                              className={
                                'gea-shell-nav-child' + (activePanel === pageId ? ' is-active' : '')
                              }
                              onClick={() => {
                                if (pageId) void workbench.open(pageId as MainPanelId);
                              }}
                            >
                              <span className="gea-shell-label">{title}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </nav>
            </div>
          )}
          <div
            className="gea-workspace-owned"
            id="gea-panel-workspace"
            data-gea-expanded={drawer === 'workspace'}
          >
            <div hidden={drawer !== 'workspace'}>
              {documentState.historyPage &&
                documentState.selectedDocument?.id === documentState.historyPage &&
                documentState.selectedDocument.resourceId &&
                documentState.selection?.cwd && (
                  <PageUnsentHistory
                    page={documentState.selectedDocument}
                    cwd={documentState.selection.cwd}
                    sessions={ctx.sessions}
                    selectedSessionId={documentState.selection.sessionId}
                    request={fetch}
                    language={ctx.locale.getSnapshot().active}
                    onChoose={(id, preset, cwd) => {
                      pageSessions.chooseHistory(documentState.historyPage!, id, { preset, cwd });
                    }}
                  />
                )}
            </div>
            {renderSlot('sidebar.workspaces', {
              wide: !collapsed,
              expandSidebar: () => {
                setDrawer('workspace');
                expandSidebar();
              },
              expanded: drawer === 'workspace',
              heading: '',
            })}
          </div>
          <div className="gea-sidebar-drawer gea-drawer-recent">
            <button
              type="button"
              className="gea-sidebar-tab"
              aria-expanded={drawer === 'workspace'}
              aria-controls="gea-panel-workspace"
              onClick={() => toggleDrawer('workspace')}
            >
              <span className="gea-drawer-title">{t('recentArea')}</span>
            </button>
          </div>
        </div>
        <footer className="gea-sidebar-footer">
          {renderSlot('sidebar.settings', { wide: !collapsed })}
          {renderSlot('sidebar.footer.action', { wide: !collapsed })}
        </footer>
      </aside>
    );
  }
  function Documents({
    sessionId,
    useSessions,
    renderFactorySlot,
  }: PropsRuntime<'agent-workbench.documents'> & PropsRenderFactories) {
    useSyncExternalStore(
      (listener) => ctx.locale.subscribe(listener),
      () => ctx.locale.getSnapshot().active,
      () => ctx.locale.getSnapshot().active,
    );
    const catalogue = useSessions((value) => value);
    const documentState = useSyncExternalStore(
      workbench.subscribe,
      workbench.getSnapshot,
      workbench.getSnapshot,
    );
    const [historyError, setHistoryError] = useState('');
    const authority = useSyncExternalStore(
      subscribeAccount,
      () => account,
      () => account,
    );
    const identity = useSyncExternalStore(
      authority?.subscribe ?? noSubscribe,
      authority?.getSnapshot ?? (() => unavailableAccount),
      authority?.getSnapshot ?? (() => unavailableAccount),
    );
    const recovery = workbench.recoveryTarget();
    const recoveryKey = recovery
      ? JSON.stringify([
          recovery.page,
          recovery.sessionId,
          recovery.preset,
          recovery.cwd,
          recovery.subject,
          recovery.resourceId,
        ])
      : undefined;
    const directoryReady = catalogue.phase === 'ready';
    const savedListed = recovery ? catalogue.ids.includes(recovery.sessionId) : false;
    const savedCwd = recovery ? catalogue.byId[recovery.sessionId]?.cwd : undefined;
    useEffect(() => workbench.reconcileBusinessIdentity(identity), [identity, documentState.pages]);
    useEffect(
      () => pageSessions.recover(recovery, catalogue, setHistoryError),
      [
        recoveryKey,
        directoryReady,
        savedListed,
        savedCwd,
        identity.state,
        identity.scope,
        identity.subject,
        identity.status?.authenticated,
        identity.error,
        authority,
      ],
    );
    useEffect(() => pageSessions.observeMainSession(sessionId, setHistoryError), [sessionId]);
    const documents = documentState.visitedDocuments.map((page) => (
      <div
        key={page.id}
        style={{
          height: '100%',
          minHeight: 0,
          display: documentState.selectedDocument?.id === page.id ? 'flex' : 'none',
          flexDirection: 'column',
        }}
      >
        {renderFactorySlot('agent-workbench.document', {
          page,
          active: documentState.selectedDocument?.id === page.id,
          navigationError:
            documentState.selectedDocument?.id === page.id ? historyError : undefined,
        })}
      </div>
    ));
    return (
      <>
        <div className="gea-workbench-documents" hidden={!documentState.selectedDocument}>
          {documents}
        </div>
        {!documentState.selectedDocument && (historyError || recovery) && (
          <div
            className="gea-workbench-recovery"
            role={historyError || identity.error ? 'alert' : 'status'}
          >
            {historyError ||
              (ctx.locale.getSnapshot().active === 'en' ? en : zh)[
                identity.error ? 'pageRecoveryIdentityUnavailable' : 'pageRecoveryPending'
              ]}
          </div>
        )}
      </>
    );
  }
  ctx.slots.inject('sidebar', () =>
    ctx.slots.register(
      {
        name: 'sidebar',
        priority: -20,
        locale: 'companyWorkbench',
        children: {
          'sidebar.brand.mark': { kind: 'single', scope: 'root' },
          'sidebar.brand.name': { kind: 'single', scope: 'root' },
          'sidebar.toggle.badge': { kind: 'single', scope: 'root' },
          'sidebar.panellist': { kind: 'list', scope: 'root' },
          'sidebar.workspaces': { kind: 'single', scope: 'root' },
          'sidebar.settings': { kind: 'single', scope: 'root' },
          'sidebar.footer.action': { kind: 'list', scope: 'root' },
        },
      },
      Sidebar,
    ),
  );
  ctx.slots.inject('settings.launcher', () =>
    ctx.slots.register(
      { name: 'settings.launcher', priority: -20, locale: 'companyWorkbench' },
      Account,
    ),
  );
  ctx.slots.inject('sidebar.brand.mark', () =>
    ctx.slots.register(
      { name: 'sidebar.brand.mark', priority: -10, locale: 'companyWorkbench' },
      function Brand() {
        const geometry = React.useContext(SidebarGeometry);
        return (
          <span
            className="gea-brand-switch"
            title={t('openBusinessNavigation')}
            onClick={(event) => {
              event.stopPropagation();
              if (geometry.collapsed) geometry.expand();
            }}
          >
            <img className="gea-shell-logo" src={brandLogo} alt="" />
          </span>
        );
      },
    ),
  );
  ctx.slots.inject('sidebar.brand.name', () =>
    ctx.slots.register(
      { name: 'sidebar.brand.name', priority: -10, locale: 'companyWorkbench' },
      function BrandName() {
        return (
          <div className="gea-brand-copy" onClick={(event) => event.stopPropagation()}>
            <span className="gea-brand-title">{t('geaBusiness')}</span>
            <div className="gea-brand-subtitle">{t('brandSubtitle')}</div>
          </div>
        );
      },
    ),
  );
  function ShellLeading() {
    const creation = useSyncExternalStore(
      conversationStarter.state.subscribe,
      conversationStarter.state.getSnapshot,
      conversationStarter.state.getSnapshot,
    );
    return (
      <div className="gea-shell-leading">
        <button
          type="button"
          className="gea-inbox-quick-action"
          aria-label={t('openBusinessNavigation')}
          onClick={() => ctx.layout.toggleSidebar()}
        >
          <IconPanelLeftOutlineRegular size={16} />
        </button>
        <button
          type="button"
          className="gea-inbox-quick-action"
          aria-label={t('newConversation')}
          disabled={creation.kind === 'creating'}
          aria-busy={creation.kind === 'creating'}
          onClick={() => void conversationStarter.start()}
        >
          <IconNewChatOutlineRegular size={16} />
        </button>
      </div>
    );
  }
  ctx.slots.inject('shell.leading', () =>
    ctx.slots.register(
      { name: 'shell.leading', priority: -20, locale: 'companyWorkbench' },
      ShellLeading,
    ),
  );
  ctx.slots.inject('conversation.hero.content', () =>
    ctx.slots.register(
      { name: 'conversation.hero.content', priority: -10, locale: 'companyWorkbench' },
      function Welcome() {
        return (
          <div className="gea-conversation-welcome">
            <h1>
              <span>{t('welcomeLead')}</span>
              {t('welcomeMessage')}
              <span>{t('welcomeWork')}</span>
            </h1>
            <p>{t('welcomeTagline')}</p>
          </div>
        );
      },
    ),
  );
  // The public overlay keeps page DOM and recovery mounted while Core owns ordinary chats.
  ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register(
      {
        name: 'shell.overlay',
        id: 'agent-workbench.documents',
        children: { 'agent-workbench.documents': { kind: 'single', scope: 'session-maybe' } },
      },
      ({
        renderSlot,
      }: PropsRuntime<'shell.overlay'> & PropsRenderSlots<'agent-workbench.documents'>) =>
        renderSlot('agent-workbench.documents', {}),
    ),
  );
  ctx.slots.inject('agent-workbench.documents', () =>
    ctx.slots.register(
      { name: 'agent-workbench.documents', locale: 'companyWorkbench' },
      Documents,
    ),
  );
  ctx.slots.inject('main.conversation', () => {
    const register = () =>
      ctx.slots.register({ name: 'main.conversation', priority: -20 }, () => (
        <div className="gea-workbench-document-viewport" />
      ));
    let dispose: (() => void) | undefined;
    const sync = () => {
      if (workbench.getSnapshot().selectedDocument) dispose ??= register();
      else {
        dispose?.();
        dispose = undefined;
      }
    };
    sync();
    const unsubscribe = workbench.subscribe(sync);
    return () => {
      unsubscribe();
      dispose?.();
    };
  });
}
