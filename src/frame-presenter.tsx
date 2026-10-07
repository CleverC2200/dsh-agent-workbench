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
import type { SessionId } from '@deepseek-ai/dsh-session/types';
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
import type { WorkbenchController, DocumentSession } from './workbench.ts';
import {
  selectResource,
  resourceWorkspace,
  type ResourceSummary,
  type NativeResourceSelection,
} from './resource-selection.ts';
import type {
  PageExecutionConnection,
  PageIdentitySnapshot,
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
const unknownIdentity: PageIdentitySnapshot = { state: 'unknown', scope: null, status: null };
const noSubscribe = () => () => {};
const emptyGuide: readonly import('@deepseek-ai/dsh-client-ui-sidebar-right/client').SidebarRightGuideBox[] =
  [];

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
): (
  page: MainPanelId,
  sessionId: SessionId,
  signal: AbortSignal,
  expected?: Pick<DocumentSession, 'preset' | 'cwd' | 'subject'>,
) => Promise<void> {
  ctx.effect(() => {
    const style = document.createElement('style');
    style.dataset.workbenchDocument = 'layout';
    style.textContent = layoutCss;
    document.head.append(style);
    return () => style.remove();
  });
  // Formal Workbench remembered this value for the plugin instance, across pages and modes.
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
    const identity = useSyncExternalStore(
      currentExecution?.identity.subscribe ?? noSubscribe,
      currentExecution?.identity.getSnapshot ?? (() => unknownIdentity),
    );
    const identityReady =
      identity.state === 'confirmed' &&
      identity.error === undefined &&
      identity.status?.authenticated === true;
    const frame = useRef<HTMLIFrameElement>(null);
    const documentElement = useRef<HTMLElement>(null);
    const [preferredWidth, setPreferredWidth] = useState(() => rememberedConversationWidth ?? 440);
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
    const [loaded, setLoaded] = useState(0),
      [busy, setBusy] = useState(false),
      [error, setError] = useState('');
    const [interpreters, setInterpreters] = useState<ResourceSummary[]>([]);
    const resourceRows = useRef<ResourceSummary[]>([]);
    const resourceRowsOwner = useRef<{
      pageId: MainPanelId;
      resourceId: string;
      scope: string;
      execution: WorkbenchPageExecution;
      host: NativeResourceSelection;
    }>();
    const resourceHost = resources();
    const [view, setView] = useState<'center' | 'split' | 'chat'>(
      () => pageViews.get(page.id) ?? 'split',
    );
    const documentState = useSyncExternalStore(workbench.subscribe, workbench.getSnapshot);
    const selection =
      documentState.selectedDocument?.id === page.id ? documentState.selection : undefined;
    const session = useSession((value) => value);
    const currentPreset = useProjection('agentPreset');
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
    const pending = useRef<{ controller: AbortController; scope: string | null }>();
    const preparationOwner = useRef<string>();
    const preparation = useRef<AbortController>();
    const connectionTransition = useRef<Promise<void>>(Promise.resolve());
    const title = typeof page.label === 'function' ? page.label() : (page.label ?? page.id);
    const src = typeof page.src === 'function' ? page.src() : page.src;
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
    useEffect(
      () => () => {
        pending.current?.controller.abort();
        pending.current = undefined;
        preparation.current?.abort();
      },
      [active],
    );
    useEffect(() => {
      const flight = pending.current;
      if (page.resourceId && flight && (flight.scope !== identity.scope || !identityReady)) {
        flight.controller.abort();
        if (pending.current === flight) {
          pending.current = undefined;
          setBusy(false);
        }
      }
      if (
        selection &&
        page.resourceId &&
        identity.state === 'confirmed' &&
        !identity.error &&
        (!identity.status?.authenticated ||
          !identity.subject ||
          identity.subject !== selection.subject)
      ) {
        workbench.forgetSession(page.id);
        setError(t('pageChanged'));
      }
    }, [
      identity.scope,
      identity.subject,
      identity.state,
      identity.error,
      identity.status?.authenticated,
      identityReady,
      selection,
    ]);
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
    }, [associated, selection, session?.openState, loaded, currentExecution, page, title]);
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
    const interpreter = interpreters.find((row) => row.id === selection?.preset)?.id ?? page.resourceId;
    const connect = async (
      cwd?: string,
      ownerSignal?: AbortSignal,
      interpreterId: string | null | undefined = interpreter,
      reuse = true,
    ) => {
      if (!ownerSignal) preparation.current?.abort();
      const host = resources();
      if (!host || !currentExecution || !page.resourceId) {
        setError(t('pageWait'));
        return;
      }
      if (!identityReady) {
        setError(identity.error ?? t('pageLogin'));
        return;
      }
      pending.current?.controller.abort();
      const controller = new AbortController();
      const flight = { controller, scope: identity.scope };
      pending.current = flight;
      setBusy(true);
      setError('');
      const signal = ownerSignal
        ? AbortSignal.any([controller.signal, ownerSignal])
        : controller.signal;
      try {
        const requested = await resourceWorkspace(host.fetch, signal, cwd);
        const { path: directory } = await host.workspace(requested);
        signal.throwIfAborted();
        const associated = (selected: {
          sessionId: SessionId;
          preset: string | null;
          cwd?: string;
          interpreters?: readonly string[];
        }) => {
          signal.throwIfAborted();
          if (
            identity.scope !== currentExecution.identity.getSnapshot().scope ||
            workbench.getSnapshot().selectedDocument?.id !== page.id
          )
            throw Error(t('pageChanged'));
          const { interpreters: choices, ...projection } = selected;
          if (choices)
            setInterpreters(
              resourceRows.current.filter(
                (row) =>
                  choices.includes(row.id) && row.kind === 'prompt' && row.installed && row.enabled,
              ),
            );
          workbench.associateSession(page.id, {
            ...projection,
            ownerScope: identity.scope,
            ...(identity.subject ? { subject: identity.subject } : {}),
          });
        };
        let cached = reuse
          ? workbench.selectionFor(page.id, interpreterId ?? null, identity.scope, directory)
          : undefined;
        // Host scope changes across restarts. Reopen the same subject's retained
        // Session through the public owner, which validates its preset and cwd.
        if (
          !cached && reuse && selection && identity.subject &&
          selection.subject === identity.subject &&
          selection.preset === (interpreterId ?? null) && selection.cwd === directory
        ) cached = selection;
        if (cached)
          await host.open(cached.sessionId, undefined, signal, (selected) => {
            if (selected.preset !== cached.preset || selected.cwd !== directory)
              throw Error('PAGE_SESSION_RECOVERY_MISMATCH');
            associated(selected);
          });
        else {
          if (interpreterId !== page.resourceId && !interpreters.some((row) => row.id === interpreterId))
            throw Error('PAGE_INTERPRETER_UNAVAILABLE');
          await selectResource(host, interpreterId!, signal, directory, associated);
        }
      } catch (failure) {
        if (!signal.aborted) setError(failure instanceof Error ? failure.message : String(failure));
      } finally {
        if (pending.current === flight) {
          pending.current = undefined;
          setBusy(false);
        }
      }
    };
    const newPlainConversation = async () => {
      const host = resources();
      if (!host) {
        setError(t('pageWait'));
        return;
      }
      pending.current?.controller.abort();
      const controller = new AbortController();
      const flight = { controller, scope: null };
      pending.current = flight;
      setBusy(true);
      setError('');
      try {
        // Deployment configuration is the legal default, never an old historical Session's external cwd.
        const cwd = await resourceWorkspace(host.fetch, controller.signal);
        const { workspaceId } = await host.workspace(cwd);
        controller.signal.throwIfAborted();
        const id = await host.create({ workspaceId });
        controller.signal.throwIfAborted();
        await host.open(id, undefined, controller.signal, (selected) => {
          controller.signal.throwIfAborted();
          if (workbench.getSnapshot().selectedDocument?.id !== page.id)
            throw Error(t('pageChanged'));
          workbench.associateSession(page.id, {
            ...selected,
            ownerScope: identity.scope,
            subject: identity.subject,
          });
        });
      } catch (failure) {
        if (!controller.signal.aborted)
          setError(failure instanceof Error ? failure.message : String(failure));
      } finally {
        if (pending.current === flight) {
          pending.current = undefined;
          setBusy(false);
        }
      }
    };
    const associateCurrent = () => {
      if (!sessionId || session?.openState !== 'open' || currentPreset === undefined) return;
      workbench.associateSession(page.id, {
        sessionId,
        preset: currentPreset,
        ownerScope: identity.scope,
        subject: identity.subject,
        cwd: ctx.sessions.list.getSnapshot().byId[sessionId]?.cwd,
      });
      setError('');
    };
    useEffect(() => {
      const host = resourceHost;
      if (
        !active ||
        !host ||
        !currentExecution ||
        !page.resourceId ||
        !identity.scope ||
        !identityReady
      )
        return;
      const catalogOwner = resourceRowsOwner.current;
      if (
        selection &&
        catalogOwner?.scope === identity.scope &&
        catalogOwner.pageId === page.id &&
        catalogOwner.resourceId === page.resourceId &&
        catalogOwner.execution === currentExecution &&
        catalogOwner.host === host
      )
        return;
      setInterpreters([]);
      resourceRows.current = [];
      resourceRowsOwner.current = undefined;
      const owner = identity.scope + '\0' + page.resourceId;
      const prepare = (!selection || (
        selection.ownerScope !== identity.scope && selection.subject === identity.subject
      )) && preparationOwner.current !== owner;
      if (prepare) preparationOwner.current = owner;
      const controller = new AbortController();
      preparation.current = controller;
      void (async () => {
        const cwd = await resourceWorkspace(host.fetch, controller.signal);
        const response = await host.fetch(
          '/api/agent-manage/resources?' + new URLSearchParams({ cwd }),
          { signal: controller.signal, cache: 'no-store' },
        );
        if (!response.ok) throw Error('RESOURCE_LIST_UNAVAILABLE');
        const rows = (await response.json()) as ResourceSummary[];
        controller.signal.throwIfAborted();
        resourceRows.current = rows;
        resourceRowsOwner.current = {
          pageId: page.id,
          resourceId: page.resourceId!,
          scope: identity.scope!,
          execution: currentExecution,
          host,
        };
        const resource = rows.find((row) => row.id === page.resourceId);
        const allowed = resource?.interpreters ?? [page.resourceId];
        setInterpreters(
          rows.filter(
            (row) =>
              allowed.includes(row.id) && row.kind === 'prompt' && row.installed && row.enabled,
          ),
        );
        if (prepare && resource?.installed && resource.enabled)
          await connect(cwd, controller.signal, selection ? selection.preset : page.resourceId);
      })().catch((failure) => {
        if (!controller.signal.aborted)
          setError(failure instanceof Error ? failure.message : String(failure));
      });
      return () => {
        controller.abort();
        if (preparation.current === controller) preparation.current = undefined;
        if (preparationOwner.current === owner) preparationOwner.current = undefined;
      };
    }, [
      active,
      identity.scope,
      identityReady,
      currentExecution,
      resourceHost,
      page.id,
      page.resourceId,
    ]);
    const toolbar = (
      <div className="gea-page-toolbar-seat">
        <ConversationToolbar
          view={view}
          onViewChange={changeView}
          onHistory={() => workbench.showHistory(page.id)}
          onNewConversation={() => {
            if (page.resourceId)
              void connect(undefined, undefined, interpreter, false);
            else void newPlainConversation();
          }}
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
              onChange={(event) => void connect(undefined, undefined, event.target.value)}
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
    return (
      <section
        ref={documentElement}
        className="agent-workbench-ui agent-workbench-document"
        style={
          { '--workbench-ai-preferred-width': conversationWidth + 'px' } as React.CSSProperties
        }
      >
        {page.resourceId && identity.error !== undefined && (
          <p className="agent-workbench-page-status" role="alert" title={identity.error}>
            {t('pageIdentityFailed')}
          </p>
        )}
        <div className={'agent-workbench-document-body view-' + view}>
          <div className="agent-workbench-business" hidden={view === 'chat'}>
            {view === 'center' && toolbar}
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
            {view !== 'center' && toolbar}
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
  return async (page, id, signal, expected) => {
    const reference = ctx.sessions.retain(id, { source: 'agentResourceSelection', signal });
    try {
      await reference.ready;
      signal.throwIfAborted();
      const preset = reference.binding.session.projections.faceOf('agentPreset').getSnapshot();
      if (preset !== null && (typeof preset !== 'string' || !preset))
        throw Error('PAGE_SESSION_PRESET_UNAVAILABLE');
      const cwd = ctx.sessions.list.getSnapshot().byId[reference.sessionId]?.cwd;
      if (expected && (preset !== expected.preset || cwd !== expected.cwd))
        throw Error('PAGE_SESSION_RECOVERY_MISMATCH');
      const account = execution?.identity.getSnapshot();
      if (expected?.subject && account?.subject !== expected.subject)
        throw Error('PAGE_SESSION_IDENTITY_MISMATCH');
      workbench.associateSession(page, {
        sessionId: id,
        preset,
        ownerScope: account?.scope ?? null,
        ...(account?.subject ? { subject: account.subject } : {}),
        ...(typeof cwd === 'string' ? { cwd } : {}),
      });
    } finally {
      reference.release();
    }
  };
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
    signal.throwIfAborted();
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
    draft: (connection, text, signal) => insertPageFeedbackDraft(ctx, connection.sessionId, text, signal),
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
