import { readFile, realpath } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { injectPicker } from "./page-interaction/inject.ts";
import { PageRuntime, type BusinessPage, type AuthorizeBusinessPage } from "./page-runtime.ts";
import { presentHtml } from "./html-document.ts";

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
  registerBusinessPage(page:BusinessPage,authorize:AuthorizeBusinessPage):()=>void;
}

const idPattern = /^[a-z][a-z0-9-]{0,119}$/;
const legacyApsIds = new Set(["inventory-apsboard", "inventory-apsdemand", "inventory-apsdelivery"]);

/** Owns discovery, safe package paths and HTML delivery. Business calls belong to GEA. */
export class HtmlPages extends PageRuntime implements WorkbenchPages {
  private readonly packageDeclarations = new Map<string, HtmlPackage>();
  constructor(ctx: import("@deepseek-ai/cordis").Context, private readonly css: string, private readonly picker: () => Promise<string>) { super(ctx); }
  async registerHtml(roots: readonly string[]): Promise<readonly HtmlPackage[]> {
    const candidates = await Promise.all(roots.map(async root => {
      const directory = await realpath(root);
      const declaration = await realpath(resolve(directory, "plugin.json"));
      if (!declaration.startsWith(directory + sep)) throw Error("INVALID_HTML_MANIFEST_PATH");
      const manifest = JSON.parse(await readFile(declaration, "utf8"));
      if (manifest.schemaVersion !== 1 || !idPattern.test(manifest.id) || typeof manifest.name !== "string" || !manifest.name.trim() || manifest.html !== "index.html")
        throw Error(`INVALID_HTML_PLUGIN [source: ${directory}/plugin.json]`);
      const pages = manifest.pages ?? [{ id: manifest.id, name: manifest.name, view: "" }];
      if (!Array.isArray(pages) || pages.length < 1 || pages.length > 12 || pages.some(page => !page || !idPattern.test(page.id) || typeof page.name !== "string" || !page.name.trim() || typeof page.view !== "string" || !/^[a-z]*$/.test(page.view)) || new Set(pages.map(page => page.id)).size !== pages.length)
        throw Error(`INVALID_HTML_PLUGIN_PAGES [source: ${directory}/plugin.json]`);
      const htmlPath = await realpath(resolve(directory, manifest.html));
      if (!htmlPath.startsWith(directory + sep)) throw Error("INVALID_HTML_PATH");
      return { directory, htmlPath, manifest: { ...manifest, pages } };
    }));
    const unified = candidates.find(item => item.manifest.id === "inventory-apsplan");
    const replaced = new Set(Array.isArray(unified?.manifest.replaces) ? unified.manifest.replaces.filter((id: string) => legacyApsIds.has(id)) : []);
    const selected = candidates.filter(item => !replaced.has(item.manifest.id));
    const ids = new Set(this.list().map(page => page.id));
    for (const item of selected) {
      const previous = this.packageDeclarations.get(item.manifest.id);
      if (previous?.directory === item.directory) continue;
      if (previous || item.manifest.pages.some((page: HtmlPage) => ids.has(page.id))) throw Error(`DUPLICATE_HTML_PLUGIN: ${item.manifest.id}`);
      for (const page of item.manifest.pages) ids.add(page.id);
    }
    for (const item of selected) this.packageDeclarations.set(item.manifest.id, item);
    return selected;
  }
  list(): HtmlPage[] {
    return [...this.packageDeclarations.values()].flatMap(item => item.manifest.pages.map((page: HtmlPage) => ({
      id: page.id, name: page.name, view: page.view, pluginId: item.manifest.id,
      order: typeof page.order === "number" ? page.order : 20,
      url: `/api/agent-workbench/html?id=${encodeURIComponent(page.id)}&page=${encodeURIComponent(page.view)}`,
      ...(item.manifest.gea?.contract === "gea-html-v2" ? {resourceId:`gea-html-${item.manifest.id}`} : {}),
    })));
  }
  packages(): readonly HtmlPackage[] { return [...this.packageDeclarations.values()]; }
  async fetch(request: Request): Promise<Response> {
    const id = new URL(request.url).searchParams.get("id");
    const item = [...this.packageDeclarations.values()].find(item => item.manifest.pages.some((page: HtmlPage) => page.id === id));
    if (!item) return new Response("Page unavailable", { status: 404 });
    const path = await realpath(item.htmlPath);
    if (!path.startsWith(item.directory + sep)) throw Error("INVALID_HTML_PATH");
    const html = await readFile(path, "utf8");
    if (Buffer.byteLength(html) > 5_000_000) throw Error("HTML_TOO_LARGE");
    const page = item.manifest.pages.find((page: HtmlPage) => page.id === id);
    const document=injectPicker(html,await this.picker());
    return new Response(presentHtml(document, this.css), { headers: {
      "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'self'",
      "X-Workbench-Page-View": page.view,
    } });
  }
}
