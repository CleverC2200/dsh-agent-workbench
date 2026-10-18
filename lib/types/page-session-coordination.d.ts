import type { Context } from '@deepseek-ai/cordis';
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client';
import type { DocumentSession, WorkbenchController } from './workbench.ts';
import type { PageIdentitySnapshot, WorkbenchFramePage, WorkbenchPageExecution } from './frame.ts';
import { type NativeResourceSelection, type ResourceSummary } from './resource-selection.ts';
type PageSessionCopy = (key: 'pageWait' | 'pageLogin' | 'pageChanged') => string;
export type PageSessionRestore = (page: MainPanelId, sessionId: SessionId, signal: AbortSignal, expected?: Pick<DocumentSession, 'preset' | 'cwd' | 'subject'>) => Promise<void>;
/** Page associations borrow Core Sessions. GEA remains the only identity authority. */
export declare function usePageSessionCoordination({ ctx, workbench, page, active, sessionId, sessionOpen, currentPreset, currentCwd, currentExecution, resources, t, }: {
    ctx: Context;
    workbench: WorkbenchController;
    page: WorkbenchFramePage;
    active: boolean;
    sessionId?: SessionId;
    sessionOpen: boolean;
    currentPreset: string | null | undefined;
    currentCwd?: string;
    currentExecution?: WorkbenchPageExecution;
    resources: () => NativeResourceSelection | undefined;
    t: PageSessionCopy;
}): {
    identity: PageIdentitySnapshot;
    identityReady: boolean;
    selection: DocumentSession | undefined;
    busy: boolean;
    error: string;
    setError: import("react").Dispatch<import("react").SetStateAction<string>>;
    interpreters: ResourceSummary[];
    associateCurrent: () => void;
    selectInterpreter: (id: string) => Promise<void>;
    newConversation: () => Promise<void>;
};
/** Restore only an actual Core projection; a missing or mismatched Session is never replaced. */
export declare function createPageSessionRestorer({ ctx, workbench, identity, }: {
    ctx: Pick<Context, 'sessions'>;
    workbench: WorkbenchController;
    identity: () => PageIdentitySnapshot | undefined;
}): PageSessionRestore;
/** Keep navigation intent for the UI lifetime, even when Core remounts its Documents seat. */
export declare function createPageSessionNavigation({ workbench, restore, identity, openSession, }: {
    workbench: WorkbenchController;
    restore: PageSessionRestore;
    identity: () => PageIdentitySnapshot | undefined;
    openSession: (id: SessionId) => void;
}): {
    chooseHistory(page: MainPanelId, id: SessionId, expected: Pick<DocumentSession, "preset" | "cwd">): void;
    recover(recovery: ReturnType<WorkbenchController["recoveryTarget"]>, catalogue: SessionListState, reportError: (message: string) => void): (() => void) | undefined;
    observeMainSession(sessionId: SessionId | undefined, reportError: (message: string) => void): (() => void) | undefined;
};
export {};
