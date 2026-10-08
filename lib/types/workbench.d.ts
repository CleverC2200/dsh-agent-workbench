import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { WorkbenchFramePage } from './frame.ts';
import { type HtmlViewState } from './html-view-state.ts';
/** Presentation metadata only. Resource selection and authorization have their own owners. */
export interface WorkbenchPage {
    readonly id: MainPanelId;
    readonly label?: string | (() => string);
}
export interface AgentWorkbench {
    register(page: WorkbenchPage): () => void;
    /** Open a page; a Document restores its associated Core Session without creating one. */
    open(id: MainPanelId): Promise<boolean>;
    /** Contribute a Document inside the actual main Conversation. */
    registerFrame(page: WorkbenchFramePage): () => void;
}
export interface DocumentSession {
    readonly sessionId: SessionId;
    readonly preset: string | null;
    readonly ownerScope: string | null;
    readonly cwd?: string;
    /** Stable subject supplied by GEA; this remains a presentation hint, never a grant. */
    readonly subject?: string | null;
}
export interface WorkbenchSnapshot {
    readonly historyPage?: MainPanelId;
    readonly pages: readonly WorkbenchPage[];
    readonly visitedDocuments: readonly WorkbenchFramePage[];
    readonly selectedDocument?: WorkbenchFramePage;
    readonly selection?: DocumentSession;
}
export interface WorkbenchPorts {
    panel(id: MainPanelId): void;
    hasPanel?(id: MainPanelId): boolean;
    document?(sessionId?: SessionId): void;
}
/** Browser presentation only; Core still resolves every referenced Session. */
export interface WorkbenchPresentation {
    version: 2;
    page?: MainPanelId;
    selections: Array<DocumentSession & {
        page: MainPanelId;
        active: boolean;
    }>;
    views: Array<{
        page: MainPanelId;
        scope: string;
        state: HtmlViewState;
    }>;
}
export interface WorkbenchPresentationMemory {
    getSnapshot(): unknown;
    set(value: WorkbenchPresentation): void;
}
export declare const WORKBENCH_PRESENTATION_KEY = "agent-workbench.presentation.v2";
/** Page selection and associations describe UI; Core owns every Session and its main reference. */
export declare class WorkbenchController implements AgentWorkbench {
    private readonly ports;
    private readonly memory?;
    private readonly pages;
    private readonly documents;
    private readonly associations;
    private readonly activePresets;
    private rememberedPage;
    private readonly htmlViews;
    private selectedDocument;
    private readonly visited;
    private snapshot;
    private disposed;
    private readonly listeners;
    private readonly historyListeners;
    private historyPage;
    private historySelection?;
    private historyController?;
    constructor(ports: WorkbenchPorts, memory?: WorkbenchPresentationMemory | undefined);
    register(page: WorkbenchPage): () => void;
    open(id: MainPanelId): Promise<boolean>;
    registerFrame(page: WorkbenchFramePage): () => void;
    associateSession(page: MainPanelId, selection: DocumentSession): void;
    /** A hint for a declared interpretation; identity confirmation and authorization remain external. */
    selectionFor(page: MainPanelId, preset: string | null, ownerScope: string | null, cwd?: string): DocumentSession | undefined;
    private currentSelection;
    recoveryTarget(): (DocumentSession & {
        page: MainPanelId;
        resourceId?: string;
    }) | undefined;
    forgetSession(page: MainPanelId): void;
    readHtmlViewState(page: string, scope?: string): HtmlViewState | undefined;
    saveHtmlViewState(page: string, scope: string | undefined, value: unknown): void;
    leaveDocument(): void;
    getSnapshot: () => WorkbenchSnapshot;
    label(id: MainPanelId): string;
    subscribe: (listener: () => void) => (() => void);
    showHistory(page?: MainPanelId): void;
    /** A selection intent, not a Core Session or persisted Session directory. */
    selectHistorySession(page: MainPanelId, sessionId: SessionId, expected: Pick<DocumentSession, 'preset' | 'cwd'>): void;
    takeHistoryTarget(sessionId?: SessionId): {
        page: MainPanelId;
        expected?: Pick<DocumentSession, 'preset' | 'cwd'>;
        signal: AbortSignal;
    } | undefined;
    cancelHistory(): void;
    subscribeHistory(listener: () => void): () => void;
    private changed;
    private persist;
    dispose(): void;
}
