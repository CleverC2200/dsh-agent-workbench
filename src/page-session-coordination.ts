import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Context } from '@deepseek-ai/cordis';
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client';
import type { DocumentSession, WorkbenchController } from './workbench.ts';
import type { PageIdentitySnapshot, WorkbenchFramePage, WorkbenchPageExecution } from './frame.ts';
import {
  resourceWorkspace,
  selectResource,
  type NativeResourceSelection,
  type ResourceSummary,
} from './resource-selection.ts';
import { withReadyPageSession } from './page-session-core.ts';

const unknownIdentity: PageIdentitySnapshot = { state: 'unknown', scope: null, status: null };
const noSubscribe = () => () => {};
type PageSessionCopy = (key: 'pageWait' | 'pageLogin' | 'pageChanged') => string;
export type PageSessionRestore = (
  page: MainPanelId,
  sessionId: SessionId,
  signal: AbortSignal,
  expected?: Pick<DocumentSession, 'preset' | 'cwd' | 'subject'>,
) => Promise<void>;

/** Page associations borrow Core Sessions. GEA remains the only identity authority. */
export function usePageSessionCoordination({
  ctx,
  workbench,
  page,
  active,
  sessionId,
  sessionOpen,
  currentPreset,
  currentCwd,
  currentExecution,
  resources,
  t,
}: {
  ctx: Context;
  workbench: WorkbenchController;
  page: WorkbenchFramePage;
  active: boolean;
  sessionId?: SessionId;
  sessionOpen: boolean;
  currentPreset: string | null | undefined;
  currentCwd?: string;
  currentExecution?: WorkbenchPageExecution;
  resources: () => NativeResourceSelection | undefined;
  t: PageSessionCopy;
}) {
  const identity = useSyncExternalStore(
    currentExecution?.identity.subscribe ?? noSubscribe,
    currentExecution?.identity.getSnapshot ?? (() => unknownIdentity),
  );
  const identityReady =
    identity.state === 'confirmed' &&
    identity.error === undefined &&
    identity.status?.authenticated === true;
  const documentState = useSyncExternalStore(workbench.subscribe, workbench.getSnapshot);
  const selection =
    documentState.selectedDocument?.id === page.id ? documentState.selection : undefined;
  const restoredWithoutSession =
    documentState.selectedDocument?.id === page.id && documentState.restoredWithoutSession === true;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
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
  const pending = useRef<{ controller: AbortController; scope: string | null }>();
  const preparationOwner = useRef<string>();
  const preparation = useRef<AbortController>();
  const cancelSelection = () => {
    const flight = pending.current;
    if (!flight) return;
    flight.controller.abort();
    if (pending.current === flight) {
      pending.current = undefined;
      setBusy(false);
    }
  };
  const runSelection = async (
    ownerSignal: AbortSignal | undefined,
    select: (signal: AbortSignal) => Promise<void>,
  ) => {
    pending.current?.controller.abort();
    const controller = new AbortController();
    const flight = { controller, scope: page.resourceId ? identity.scope : null };
    pending.current = flight;
    setBusy(true);
    setError('');
    const signal = ownerSignal
      ? AbortSignal.any([controller.signal, ownerSignal])
      : controller.signal;
    try {
      await select(signal);
    } catch (failure: unknown) {
      if (!signal.aborted) setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      // A late completion cannot clear the next intent's busy state.
      if (pending.current === flight) {
        pending.current = undefined;
        setBusy(false);
      }
    }
  };
  const associate = (
    selected: Pick<DocumentSession, 'sessionId' | 'preset' | 'cwd'> & {
      interpreters?: readonly string[];
    },
    signal: AbortSignal,
  ) => {
    signal.throwIfAborted();
    if (
      workbench.getSnapshot().selectedDocument?.id !== page.id ||
      (page.resourceId && identity.scope !== currentExecution?.identity.getSnapshot().scope)
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
  useEffect(
    () => () => {
      cancelSelection();
      preparation.current?.abort();
    },
    [active],
  );
  useEffect(() => {
    const flight = pending.current;
    if (page.resourceId && flight && (flight.scope !== identity.scope || !identityReady)) {
      cancelSelection();
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
  const interpreter =
    interpreters.find((row) => row.id === selection?.preset)?.id ?? page.resourceId;
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
    await runSelection(ownerSignal, async (signal) => {
      const requested = await resourceWorkspace(
        host.fetch,
        signal,
        cwd ?? selection?.cwd ?? currentCwd,
        host.pickDirectory,
      );
      const { path: directory } = await host.workspace(requested);
      signal.throwIfAborted();
      let cached = reuse
        ? workbench.selectionFor(page.id, interpreterId ?? null, identity.scope, directory)
        : undefined;
      // Host scope changes across restarts. Reopen the same subject's retained
      // Session through the public owner, which validates its preset and cwd.
      if (
        !cached &&
        reuse &&
        selection &&
        identity.subject &&
        selection.subject === identity.subject &&
        selection.preset === (interpreterId ?? null) &&
        selection.cwd === directory
      )
        cached = selection;
      if (cached)
        await host.open(cached.sessionId, undefined, signal, (selected) => {
          if (selected.preset !== cached.preset || selected.cwd !== directory)
            throw Error('PAGE_SESSION_RECOVERY_MISMATCH');
          associate(selected, signal);
        });
      else {
        if (
          interpreterId !== page.resourceId &&
          !interpreters.some((row) => row.id === interpreterId)
        )
          throw Error('PAGE_INTERPRETER_UNAVAILABLE');
        await selectResource(host, interpreterId!, signal, directory, (selected) =>
          associate(selected, signal),
        );
      }
    });
  };
  const newPlainConversation = async () => {
    const host = resources();
    if (!host) {
      setError(t('pageWait'));
      return;
    }
    await runSelection(undefined, async (signal) => {
      // Borrow the current Core Workspace before requesting another directory.
      const cwd = await resourceWorkspace(
        host.fetch,
        signal,
        selection?.cwd ?? currentCwd,
        host.pickDirectory,
      );
      const { workspaceId } = await host.workspace(cwd);
      signal.throwIfAborted();
      const id = await host.create({ workspaceId });
      signal.throwIfAborted();
      await host.open(id, undefined, signal, (selected) => associate(selected, signal));
    });
  };
  const associateCurrent = () => {
    if (!sessionId || !sessionOpen || currentPreset === undefined) return;
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
    // Restored presentation discovers choices; an explicit page/resource action starts its Session.
    const prepare =
      ((!selection && !restoredWithoutSession) ||
        (selection &&
          selection.ownerScope !== identity.scope &&
          selection.subject === identity.subject)) &&
      preparationOwner.current !== owner;
    if (prepare) preparationOwner.current = owner;
    const controller = new AbortController();
    preparation.current = controller;
    void (async () => {
      const cwd = await resourceWorkspace(
        host.fetch,
        controller.signal,
        selection?.cwd ?? currentCwd,
        prepare ? host.pickDirectory : undefined,
      );
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
    restoredWithoutSession,
    currentCwd,
  ]);
  return {
    identity,
    identityReady,
    selection,
    busy,
    error,
    setError,
    interpreters,
    associateCurrent,
    selectInterpreter: (id: string) => connect(undefined, undefined, id),
    newConversation: () => {
      workbench.cancelHistory();
      return page.resourceId
        ? connect(undefined, undefined, interpreter, false)
        : newPlainConversation();
    },
  };
}

/** Restore only an actual Core projection; a missing or mismatched Session is never replaced. */
export function createPageSessionRestorer({
  ctx,
  workbench,
  identity,
}: {
  ctx: Pick<Context, 'sessions'>;
  workbench: WorkbenchController;
  identity: () => PageIdentitySnapshot | undefined;
}): PageSessionRestore {
  return async (page, id, signal, expected) => {
    await withReadyPageSession(
      ctx,
      id,
      signal,
      ({ projection }) => {
        const account = identity();
        if (expected?.subject && account?.subject !== expected.subject)
          throw Error('PAGE_SESSION_IDENTITY_MISMATCH');
        workbench.associateSession(page, {
          ...projection,
          ownerScope: account?.scope ?? null,
          ...(account?.subject ? { subject: account.subject } : {}),
        });
      },
      expected,
    );
  };
}

/** Keep navigation intent for the UI lifetime, even when Core remounts its Documents seat. */
export function createPageSessionNavigation({
  workbench,
  restore,
  identity,
  openSession,
}: {
  workbench: WorkbenchController;
  restore: PageSessionRestore;
  identity: () => PageIdentitySnapshot | undefined;
  openSession: (id: SessionId) => void;
}) {
  let mainObservation: { sessionId?: SessionId; hasObservedSession: boolean } | undefined;

  return {
    chooseHistory(
      page: MainPanelId,
      id: SessionId,
      expected: Pick<DocumentSession, 'preset' | 'cwd'>,
    ) {
      workbench.selectHistorySession(page, id, expected);
      openSession(id);
    },
    recover(
      recovery: ReturnType<WorkbenchController['recoveryTarget']>,
      catalogue: SessionListState,
      reportError: (message: string) => void,
    ): (() => void) | undefined {
      if (!recovery || catalogue.phase !== 'ready') return;
      const saved = catalogue.byId[recovery.sessionId];
      if (!catalogue.ids.includes(recovery.sessionId) || !saved) {
        reportError(`Session unavailable: ${recovery.sessionId}`);
        return;
      }
      if (recovery.cwd && saved.cwd !== recovery.cwd) {
        reportError('PAGE_SESSION_WORKSPACE_MISMATCH');
        return;
      }
      if (recovery.resourceId) {
        // Presentation memory supplies a hint; recovery waits for GEA's current identity.
        const account = identity();
        if (account?.state !== 'confirmed' || account.error) return;
        if (
          !account.status?.authenticated ||
          !recovery.subject ||
          account.subject !== recovery.subject
        ) {
          workbench.forgetSession(recovery.page);
          workbench.leaveDocument();
          return;
        }
      }
      const controller = new AbortController();
      reportError('');
      void restore(recovery.page, recovery.sessionId, controller.signal, recovery)
        .then(() => {
          controller.signal.throwIfAborted();
          if (recovery.resourceId && identity()?.subject !== recovery.subject)
            throw Error('PAGE_IDENTITY_CHANGED');
          return workbench.open(recovery.page);
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted)
            reportError(error instanceof Error ? error.message : String(error));
        });
      return () => controller.abort();
    },
    observeMainSession(
      sessionId: SessionId | undefined,
      reportError: (message: string) => void,
    ): (() => void) | undefined {
      const previous = mainObservation;
      const changed = previous !== undefined && previous.sessionId !== sessionId;
      const firstSession = !!sessionId && !previous?.hasObservedSession;
      mainObservation = {
        sessionId,
        hasObservedSession: !!sessionId || previous?.hasObservedSession === true,
      };
      if (!sessionId) {
        if (changed) workbench.leaveDocument();
        return;
      }
      if (changed && !workbench.recoveryTarget()) reportError('');
      const target = workbench.takeHistoryTarget(sessionId);
      if (!target) {
        const state = workbench.getSnapshot();
        if (
          (state.selection && state.selection.sessionId !== sessionId) ||
          (changed &&
            state.selectedDocument &&
            !state.selection &&
            !(firstSession && state.restoredWithoutSession))
        )
          workbench.leaveDocument();
        return;
      }
      const controller = new AbortController();
      const signal = AbortSignal.any([controller.signal, target.signal]);
      void restore(target.page, sessionId, signal, target.expected)
        .then(() => {
          signal.throwIfAborted();
          return workbench.completeHistory(target);
        })
        .catch((error: unknown) => {
          if (!signal.aborted) reportError(error instanceof Error ? error.message : String(error));
        });
      return () => controller.abort();
    },
  };
}
