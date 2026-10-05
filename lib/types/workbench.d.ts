import type { MainPanelId } from "@deepseek-ai/dsh-client-ui-layout/client";
import type { SessionId } from "@deepseek-ai/dsh-session/types";
import type { WorkbenchFramePage } from "./frame.ts";
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
    readonly preset: string;
    readonly ownerScope: string | null;
}
export interface WorkbenchSnapshot {
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
/** Page selection and associations describe UI; Core owns every Session and its main reference. */
export declare class WorkbenchController implements AgentWorkbench {
    private readonly ports;
    private readonly pages;
    private readonly documents;
    private readonly associations;
    private selectedDocument;
    private readonly visited;
    private snapshot;
    private disposed;
    private readonly listeners;
    private readonly historyListeners;
    private historyPage;
    constructor(ports: WorkbenchPorts);
    register(page: WorkbenchPage): () => void;
    open(id: MainPanelId): Promise<boolean>;
    registerFrame(page: WorkbenchFramePage): () => void;
    associateSession(page: MainPanelId, selection: DocumentSession): void;
    forgetSession(page: MainPanelId): void;
    leaveDocument(): void;
    getSnapshot: () => WorkbenchSnapshot;
    label(id: MainPanelId): string;
    subscribe: (listener: () => void) => (() => void);
    showHistory(page?: MainPanelId): void;
    takeHistoryPage(): MainPanelId | undefined;
    subscribeHistory(listener: () => void): () => void;
    private changed;
    dispose(): void;
}
