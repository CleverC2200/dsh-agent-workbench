/** Page registration and instance-to-session navigation, independent of React. */
import type { MainPanelId } from "@deepseek-ai/dsh-client-ui-layout/client";
import type { SessionId } from "@deepseek-ai/dsh-session/types";
/** One page's session preset; page components remain ordinary DSH main entries. */
export interface WorkbenchPage {
    readonly id: MainPanelId;
    readonly preset: string;
}
/** Dependencies supplied by the DSH layout adapter. */
export interface WorkbenchPorts {
    storage?: Pick<Storage, "getItem" | "setItem">;
    create(preset: string): Promise<SessionId>;
    prepare(id: SessionId): Promise<void>;
    available(id: SessionId): boolean;
    select(id: SessionId | undefined): void;
    panel(id: MainPanelId | null): void;
    beginNavigation(): AbortSignal;
    showConversation(id: MainPanelId): () => void;
}
/** Public workbench operations. Opening never changes an existing Session's preset. */
export interface AgentWorkbench {
    register(page: WorkbenchPage): () => void;
    open(id: MainPanelId, instance?: string, sessionId?: SessionId): Promise<void>;
    showConversation(id: MainPanelId): () => void;
    forget(id: MainPanelId): void;
}
/** Owns one selected instance per page and coalesces creation per instance. */
export declare class WorkbenchController implements AgentWorkbench {
    private readonly ports;
    private readonly pages;
    private readonly sessions;
    private readonly instances;
    private readonly pending;
    private disposed;
    constructor(ports: WorkbenchPorts);
    private save;
    /** Register after the page's main slot; the disposer forgets its associations. */
    register(page: WorkbenchPage): () => void;
    /** Called by the layout on every panel selection, including native navigation. */
    selectPanel(id: MainPanelId | null): void;
    /** Create/reuse an instance Session, or explicitly associate a host-created Session. */
    open(id: MainPanelId, instance?: string, sessionId?: SessionId): Promise<void>;
    /** Opt a mounted page into the native conversation column. */
    showConversation(id: MainPanelId): () => void;
    /** Drop local associations, without deleting or stopping durable Sessions. */
    forget(id: MainPanelId): void;
    /** Invalidate pending navigation without cancelling host-owned Agent work. */
    dispose(): void;
}
