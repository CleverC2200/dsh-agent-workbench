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
  registerHtml(page: WorkbenchPage & { html: string }): () => void;
}
export interface WorkbenchPorts {
  panel(id: MainPanelId): void;
  hasPanel?(id: MainPanelId): boolean;
  html?(page: WorkbenchPage & { html: string }): () => void;
}
/** Page navigation has no identity, preset or persistent Session state. */
export class WorkbenchController implements AgentWorkbench {
  private readonly pages = new Map<MainPanelId, WorkbenchPage>();
  private disposed = false;
  private readonly listeners = new Set<() => void>();
  constructor(private readonly ports: WorkbenchPorts) {}
  register(page: WorkbenchPage): () => void {
    if (this.disposed) throw Error("WORKBENCH_DISPOSED");
    if (this.pages.has(page.id)) throw Error(`Duplicate workbench page: ${page.id}`);
    this.pages.set(page.id, page);
    this.changed();
    return () => { if (this.pages.get(page.id) === page) { this.pages.delete(page.id); this.changed(); } };
  }
  async open(id: MainPanelId): Promise<boolean> {
    if (this.disposed) return false;
    if (!this.pages.has(id) && !this.ports.hasPanel?.(id)) throw Error(`Unknown workbench page: ${id}`);
    this.ports.panel(id);
    return true;
  }
  registerHtml(page: WorkbenchPage & { html: string }): () => void {
    if (!this.ports.html) throw Error("WORKBENCH_HTML_UNAVAILABLE");
    const unregister = this.register(page);
    let dispose: () => void;
    try { dispose = this.ports.html(page); } catch (error) { unregister(); throw error; }
    return () => { dispose(); unregister(); };
  }
  label(id: MainPanelId): string {
    const label = this.pages.get(id)?.label;
    return typeof label === "function" ? label() : label ?? id;
  }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private changed(): void { for (const listener of this.listeners) listener(); }
  dispose(): void { this.disposed = true; this.pages.clear(); }
}
