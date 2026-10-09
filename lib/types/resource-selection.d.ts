import type { Context } from '@deepseek-ai/cordis';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
/** Resource selection borrows the host Session/Conversation; it owns no current Session. */
export interface NativeResourceSelection {
    fetch: typeof fetch;
    workspace(path: string): Promise<{
        workspaceId: string;
        path: string;
    }>;
    create(options: {
        workspaceId: string;
    }): Promise<string>;
    select(sessionId: string, preset: string): Promise<void>;
    open(sessionId: string, skill: string | undefined, signal: AbortSignal, beforeOpen?: (session: {
        sessionId: SessionId;
        preset: string | null;
        cwd?: string;
    }) => void): Promise<void>;
}
export interface ResourceSummary {
    id: string;
    label: string;
    kind: 'prompt' | 'skill';
    installed: boolean;
    enabled: boolean;
    provider: string;
    skills?: string[];
    missingSkills?: string[];
    error?: string;
    interpreters?: readonly string[];
}
export declare function resourceWorkspace(request: typeof fetch, signal: AbortSignal, cwd?: string): Promise<string>;
export declare function selectResource(host: NativeResourceSelection, id: string, signal: AbortSignal, currentCwd?: string, beforeOpen?: (selection: {
    sessionId: SessionId;
    preset: string;
    cwd?: string;
    interpreters?: readonly string[];
}) => void): Promise<{
    sessionId: string;
    preset: string;
}>;
/** Bind the actual native client services under their Cordis effect lifetime. */
export declare function mountNativeResourceSelection(ctx: Context, ready: (host: NativeResourceSelection | undefined) => void): ReturnType<Context['inject']>;
