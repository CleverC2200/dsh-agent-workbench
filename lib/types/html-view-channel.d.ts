import type { WorkbenchController } from './workbench.ts';
export declare const HTML_VIEW_PROTOCOL = "dsh-workbench-view-v1";
/** This binding owns one real frame generation, independently of GEA grant and quote lifetimes. */
export declare function connectHtmlViewState(frame: HTMLIFrameElement, page: string, scope: string | undefined, workbench: WorkbenchController, signal: AbortSignal): () => void;
