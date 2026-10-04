import { PageRuntime, type BusinessPage, type AuthorizeBusinessPage } from "./page-runtime.ts";
export interface HtmlPage {
    id: string;
    name: string;
    view: string;
    pluginId: string;
    order: number;
    url: string;
    resourceId?: string;
}
/** Private package location plus the original declaration, for capability owners. */
export interface HtmlPackage {
    directory: string;
    htmlPath: string;
    manifest: Record<string, any>;
}
export interface WorkbenchPages {
    /** Register explicit installed package roots. No capability body or business credentials are read. */
    registerHtml(roots: readonly string[]): Promise<readonly HtmlPackage[]>;
    packages(): readonly HtmlPackage[];
    registerBusinessPage(page: BusinessPage, authorize: AuthorizeBusinessPage): () => void;
}
/** Owns discovery, safe package paths and HTML delivery. Business calls belong to GEA. */
export declare class HtmlPages extends PageRuntime implements WorkbenchPages {
    private readonly css;
    private readonly picker?;
    private readonly packageDeclarations;
    constructor(ctx: import("@deepseek-ai/cordis").Context, css: string, picker?: (() => Promise<string>) | undefined);
    registerHtml(roots: readonly string[]): Promise<readonly HtmlPackage[]>;
    list(): HtmlPage[];
    packages(): readonly HtmlPackage[];
    fetch(request: Request): Promise<Response>;
}
