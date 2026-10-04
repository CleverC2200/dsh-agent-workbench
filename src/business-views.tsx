import type {Context} from '@deepseek-ai/cordis';
import React,{useEffect,useState,useSyncExternalStore} from 'react';
import type {MainPanelId} from '@deepseek-ai/dsh-client-ui-layout/client';
import {zh,en} from './client/locales.ts';
import {Inbox} from './client/inbox.tsx';
import {DesktopNavigation,createNavigationSelection,type ReadyNavigation} from './client/desktop-navigation.tsx';
import {ApiLogCenter} from './workbench/api-log-center.tsx';
import nativeCss from './client/native-pages.css';
const PANEL='gea-proof' as MainPanelId,INBOX='gea-inbox' as MainPanelId,API_LOG_PANEL='gea-api-log' as MainPanelId;
export function mountBusinessViews(ctx:Context){
 ctx.effect(()=>ctx.locale.register('geaProof',{zh,en}));const t=ctx.locale.bind('geaProof');
 ctx.inject(['businessAccount'],scope=>{
 const ctx=scope;
 const identity=scope.businessAccount;
  const incoming = createNavigationSelection();

  function InboxPage() {
    const navigation = useSyncExternalStore(incoming.subscribe, incoming.getSnapshot);
    return <section className="agent-workbench-ui gea-native-page" style={{ height: "100%", overflow: "auto" }}><style>{nativeCss}</style><Inbox t={t} navigation={navigation?.panel === INBOX ? navigation : null} /></section>;
  }
  function LogPage() {
    const [environment, setEnvironment] = useState<"production" | "test">("production");
    useEffect(() => {
      const controller = new AbortController();
      void request<{ environment: "production" | "test" }>("status", {}, controller.signal).then(status => {
        if (!controller.signal.aborted) setEnvironment(status.environment);
      }).catch(() => {});
      return () => controller.abort();
    }, []);
    return <section className="agent-workbench-ui gea-native-page" style={{ height: "100%" }}><style>{nativeCss}</style><ApiLogCenter environment={environment} request={request} onClose={() => ctx.layout.selectPanel(PANEL)} /></section>;
  }
  for (const [id, label, component] of [
    [INBOX, "businessInbox", InboxPage], [API_LOG_PANEL, "apiLog", LogPage],
  ] as const) ctx.slots.inject("main", () => {
    const unregister = ctx.agentWorkbench.register({id, label: () => t(label)});
    const dispose = ctx.slots.register({ name: "main", key: id }, component);
    return () => { dispose(); unregister(); };
  });
  ctx.slots.inject("main",()=>ctx.agentWorkbench.registerFrame({id:PANEL,label:()=>t("salesPlan"),kind:"native",resourceId:"gea-readonly",src:()=>`/api/agent-workbench/native?locale=${encodeURIComponent(ctx.locale.getSnapshot().active)}`,onVisible:()=>{const navigation=incoming.getSnapshot();if(identity.getSnapshot().status?.authenticated&&navigation?.panel===PANEL)navigation.visible();}}));
  const openNavigation = async (target: ReadyNavigation, signal: AbortSignal) => {
    if (![PANEL, INBOX].includes(target.panel as MainPanelId)) throw Error("NAVIGATION_TARGET_UNSUPPORTED");
    signal.throwIfAborted();
    let clear = () => {};
    const arrival = new Promise<void>((resolve, reject) => {
      const cancel = () => { if (incoming.getSnapshot()?.receipt === target.receipt) incoming.set(null); reject(Error("NAVIGATION_REQUEST_CANCELLED")); };
      const timer = setTimeout(() => { cancel(); }, 30000);
      clear = () => { clearTimeout(timer); signal.removeEventListener("abort", cancel); };
      signal.addEventListener("abort", cancel, {once: true});
      incoming.set({...target, visible: resolve, failed: reject});
      if (signal.aborted) cancel();
    });
    try { await Promise.all([ctx.agentWorkbench.open(target.panel as MainPanelId), arrival]); signal.throwIfAborted(); }
    finally { clear(); }
  };
  ctx.slots.inject("shell.overlay", () => ctx.slots.register({ name: "shell.overlay", id: "gea-desktop-navigation" }, () => <DesktopNavigation t={t} open={openNavigation} login={() => ctx.layout.selectPanel(PANEL)} />));
 });
}
async function request<T>(endpoint:string,payload:object={},signal?:AbortSignal):Promise<T>{const response=await fetch('/api/gea-proof/'+endpoint,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal});const result=await response.json();if(!response.ok||result.ok!==true)throw Error(result.error?.message??'GEA_REQUEST_FAILED');return result.value;}
declare module '@deepseek-ai/dsh-client-ui-slots' {interface LocaleNamespaceMap {geaProof: import('./client/locales.ts').CopyKey;}}
