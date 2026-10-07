import type { WorkbenchPage } from './workbench.ts';
/** A real Document contribution; Workbench owns its UI and borrows the Core main Conversation. */
export type WorkbenchFramePage = WorkbenchPage & {
    readonly pluginId?: string;
    readonly resourceId?: string;
    /** Page contributor owns pending navigation identity; Workbench observes only the current receipt. */
    readonly visibleRequest?: import('@deepseek-ai/dsh-client-store').ObservableSnapshot<string | undefined>;
    readonly onVisible?: (receipt?: string) => void;
} & ({
    readonly kind: 'native' | 'html';
    readonly src: string | (() => string);
    readonly body?: never;
} | {
    readonly kind: 'local';
    readonly body: import('react').ComponentType;
    readonly src?: never;
});
export interface PageIdentitySnapshot {
    readonly state: string;
    readonly scope: string | null;
    readonly subject?: string | null;
    readonly error?: string;
    readonly status: {
        readonly authenticated: boolean;
    } | null;
}
export interface PageExecutionConnection {
    readonly page: WorkbenchFramePage;
    readonly sessionId: string;
    readonly resourceId: string;
    readonly owner: string;
    readonly binding: {
        surface: string;
        tool: string;
    };
}
/** Private Workbench document implementation. Business grants stay on the Host. */
export interface WorkbenchPageExecution {
    readonly identity: {
        getSnapshot(): PageIdentitySnapshot;
        subscribe(listener: () => void): () => void;
    };
    open(page: WorkbenchFramePage, sessionId: string, resourceId: string, signal: AbortSignal): Promise<PageExecutionConnection>;
    call(connection: PageExecutionConnection, method: string, parameters: unknown, signal: AbortSignal): Promise<any>;
    close(connection: PageExecutionConnection): Promise<void>;
    draft(connection: PageExecutionConnection, text: string, signal: AbortSignal): Promise<void>;
    prompt(connection: PageExecutionConnection, text: string, signal: AbortSignal): Promise<void>;
}
