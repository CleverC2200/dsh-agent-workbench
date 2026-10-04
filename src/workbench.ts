import type { MainPanelId } from "@deepseek-ai/dsh-client-ui-layout/client";
import type { WorkbenchFramePage } from "./frame.ts";

/** Presentation metadata only. Resource selection and authorization have their own owners. */
export interface WorkbenchPage {
  readonly id: MainPanelId;
  readonly label?: string | (() => string);
}
export interface AgentWorkbench {
  register(page: WorkbenchPage): () => void;
  /** Open a registered page without creating or changing a host Conversation. */
  open(id: MainPanelId): Promise<boolean>;
  /** Contribute a document location; its body loads when the page is selected. */
  registerFrame(page: WorkbenchFramePage): () => void;
}
export interface WorkbenchPorts {
  panel(id: MainPanelId): void;
  hasPanel?(id: MainPanelId): boolean;
  frame?(page: WorkbenchFramePage): () => void;
}
/** Page navigation has no identity, preset or persistent Session state. */
export class WorkbenchController implements AgentWorkbench {
  private readonly pages = new Map<MainPanelId, WorkbenchPage>();
  private disposed = false;
  private readonly listeners = new Set<() => void>();
  private readonly historyListeners = new Set<() => void>();
  private historyPage:MainPanelId|undefined;
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
  registerFrame(page: WorkbenchFramePage): () => void {
    if (!this.ports.frame) throw Error("WORKBENCH_FRAME_UNAVAILABLE");
    const unregister = this.register(page);
    let dispose: () => void;
    try { dispose = this.ports.frame(page); } catch (error) { unregister(); throw error; }
    return () => { dispose(); unregister(); };
  }
  label(id: MainPanelId): string {
    const label = this.pages.get(id)?.label;
    return typeof label === "function" ? label() : label ?? id;
  }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  showHistory(page?:MainPanelId):void {this.historyPage=page;for(const listener of this.historyListeners)listener();}
  takeHistoryPage():MainPanelId|undefined {const page=this.historyPage;this.historyPage=undefined;return page;}
  subscribeHistory(listener:()=>void):()=>void {this.historyListeners.add(listener);return()=>{this.historyListeners.delete(listener);};}
  private changed(): void { for (const listener of this.listeners) listener(); }
  dispose(): void { this.disposed = true; this.pages.clear(); }
}
