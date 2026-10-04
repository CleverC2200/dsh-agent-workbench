export interface HtmlPage {
    id: string;
    name: string;
    view: string;
    pluginId: string;
    order: number;
    url: string;
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
}
/** Owns discovery, safe package paths and HTML delivery. Business calls belong to GEA. */
export declare class HtmlPages implements WorkbenchPages {
    private readonly css;
    private readonly packages;
    constructor(css: string);
    registerHtml(roots: readonly string[]): Promise<readonly HtmlPackage[]>;
    list(): HtmlPage[];
    fetch(request: Request): Promise<Response>;
}
