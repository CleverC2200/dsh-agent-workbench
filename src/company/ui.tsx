import { PageUnsentHistory } from './unsent-history.tsx';
import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import type { Context } from '@deepseek-ai/cordis';
import {
  IconPanelLeftOutlineRegular,
  IconNewChatOutlineRegular,
  IconPluginPinwheelOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives/src/icons/index.tsx';
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type {
  PropsRuntime,
  PropsRenderSlots,
  PropsRenderFactories,
  FactoryLocalComponentPropsOf,
} from '@deepseek-ai/dsh-client-ui-slots';
import type {} from '@deepseek-ai/dsh-client-ui-settings/client';
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client';
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client';
import type { WorkbenchController, DocumentSession } from '../workbench.ts';
import type { BusinessAccount } from './account.ts';
import { zh, en, type CopyKey } from './locales.ts';
import { BUSINESS_MENU_PRESET, resolveBusinessMenu } from './navigation.ts';
import { AgentWelcome, GeaHomeHero, NavIcon, Chevron } from './formal-components.tsx';
import * as prompts from './conversation-prompts.ts';
import brandLogo from './brand-logo.png';
import css from './shell.css';
import layoutCss from './layout.css';
import staticControlsCss from './formal-static-controls.css';
import {
  IconNewChatOutline16,
  IconFolderClose16,
  IconFolderOpen16,
  IconChevronDownOutline14,
} from './formal-static-icons.tsx';

const DIRECTORY = 'agent-workbench' as MainPanelId;
const INBOX = 'gea-inbox' as MainPanelId;
const PLUGINS = 'plugins' as MainPanelId;
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
    'agent-workbench.directory': { kind: 'single'; scope: 'session-maybe' };
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
    <AgentWelcome agent={agent} onFill={(prompt) => onFill?.(prompt)} />
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
  Resources: React.ComponentType<{ cwd?: string }>,
  restorePageSession: (
    page: MainPanelId,
    sessionId: SessionId,
    signal: AbortSignal,
    expected?: Pick<DocumentSession, 'preset' | 'cwd'>,
  ) => Promise<void> = async () => {},
): void {
  ctx.effect(() => ctx.locale.register('companyWorkbench', { zh, en }));
  const t = ctx.locale.bind('companyWorkbench');
  const SidebarGeometry = React.createContext({ collapsed: false, expand: () => {} });
  ctx.effect(() => {
    const style = document.createElement('style');
    style.dataset.companyWorkbench = 'formal-508feea';
    style.textContent = staticControlsCss + '\n' + css + '\n' + layoutCss;
    document.head.append(style);
    return () => style.remove();
  });
  let account: BusinessAccount | undefined;
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
    return identity.error ? (
      <p
        role="alert"
        data-gea-identity-error=""
        className="agent-workbench-ui gea-identity-warning"
      >
        {t('identityObservationFailed')}
      </p>
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
    const user = identity.status?.authenticated ? identity.status.user : null;
    const name = user?.name ?? '',
      avatarUrl = user?.avatar ?? '';
    const [failedAvatar, setFailedAvatar] = useState<string | null>(null);
    useEffect(() => {
      setFailedAvatar(null);
    }, [avatarUrl]);
    const menu = useRef<HTMLDivElement>(null),
      trigger = useRef<HTMLButtonElement>(null);
    const [position, setPosition] = useState<{ left: number; bottom: number } | null>(null);
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
          {wide && <span>{name || t('signedOut')}</span>}
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
      | 'sidebar.panellist'
      | 'sidebar.workspaces'
      | 'sidebar.settings'
      | 'sidebar.footer.action'
    >) {
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
        aria-label="收起侧边栏"
        onClick={() => ctx.layout.toggleSidebar()}
      >
        <IconPanelLeftOutlineRegular size={16} />
      </button>
    );
    const documentState = useSyncExternalStore(
      workbench.subscribe,
      workbench.getSnapshot,
      workbench.getSnapshot,
    );
    const layoutPanel = usePanelInfo((value) => value.activePanelId);
    const activePanel = layoutPanel ?? documentState.selectedDocument?.id;
    const business = Boolean(
      activePanel && ![DIRECTORY, PLUGINS, 'gea-api-log'].includes(activePanel),
    );
    const [drawer, setDrawer] = useState<'function' | 'workspace' | 'none'>(() =>
      business ? 'function' : 'workspace',
    );
    const previousBusiness = useRef(business);
    useEffect(() => {
      if (business && !previousBusiness.current) setDrawer('function');
      previousBusiness.current = business;
    }, [business]);
    const [sections, setSections] = useState({
      supply: true,
      plan: true,
      inventory: true,
      orders: true,
      prototypes: true,
    });
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
    const menu = resolveBusinessMenu(BUSINESS_MENU_PRESET, available);
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
    const newConversation = () => {
      workbench.leaveDocument();
      setDrawer('workspace');
      expandSidebar();
      ctx.uiWorkspace.startSession();
    };
    const toggleDrawer = (name: 'function' | 'workspace') =>
      setDrawer((value) => (value === name ? 'none' : name));
    const pluginLabel = ctx.slots
      .entries('sidebar.panellist')
      .find((entry) => entry.options.id === PLUGINS)?.options.label;
    const modules = [{ id: DIRECTORY, label: '工作台' }];
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
                {!darwin && sidebarToggle}
              </>
            )}
          </div>
        </SidebarGeometry.Provider>
        {!collapsed && (
          <button
            type="button"
            className="gea-formal-new-session gea-new-session"
            aria-label={t('newConversation')}
            onClick={newConversation}
          >
            <IconNewChatOutline16 size={14} />
            <span className="gea-formal-new-session-label">AI工作台</span>
          </button>
        )}
        {!collapsed && available.has(PLUGINS) && (
          <button
            type="button"
            className={
              'gea-sidebar-tab gea-plugin-entry' + (activePanel === PLUGINS ? ' is-active' : '')
            }
            aria-current={activePanel === PLUGINS ? 'page' : undefined}
            onClick={() => void workbench.open(PLUGINS)}
          >
            <IconPluginPinwheelOutlineRegular size={16} />
            <span>
              {typeof pluginLabel === 'function' ? pluginLabel() : (pluginLabel ?? PLUGINS)}
            </span>
          </button>
        )}
        <div className="gea-sidebar-region" data-gea-drawer={drawer}>
          <div className="gea-sidebar-rail" data-gea-sidebar-rail>
            {(
              [
                ['newChat', t('newConversation'), newConversation, false],
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
                  t('workspaceArea'),
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
          <div className="gea-sidebar-drawer gea-drawer-workspace">
            <button
              type="button"
              className="gea-sidebar-tab"
              aria-expanded={drawer === 'workspace'}
              aria-controls="gea-panel-workspace"
              onClick={() => toggleDrawer('workspace')}
            >
              <span className="gea-drawer-title">{t('workspaceArea')}</span>
              <Chevron open={drawer === 'workspace'} />
            </button>
          </div>
          {drawer === 'function' && (
            <div className="gea-sidebar-panel gea-panel-function" id="gea-panel-function">
              <nav className="gea-shell-navigation" aria-label={t('businessNavigation')}>
                <div className="gea-shell-navigation-content">
                  {menu.map((group) => (
                    <div
                      className={'gea-shell-nav-section' + (group.flat ? ' is-flat' : '')}
                      key={group.key}
                    >
                      {!group.flat && (
                        <button
                          type="button"
                          className="gea-shell-nav-heading"
                          aria-expanded={sections[group.key]}
                          onClick={() =>
                            setSections((value) => ({ ...value, [group.key]: !value[group.key] }))
                          }
                        >
                          <NavIcon kind={group.icon as Parameters<typeof NavIcon>[0]['kind']} />
                          <span>{group.title}</span>
                          <Chevron open={sections[group.key]} />
                        </button>
                      )}
                      {(group.flat || sections[group.key]) && (
                        <div className="gea-shell-nav-children">
                          {group.entries.map(({ id, title, disabled }) => (
                            <button
                              key={id}
                              type="button"
                              disabled={disabled}
                              data-gea-business-entry={id}
                              aria-current={activePanel === id ? 'page' : undefined}
                              className={
                                'gea-shell-nav-child' + (activePanel === id ? ' is-active' : '')
                              }
                              onClick={() => void workbench.open(id as MainPanelId)}
                            >
                              <span className="gea-shell-label">{title}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  <div className="gea-shell-plugin-group">
                    {modules
                      .filter((module) => available.has(module.id))
                      .map((module) => (
                        <button
                          key={module.id}
                          type="button"
                          className={
                            'gea-shell-nav-child gea-shell-plugin' +
                            (activePanel === module.id ? ' is-active' : '')
                          }
                          aria-current={activePanel === module.id ? 'page' : undefined}
                          onClick={() => void workbench.open(module.id)}
                        >
                          <span className="gea-shell-plugin-dot" aria-hidden="true" />
                          <span className="gea-shell-label">{module.label}</span>
                        </button>
                      ))}
                  </div>
                </div>
              </nav>
            </div>
          )}
          <div className="gea-workspace-owned" hidden={drawer !== 'workspace'}>
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
                    workbench.selectHistorySession(documentState.historyPage!, id, { preset, cwd });
                    ctx.uiWorkspace.openSession(id);
                  }}
                />
              )}
            {renderSlot('sidebar.workspaces', { wide: !collapsed, expandSidebar })}
          </div>
        </div>
        <footer className="gea-sidebar-footer">
          {renderSlot('sidebar.settings', { wide: !collapsed })}
          {renderSlot('sidebar.footer.action', { wide: !collapsed })}
        </footer>
      </aside>
    );
  }
  function Conversation({
    sessionId,
    useSession,
    useConversation,
    useSessions,
    renderFactorySlot,
  }: PropsRuntime<'main.conversation'> & PropsRenderFactories) {
    useSyncExternalStore(
      (listener) => ctx.locale.subscribe(listener),
      () => ctx.locale.getSnapshot().active,
      () => ctx.locale.getSnapshot().active,
    );
    const session = useSession((value) => value),
      conversation = useConversation((value) => value);
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
    useEffect(() => {
      if (!recovery) return;
      if (catalogue.phase !== 'ready') return;
      const savedSession = catalogue.byId[recovery.sessionId];
      if (!catalogue.ids.includes(recovery.sessionId) || !savedSession) {
        setHistoryError(`Session unavailable: ${recovery.sessionId}`);
        return;
      }
      if (recovery.cwd && savedSession.cwd !== recovery.cwd) {
        setHistoryError('PAGE_SESSION_WORKSPACE_MISMATCH');
        return;
      }
      if (recovery.resourceId) {
        // A browser hint is neither a login flag nor a grant. Wait for GEA's current projection.
        if (identity.state !== 'confirmed' || identity.error) return;
        if (
          identity.status?.authenticated !== true ||
          !recovery.subject ||
          identity.subject !== recovery.subject
        ) {
          workbench.forgetSession(recovery.page);
          workbench.leaveDocument();
          return;
        }
      }
      const controller = new AbortController();
      setHistoryError('');
      void restorePageSession(recovery.page, recovery.sessionId, controller.signal, recovery)
        .then(() => {
          controller.signal.throwIfAborted();
          if (recovery.resourceId && authority?.getSnapshot().subject !== recovery.subject)
            throw Error('PAGE_IDENTITY_CHANGED');
          return workbench.open(recovery.page);
        })
        .catch((error) => {
          if (!controller.signal.aborted)
            setHistoryError(error instanceof Error ? error.message : String(error));
        });
      return () => controller.abort();
    }, [
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
    ]);
    const previousMainSession = useRef(sessionId);
    useEffect(() => {
      const changed = previousMainSession.current !== sessionId;
      previousMainSession.current = sessionId;
      if (!sessionId) {
        if (changed) workbench.leaveDocument();
        return;
      }
      if (changed && !recovery) setHistoryError('');
      const target = workbench.takeHistoryTarget(sessionId);
      const page = target?.page;
      if (!page) {
        const state = workbench.getSnapshot();
        if (
          (state.selection && state.selection.sessionId !== sessionId) ||
          (changed && state.selectedDocument && !state.selection)
        )
          workbench.leaveDocument();
        return;
      }
      const controller = new AbortController();
      const signal = AbortSignal.any([controller.signal, target!.signal]);
      void restorePageSession(page, sessionId, signal, target?.expected)
        .then(() => {
          signal.throwIfAborted();
          return workbench.completeHistory(target!);
        })
        .catch((error) => {
          if (!signal.aborted)
            setHistoryError(error instanceof Error ? error.message : String(error));
        });
      return () => controller.abort();
    }, [sessionId]);
    const blank =
      !session ||
      !conversation ||
      (conversation.activeTargets.size === 0 &&
        session.blank &&
        !session.running &&
        !session.promptAttempted);
    const loading = session?.openState === 'loading' && !blank;
    const positions = useMemo(() => {
      function Home() {
        return (
          <GeaHomeHero
            copy={{
              label: t('geaBusiness'),
              eyebrow: t('homeEyebrow'),
              title: t('homeTitle'),
              description: t('homeDescription'),
            }}
          />
        );
      }
      function Choices({
        useWorkspaces,
        renderSlot,
        selectWorkspace,
        t,
      }: Pick<
        FactoryLocalComponentPropsOf<'conversation.content', 'widthControls'>,
        'useWorkspaces' | 'renderSlot' | 'selectWorkspace' | 't'
      >) {
        const workspaces = useWorkspaces((value) => value.items),
          current = workspaces.find((workspace) => workspace.sessionIds.includes(sessionId!));
        const [open, setOpen] = useState(false);
        const anchorRef = useRef<HTMLButtonElement>(null);
        return (
          <div className="gea-native-selectors">
            <button
              ref={anchorRef}
              type="button"
              className="gea-formal-workspace"
              aria-label={t('hero.chooseWorkspace')}
              aria-haspopup="menu"
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
            >
              {current?.title === undefined ? (
                <IconFolderClose16 className="gea-formal-folder" size={16} />
              ) : (
                <IconFolderOpen16 className="gea-formal-folder" size={16} />
              )}
              <span className="gea-formal-workspace-label">
                {current?.title ?? t('hero.chooseWorkspace')}
              </span>
              <IconChevronDownOutline14 className="gea-formal-workspace-chevron" size={12} />
            </button>
            {renderSlot('conversation.hero.workspace', {
              open,
              anchorRef,
              selectedId: current?.workspaceId,
              onPick: (id) => {
                setOpen(false);
                void selectWorkspace(id);
              },
              onClose: () => setOpen(false),
            })}
            {renderSlot('conversation.hero.agentPreset', {})}
          </div>
        );
      }
      return {
        views: function MainViews(
          props: FactoryLocalComponentPropsOf<'conversation.content', 'views'>,
        ) {
          return (
            <div className="gea-main-views">
              {blank && (
                <div className="gea-home-position">
                  <Home />
                </div>
              )}
              <div className="gea-native-history" hidden={blank}>
                {props.renderSlot('conversation.session', {})}
              </div>
              {blank && <Choices {...props} />}
            </div>
          );
        },
        widthControls: function ColdStart(
          props: FactoryLocalComponentPropsOf<'conversation.content', 'widthControls'>,
        ) {
          return sessionId === undefined ? (
            <div className="gea-cold-start">
              <div className="gea-home-position">
                <Home />
              </div>
              <Choices {...props} />
            </div>
          ) : null;
        },
      };
    }, [blank, sessionId, ctx.locale.getSnapshot().active]);
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
        {documents}
        {!documentState.selectedDocument && (
          <section className="gea-company-main">
            {recovery && !historyError && (
              <p role={identity.error ? 'alert' : 'status'}>
                {
                  (ctx.locale.getSnapshot().active === 'en' ? en : zh)[
                    identity.error ? 'pageRecoveryIdentityUnavailable' : 'pageRecoveryPending'
                  ]
                }
              </p>
            )}
            {historyError && <p role="alert">{historyError}</p>}
            <div className="gea-native-content">
              {renderFactorySlot(
                'conversation.content',
                { variant: 'embedded', phase: loading ? 'settling' : 'active', hero: false },
                { slots: positions },
              )}
            </div>
          </section>
        )}
      </>
    );
  }
  function Directory({ sessionId, useSessions }: PropsRuntime<'agent-workbench.directory'>) {
    const documentState = useSyncExternalStore(
      workbench.subscribe,
      workbench.getSnapshot,
      workbench.getSnapshot,
    );
    useSyncExternalStore(
      (listener) => ctx.locale.subscribe(listener),
      () => ctx.locale.getSnapshot().active,
      () => ctx.locale.getSnapshot().active,
    );
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
    const cwd = useSessions((value) => (sessionId ? value.byId[sessionId]?.cwd : undefined));
    return (
      <section className="gea-directory-owned">
        <h1>工作台</h1>
        <button
          type="button"
          className="gea-home-panel-item"
          onClick={() => {
            workbench.leaveDocument();
            ctx.layout.selectPanel(null);
          }}
        >
          原生对话
        </button>
        <section className="gea-home-panel">
          <div className="gea-home-panel-head">
            <strong>已接入页面</strong>
          </div>
          <div className="gea-home-panel-list">
            {[
              ...new Set([
                ...entries
                  .filter(
                    (entry) =>
                      entry.options.key && ![DIRECTORY, 'conversation'].includes(entry.options.key),
                  )
                  .map((entry) => entry.options.key! as MainPanelId),
                ...documentState.pages
                  .filter((page) => page.id !== DIRECTORY)
                  .map((page) => page.id),
              ]),
            ].map((id) => {
              const label = ctx.slots
                .entries('sidebar.panellist')
                .find((panel) => panel.options.id === id)?.options.label;
              return (
                <button
                  key={id}
                  type="button"
                  className="gea-home-panel-item"
                  onClick={() => void workbench.open(id)}
                >
                  {typeof label === 'function' ? label() : (label ?? workbench.label(id))}
                </button>
              );
            })}
          </div>
        </section>
        <Resources cwd={cwd} />
      </section>
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
  ctx.slots.inject('shell.leading', () =>
    ctx.slots.register({ name: 'shell.leading', priority: -20, locale: 'companyWorkbench' }, () => (
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
          onClick={() => {
            workbench.leaveDocument();
            ctx.uiWorkspace.startSession();
          }}
        >
          <IconNewChatOutlineRegular size={16} />
        </button>
      </div>
    )),
  );
  ctx.slots.inject('main.conversation', () =>
    ctx.slots.register(
      { name: 'main.conversation', priority: -20, locale: 'companyWorkbench' },
      Conversation,
    ),
  );
  ctx.slots.inject('main', () => {
    const dispose = ctx.slots.register(
      {
        name: 'main',
        key: DIRECTORY,
        children: { 'agent-workbench.directory': { kind: 'single', scope: 'session-maybe' } },
      },
      ({ renderSlot }: PropsRuntime<'main'> & PropsRenderSlots<'agent-workbench.directory'>) =>
        renderSlot('agent-workbench.directory', {}),
    );
    const unregister = workbench.register({ id: DIRECTORY, label: '工作台' });
    return () => {
      dispose();
      unregister();
    };
  });
  ctx.slots.inject('agent-workbench.directory', () =>
    ctx.slots.register({ name: 'agent-workbench.directory' }, Directory),
  );
}
