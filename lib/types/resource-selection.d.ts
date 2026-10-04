import type { Context } from "@deepseek-ai/cordis";
/** Resource selection borrows the host Session/Conversation; it owns no current Session. */
export interface NativeResourceSelection {
    fetch: typeof fetch;
    workspace(path: string): Promise<string>;
    create(options: {
        workspaceId: string;
    }): Promise<string>;
    select(sessionId: string, preset: string): Promise<void>;
    open(sessionId: string, skill: string | undefined, signal: AbortSignal): Promise<void>;
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
}
export declare function selectResource(host: NativeResourceSelection, id: string, signal: AbortSignal): Promise<void>;
/** Bind the actual native client services under their Cordis effect lifetime. */
export declare function mountNativeResourceSelection(ctx: Context, ready: (host: NativeResourceSelection | undefined) => void): ReturnType<Context['inject']>;
