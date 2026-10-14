import type { Context } from '@deepseek-ai/cordis';
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store';
import type {} from '@deepseek-ai/dsh-api-session-controller/client';
import type {} from '@deepseek-ai/dsh-api-workspace-controller/client';
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client';

type CreationState = { kind: 'idle' } | { kind: 'creating' } | { kind: 'failed'; message: string };

/** Create a fresh Core Session; never adopt a blank Session with an old preset or draft. */
export function createConversationStarter(
  ctx: Pick<Context, 'sessions' | 'workspaces' | 'uiWorkspace' | 'layout' | 'effect'>,
  beforeOpen: () => void,
) {
  const state = createSnapshotStore<CreationState>({ kind: 'idle' });
  const lifetime = new AbortController();
  ctx.effect(() => () => lifetime.abort());

  const start = async (): Promise<void> => {
    if (lifetime.signal.aborted || state.getSnapshot().kind === 'creating') return;
    const navigation = AbortSignal.any([ctx.layout.beginNavigation(), lifetime.signal]);
    state.set({ kind: 'creating' });
    try {
      const workspaces = ctx.workspaces.list.getSnapshot();
      const sessions = ctx.sessions.list.getSnapshot();
      if (workspaces.phase !== 'ready' || sessions.phase !== 'ready')
        throw Error('WORKBENCH_WORKSPACE_UNAVAILABLE');
      const current = Object.values(sessions.byId).find(
        (row) => (row.retainedBy.mainView ?? 0) > 0,
      );
      let target = workspaces.items.find(
        (item) => current !== undefined && item.sessionIds.includes(current.id),
      );
      if (target === undefined) {
        let latest = Number.NEGATIVE_INFINITY;
        for (const workspace of workspaces.items) {
          const activity = workspace.sessionIds.reduce(
            (time, id) => Math.max(time, sessions.byId[id]?.updatedAt ?? Number.NEGATIVE_INFINITY),
            Number.NEGATIVE_INFINITY,
          );
          const time =
            activity === Number.NEGATIVE_INFINITY ? Date.parse(workspace.createdAt) : activity;
          if (target === undefined || time > latest) {
            target = workspace;
            latest = time;
          }
        }
      }
      if (target === undefined) target = await ctx.workspaces.initializeDefault(navigation);
      navigation.throwIfAborted();
      if (target === undefined) throw Error('WORKBENCH_WORKSPACE_REQUIRED');
      // Omitting sessionId forces fresh creation. Core resolves the user's current default.
      const sessionId = await ctx.sessions.create({ workspaceId: target.workspaceId });
      navigation.throwIfAborted();
      beforeOpen();
      navigation.throwIfAborted();
      ctx.uiWorkspace.openSession(sessionId);
    } catch (error: unknown) {
      if (!navigation.aborted) {
        state.set({
          kind: 'failed',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    } finally {
      if (state.getSnapshot().kind === 'creating') state.set({ kind: 'idle' });
    }
  };
  return { state, start };
}
