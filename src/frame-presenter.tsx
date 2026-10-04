import React, {useEffect, useRef, useState, useSyncExternalStore} from "react";
import type {Context} from "@deepseek-ai/cordis";
import type {SessionReference} from "@deepseek-ai/dsh-api-session-controller/client";
import type {FactoryComponentPropsOf, PropsRenderFactories, PropsRenderSlots, PropsRuntime} from "@deepseek-ai/dsh-client-ui-slots";
import type {} from "@deepseek-ai/dsh-client-ui-conversation/client";
import {selectResource,type NativeResourceSelection} from "./resource-selection.ts";
import type {PageExecutionConnection,PageIdentitySnapshot,WorkbenchFramePage,WorkbenchPageExecution} from "./frame.ts";
import {connectHtmlFrame} from "./html-bridge.ts";
import {installPageInteraction} from "./page-interaction/client.ts";

declare module "@deepseek-ai/dsh-client-ui-slots" {
  interface SlotFactoryMap {
    "agent-workbench.document": {scope:"root";props:{page:WorkbenchFramePage};children:{"agent-workbench.conversation":{kind:"single";scope:"session"}}};
  }
  interface SlotMap { "agent-workbench.conversation":{kind:"single";scope:"session"}; }
}
const unknownIdentity:PageIdentitySnapshot={state:"unknown",scope:null,status:null};
const noSubscribe=()=>()=>{};

/** The single native/HTML presentation module. Host Session references are explicitly borrowed. */
export type FrameCopyKey="pageConnect"|"pageNewChat"|"pageWorking"|"pageChanged"|"pageHint"|"pageWait"|"pageLogin"|"pageSessionUnavailable";
export function mountFramePresentation(ctx:Context,resources:()=>NativeResourceSelection|undefined,t:(key:FrameCopyKey)=>string):void {
  let execution:WorkbenchPageExecution|undefined;
  const backendListeners=new Set<()=>void>();
  ctx.inject(["geaPageExecution"],scope=>{
    execution=scope.geaPageExecution;for(const changed of backendListeners)changed();
    scope.effect(()=>()=>{if(execution===scope.geaPageExecution){execution=undefined;for(const changed of backendListeners)changed();}});
  });
  const interaction=installPageInteraction(ctx);
  function Document({page,SessionProvider,renderSlot}:FactoryComponentPropsOf<"agent-workbench.document">&PropsRenderSlots<"agent-workbench.conversation">) {
    useSyncExternalStore(listener=>ctx.locale.subscribe(listener),()=>ctx.locale.getSnapshot());
    const currentExecution=useSyncExternalStore(listener=>{backendListeners.add(listener);return()=>{backendListeners.delete(listener);};},()=>execution);
    const identity=useSyncExternalStore(currentExecution?.identity.subscribe??noSubscribe,currentExecution?.identity.getSnapshot??(()=>unknownIdentity));
    const frame=useRef<HTMLIFrameElement>(null);
    const [loaded,setLoaded]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState("");
    const [selection,setSelection]=useState<{reference:SessionReference;preset:string;ownerScope:string|null}>();
    const pending=useRef<AbortController>();
    const connectionTransition=useRef<Promise<void>>(Promise.resolve());
    const title=typeof page.label==="function"?page.label():page.label??page.id;
    const src=typeof page.src==="function"?page.src():page.src;
    const sendTheme=()=>{const theme=ctx.theme.getTheme();frame.current?.contentWindow?.postMessage({protocol:"agent-workbench-theme",dark:theme.active.colorScheme==="dark",fontSize:theme.fontSize},"*");};
    useEffect(()=>{const off=ctx.on("theme/change",sendTheme);return()=>{off();};},[]);
    useEffect(()=>{
      const ready=(event:MessageEvent)=>{if(event.source===frame.current?.contentWindow&&event.data?.protocol==="agent-workbench-theme")sendTheme();};
      window.addEventListener("message",ready);return()=>window.removeEventListener("message",ready);
    },[]);
    useEffect(()=>()=>{pending.current?.abort();},[]);
    useEffect(()=>{
      if(!selection)return;
      if(identity.scope!==selection.ownerScope||!identity.status?.authenticated){
        pending.current?.abort();setSelection(undefined);setError(t("pageChanged"));
      }
    },[identity.scope,identity.status?.authenticated,selection]);
    useEffect(()=>{
      if(!selection)return;
      return()=>selection.reference.release();
    },[selection]);
    useEffect(()=>{
      if(page.kind!=="native"||!frame.current)return;
      frame.current.contentWindow?.postMessage({type:"gea:identity-snapshot",snapshot:identity},window.location.origin);
      if(loaded&&identity.status?.authenticated)page.onVisible?.();
    },[identity,loaded,page]);
    useEffect(()=>{
      if(!selection||!loaded||!frame.current||!currentExecution)return;
      const controller=new AbortController();
      let connection:PageExecutionConnection|undefined;
      let disposeBridge=()=>{},disposeReference=()=>{},disposeTheme=()=>{};
      const target=frame.current;
      const alive=()=>!controller.signal.aborted&&selection.ownerScope===currentExecution.identity.getSnapshot().scope;
      const setup=connectionTransition.current.then(async()=>{
        controller.signal.throwIfAborted();
        connection=await currentExecution.open(page,selection.reference.sessionId,selection.preset,controller.signal);
        if(!alive()){await currentExecution.close(connection);connection=undefined;return;}
        if(page.kind==="html"){
          const bridge=connectHtmlFrame(target,connection,currentExecution,()=>ctx.theme.getTheme(),controller.signal,failure=>{if(alive()){setError(failure instanceof Error?failure.message:String(failure));if(connection)void currentExecution.close(connection).catch(()=>{});}});
          disposeBridge=bridge;const off=ctx.on("theme/change",()=>bridge.sendTheme());disposeTheme=()=>{off();};
        }else target.contentWindow?.postMessage({type:"gea:session",sessionId:selection.reference.sessionId},window.location.origin);
        disposeReference=interaction.bindFrame({frame:target,reference:selection.reference,page:title,surface:page.kind==="html"?`gea-html-${page.pluginId}`:"gea-workbench",tool:page.kind==="native"?"gea_workbench_apply":undefined,referenceLease:()=>connection?.lease});
        setError("");
      });
      connectionTransition.current=setup.catch(failure=>{if(alive()){setError(failure instanceof Error?failure.message:String(failure));if(connection)void currentExecution.close(connection).catch(()=>{});}});
      return()=>{
        controller.abort();disposeTheme();disposeReference();disposeBridge();
        if(page.kind==="native")target.contentWindow?.postMessage({type:"gea:session",sessionId:null},window.location.origin);
        connectionTransition.current=setup.catch(()=>{}).then(async()=>{
          if(connection){const owned=connection;connection=undefined;await currentExecution.close(owned);}
        }).catch(()=>{});
      };
    },[selection,loaded,currentExecution,page,title]);
    const connect=async()=>{
      const host=resources();if(!host||!currentExecution||!page.resourceId){setError(t("pageWait"));return;}
      if(!identity.status?.authenticated){setError(t("pageLogin"));return;}
      pending.current?.abort();const controller=new AbortController();pending.current=controller;setBusy(true);setError("");
      try{
        const selected=await selectResource(host,page.resourceId,controller.signal,true);
        if(!selected.reference)throw Error(t("pageSessionUnavailable"));
        if(controller.signal.aborted||identity.scope!==currentExecution.identity.getSnapshot().scope){selected.reference.release();return;}
        setSelection({reference:selected.reference,preset:selected.preset,ownerScope:identity.scope});
      }catch(failure){if(!controller.signal.aborted)setError(failure instanceof Error?failure.message:String(failure));}
      finally{if(!controller.signal.aborted)setBusy(false);}
    };
    return <section className="agent-workbench-ui agent-workbench-document">
      {page.resourceId&&<header className="agent-workbench-page-toolbar"><span>{title}</span><button type="button" disabled={busy} onClick={()=>void connect()}>{busy?t("pageWorking"):selection?t("pageNewChat"):t("pageConnect")}</button>{!selection&&<span>{t("pageHint")}</span>}</header>}
      {error&&<p role="alert" className="agent-workbench-page-error">{error}</p>}
      <div className={"agent-workbench-document-body"+(selection?" with-conversation":"")}>
        <iframe ref={frame} title={title} src={src} {...(page.kind==="html"?{sandbox:"allow-scripts allow-downloads"}:{})} className="agent-workbench-html" onLoad={()=>{setLoaded(value=>value+1);sendTheme();if(page.kind==="native")frame.current?.contentWindow?.postMessage({type:"gea:identity-snapshot",snapshot:identity},window.location.origin);page.onVisible?.();}}/>
        {selection&&<aside className="agent-workbench-native-conversation"><SessionProvider session={selection.reference}>{renderSlot("agent-workbench.conversation",{})}</SessionProvider></aside>}
      </div>
    </section>;
  }
  ctx.effect(()=>ctx.slots.registerFactory({name:"agent-workbench.document",scope:"root",children:{"agent-workbench.conversation":{kind:"single",scope:"session"}}},Document));
  ctx.slots.inject("agent-workbench.conversation",()=>ctx.slots.register({name:"agent-workbench.conversation"},({renderFactorySlot}:PropsRuntime<"agent-workbench.conversation">&PropsRenderFactories)=>renderFactorySlot("conversation.content",{variant:"embedded",phase:"active",hero:false})));
}
