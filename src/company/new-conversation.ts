import type { Context } from '@deepseek-ai/cordis';
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store';
import type {} from '@deepseek-ai/dsh-api-session-controller/client';
import type {} from '@deepseek-ai/dsh-api-workspace-controller/client';
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client';
import { conversationWorkspace } from '../workspace-selection.ts';

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
      let target = await conversationWorkspace(ctx, navigation);
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
