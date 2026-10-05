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
  readonly preset: string | null;
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
export class WorkbenchController implements AgentWorkbench {
  private readonly pages = new Map<MainPanelId, WorkbenchPage>();
  private readonly documents = new Map<MainPanelId, WorkbenchFramePage>();
  private readonly associations = new Map<MainPanelId, DocumentSession>();
  private selectedDocument: WorkbenchFramePage | undefined;
  private readonly visited = new Set<MainPanelId>();
  private snapshot: WorkbenchSnapshot = { pages: [], visitedDocuments: [] };
  private disposed = false;
  private readonly listeners = new Set<() => void>();
  private readonly historyListeners = new Set<() => void>();
  private historyPage: MainPanelId | undefined;
  constructor(private readonly ports: WorkbenchPorts) {}
  register(page: WorkbenchPage): () => void {
    if (this.disposed) throw Error("WORKBENCH_DISPOSED");
    if (this.pages.has(page.id)) throw Error(`Duplicate workbench page: ${page.id}`);
    this.pages.set(page.id, page);
    this.changed();
    return () => {
      if (this.pages.get(page.id) !== page) return;
      this.pages.delete(page.id);
      this.documents.delete(page.id);
      this.visited.delete(page.id);
      this.associations.delete(page.id);
      if (this.selectedDocument?.id === page.id) this.selectedDocument = undefined;
      this.changed();
    };
  }
  async open(id: MainPanelId): Promise<boolean> {
    if (this.disposed) return false;
    if (!this.pages.has(id) && !this.ports.hasPanel?.(id)) throw Error(`Unknown workbench page: ${id}`);
    const document = this.documents.get(id);
    if (document) {
      this.selectedDocument = document;
      this.visited.add(id);
      this.changed();
      this.ports.document!(this.associations.get(id)?.sessionId);
    } else {
      this.leaveDocument();
      this.ports.panel(id);
    }
    return true;
  }
  registerFrame(page: WorkbenchFramePage): () => void {
    if (!this.ports.document) throw Error("WORKBENCH_DOCUMENT_UNAVAILABLE");
    const unregister = this.register(page);
    this.documents.set(page.id, page);
    this.changed();
    return unregister;
  }
  associateSession(page: MainPanelId, selection: DocumentSession): void {
    if (!this.documents.has(page)) throw Error(`Unknown workbench Document: ${page}`);
    this.associations.set(page, selection);
    this.changed();
  }
  forgetSession(page: MainPanelId): void { this.associations.delete(page); this.changed(); }
  leaveDocument(): void {
    if (!this.selectedDocument) return;
    this.selectedDocument = undefined;
    this.changed();
  }
  getSnapshot = (): WorkbenchSnapshot => this.snapshot;
  label(id: MainPanelId): string {
    const label = this.pages.get(id)?.label;
    return typeof label === "function" ? label() : label ?? id;
  }
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  showHistory(page?: MainPanelId): void { this.historyPage = page; for (const listener of this.historyListeners) listener(); }
  takeHistoryPage(): MainPanelId | undefined { const page = this.historyPage; this.historyPage = undefined; return page; }
  subscribeHistory(listener: () => void): () => void { this.historyListeners.add(listener); return () => { this.historyListeners.delete(listener); }; }
  private changed(): void {
    this.snapshot = { pages: [...this.pages.values()], visitedDocuments: [...this.visited].map(id=>this.documents.get(id)!), selectedDocument: this.selectedDocument, selection: this.selectedDocument ? this.associations.get(this.selectedDocument.id) : undefined };
    for (const listener of this.listeners) listener();
  }
  dispose(): void { this.disposed = true; this.pages.clear(); this.documents.clear(); this.associations.clear(); this.visited.clear(); this.selectedDocument = undefined; this.changed(); }
}
