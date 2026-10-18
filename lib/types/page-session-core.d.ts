import type { Context } from '@deepseek-ai/cordis';
import type { SessionReference } from '@deepseek-ai/dsh-api-session-controller/client';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { DocumentSession } from './workbench.ts';
type PageSessionProjection = Pick<DocumentSession, 'sessionId' | 'preset' | 'cwd'>;
/** Read and check the actual Core Session while its reference is held. */
export declare function withReadyPageSession(ctx: Pick<Context, 'sessions'>, id: SessionId, signal: AbortSignal, accept: (session: {
    reference: SessionReference;
    projection: PageSessionProjection;
}) => void | Promise<void>, expected?: Pick<DocumentSession, 'preset' | 'cwd'>): Promise<void>;
export {};
