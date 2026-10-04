import type { WorkbenchPage } from "./workbench.ts";
/** A real document contribution; Workbench owns the frame and its attached Conversation. */
export interface WorkbenchFramePage extends WorkbenchPage {
  readonly src: string | (() => string);
  readonly kind: "native" | "html";
  readonly pluginId?: string;
  readonly resourceId?: string;
  readonly onVisible?: () => void;
}
export interface PageIdentitySnapshot {
  readonly state: "unknown" | "confirmed" | "error";
  readonly scope: string | null;
  readonly status: { readonly authenticated: boolean } | null;
}
export interface PageExecutionConnection {
  readonly page: WorkbenchFramePage;
  readonly sessionId: string;
  readonly resourceId: string;
  readonly scope: string;
  readonly lease?: string;
}
/** GEA owns identity and authorized routes; Workbench owns presentation/port lifetimes. */
export interface WorkbenchPageExecution {
  readonly identity: {
    getSnapshot(): PageIdentitySnapshot;
    subscribe(listener: () => void): () => void;
  };
  open(page: WorkbenchFramePage, sessionId: string, resourceId: string, signal: AbortSignal): Promise<PageExecutionConnection>;
  call(connection: PageExecutionConnection, method: string, parameters: unknown, signal: AbortSignal): Promise<any>;
  close(connection: PageExecutionConnection): Promise<void>;
  prompt(connection: PageExecutionConnection, text: string, signal: AbortSignal): Promise<void>;
}
declare module "@deepseek-ai/cordis" { interface Context { geaPageExecution: WorkbenchPageExecution; } }
