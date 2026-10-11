import type { Context } from '@deepseek-ai/cordis';
import type { SessionId } from '@deepseek-ai/dsh-session';
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client';

declare module '@deepseek-ai/dsh-api-session-controller/client' {
  interface SessionReferenceSourceMap {
    pageFeedbackDraft: unknown;
  }
}

/** Append through the Core's public revision-guarded event. Core persists the semantic edit. */
export async function insertPageFeedbackDraft(
  ctx: Pick<Context, 'sessions' | 'conversation'>,
  sessionId: string,
  text: string,
  signal: AbortSignal,
): Promise<void> {
  const reference = ctx.sessions.retain(sessionId as SessionId, {
    source: 'pageFeedbackDraft',
    signal,
  });
  try {
    await reference.ready;
    signal.throwIfAborted();
    const input = ctx.conversation.input.for(reference.binding.ctx);
    const state = input.state.getSnapshot();
    if (state.phase !== 'plain') throw Error('RESOURCE_DRAFT_CHANGED');
    // Clipboard projection expands chips. The scoped event accepts atomic editor coordinates.
    const end =
      state.draft.length -
      state.occurrences.reduce((expanded, occurrence) => expanded + occurrence.length - 1, 0);
    if (
      reference.binding.ctx.bail('slash/input-insert-text', {
        text: (state.draft ? '\n' : '') + text,
        span: { start: end, end, draftRev: state.draftRev },
      }) !== true
    )
      throw Error('RESOURCE_DRAFT_CHANGED');
  } finally {
    reference.release();
  }
}
