/** Resource selection borrows the host Session/Conversation; it owns no current Session. */
export interface NativeResourceSelection {
    fetch: typeof fetch;
    create(options: {
        cwd: string;
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
