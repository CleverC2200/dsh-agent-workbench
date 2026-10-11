import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { WorkbenchFramePage } from './frame.ts';
import { isBusinessViewPage, validHtmlViewState, type HtmlViewState } from './html-view-state.ts';

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
  selections: Array<DocumentSession & { page: MainPanelId; active: boolean }>;
  views: Array<{ page: MainPanelId; scope: string; state: HtmlViewState }>;
}
export interface WorkbenchPresentationMemory {
  getSnapshot(): unknown;
  set(value: WorkbenchPresentation): void;
}
export const WORKBENCH_PRESENTATION_KEY = 'agent-workbench.presentation.v2';

function presentation(value: unknown): WorkbenchPresentation | undefined {
  const state = value as WorkbenchPresentation | null;
  const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
  if (
    !state ||
    state.version !== 2 ||
    (state.page !== undefined && !text(state.page)) ||
    !Array.isArray(state.selections) ||
    !Array.isArray(state.views)
  )
    return;
  if (
    state.selections.some(
      (item) =>
        !item ||
        !text(item.page) ||
        typeof item.sessionId !== 'string' ||
        !/^session-[0-9a-f-]{36}$/.test(item.sessionId) ||
        (item.preset !== null && !text(item.preset)) ||
        (item.ownerScope !== null && !text(item.ownerScope)) ||
        (item.cwd !== undefined && !text(item.cwd)) ||
        (item.subject !== undefined && item.subject !== null && !text(item.subject)) ||
        typeof item.active !== 'boolean',
    )
  )
    return;
  if (
    state.views.some(
      (item) =>
        !item ||
        !text(item.page) ||
        !text(item.scope) ||
        !validHtmlViewState(item.page, item.state),
    )
  )
    return;
  return state;
}
/** Page selection and associations describe UI; Core owns every Session and its main reference. */
export class WorkbenchController implements AgentWorkbench {
  private readonly pages = new Map<MainPanelId, WorkbenchPage>();
  private readonly documents = new Map<MainPanelId, WorkbenchFramePage>();
  private readonly associations = new Map<MainPanelId, Map<string | null, DocumentSession>>();
  private readonly activePresets = new Map<MainPanelId, string | null>();
  private rememberedPage: MainPanelId | undefined;
  private readonly htmlViews = new Map<MainPanelId, Map<string, HtmlViewState>>();
  private selectedDocument: WorkbenchFramePage | undefined;
  private readonly visited = new Set<MainPanelId>();
  private snapshot: WorkbenchSnapshot = { pages: [], visitedDocuments: [] };
  private disposed = false;
  private readonly listeners = new Set<() => void>();
  private readonly historyListeners = new Set<() => void>();
  private historyPage: MainPanelId | undefined;
  private historySelection?: {
    sessionId: SessionId;
    expected: Pick<DocumentSession, 'preset' | 'cwd'>;
  };
  private historyIntent?: { page: MainPanelId | undefined; controller: AbortController };
  constructor(
    private readonly ports: WorkbenchPorts,
    private readonly memory?: WorkbenchPresentationMemory,
  ) {
    const saved = presentation(memory?.getSnapshot());
    if (!saved) return;
    this.rememberedPage = saved.page;
    for (const { page, active, sessionId, preset, ownerScope, cwd, subject } of saved.selections) {
      let selections = this.associations.get(page);
      if (!selections) {
        selections = new Map();
        this.associations.set(page, selections);
      }
      selections.set(preset, {
        sessionId,
        preset,
        ownerScope,
        ...(cwd ? { cwd } : {}),
        ...(subject === undefined ? {} : { subject }),
      });
      if (active) this.activePresets.set(page, preset);
    }
    for (const { page, scope, state } of saved.views) {
      let values = this.htmlViews.get(page);
      if (!values) {
        values = new Map();
        this.htmlViews.set(page, values);
      }
      values.set(scope, structuredClone(state));
    }
  }
  register(page: WorkbenchPage): () => void {
    if (this.disposed) throw Error('WORKBENCH_DISPOSED');
    if (this.pages.has(page.id)) throw Error(`Duplicate workbench page: ${page.id}`);
    this.pages.set(page.id, page);
    this.changed();
    return () => {
      if (this.pages.get(page.id) !== page) return;
      if (this.historyIntent?.page === page.id) this.cancelHistory();
      this.pages.delete(page.id);
      this.documents.delete(page.id);
      this.visited.delete(page.id);
      this.associations.delete(page.id);
      this.activePresets.delete(page.id);
      this.htmlViews.delete(page.id);
      if (this.selectedDocument?.id === page.id) this.selectedDocument = undefined;
      if (this.rememberedPage === page.id) this.rememberedPage = undefined;
      this.changed();
    };
  }
  async open(id: MainPanelId): Promise<boolean> {
    if (this.disposed) return false;
    if (!this.pages.has(id) && !this.ports.hasPanel?.(id))
      throw Error(`Unknown workbench page: ${id}`);
    this.cancelHistory();
    const document = this.documents.get(id);
    if (document) {
      this.selectedDocument = document;
      this.rememberedPage = undefined;
      this.visited.add(id);
      this.changed();
      this.ports.document!(this.currentSelection(id)?.sessionId);
    } else {
      this.leaveDocument();
      this.ports.panel(id);
    }
    return true;
  }
  registerFrame(page: WorkbenchFramePage): () => void {
    if (!this.ports.document) throw Error('WORKBENCH_DOCUMENT_UNAVAILABLE');
    const unregister = this.register(page);
    this.documents.set(page.id, page);
    // A page with no Session association restores presentation only; Core navigation stays untouched.
    if (this.rememberedPage === page.id && !this.associations.has(page.id)) {
      this.selectedDocument = page;
      this.rememberedPage = undefined;
      this.visited.add(page.id);
    }
    this.changed();
    return unregister;
  }
  associateSession(page: MainPanelId, selection: DocumentSession): void {
    if (!this.documents.has(page)) throw Error(`Unknown workbench Document: ${page}`);
    let selections = this.associations.get(page);
    if (!selections) {
      selections = new Map();
      this.associations.set(page, selections);
    }
    selections.set(selection.preset, selection);
    this.activePresets.set(page, selection.preset);
    this.changed();
  }
  /** A hint for a declared interpretation; identity confirmation and authorization remain external. */
  selectionFor(
    page: MainPanelId,
    preset: string | null,
    ownerScope: string | null,
    cwd?: string,
  ): DocumentSession | undefined {
    const selection = this.associations.get(page)?.get(preset);
    return selection?.ownerScope === ownerScope && (cwd === undefined || selection.cwd === cwd)
      ? selection
      : undefined;
  }
  private currentSelection(page: MainPanelId): DocumentSession | undefined {
    if (!this.activePresets.has(page)) return undefined;
    return this.associations.get(page)?.get(this.activePresets.get(page)!);
  }
  recoveryTarget(): (DocumentSession & { page: MainPanelId; resourceId?: string }) | undefined {
    const page = this.rememberedPage;
    const selection = page && this.documents.has(page) ? this.currentSelection(page) : undefined;
    const resourceId = page && this.documents.get(page)?.resourceId;
    return selection && page
      ? { page, ...selection, ...(resourceId ? { resourceId } : {}) }
      : undefined;
  }
  forgetSession(page: MainPanelId): void {
    this.associations.delete(page);
    this.activePresets.delete(page);
    this.changed();
  }
  readHtmlViewState(page: string, scope?: string): HtmlViewState | undefined {
    if (!this.documents.has(page as MainPanelId)) return undefined;
    if (isBusinessViewPage(page) && !scope) return undefined;
    const value = this.htmlViews
      .get(page as MainPanelId)
      ?.get(isBusinessViewPage(page) ? scope! : 'static');
    return value === undefined ? undefined : structuredClone(value);
  }
  saveHtmlViewState(page: string, scope: string | undefined, value: unknown): void {
    if (this.disposed || !this.documents.has(page as MainPanelId))
      throw Error('HTML_DOCUMENT_UNREGISTERED');
    if (isBusinessViewPage(page) && !scope) throw Error('HTML_VIEW_SCOPE_REQUIRED');
    if (!validHtmlViewState(page, value)) throw Error('INVALID_HTML_VIEW_STATE');
    let values = this.htmlViews.get(page as MainPanelId);
    if (!values) {
      values = new Map();
      this.htmlViews.set(page as MainPanelId, values);
    }
    values.set(isBusinessViewPage(page) ? scope! : 'static', structuredClone(value));
    this.persist();
  }
  leaveDocument(): void {
    this.cancelHistory();
    this.rememberedPage = undefined;
    if (!this.selectedDocument) {
      this.changed();
      return;
    }
    this.selectedDocument = undefined;
    this.changed();
  }
  getSnapshot = (): WorkbenchSnapshot => this.snapshot;
  label(id: MainPanelId): string {
    const label = this.pages.get(id)?.label;
    return typeof label === 'function' ? label() : (label ?? id);
  }
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  showHistory(page?: MainPanelId): void {
    this.rememberedPage = undefined;
    this.historyIntent?.controller.abort();
    this.historyIntent = { page, controller: new AbortController() };
    this.historySelection = undefined;
    this.historyPage = page;
    this.changed();
    for (const listener of this.historyListeners) listener();
  }
  /** A selection intent, not a Core Session or persisted Session directory. */
  selectHistorySession(
    page: MainPanelId,
    sessionId: SessionId,
    expected: Pick<DocumentSession, 'preset' | 'cwd'>,
  ): void {
    if (
      this.historyPage !== page ||
      !this.historyIntent ||
      this.historyIntent.controller.signal.aborted
    )
      throw Error('PAGE_HISTORY_CANCELLED');
    this.historySelection = { sessionId, expected };
  }
  takeHistoryTarget(
    sessionId?: SessionId,
  ):
    | { page: MainPanelId; expected?: Pick<DocumentSession, 'preset' | 'cwd'>; signal: AbortSignal }
    | undefined {
    if (!this.historyPage) return undefined;
    const page = this.historyPage,
      selection = this.historySelection,
      controller = this.historyIntent?.controller;
    this.historyPage = undefined;
    this.historySelection = undefined;
    this.changed();
    if (
      !page ||
      !controller ||
      controller.signal.aborted ||
      (selection && selection.sessionId !== sessionId)
    )
      return undefined;
    return {
      page,
      signal: controller.signal,
      ...(selection ? { expected: selection.expected } : {}),
    };
  }
  /** Finish the still-owned History navigation without revoking its own restore. */
  async completeHistory(target: { page: MainPanelId; signal: AbortSignal }): Promise<boolean> {
    target.signal.throwIfAborted();
    if (this.historyIntent?.controller.signal !== target.signal)
      throw Error('PAGE_HISTORY_CANCELLED');
    // Hand the completed intent back to normal navigation before open cancels prior intents.
    this.historyIntent = undefined;
    return this.open(target.page);
  }
  cancelHistory(): void {
    const changed = this.historyPage !== undefined;
    this.historyIntent?.controller.abort();
    this.historyIntent = undefined;
    this.historyPage = undefined;
    this.historySelection = undefined;
    if (changed) this.changed();
  }
  subscribeHistory(listener: () => void): () => void {
    this.historyListeners.add(listener);
    return () => {
      this.historyListeners.delete(listener);
    };
  }
  private changed(): void {
    this.snapshot = {
      ...(this.historyPage ? { historyPage: this.historyPage } : {}),
      pages: [...this.pages.values()],
      visitedDocuments: [...this.visited].map((id) => this.documents.get(id)!),
      selectedDocument: this.selectedDocument,
      selection: this.selectedDocument
        ? this.currentSelection(this.selectedDocument.id)
        : undefined,
    };
    if (!this.disposed) this.persist();
    for (const listener of this.listeners) listener();
  }
  private persist(): void {
    this.memory?.set({
      version: 2,
      ...(this.selectedDocument?.id || this.rememberedPage
        ? { page: this.selectedDocument?.id ?? this.rememberedPage }
        : {}),
      selections: [...this.associations].flatMap(([page, values]) =>
        [...values.values()].map((selection) => ({
          page,
          ...selection,
          active: this.activePresets.get(page) === selection.preset,
        })),
      ),
      views: [...this.htmlViews].flatMap(([page, values]) =>
        [...values].map(([scope, state]) => ({ page, scope, state })),
      ),
    });
  }
  dispose(): void {
    this.historyIntent?.controller.abort();
    this.historyIntent = undefined;
    this.historyPage = undefined;
    this.historySelection = undefined;
    this.disposed = true;
    this.pages.clear();
    this.documents.clear();
    this.associations.clear();
    this.activePresets.clear();
    this.htmlViews.clear();
    this.visited.clear();
    this.selectedDocument = undefined;
    this.rememberedPage = undefined;
    this.changed();
  }
}
