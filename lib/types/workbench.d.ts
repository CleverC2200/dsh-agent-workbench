import type { MainPanelId } from "@deepseek-ai/dsh-client-ui-layout/client";
/** Presentation metadata only. Resource selection and authorization have their own owners. */
export interface WorkbenchPage {
    readonly id: MainPanelId;
    readonly label?: string | (() => string);
}
export interface AgentWorkbench {
    register(page: WorkbenchPage): () => void;
    /** Open a registered page without creating or changing a host Conversation. */
    open(id: MainPanelId): Promise<boolean>;
    /** Contribute an existing HTML document; Workbench owns its frame and theme lifetime. */
    registerHtml(page: WorkbenchPage & {
        html: string;
    }): () => void;
}
export interface WorkbenchPorts {
    panel(id: MainPanelId): void;
    hasPanel?(id: MainPanelId): boolean;
    html?(page: WorkbenchPage & {
        html: string;
    }): () => void;
}
/** Page navigation has no identity, preset or persistent Session state. */
export declare class WorkbenchController implements AgentWorkbench {
    private readonly ports;
    private readonly pages;
    private disposed;
    private readonly listeners;
    constructor(ports: WorkbenchPorts);
    register(page: WorkbenchPage): () => void;
    open(id: MainPanelId): Promise<boolean>;
    registerHtml(page: WorkbenchPage & {
        html: string;
    }): () => void;
    label(id: MainPanelId): string;
    subscribe(listener: () => void): () => void;
    private changed;
    dispose(): void;
}
