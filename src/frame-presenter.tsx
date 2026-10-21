import { insertPageFeedbackDraft } from './page-feedback-draft.ts';
import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { Context } from '@deepseek-ai/cordis';
import type { SessionReference } from '@deepseek-ai/dsh-api-session-controller/client';
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client';
import type {
  FactoryComponentPropsOf,
  FactoryLocalComponentPropsOf,
  PropsRenderFactories,
  PropsRenderSlots,
  PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots';
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client';
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client';
import type { WorkbenchController } from './workbench.ts';
import type { NativeResourceSelection } from './resource-selection.ts';
import {
  createPageSessionRestorer,
  usePageSessionCoordination,
  type PageSessionRestore,
} from './page-session-coordination.ts';
import type {
  PageExecutionConnection,
  WorkbenchFramePage,
  WorkbenchPageExecution,
} from './frame.ts';
import { connectHtmlFrame } from './html-bridge.ts';
import { installPageInteraction } from './page-interaction/client.ts';
import { CompanyWelcome } from './company/ui.tsx';
import { ConversationToolbar } from './company/formal-components.tsx';
import layoutCss from './frame-presenter.css';
import { connectHtmlViewState } from './html-view-channel.ts';
import { isBusinessViewPage } from './html-view-state.ts';

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotFactoryMap {
    'agent-workbench.document': {
      scope: 'session-maybe';
      props: { page: WorkbenchFramePage; active: boolean; navigationError?: string };
      children: { 'agent-workbench.conversation': { kind: 'single'; scope: 'session-maybe' } };
    };
  }
  interface SlotMap {
    'agent-workbench.conversation': {
      kind: 'single';
      scope: 'session-maybe';
      owner: { page: string };
    };
  }
}
const noSubscribe = () => () => {};
const emptyGuide: readonly import('@deepseek-ai/dsh-client-ui-sidebar-right/client').SidebarRightGuideBox[] =
  [];
const inventoryAgentPages = new Set([
  'inventory-qll',
  'inventory-fc',
  'inventory-aqkc',
  'inventory-dealer',
  'inventory-apsplan',
]);

/** The single native/HTML presentation module. Host Session references are explicitly borrowed. */
export type FrameCopyKey =
  | 'pageConnect'
  | 'pageNewChat'
  | 'pageWorking'
  | 'pageChanged'
  | 'pageHint'
  | 'pageWait'
  | 'pageLogin'
  | 'pageSessionUnavailable'
  | 'pageStaticHint'
  | 'pageCreating'
  | 'pageInterpreter'
  | 'pageIdentityFailed';
export function mountFramePresentation(
  ctx: Context,
  resources: () => NativeResourceSelection | undefined,
  t: (key: FrameCopyKey) => string,
  workbench: WorkbenchController,
): PageSessionRestore {
  ctx.effect(() => {
    const style = document.createElement('style');
    style.dataset.plugin = '@cleverc2200/dsh-agent-workbench';
    style.dataset.workbenchDocument = 'layout';
    style.textContent = layoutCss;
    document.head.append(style);
    return () => style.remove();
  });
  // Width preference survives page and mode changes within this Workbench instance.
  let rememberedConversationWidth: number | undefined;
  let execution: WorkbenchPageExecution | undefined;
  const backendListeners = new Set<() => void>();
  ctx.inject(['businessAccount', 'remote.session', 'sessions', 'conversation'], (scope) => {
    const owned = createExecution(scope, scope.businessAccount);
    execution = owned;
    for (const changed of backendListeners) changed();
    scope.effect(() => () => {
      if (execution === owned) {
        execution = undefined;
        for (const changed of backendListeners) changed();
      }
    });
  });
  const interaction = installPageInteraction(ctx);
  const pageViews = new Map<MainPanelId, 'center' | 'split' | 'chat'>();
  let tools: Pick<Context, 'sidebarRight' | 'sidebarRightTabs'> | undefined;
  const toolListeners = new Set<() => void>();
  ctx.inject(['sidebarRight', 'sidebarRightTabs'], (scope) => {
    tools = scope;
    for (const notify of toolListeners) notify();
    scope.effect(() => () => {
      if (tools === scope) {
        tools = undefined;
        for (const notify of toolListeners) notify();
      }
    });
  });
  function Document({
    page,
    active,
    navigationError,
    sessionId,
    useSessions,
    useSession,
    useProjection,
    inputActions,
    renderSlot,
  }: FactoryComponentPropsOf<'agent-workbench.document'> &
    PropsRenderSlots<'agent-workbench.conversation'>) {
    useSyncExternalStore(
      (listener) => ctx.locale.subscribe(listener),
      () => ctx.locale.getSnapshot(),
    );
    const currentExecution = useSyncExternalStore(
      (listener) => {
        backendListeners.add(listener);
        return () => {
          backendListeners.delete(listener);
        };
      },
      () => execution,
    );
    const frame = useRef<HTMLIFrameElement>(null);
    const documentElement = useRef<HTMLElement>(null);
    const [preferredWidth, setPreferredWidth] = useState(() => rememberedConversationWidth ?? 520);
    const [space, setSpace] = useState({ viewport: window.innerWidth, document: 0 });
    const maximumWidth = Math.max(
      300,
      Math.min(space.viewport * 0.7, space.document ? space.document - 400 : Infinity),
    );
    const conversationWidth = Math.min(maximumWidth, Math.max(300, Math.round(preferredWidth)));
    const drag = useRef<{ pointer: number; x: number; width: number }>();
    const syncToolPresentation = useRef<() => void>();
    useLayoutEffect(() => {
      const target = documentElement.current!;
      const measure = () => {
        const width = target.getBoundingClientRect().width;
        setSpace({ viewport: window.innerWidth, document: width });
        syncToolPresentation.current?.();
      };
      measure();
      window.addEventListener('resize', measure);
      const observer =
        typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure);
      observer?.observe(target);
      return () => {
        window.removeEventListener('resize', measure);
        observer?.disconnect();
      };
    }, []);
    const resizeConversation = (x: number) => {
      const current = drag.current;
      if (!current) return;
      const width = Math.min(
        maximumWidth,
        Math.max(300, Math.round(current.width + current.x - x)),
      );
      rememberedConversationWidth = width;
      setPreferredWidth(width);
    };
    const [loaded, setLoaded] = useState(0);
    const [view, setView] = useState<'center' | 'split' | 'chat'>(
      () => pageViews.get(page.id) ?? 'split',
    );
    const titleless = inventoryAgentPages.has(page.id);
    const session = useSession((value) => value);
    const currentPreset = useProjection('agentPreset');
    const currentCwd = useSessions((value) => (sessionId ? value.byId[sessionId]?.cwd : undefined));
    const {
      identity,
      identityReady,
      selection,
      busy,
      error,
      setError,
      interpreters,
      selectInterpreter,
      newConversation,
      associateCurrent,
    } = usePageSessionCoordination({
      ctx,
      workbench,
      page,
      active,
      sessionId,
      sessionOpen: session?.openState === 'open',
      currentPreset,
      currentCwd,
      currentExecution,
      resources,
      t,
    });
    const associated =
      active &&
      selection?.sessionId === sessionId &&
      selection !== undefined &&
      (!page.resourceId || (selection.ownerScope === identity.scope && identityReady));
    const frameKey = page.resourceId && identityReady ? (identity.scope ?? undefined) : undefined;
    const viewScope =
      isBusinessViewPage(page.id) && associated && identity.subject && sessionId
        ? JSON.stringify([identity.subject, sessionId])
        : undefined;
    useEffect(() => {
      if (
        !active ||
        page.kind !== 'html' ||
        !frame.current ||
        (isBusinessViewPage(page.id) && !viewScope)
      )
        return;
      const controller = new AbortController();
      const stop = connectHtmlViewState(
        frame.current,
        page.id,
        viewScope,
        workbench,
        controller.signal,
      );
      return () => {
        controller.abort();
        stop();
      };
    }, [active, page, viewScope, workbench]);
    const restoreView = useRef<'center' | 'split' | 'chat'>();
    const currentTools = useSyncExternalStore(
      (listener) => {
        toolListeners.add(listener);
        return () => {
          toolListeners.delete(listener);
        };
      },
      () => tools,
    );
    const guide = useSyncExternalStore(
      currentTools ? (listener) => currentTools.sidebarRightTabs.subscribe(listener) : noSubscribe,
      () => currentTools?.sidebarRightTabs.guide() ?? emptyGuide,
    );
    const [toolsExpanded, setToolsExpanded] = useState(
      () => currentTools?.sidebarRight.isExpanded() ?? false,
    );
    const changeView = (next: 'center' | 'split' | 'chat') => {
      restoreView.current = undefined;
      if (currentTools?.sidebarRight.isExpanded()) {
        currentTools.sidebarRight.toggleExpanded();
        setToolsExpanded(false);
      }
      pageViews.set(page.id, next);
      setView(next);
    };
    const openTool = (kind: string) => {
      if (!associated || !currentTools?.sidebarRightTabs.get(kind)) return;
      try {
        if (!currentTools.sidebarRight.isExpanded()) restoreView.current = view;
        currentTools.sidebarRight.openTab(kind);
        setToolsExpanded(currentTools.sidebarRight.isExpanded());
        setView('center');
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : String(failure));
      }
    };
    const closeTools = () => {
      if (currentTools?.sidebarRight.isExpanded()) currentTools.sidebarRight.toggleExpanded();
      setToolsExpanded(false);
      setView(restoreView.current ?? pageViews.get(page.id) ?? 'split');
      restoreView.current = undefined;
    };
    syncToolPresentation.current = () => {
      if (!associated) return;
      const expanded = currentTools?.sidebarRight.isExpanded() ?? false;
      setToolsExpanded(expanded);
      if (expanded && view !== 'center') {
        restoreView.current ??= view;
        setView('center');
      } else if (!expanded && restoreView.current) {
        setView(restoreView.current);
        restoreView.current = undefined;
      }
    };
    useLayoutEffect(() => {
      syncToolPresentation.current?.();
    }, [associated, currentTools]);
    const connectionTransition = useRef<Promise<void>>(Promise.resolve());
    const title = typeof page.label === 'function' ? page.label() : (page.label ?? page.id);
    const src = typeof page.src === 'function' ? page.src() : page.src;
    useEffect(() => {
      if (page.id !== 'inventory-customer' || !loaded) return;
      const failure = error || navigationError || identity.error;
      frame.current?.contentWindow?.postMessage(
        {
          protocol: 'customer-inventory-status',
          failed: Boolean(failure),
          error: failure || '',
        },
        '*',
      );
    }, [page.id, loaded, error, navigationError, identity.error]);
    const Body = page.kind === 'local' ? page.body : undefined;
    const visibleReceipt = useSyncExternalStore(
      page.visibleRequest?.subscribe ?? noSubscribe,
      page.visibleRequest?.getSnapshot ?? (() => undefined),
    );
    const sendTheme = () => {
      const theme = ctx.theme.getTheme();
      frame.current?.contentWindow?.postMessage(
        {
          protocol: 'agent-workbench-theme',
          dark: theme.active.colorScheme === 'dark',
          fontSize: theme.fontSize,
        },
        '*',
      );
    };
    useEffect(() => {
      const off = ctx.on('theme/change', sendTheme);
      return () => {
        off();
      };
    }, []);
    useEffect(() => {
      const ready = (event: MessageEvent) => {
        if (
          event.source === frame.current?.contentWindow &&
          event.data?.protocol === 'agent-workbench-theme'
        )
          sendTheme();
      };
      window.addEventListener('message', ready);
      return () => window.removeEventListener('message', ready);
    }, []);
    useEffect(() => {
      if (!active || page.kind !== 'native' || !frame.current) return;
      frame.current.contentWindow?.postMessage(
        { type: 'gea:identity-snapshot', snapshot: identity },
        window.location.origin,
      );
    }, [active, identity, loaded, page]);
    useEffect(() => {
      if (active && loaded && identityReady) page.onVisible?.(visibleReceipt);
    }, [active, loaded, identityReady, page, visibleReceipt]);
    useEffect(() => {
      if (
        !associated ||
        session?.openState !== 'open' ||
        !loaded ||
        !frame.current ||
        !currentExecution ||
        !inputActions ||
        !page.resourceId
      )
        return;
      const controller = new AbortController();
      let connection: PageExecutionConnection | undefined;
      let reference: SessionReference | undefined;
      let disposeBridge = () => {},
        disposeReference = () => {},
        disposeTheme = () => {};
      const target = frame.current;
      const alive = () =>
        !controller.signal.aborted &&
        selection.ownerScope === currentExecution.identity.getSnapshot().scope;
      const setup = connectionTransition.current.then(async () => {
        controller.signal.throwIfAborted();
        reference = ctx.sessions.retain(selection!.sessionId, {
          source: 'agentResourceSelection',
          signal: controller.signal,
        });
        await reference.ready;
        controller.signal.throwIfAborted();
        connection = await currentExecution.open(
          page,
          reference.sessionId,
          page.resourceId!,
          controller.signal,
        );
        if (!alive()) {
          await currentExecution.close(connection);
          connection = undefined;
          return;
        }
        if (page.kind === 'html') {
          const bridge = connectHtmlFrame(
            target,
            connection,
            currentExecution,
            () => ctx.theme.getTheme(),
            controller.signal,
            (failure) => {
              if (alive()) {
                setError(failure instanceof Error ? failure.message : String(failure));
                if (connection) void currentExecution.close(connection).catch(() => {});
              }
            },
          );
          disposeBridge = bridge;
          const off = ctx.on('theme/change', () => bridge.sendTheme());
          disposeTheme = () => {
            off();
          };
        } else
          target.contentWindow?.postMessage(
            { type: 'workbench:session', sessionId: selection!.sessionId, owner: connection.owner },
            window.location.origin,
          );
        disposeReference = interaction.bindFrame({
          mode: 'business',
          frame: target,
          reference: reference!,
          page: title,
          inputActions,
          surface: connection.binding.surface,
          tool: connection.binding.tool,
          owner: connection.owner,
        });
        setError('');
      });
      connectionTransition.current = setup.catch((failure) => {
        if (alive()) {
          setError(failure instanceof Error ? failure.message : String(failure));
          if (connection) void currentExecution.close(connection).catch(() => {});
        }
      });
      return () => {
        controller.abort();
        disposeTheme();
        disposeReference();
        disposeBridge();
        if (page.kind === 'native')
          target.contentWindow?.postMessage(
            { type: 'workbench:session', sessionId: null },
            window.location.origin,
          );
        connectionTransition.current = setup
          .catch(() => {})
          .then(async () => {
            try {
              if (connection) {
                const owned = connection;
                connection = undefined;
                await currentExecution.close(owned);
              }
            } finally {
              reference?.release();
              reference = undefined;
            }
          })
          .catch(() => {});
      };
    }, [
      associated,
      selection,
      session?.openState,
      loaded,
      currentExecution,
      inputActions,
      page,
      title,
    ]);
    useEffect(() => {
      if (
        page.resourceId ||
        !associated ||
        session?.openState !== 'open' ||
        !inputActions ||
        !loaded ||
        !frame.current
      )
        return;
      const controller = new AbortController();
      const reference = ctx.sessions.retain(selection!.sessionId, {
        source: 'agentResourceSelection',
        signal: controller.signal,
      });
      let unbind = () => {};
      void reference.ready
        .then(() => {
          controller.signal.throwIfAborted();
          unbind = interaction.bindFrame({
            mode: 'quote',
            frame: frame.current!,
            reference,
            page: title,
            inputActions,
            isCurrentSession: () =>
              ctx.sessions.retainInfo(reference.sessionId).getSnapshot().retainedBy.mainView !==
              undefined,
          });
        })
        .catch((failure) => {
          if (!controller.signal.aborted)
            setError(failure instanceof Error ? failure.message : String(failure));
        });
      return () => {
        controller.abort();
        unbind();
        reference.release();
      };
    }, [page.resourceId, associated, session?.openState, selection, inputActions, loaded, title]);
    const toolbar = (
      <div className="gea-page-toolbar-seat">
        <ConversationToolbar
          view={view}
          onViewChange={changeView}
          onHistory={() => workbench.showHistory(page.id)}
          onNewConversation={() => void newConversation()}
          onAssociateCurrent={!page.resourceId ? associateCurrent : undefined}
          associateDisabled={
            !sessionId || session?.openState !== 'open' || currentPreset === undefined
          }
          error={error || navigationError || ''}
          tools={associated ? guide : emptyGuide}
          onOpenTool={openTool}
          onCloseTools={closeTools}
          toolsExpanded={toolsExpanded}
        >
          {identityReady && interpreters.length > 1 && (
            <select
              className="gea-conversation-toolbar-tool"
              aria-label={t('pageInterpreter')}
              disabled={busy}
              value={currentPreset ?? selection?.preset ?? page.resourceId}
              onChange={(event) => void selectInterpreter(event.target.value)}
            >
              {interpreters.map((resource) => (
                <option key={resource.id} value={resource.id}>
                  {resource.label}
                </option>
              ))}
            </select>
          )}
        </ConversationToolbar>
      </div>
    );
    const chrome = (
      <header
        className={
          'agent-workbench-document-chrome' +
          (titleless ? ' agent-workbench-document-chrome-tools' : '')
        }
        data-workbench-view={view}
        data-workbench-window-chrome
        data-window-drag
        aria-label={titleless ? '会话操作栏' : '工作台标题栏'}
      >
        {!titleless && <span className="agent-workbench-document-title">{title}</span>}
        {toolbar}
      </header>
    );
    return (
      <section
        ref={documentElement}
        className="agent-workbench-document"
        style={
          { '--workbench-ai-preferred-width': conversationWidth + 'px' } as React.CSSProperties
        }
      >
        {(!titleless || view === 'center') && chrome}
        {page.resourceId && identity.error !== undefined && (
          <p className="agent-workbench-page-status" role="alert" title={identity.error}>
            {t('pageIdentityFailed')}
          </p>
        )}
        <div className={'agent-workbench-document-body view-' + view}>
          <div className="agent-workbench-business" hidden={view === 'chat'}>
            {Body ? (
              <div className="agent-workbench-html">
                <Body />
              </div>
            ) : (
              <iframe
                key={frameKey}
                ref={frame}
                title={title}
                src={src}
                {...(page.kind === 'html' ? { sandbox: 'allow-scripts allow-downloads' } : {})}
                className="agent-workbench-html"
                onLoad={() => {
                  setLoaded((value) => value + 1);
                  sendTheme();
                }}
              />
            )}
          </div>
          <div
            role="separator"
            aria-label="调整业务与AI栏宽"
            aria-orientation="vertical"
            className="agent-workbench-column-handle"
            hidden={view !== 'split'}
            onPointerDown={(event) => {
              if (event.button !== 0 || space.viewport <= 1200 || drag.current) return;
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = {
                pointer: event.pointerId,
                x: event.clientX,
                width: conversationWidth,
              };
            }}
            onPointerMove={(event) => {
              if (drag.current?.pointer === event.pointerId) resizeConversation(event.clientX);
            }}
            onPointerUp={(event) => {
              if (drag.current?.pointer !== event.pointerId) return;
              resizeConversation(event.clientX);
              drag.current = undefined;
              event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onPointerCancel={() => {
              drag.current = undefined;
            }}
            onLostPointerCapture={() => {
              drag.current = undefined;
            }}
          />
          <aside
            className="agent-workbench-native-conversation"
            aria-label="AI对话"
            hidden={view === 'center'}
          >
            {titleless && view !== 'center' && chrome}
            {associated && session?.openState === 'open' ? (
              renderSlot('agent-workbench.conversation', { page: page.id })
            ) : (
              <p className="agent-workbench-page-status" role={error ? 'alert' : 'status'}>
                {error ||
                  navigationError ||
                  (associated ? session?.openError?.message : undefined) ||
                  t(
                    associated
                      ? 'pageWorking'
                      : !page.resourceId
                        ? busy
                          ? 'pageCreating'
                          : 'pageStaticHint'
                        : !currentExecution || identity.state === 'unknown'
                          ? 'pageWait'
                          : !identity.status?.authenticated
                            ? 'pageLogin'
                            : !resources() || !page.resourceId
                              ? 'pageWait'
                              : busy
                                ? 'pageWorking'
                                : 'pageHint',
                  )}
              </p>
            )}
          </aside>
        </div>
      </section>
    );
  }
  ctx.effect(() =>
    ctx.slots.registerFactory(
      {
        name: 'agent-workbench.document',
        scope: 'session-maybe',
        children: { 'agent-workbench.conversation': { kind: 'single', scope: 'session-maybe' } },
      },
      Document,
    ),
  );
  ctx.slots.inject('agent-workbench.conversation', () =>
    ctx.slots.register(
      { name: 'agent-workbench.conversation' },
      ({
        page,
        renderFactorySlot,
      }: PropsRuntime<'agent-workbench.conversation'> & PropsRenderFactories) => {
        const language = ctx.locale.getSnapshot().active;
        const positions = useMemo(
          () => ({
            views: function BusinessViews({
              useSession,
              inputActions,
              renderSlot,
            }: FactoryLocalComponentPropsOf<'conversation.content', 'views'>) {
              const blank = useSession(
                (session) => session.blank && !session.running && !session.promptAttempted,
              );
              return (
                <>
                  {blank && (
                    <CompanyWelcome
                      page={page}
                      language={language}
                      onFill={(text) => inputActions?.setDraft(text)}
                    />
                  )}
                  {renderSlot('conversation.session', {})}
                </>
              );
            },
          }),
          [page, language],
        );
        return (
          <div className="workbench-page-conversation">
            {renderFactorySlot(
              'conversation.content',
              { variant: 'embedded', phase: 'active', hero: false },
              { slots: positions },
            )}
          </div>
        );
      },
    ),
  );
  return createPageSessionRestorer({
    ctx,
    workbench,
    identity: () => execution?.identity.getSnapshot(),
  });
}

function createExecution(
  ctx: Context,
  account: import('./company/account.ts').BusinessAccount,
): WorkbenchPageExecution {
  const request = async (operation: string, input: object, signal: AbortSignal) => {
    const response = await fetch('/api/agent-workbench/page', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operation, ...input }),
      signal,
    });
    const value = await response.json();
    // Return a late opening's owner to setup so it can close it before releasing the Session.
    // Other replies must never cross their cancelled generation.
    if (operation !== 'open') signal.throwIfAborted();
    if (!response.ok) throw Error(value.error ?? 'PAGE_REQUEST_FAILED');
    return value;
  };
  return {
    identity: account,
    async open(page, sessionId, resourceId, signal) {
      const result = await request('open', { pageId: page.id, sessionId, resourceId }, signal);
      return { page, sessionId, resourceId, owner: result.owner, binding: result.binding };
    },
    call: (connection, operation, parameters, signal) =>
      request(
        operation === 'page-bridge' ? 'catalog' : operation,
        { owner: connection.owner, parameters },
        signal,
      ),
    close: async (connection) => {
      await request('close', { owner: connection.owner }, AbortSignal.timeout(5000));
    },
    draft: (connection, text, signal) =>
      insertPageFeedbackDraft(ctx, connection.sessionId, text, signal),
    prompt: async (connection, text, signal) => {
      signal.throwIfAborted();
      const result = await ctx.remote.session.prompt(
        {
          sessionId: connection.sessionId as any,
          requestId: crypto.randomUUID() as any,
          mode: 'queue',
          content: [{ type: 'text', text }],
        },
        signal,
      );
      signal.throwIfAborted();
      if (!result.ok) throw Error(result.error.message);
    },
  };
}
