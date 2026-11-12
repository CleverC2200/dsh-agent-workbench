import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-api-session-controller/client';
import type {} from '@deepseek-ai/dsh-api-workspace-controller/client';

export async function conversationWorkspace(
  ctx: Pick<Context, 'sessions' | 'workspaces'>,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  if (
    ctx.workspaces.list.getSnapshot().phase !== 'ready' ||
    ctx.sessions.list.getSnapshot().phase !== 'ready'
  )
    await new Promise<void>((resolve, reject) => {
      const finish = (error?: unknown) => {
        stopWorkspaces();
        stopSessions();
        signal.removeEventListener('abort', abort);
        if (error) reject(error);
        else resolve();
      };
      const abort = () => finish(signal.reason);
      const check = () => {
        const workspaces = ctx.workspaces.list.getSnapshot();
        const sessions = ctx.sessions.list.getSnapshot();
        if (workspaces.state === 'error') finish(Error('WORKBENCH_WORKSPACE_UNAVAILABLE'));
        else if (workspaces.phase === 'ready' && sessions.phase === 'ready') finish();
      };
      const stopWorkspaces = ctx.workspaces.list.subscribe(check);
      const stopSessions = ctx.sessions.list.subscribe(check);
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
      else check();
    });
  signal.throwIfAborted();
  const workspaces = ctx.workspaces.list.getSnapshot();
  const sessions = ctx.sessions.list.getSnapshot();
  const current = Object.values(sessions.byId).find((row) => (row.retainedBy.mainView ?? 0) > 0);
  let target = workspaces.items.find(
    (item) => current !== undefined && item.sessionIds.includes(current.id),
  );
  if (target) return target;
  let latest = Number.NEGATIVE_INFINITY;
  for (const workspace of workspaces.items) {
    const activity = workspace.sessionIds.reduce(
      (time, id) => Math.max(time, sessions.byId[id]?.updatedAt ?? Number.NEGATIVE_INFINITY),
      Number.NEGATIVE_INFINITY,
    );
    const time = activity === Number.NEGATIVE_INFINITY ? Date.parse(workspace.createdAt) : activity;
    if (target === undefined || time > latest) {
      target = workspace;
      latest = time;
    }
  }
  return target;
}
