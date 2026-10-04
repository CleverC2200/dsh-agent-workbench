// src/host.ts
import { isAbsolute } from "node:path";
import { readFile as readFile2 } from "node:fs/promises";

// src/html-pages.ts
import { readFile, realpath } from "node:fs/promises";
import { resolve, sep } from "node:path";

// src/html-document.ts
function presentHtml(html, css) {
  const bridge = `<style data-workbench-theme>${css}</style><script>window.addEventListener('message',function(event){if(event.source!==parent||event.data?.protocol!=='agent-workbench-theme')return;const value=event.data;if(document.body)document.body.toggleAttribute('data-ds-dark-theme',value.dark===true);if(Number.isFinite(value.fontSize))document.documentElement.style.setProperty('--dsh-content-font-size',String(value.fontSize)+'px');});document.addEventListener('DOMContentLoaded',function(){parent.postMessage({protocol:'agent-workbench-theme',type:'ready'},'*');});</script>`;
  return html.includes("</head>") ? html.replace("</head>", bridge + "</head>") : bridge + html;
}

// src/html-pages.ts
var idPattern = /^[a-z][a-z0-9-]{0,119}$/;
var legacyApsIds = /* @__PURE__ */ new Set(["inventory-apsboard", "inventory-apsdemand", "inventory-apsdelivery"]);
var HtmlPages = class {
  constructor(css) {
    this.css = css;
  }
  packages = /* @__PURE__ */ new Map();
  async registerHtml(roots) {
    const candidates = await Promise.all(roots.map(async (root) => {
      const directory = await realpath(root);
      const declaration = await realpath(resolve(directory, "plugin.json"));
      if (!declaration.startsWith(directory + sep)) throw Error("INVALID_HTML_MANIFEST_PATH");
      const manifest = JSON.parse(await readFile(declaration, "utf8"));
      if (manifest.schemaVersion !== 1 || !idPattern.test(manifest.id) || typeof manifest.name !== "string" || !manifest.name.trim() || manifest.html !== "index.html")
        throw Error(`INVALID_HTML_PLUGIN [source: ${directory}/plugin.json]`);
      const pages = manifest.pages ?? [{ id: manifest.id, name: manifest.name, view: "" }];
      if (!Array.isArray(pages) || pages.length < 1 || pages.length > 12 || pages.some((page) => !page || !idPattern.test(page.id) || typeof page.name !== "string" || !page.name.trim() || typeof page.view !== "string" || !/^[a-z]*$/.test(page.view)) || new Set(pages.map((page) => page.id)).size !== pages.length)
        throw Error(`INVALID_HTML_PLUGIN_PAGES [source: ${directory}/plugin.json]`);
      const htmlPath = await realpath(resolve(directory, manifest.html));
      if (!htmlPath.startsWith(directory + sep)) throw Error("INVALID_HTML_PATH");
      return { directory, htmlPath, manifest: { ...manifest, pages } };
    }));
    const unified = candidates.find((item) => item.manifest.id === "inventory-apsplan");
    const replaced = new Set(Array.isArray(unified?.manifest.replaces) ? unified.manifest.replaces.filter((id) => legacyApsIds.has(id)) : []);
    const selected = candidates.filter((item) => !replaced.has(item.manifest.id));
    const ids = new Set(this.list().map((page) => page.id));
    for (const item of selected) {
      const previous = this.packages.get(item.manifest.id);
      if (previous?.directory === item.directory) continue;
      if (previous || item.manifest.pages.some((page) => ids.has(page.id))) throw Error(`DUPLICATE_HTML_PLUGIN: ${item.manifest.id}`);
      for (const page of item.manifest.pages) ids.add(page.id);
    }
    for (const item of selected) this.packages.set(item.manifest.id, item);
    return selected;
  }
  list() {
    return [...this.packages.values()].flatMap((item) => item.manifest.pages.map((page) => ({
      id: page.id,
      name: page.name,
      view: page.view,
      pluginId: item.manifest.id,
      order: typeof page.order === "number" ? page.order : 20,
      url: `/api/agent-workbench/html?id=${encodeURIComponent(page.id)}&page=${encodeURIComponent(page.view)}`
    })));
  }
  async fetch(request) {
    const id = new URL(request.url).searchParams.get("id");
    const item = [...this.packages.values()].find((item2) => item2.manifest.pages.some((page2) => page2.id === id));
    if (!item) return new Response("Page unavailable", { status: 404 });
    const path = await realpath(item.htmlPath);
    if (!path.startsWith(item.directory + sep)) throw Error("INVALID_HTML_PATH");
    const html = await readFile(path, "utf8");
    if (Buffer.byteLength(html) > 5e6) throw Error("HTML_TOO_LARGE");
    const page = item.manifest.pages.find((page2) => page2.id === id);
    return new Response(presentHtml(html, this.css), { headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'self'",
      "X-Workbench-Page-View": page.view
    } });
  }
};

// src/host.ts
var inject = ["connection"];
async function apply(ctx, config) {
  if (!config || typeof config.cwd !== "string" || !isAbsolute(config.cwd))
    throw new Error("agent-workbench: cwd must be absolute");
  const pages = new HtmlPages(await readFile2(new URL("./theme/tokens.css", import.meta.url), "utf8"));
  await pages.registerHtml([new URL("./samples/", import.meta.url).pathname]);
  ctx.provide("workbenchPages", pages);
  ctx.effect(() => ctx.connection.fetch.register({
    path: "/api/agent-workbench/theme.css",
    methods: ["GET"],
    requestBody: "buffered",
    fetch: async () => new Response(await readFile2(new URL("./theme/tokens.css", import.meta.url), "utf8"), { headers: { "Content-Type": "text/css; charset=utf-8", "Cache-Control": "no-store" } })
  }));
  ctx.effect(() => ctx.connection.fetch.register({
    path: "/api/agent-workbench/pages",
    methods: ["GET"],
    requestBody: "buffered",
    fetch: async () => Response.json(pages.list(), { headers: { "Cache-Control": "no-store" } })
  }));
  ctx.effect(() => ctx.connection.fetch.register({
    path: "/api/agent-workbench/html",
    methods: ["GET"],
    requestBody: "buffered",
    fetch: (request) => pages.fetch(request)
  }));
  ctx.effect(
    () => ctx.connection.fetch.register({
      path: "/api/agent-workbench/config",
      methods: ["GET"],
      requestBody: "buffered",
      // Read-only deployment metadata; static presentation does not use it to create Sessions.
      fetch: async () => Response.json(
        { cwd: config.cwd },
        { headers: { "Cache-Control": "no-store" } }
      )
    })
  );
}
export {
  apply,
  inject
};
