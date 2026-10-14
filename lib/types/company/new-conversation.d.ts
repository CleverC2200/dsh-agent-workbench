import type { Context } from '@deepseek-ai/cordis';
type CreationState = {
    kind: 'idle';
} | {
    kind: 'creating';
} | {
    kind: 'failed';
    message: string;
};
/** Create a fresh Core Session; never adopt a blank Session with an old preset or draft. */
export declare function createConversationStarter(ctx: Pick<Context, 'sessions' | 'workspaces' | 'uiWorkspace' | 'layout' | 'effect'>, beforeOpen: () => void): {
    state: import("@deepseek-ai/dsh-client-store").SnapshotStore<CreationState>;
    start: () => Promise<void>;
};
export {};
