import type { Context } from '@deepseek-ai/cordis';
import type { WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/client';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type {} from '@deepseek-ai/dsh-api-session-controller/client';
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client';
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client';
import type {} from '@deepseek-ai/dsh-agent-preset-registry/types';
import type {} from '@deepseek-ai/dsh-api-remotes/client';
/** Resource selection borrows the host Session/Conversation; it owns no current Session. */
export interface NativeResourceSelection {
  fetch: typeof fetch;
  pickDirectory?(): Promise<string | null>;
  workspace(path: string): Promise<{ workspaceId: string; path: string }>;
  create(options: { workspaceId: string }): Promise<string>;
  select(sessionId: string, preset: string): Promise<void>;
  open(
    sessionId: string,
    skill: string | undefined,
    signal: AbortSignal,
    beforeOpen?: (session: { sessionId: SessionId; preset: string | null; cwd?: string }) => void,
  ): Promise<void>;
}
export interface ResourceSummary {
  id: string;
  label: string;
  description?: string;
  kind: 'prompt' | 'skill';
  installed: boolean;
  enabled: boolean;
  provider: string;
  skills?: string[];
  missingSkills?: string[];
  error?: string;
  interpreters?: readonly string[];
}
export async function resourceWorkspace(
  request: typeof fetch,
  signal: AbortSignal,
  cwd?: string,
  pickDirectory?: () => Promise<string | null>,
): Promise<string> {
  if (cwd?.trim()) return cwd;
  const configResponse = await request('/api/agent-workbench/config', {
    signal,
    cache: 'no-store',
  });
  if (!configResponse.ok) throw Error('WORKBENCH_WORKSPACE_UNAVAILABLE');
  const config = (await configResponse.json()) as { cwd?: unknown };
  if (typeof config.cwd === 'string' && config.cwd.trim()) return config.cwd;
  const selected = await pickDirectory?.();
  signal.throwIfAborted();
  if (!selected) throw Error('WORKBENCH_WORKSPACE_REQUIRED');
  return selected;
}
export async function selectResource(
  host: NativeResourceSelection,
  id: string,
  signal: AbortSignal,
  currentCwd?: string,
  beforeOpen?: (selection: {
    sessionId: SessionId;
    preset: string;
    cwd?: string;
    interpreters?: readonly string[];
  }) => void,
): Promise<{ sessionId: string; preset: string }> {
  const cwd = await resourceWorkspace(host.fetch, signal, currentCwd, host.pickDirectory);
  const response = await host.fetch('/api/agent-manage/resources/select', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, cwd }),
    signal,
  });
  const resource = (await response.json()) as {
    preset?: unknown;
    skill?: unknown;
    interpreters?: readonly string[];
    error?: string;
  };
  if (!response.ok || typeof resource.preset !== 'string')
    throw Error(resource.error ?? 'RESOURCE_SELECTION_FAILED');
  signal.throwIfAborted();
  const { workspaceId } = await host.workspace(cwd);
  signal.throwIfAborted();
  const sessionId = await host.create({ workspaceId });
  signal.throwIfAborted();
  await host.select(sessionId, resource.preset);
  signal.throwIfAborted();
  await host.open(
    sessionId,
    typeof resource.skill === 'string' ? resource.skill : undefined,
    signal,
    (projection) => {
      if (typeof projection.preset !== 'string' || projection.preset !== resource.preset)
        throw Error('PAGE_SESSION_PRESET_UNAVAILABLE');
      beforeOpen?.({
        sessionId: projection.sessionId,
        preset: projection.preset,
        ...(projection.cwd === undefined ? {} : { cwd: projection.cwd }),
        ...(resource.interpreters ? { interpreters: resource.interpreters } : {}),
      });
    },
  );
  return { sessionId, preset: resource.preset };
}

/** Bind the actual native client services under their Cordis effect lifetime. */
export function mountNativeResourceSelection(
  ctx: Context,
  ready: (host: NativeResourceSelection | undefined) => void,
): ReturnType<Context['inject']> {
  let active: NativeResourceSelection | undefined;
  return ctx.inject(
    ['sessions', 'workspaces', 'remote', 'remote.agentPresets', 'conversation', 'uiWorkspace'],
    (scope) => {
      const host: NativeResourceSelection = {
        fetch: (...args) => fetch(...args),
        pickDirectory: () => scope.uiWorkspace.pickDirectory(),
        workspace: (path) => scope.workspaces.create({ path }),
        create: (options) =>
          scope.sessions.create({ workspaceId: options.workspaceId as WorkspaceId }),
        select: async (id, preset) => {
          const result = await scope.remote.agentPresets.select(id as SessionId, preset);
          if (!result.ok) throw Error(result.error.message);
        },
        open: async (id, skill, signal, beforeOpen) => {
          const reference = scope.sessions.retain(id as SessionId, {
            source: 'agentResourceSelection',
            signal,
          });
          try {
            await reference.ready;
            signal.throwIfAborted();
            if (skill) {
              const input = scope.conversation.input.for(reference.binding.ctx);
              const state = input.state.getSnapshot();
              if (
                state.draft ||
                reference.binding.ctx.bail('slash/input-insert-text', {
                  text: `/${skill} `,
                  span: { start: 0, end: 0, draftRev: state.draftRev },
                }) !== true
              )
                throw Error('RESOURCE_DRAFT_CHANGED');
            }
            signal.throwIfAborted();
            const preset = reference.binding.session.projections
              .faceOf('agentPreset')
              .getSnapshot();
            if (preset !== null && (typeof preset !== 'string' || !preset))
              throw Error('PAGE_SESSION_PRESET_UNAVAILABLE');
            const cwd = scope.sessions.list.getSnapshot().byId[reference.sessionId]?.cwd;
            beforeOpen?.({
              sessionId: reference.sessionId,
              preset,
              ...(typeof cwd === 'string' ? { cwd } : {}),
            });
            signal.throwIfAborted();
            scope.uiWorkspace.openSession(id as SessionId);
          } finally {
            reference.release();
          }
        },
      };
      active = host;
      ready(host);
      scope.effect(() => () => {
        if (active === host) {
          active = undefined;
          ready(undefined);
        }
      });
    },
  );
}
