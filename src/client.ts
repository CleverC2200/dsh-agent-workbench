import {mountBusinessViews} from "./business-views.tsx";
import type { Context } from "@deepseek-ai/cordis";
import React, { useEffect, useRef, useState } from "react";
import type {} from "@deepseek-ai/dsh-client-ui-layout/client";
import type {} from "@deepseek-ai/dsh-client-ui-renderer/client";
import type {} from "@deepseek-ai/dsh-client-ui-sidebar/client";
import type {} from "@deepseek-ai/dsh-client-ui-theme/client";
import type {} from "@deepseek-ai/dsh-client-locale/client";
import { selectResource, resourceWorkspace, mountNativeResourceSelection, type ResourceSummary, type NativeResourceSelection } from "./resource-selection.ts";
import {mountCompanyUI} from './company/ui.tsx';
import type {} from "@deepseek-ai/dsh-api-session-controller/client";
import type { MainPanelId } from "@deepseek-ai/dsh-client-ui-layout/client";
import { WorkbenchController, type AgentWorkbench } from "./workbench.ts";
import type { HtmlPage } from "./html-pages.ts";
import css from "../theme/tokens.css";
import { mountFramePresentation } from "./frame-presenter.tsx";
import type { PropsRuntime, PropsRenderFactories } from "@deepseek-ai/dsh-client-ui-slots";

export const inject = ["slots", "layout", "locale", "theme", "uiWorkspace"];
const zh = { title: "工作台", pages: "已接入页面", conversation: "原生对话", failed: "页面目录读取失败", retry: "重试", empty: "暂无已接入页面", resources:"提示词与 Skill", start:"开始新聊天", useSkill:"在新聊天中使用", unavailable:"不可选用", missing:"当前不可用 Skill", resourcesFailed:"资源清单读取失败，请刷新。", selectionFailed:"资源选用失败，请重试。", resourceWorking:"正在装载", resourcesRefresh:"刷新资源",pageConnect:"连接页面与原生对话",pageNewChat:"开始新的页面对话",pageWorking:"正在连接…",pageChanged:"登录身份已变化，请重新选用页面能力。",pageHint:"业务读取需登录并选用页面能力。",pageWait:"页面能力尚未就绪，请稍后重试。",pageLogin:"请先登录 GEA，再连接页面能力。",pageSessionUnavailable:"页面原生会话未就绪。" };
const en = { title: "Workbench", pages: "Available pages", conversation: "Conversation", failed: "Page directory unavailable", retry: "Retry", empty: "No pages available", resources:"Prompts and Skills", start:"Start a new chat", useSkill:"Use in a new chat", unavailable:"Unavailable", missing:"Unavailable Skills", resourcesFailed:"Resource list unavailable. Please refresh.", selectionFailed:"Unable to select this resource. Please retry.", resourceWorking:"Loading", resourcesRefresh:"Refresh resources",pageConnect:"Connect page and Conversation",pageNewChat:"Start a new page chat",pageWorking:"Connecting…",pageChanged:"Your identity changed. Select this page resource again.",pageHint:"Business reads require login and a selected page resource.",pageWait:"Page capability is not ready. Please retry shortly.",pageLogin:"Sign in to GEA before connecting this page.",pageSessionUnavailable:"The page Conversation is unavailable." };

declare module "@deepseek-ai/dsh-client-ui-slots" {
  interface LocaleNamespaceMap { agentWorkbench: keyof typeof zh; }
}

/** Keep the official frame, workspace browser and Conversation. Only contribute public seats. */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register("agentWorkbench", { zh, en }));
  const t = ctx.locale.bind("agentWorkbench");
  ctx.effect(() => {
    const style = document.createElement("style");
    style.dataset.agentWorkbenchTheme = "1.1.0";
    style.textContent = css;
    document.head.append(style);
    return () => style.remove();
  });
  const workbench = new WorkbenchController({
    panel: id => ctx.layout.selectPanel(id),
    hasPanel: id => ctx.slots.entries("main").some(entry => entry.options.key === id),
    frame: page => ctx.slots.register({name:"main",key:page.id},({renderFactorySlot}:PropsRuntime<"main">&PropsRenderFactories)=>renderFactorySlot("agent-workbench.document",{page})),
  });
  ctx.provide("agentWorkbench", workbench);
  ctx.effect(() => () => workbench.dispose());

  let nativeResources: NativeResourceSelection | undefined;
  mountNativeResourceSelection(ctx, host => {nativeResources=host;});
  const restorePageSession=mountFramePresentation(ctx,()=>nativeResources,key=>t(key),page=>workbench.showHistory(page));

  function Resources({cwd}:{cwd?:string}) {
    const [rows,setRows]=useState<ResourceSummary[]>([]);
    const [resourceRevision,refreshResources]=useState(0);
    const [error,setError]=useState(""); const [selectionError,setSelectionError]=useState(false); const [busy,setBusy]=useState("");
    const pending=useRef<AbortController>();
    useEffect(() => {
      const lifetime=new AbortController();
      void resourceWorkspace(fetch,lifetime.signal,cwd).then(path=>fetch("/api/agent-manage/resources?"+new URLSearchParams({cwd:path}),{signal:lifetime.signal,cache:"no-store"})).then(async response=>{
        if(!response.ok)throw Error(`HTTP ${response.status}`);const value=await response.json();lifetime.signal.throwIfAborted();setRows(value);setError("");
      }).catch(failure=>{if(!lifetime.signal.aborted){console.error("[agent-workbench] resource list failed",failure);setSelectionError(false);setError(String(failure));}});
      return () => {lifetime.abort();pending.current?.abort();};
    },[resourceRevision,cwd]);
    const choose=async (id:string) => {
      pending.current?.abort();const controller=new AbortController();pending.current=controller;setBusy(id);setError("");
      try {if(!nativeResources)throw Error(t("unavailable"));await selectResource(nativeResources,id,controller.signal,false,cwd);}
      catch(failure){if(!controller.signal.aborted){console.error("[agent-workbench] resource selection failed",{id,error:failure instanceof Error?failure.message:String(failure)});setSelectionError(true);setError(String(failure));}}
      finally{if(!controller.signal.aborted)setBusy("");}
    };
    return React.createElement("section",{className:'gea-home-panel'},React.createElement("div",{className:'gea-home-panel-head'},React.createElement("strong",null,t("resources"))),
      React.createElement("button",{className:'gea-home-panel-more',type:"button",disabled:Boolean(busy),onClick:()=>refreshResources(value=>value+1)},t("resourcesRefresh")),
      error?React.createElement("p",{role:"alert"},selectionError?t("selectionFailed"):t("resourcesFailed")):null,
      ...rows.map(row=>React.createElement("div",{key:row.id},
        React.createElement("button",{className:'gea-home-panel-item',type:"button",disabled:!row.enabled||Boolean(busy),onClick:()=>void choose(row.id)},row.label+" · "+(busy===row.id?t("resourceWorking"):!row.enabled?t("unavailable"):row.kind==="skill"?t("useSkill"):t("start"))),
        row.missingSkills?.length?React.createElement("p",null,t("missing")+": "+row.missingSkills.join(", ")):null,
        row.error?React.createElement("p",{role:"alert"},row.error):null)));
  }
  mountCompanyUI(ctx,workbench,Resources,restorePageSession);
  mountBusinessViews(ctx);
  let discoveryError = "";
  let discoveryRevision = 0;
  const listeners = new Set<() => void>();
  let retry = () => {};
  const notify = () => { discoveryRevision++; for (const listener of listeners) listener(); };
  function DiscoveryNotice() {
    React.useSyncExternalStore(listener => { listeners.add(listener); return () => listeners.delete(listener); }, () => discoveryRevision);
    return discoveryError ? React.createElement("p", { role: "alert" }, t("failed") + ": " + discoveryError, " ", React.createElement("button", { onClick: () => retry() }, t("retry"))) : null;
  }
  ctx.slots.inject('shell.overlay',()=>ctx.slots.register({name:'shell.overlay',id:'workbench-page-discovery'},DiscoveryNotice));
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
            const dispose = workbench.registerFrame({id:page.id as MainPanelId,label:page.name,src:page.url,kind:'html',pluginId:page.pluginId,resourceId:page.resourceId});
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

export type { WorkbenchFramePage } from "./frame.ts";
export type {BusinessAccount} from './company/account.ts';

export type {NavigationView} from "./client/desktop-navigation.tsx";
