import type { Context } from "@deepseek-ai/cordis";
import React, { useEffect, useRef, useState } from "react";
import type {} from "@deepseek-ai/dsh-client-ui-layout/client";
import type {} from "@deepseek-ai/dsh-client-ui-renderer/client";
import type {} from "@deepseek-ai/dsh-client-ui-sidebar/client";
import type {} from "@deepseek-ai/dsh-client-ui-theme/client";
import type {} from "@deepseek-ai/dsh-client-locale/client";
import { selectResource, type ResourceSummary, type NativeResourceSelection } from "./resource-selection.ts";
import type { SessionId } from "@deepseek-ai/dsh-session/types";
import type {} from "@deepseek-ai/dsh-api-session-controller/client";
import type {} from "@deepseek-ai/dsh-client-ui-conversation/client";
import type {} from "@deepseek-ai/dsh-client-ui-workspace/client";
import type {} from "@deepseek-ai/dsh-agent-preset-registry/types";
import type {} from "@deepseek-ai/dsh-api-remotes/client";
import type { MainPanelId } from "@deepseek-ai/dsh-client-ui-layout/client";
import { WorkbenchController, type AgentWorkbench } from "./workbench.ts";
import type { HtmlPage } from "./html-pages.ts";
import css from "../theme/tokens.css";
import { presentHtml } from "./html-document.ts";

export const inject = ["slots", "layout", "locale", "theme"];
const DIRECTORY = "agent-workbench" as MainPanelId;
const zh = { title: "工作台", pages: "已接入页面", conversation: "原生对话", failed: "页面目录读取失败", retry: "重试", empty: "暂无已接入页面", resources:"提示词与 Skill", start:"开始新聊天", useSkill:"在新聊天中使用", unavailable:"不可选用", missing:"未安装 Skill", resourcesFailed:"资源读取失败", resourceWorking:"正在装载", resourcesRefresh:"刷新资源" };
const en = { title: "Workbench", pages: "Available pages", conversation: "Conversation", failed: "Page directory unavailable", retry: "Retry", empty: "No pages available", resources:"Prompts and Skills", start:"Start a new chat", useSkill:"Use in a new chat", unavailable:"Unavailable", missing:"Missing Skills", resourcesFailed:"Resources unavailable", resourceWorking:"Loading", resourcesRefresh:"Refresh resources" };

declare module "@deepseek-ai/dsh-client-ui-slots" {
  interface LocaleNamespaceMap { agentWorkbench: keyof typeof zh; }
}

/** Keep the official frame, workspace browser and Conversation. Only contribute public seats. */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register("agentWorkbench", { zh, en }));
  const t = ctx.locale.bind("agentWorkbench");
  ctx.effect(() => {
    const style = document.createElement("style");
    style.dataset.agentWorkbenchTheme = "1.0.0";
    style.textContent = css;
    document.head.append(style);
    return () => style.remove();
  });
  const workbench = new WorkbenchController({
    panel: id => ctx.layout.selectPanel(id),
    hasPanel: id => ctx.slots.entries("main").some(entry => entry.options.key === id),
    html: page => ctx.slots.register({ name: "main", key: page.id }, () => React.createElement(HtmlFrame, { page: { id: page.id, name: typeof page.label === "function" ? page.label() : page.label ?? page.id, pluginId: page.id, order: 20, view: "", url: "" }, html: presentHtml(page.html, css) })),
  });
  ctx.provide("agentWorkbench", workbench);
  ctx.effect(() => () => workbench.dispose());

  let nativeResources: NativeResourceSelection | undefined;
  ctx.inject(["sessions", "remote.agentPresets", "conversation", "uiWorkspace"], scope => {
    const host: NativeResourceSelection = {
      fetch: (...args) => fetch(...args),
      create: options => scope.sessions.create(options),
      select: async (id, preset) => {const result=await scope.remote.agentPresets.select(id as SessionId,preset);if(!result.ok)throw Error(result.error.message);},
      open: async (id,skill,signal) => scope.sessions.using(id as SessionId,{source:"agentResourceSelection",signal},reference => {
        signal.throwIfAborted();
        if(skill){
          const input=scope.conversation.input.for(reference.binding.ctx);
          const state=input.state.getSnapshot();
          if(state.draft || reference.binding.ctx.bail("slash/input-insert-text",{text:`/${skill} `,span:{start:0,end:0,draftRev:state.draftRev}})!==true)throw Error("RESOURCE_DRAFT_CHANGED");
        }
        scope.uiWorkspace.openSession(id as SessionId);
      }),
    };
    nativeResources=host;
    scope.effect(() => () => {if(nativeResources===host)nativeResources=undefined;});
  });
  function Resources() {
    const [rows,setRows]=useState<ResourceSummary[]>([]);
    const [resourceRevision,refreshResources]=useState(0);
    const [error,setError]=useState(""); const [busy,setBusy]=useState("");
    const pending=useRef<AbortController>();
    useEffect(() => {
      const lifetime=new AbortController();
      void fetch("/api/agent-manage/resources",{signal:lifetime.signal,cache:"no-store"}).then(async response=>{
        if(!response.ok)throw Error(`HTTP ${response.status}`);const value=await response.json();lifetime.signal.throwIfAborted();setRows(value);setError("");
      }).catch(failure=>{if(!lifetime.signal.aborted)setError(String(failure));});
      return () => {lifetime.abort();pending.current?.abort();};
    },[resourceRevision]);
    const choose=async (id:string) => {
      pending.current?.abort();const controller=new AbortController();pending.current=controller;setBusy(id);setError("");
      try {if(!nativeResources)throw Error(t("unavailable"));await selectResource(nativeResources,id,controller.signal);}
      catch(failure){if(!controller.signal.aborted)setError(failure instanceof Error?failure.message:String(failure));}
      finally{if(!controller.signal.aborted)setBusy("");}
    };
    return React.createElement("section",null,React.createElement("h2",null,t("resources")),
      React.createElement("button",{type:"button",disabled:Boolean(busy),onClick:()=>refreshResources(value=>value+1)},t("resourcesRefresh")),
      error?React.createElement("p",{role:"alert"},t("resourcesFailed")+": "+error):null,
      ...rows.map(row=>React.createElement("div",{key:row.id},
        React.createElement("button",{type:"button",disabled:!row.enabled||Boolean(busy),onClick:()=>void choose(row.id)},row.label+" · "+(busy===row.id?t("resourceWorking"):!row.enabled?t("unavailable"):row.kind==="skill"?t("useSkill"):t("start"))),
        row.missingSkills?.length?React.createElement("p",null,t("missing")+": "+row.missingSkills.join(", ")):null,
        row.error?React.createElement("p",{role:"alert"},row.error):null)));
  }
  function Directory() {
    const [entries, setEntries] = useState(() => ctx.slots.entries("main"));
    useEffect(() => {
      const refresh = () => setEntries([...ctx.slots.entries("main")]);
      const offSlots = ctx.slots.subscribe("main", refresh);
      const offSidebar = ctx.slots.subscribe("sidebar.panellist", refresh);
      const offPages = workbench.subscribe(refresh);
      const offLocale = ctx.locale.subscribe(refresh);
      return () => { offSlots(); offSidebar(); offPages(); offLocale(); };
    }, []);
    const pages = entries.filter(entry => entry.options.key && entry.options.key !== DIRECTORY && entry.options.key !== "conversation");
    return React.createElement("section", { className: "agent-workbench-ui agent-workbench-directory" },
      React.createElement("h1", null, t("title")),
      React.createElement("button", { type: "button", onClick: () => ctx.layout.selectPanel(null) }, t("conversation")),
      React.createElement("h2", null, t("pages")),
      pages.length ? React.createElement("div", { className: "agent-workbench-pages" }, ...pages.map(entry => {
        const id = entry.options.key as MainPanelId;
        const sidebarLabel = ctx.slots.entries("sidebar.panellist")
          .find(sidebar => sidebar.options.id === id)?.options.label;
        const label = typeof sidebarLabel === "function" ? sidebarLabel() : sidebarLabel ?? workbench.label(id);
        return React.createElement("button", { key: id, type: "button", onClick: () => void workbench.open(id) }, label);
      })) : React.createElement("p", null, t("empty")),
      React.createElement(DiscoveryNotice),
      React.createElement(Resources),
    );
  }
  let discoveryError = "";
  let discoveryRevision = 0;
  const listeners = new Set<() => void>();
  let retry = () => {};
  const notify = () => { discoveryRevision++; for (const listener of listeners) listener(); };
  function DiscoveryNotice() {
    React.useSyncExternalStore(listener => { listeners.add(listener); return () => listeners.delete(listener); }, () => discoveryRevision);
    return discoveryError ? React.createElement("p", { role: "alert" }, t("failed") + ": " + discoveryError, " ", React.createElement("button", { onClick: () => retry() }, t("retry"))) : null;
  }
  function HtmlFrame({ page, html }: { page: HtmlPage; html?: string }) {
    const frame = useRef<HTMLIFrameElement>(null);
    useEffect(() => {
      const theme = () => {
        const snapshot = ctx.theme.getTheme();
        frame.current?.contentWindow?.postMessage({ protocol: "agent-workbench-theme", dark: snapshot.active.colorScheme === "dark", fontSize: snapshot.fontSize }, "*");
      };
      const ready = (event: MessageEvent) => {
        if (event.source === frame.current?.contentWindow && event.data?.protocol === "agent-workbench-theme") theme();
      };
      window.addEventListener("message", ready);
      const stop = ctx.on("theme/change", theme);
      return () => { window.removeEventListener("message", ready); stop(); };
    }, [page.id]);
    return React.createElement("iframe", { ref: frame, title: page.name, ...(html === undefined ? { src: page.url } : { srcDoc: html }), sandbox: "allow-scripts allow-downloads", className: "agent-workbench-html", onLoad: () => {
      const snapshot = ctx.theme.getTheme();
      frame.current?.contentWindow?.postMessage({ protocol: "agent-workbench-theme", dark: snapshot.active.colorScheme === "dark", fontSize: snapshot.fontSize }, "*");
    } });
  }
  ctx.slots.inject("main", () => ctx.slots.register({ name: "main", key: DIRECTORY }, Directory));
  ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({ name: "sidebar.panellist", id: DIRECTORY, order: 5, label: () => t("title") }, ({ size }) => React.createElement("span", { style: { fontSize: size }, "aria-hidden": true }, "▦")));
  ctx.effect(() => {
    const controller = new AbortController();
    const registered = new Set<string>();
    const cleanup: Array<() => void> = [];
    let loading = false;
    const discover = async () => {
      if (loading || controller.signal.aborted) return;
      loading = true;
      try {
        const response = await fetch("/api/agent-workbench/pages", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw Error(`HTTP ${response.status}`);
        const pages: HtmlPage[] = await response.json();
        controller.signal.throwIfAborted();
        for (const page of pages) {
          if (registered.has(page.id)) continue;
          registered.add(page.id);
          ctx.slots.inject("main", () => {
            if (controller.signal.aborted) return () => {};
            const unregister = workbench.register({ id: page.id as MainPanelId, label: page.name });
            const disposeSlot = ctx.slots.register({ name: "main", key: page.id as MainPanelId }, () => React.createElement(HtmlFrame, { page }));
            const dispose = () => { disposeSlot(); unregister(); };
            cleanup.push(dispose);
            return dispose;
          });
        }
        discoveryError = "";
      } catch (error) {
        if (!controller.signal.aborted) discoveryError = error instanceof Error ? error.message : String(error);
      } finally { loading = false; if (!controller.signal.aborted) notify(); }
    };
    retry = () => { void discover(); };
    void discover();
    return () => { controller.abort(); retry = () => {}; for (const dispose of cleanup) dispose(); };
  });
}

declare module "@deepseek-ai/cordis" {
  interface Context { agentWorkbench: AgentWorkbench; }
}
export type { AgentWorkbench, WorkbenchPage } from "./workbench.ts";

declare module "@deepseek-ai/dsh-api-session-controller/client" {
  interface SessionReferenceSourceMap { agentResourceSelection: unknown; }
}
