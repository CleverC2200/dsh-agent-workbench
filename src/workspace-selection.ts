import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-api-session-controller/client';
import type {} from '@deepseek-ai/dsh-api-workspace-controller/client';

export function conversationWorkspace(ctx: Pick<Context, 'sessions' | 'workspaces'>) {
  const workspaces = ctx.workspaces.list.getSnapshot();
  const sessions = ctx.sessions.list.getSnapshot();
  if (workspaces.phase !== 'ready' || sessions.phase !== 'ready')
    throw Error('WORKBENCH_WORKSPACE_UNAVAILABLE');
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
