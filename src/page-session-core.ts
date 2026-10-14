import type { Context } from '@deepseek-ai/cordis';
import type { SessionReference } from '@deepseek-ai/dsh-api-session-controller/client';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { DocumentSession } from './workbench.ts';

type PageSessionProjection = Pick<DocumentSession, 'sessionId' | 'preset' | 'cwd'>;

/** Read and check the actual Core Session while its reference is held. */
export async function withReadyPageSession(
  ctx: Pick<Context, 'sessions'>,
  id: SessionId,
  signal: AbortSignal,
  accept: (session: {
    reference: SessionReference;
    projection: PageSessionProjection;
  }) => void | Promise<void>,
  expected?: Pick<DocumentSession, 'preset' | 'cwd'>,
): Promise<void> {
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
    // The accepted Core navigation can revoke the old layout intent; check before that handoff.
    await accept({
      reference,
      projection: {
        sessionId: reference.sessionId,
        preset,
        ...(typeof cwd === 'string' ? { cwd } : {}),
      },
    });
  } finally {
    reference.release();
  }
}
