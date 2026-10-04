import React, {useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore} from "react";
import type {Context} from "@deepseek-ai/cordis";
import type {SessionReference} from "@deepseek-ai/dsh-api-session-controller/client";
import type {SessionId} from '@deepseek-ai/dsh-session/types';
import type {MainPanelId} from '@deepseek-ai/dsh-client-ui-layout/client';
import type {FactoryComponentPropsOf, PropsRenderFactories, PropsRenderSlots, PropsRuntime} from "@deepseek-ai/dsh-client-ui-slots";
import type {} from "@deepseek-ai/dsh-client-ui-conversation/client";
import {selectResource,resourceWorkspace,type ResourceSummary,type NativeResourceSelection} from "./resource-selection.ts";
import type {PageExecutionConnection,PageIdentitySnapshot,WorkbenchFramePage,WorkbenchPageExecution} from "./frame.ts";
import {connectHtmlFrame} from "./html-bridge.ts";
import {installPageInteraction} from "./page-interaction/client.ts";
import {CompanyWelcome} from './company/ui.tsx';
import {ConversationToolbar} from './company/formal-components.tsx';
import layoutCss from './frame-presenter.css';

declare module "@deepseek-ai/dsh-client-ui-slots" {
  interface SlotFactoryMap {
    "agent-workbench.document": {scope:"root";props:{page:WorkbenchFramePage};children:{"agent-workbench.conversation":{kind:"single";scope:"session"}}};
  }
  interface SlotMap { "agent-workbench.conversation":{kind:"single";scope:"session";owner:{page:string}}; }
}
const unknownIdentity:PageIdentitySnapshot={state:"unknown",scope:null,status:null};
const noSubscribe=()=>()=>{};

/** The single native/HTML presentation module. Host Session references are explicitly borrowed. */
export type FrameCopyKey="pageConnect"|"pageNewChat"|"pageWorking"|"pageChanged"|"pageHint"|"pageWait"|"pageLogin"|"pageSessionUnavailable";
export function mountFramePresentation(ctx:Context,resources:()=>NativeResourceSelection|undefined,t:(key:FrameCopyKey)=>string,showHistory:(page?:MainPanelId)=>void=()=>{}):(page:MainPanelId,sessionId:SessionId,signal:AbortSignal)=>Promise<void> {
  ctx.effect(()=>{const style=document.createElement('style');style.dataset.workbenchDocument='layout';style.textContent=layoutCss;document.head.append(style);return()=>style.remove();});
  // Formal Workbench remembered this value for the plugin instance, across pages and modes.
  let rememberedConversationWidth:number|undefined;
  let execution:WorkbenchPageExecution|undefined;
  const backendListeners=new Set<()=>void>();
  ctx.inject(["businessAccount", "remote.session"],scope=>{
    const owned=createExecution(scope,scope.businessAccount);
    execution=owned;for(const changed of backendListeners)changed();
    scope.effect(()=>()=>{if(execution===owned){execution=undefined;for(const changed of backendListeners)changed();}});
  });
  const interaction=installPageInteraction(ctx);
  const restored=new Map<MainPanelId,SessionReference>();
  ctx.effect(()=>()=>{for(const reference of restored.values())reference.release();restored.clear();});
  function Document({page,SessionProvider,renderSlot}:FactoryComponentPropsOf<"agent-workbench.document">&PropsRenderSlots<"agent-workbench.conversation">) {
    useSyncExternalStore(listener=>ctx.locale.subscribe(listener),()=>ctx.locale.getSnapshot());
    const currentExecution=useSyncExternalStore(listener=>{backendListeners.add(listener);return()=>{backendListeners.delete(listener);};},()=>execution);
    const identity=useSyncExternalStore(currentExecution?.identity.subscribe??noSubscribe,currentExecution?.identity.getSnapshot??(()=>unknownIdentity));
    const frame=useRef<HTMLIFrameElement>(null);
    const documentElement=useRef<HTMLElement>(null);
    const [preferredWidth,setPreferredWidth]=useState(()=>rememberedConversationWidth??440);
    const [space,setSpace]=useState({viewport:window.innerWidth,document:0});
    const maximumWidth=Math.max(300,Math.min(space.viewport*.7,space.document?space.document-400:Infinity));
    const conversationWidth=Math.min(maximumWidth,Math.max(300,Math.round(preferredWidth)));
    const drag=useRef<{pointer:number;x:number;width:number}>();
    useLayoutEffect(()=>{
      const target=documentElement.current!;
      const measure=()=>{const width=target.getBoundingClientRect().width;setSpace({viewport:window.innerWidth,document:width});};
      measure();window.addEventListener('resize',measure);
      const observer=typeof ResizeObserver==='undefined'?undefined:new ResizeObserver(measure);observer?.observe(target);
      return()=>{window.removeEventListener('resize',measure);observer?.disconnect();};
    },[]);
    const resizeConversation=(x:number)=>{
      const current=drag.current;if(!current)return;
      const width=Math.min(maximumWidth,Math.max(300,Math.round(current.width+current.x-x)));
      rememberedConversationWidth=width;setPreferredWidth(width);
    };
    const [loaded,setLoaded]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState("");
    const [view,setView]=useState<'center'|'split'|'chat'>('split');
    const [selection,setSelection]=useState<{reference:SessionReference;preset:string;ownerScope:string|null}|undefined>(()=>{
      const reference=restored.get(page.id);restored.delete(page.id);
      return reference?{reference,preset:page.resourceId!,ownerScope:execution?.identity.getSnapshot().scope??null}:undefined;
    });
    const pending=useRef<{controller:AbortController;scope:string|null}>();
    const preparationOwner=useRef<string>();
    const preparation=useRef<AbortController>();
    const connectionTransition=useRef<Promise<void>>(Promise.resolve());
    const title=typeof page.label==="function"?page.label():page.label??page.id;
    const src=typeof page.src==="function"?page.src():page.src;
    const Body=page.kind==="local"?page.body:undefined;
    const sendTheme=()=>{const theme=ctx.theme.getTheme();frame.current?.contentWindow?.postMessage({protocol:"agent-workbench-theme",dark:theme.active.colorScheme==="dark",fontSize:theme.fontSize},"*");};
    useEffect(()=>{const off=ctx.on("theme/change",sendTheme);return()=>{off();};},[]);
    useEffect(()=>{
      const ready=(event:MessageEvent)=>{if(event.source===frame.current?.contentWindow&&event.data?.protocol==="agent-workbench-theme")sendTheme();};
      window.addEventListener("message",ready);return()=>window.removeEventListener("message",ready);
    },[]);
    useEffect(()=>()=>{pending.current?.controller.abort();pending.current=undefined;},[]);
    useEffect(()=>{
      const flight=pending.current;
      if(flight&&(flight.scope!==identity.scope||!identity.status?.authenticated)){
        flight.controller.abort();
        if(pending.current===flight){pending.current=undefined;setBusy(false);}
      }
      if(selection&&(identity.scope!==selection.ownerScope||!identity.status?.authenticated)){
        setSelection(undefined);setError(t("pageChanged"));
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
        }else target.contentWindow?.postMessage({type:"workbench:session",sessionId:selection.reference.sessionId,owner:connection.owner},window.location.origin);
        disposeReference=interaction.bindFrame({frame:target,reference:selection.reference,page:title,surface:connection.binding.surface,tool:connection.binding.tool,owner:connection.owner});
        setError("");
      });
      connectionTransition.current=setup.catch(failure=>{if(alive()){setError(failure instanceof Error?failure.message:String(failure));if(connection)void currentExecution.close(connection).catch(()=>{});}});
      return()=>{
        controller.abort();disposeTheme();disposeReference();disposeBridge();
        if(page.kind==="native")target.contentWindow?.postMessage({type:"workbench:session",sessionId:null},window.location.origin);
        connectionTransition.current=setup.catch(()=>{}).then(async()=>{
          if(connection){const owned=connection;connection=undefined;await currentExecution.close(owned);}
        }).catch(()=>{});
      };
    },[selection,loaded,currentExecution,page,title]);
    const connect=async(cwd?:string,ownerSignal?:AbortSignal)=>{
      if(!ownerSignal)preparation.current?.abort();
      const host=resources();if(!host||!currentExecution||!page.resourceId){setError(t("pageWait"));return;}
      if(!identity.status?.authenticated){setError(t("pageLogin"));return;}
      pending.current?.controller.abort();const controller=new AbortController();const flight={controller,scope:identity.scope};pending.current=flight;setBusy(true);setError("");
      const signal=ownerSignal?AbortSignal.any([controller.signal,ownerSignal]):controller.signal;
      try{
        const selected=await selectResource(host,page.resourceId,signal,true,cwd);
        if(!selected.reference)throw Error(t("pageSessionUnavailable"));
        if(signal.aborted||identity.scope!==currentExecution.identity.getSnapshot().scope){selected.reference.release();return;}
        setSelection({reference:selected.reference,preset:selected.preset,ownerScope:identity.scope});
      }catch(failure){if(!signal.aborted)setError(failure instanceof Error?failure.message:String(failure));}
      finally{if(pending.current===flight){pending.current=undefined;setBusy(false);}}
    };
    useEffect(()=>{
      const host=resources();
      if(!host||!currentExecution||!page.resourceId||!identity.scope||!identity.status?.authenticated||selection)return;
      const owner=identity.scope+'\0'+page.resourceId;
      if(preparationOwner.current===owner)return;
      preparationOwner.current=owner;
      const controller=new AbortController();
      preparation.current=controller;
      void (async()=>{
        const cwd=await resourceWorkspace(host.fetch,controller.signal);
        const response=await host.fetch('/api/agent-manage/resources?'+new URLSearchParams({cwd}),{signal:controller.signal,cache:'no-store'});
        if(!response.ok)throw Error('RESOURCE_LIST_UNAVAILABLE');
        const rows=await response.json() as ResourceSummary[];controller.signal.throwIfAborted();
        if(!rows.some(row=>row.id===page.resourceId&&row.installed&&row.enabled))return;
        await connect(cwd,controller.signal);
      })().catch(failure=>{if(!controller.signal.aborted)setError(failure instanceof Error?failure.message:String(failure));});
      return()=>{controller.abort();if(preparation.current===controller)preparation.current=undefined;};
    },[identity.scope,identity.status?.authenticated,currentExecution,page.resourceId]);
    return <section ref={documentElement} className="agent-workbench-ui agent-workbench-document" style={{'--workbench-ai-preferred-width':conversationWidth+'px'} as React.CSSProperties}>
      <div className={'gea-page-toolbar-anchor'+(view==='split'?' for-conversation':'')}><ConversationToolbar view={view} onViewChange={setView} onHistory={()=>showHistory(page.resourceId?page.id:undefined)} onNewConversation={()=>{if(page.resourceId)void connect();}} error={error}/></div>
      <div className={"agent-workbench-document-body view-"+view}>
        {Body?<div className="agent-workbench-html" hidden={view==='chat'}><Body/></div>:<iframe ref={frame} title={title} src={src} {...(page.kind==="html"?{sandbox:"allow-scripts allow-downloads"}:{})} className="agent-workbench-html" hidden={view==='chat'} onLoad={()=>{setLoaded(value=>value+1);sendTheme();if(page.kind==="native")frame.current?.contentWindow?.postMessage({type:"gea:identity-snapshot",snapshot:identity},window.location.origin);page.onVisible?.();}}/>}
        <div role="separator" aria-label="调整业务与AI栏宽" aria-orientation="vertical" className="agent-workbench-column-handle" hidden={view!=='split'}
          onPointerDown={event=>{if(event.button!==0||space.viewport<=1200||drag.current)return;event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);drag.current={pointer:event.pointerId,x:event.clientX,width:conversationWidth};}}
          onPointerMove={event=>{if(drag.current?.pointer===event.pointerId)resizeConversation(event.clientX);}}
          onPointerUp={event=>{if(drag.current?.pointer!==event.pointerId)return;resizeConversation(event.clientX);drag.current=undefined;event.currentTarget.releasePointerCapture(event.pointerId);}}
          onPointerCancel={()=>{drag.current=undefined;}} onLostPointerCapture={()=>{drag.current=undefined;}}/>
        <aside className="agent-workbench-native-conversation" aria-label="AI对话" hidden={view==='center'}>{selection?<SessionProvider session={selection.reference}>{renderSlot("agent-workbench.conversation",{page:page.id})}</SessionProvider>:<p className="agent-workbench-page-status" role={error?"alert":"status"}>{error||t(!currentExecution||identity.state==="unknown"?"pageWait":!identity.status?.authenticated?"pageLogin":!resources()||!page.resourceId?"pageWait":busy?"pageWorking":"pageHint")}</p>}</aside>
      </div>
    </section>;
  }
  ctx.effect(()=>ctx.slots.registerFactory({name:"agent-workbench.document",scope:"root",children:{"agent-workbench.conversation":{kind:"single",scope:"session"}}},Document));
  ctx.slots.inject("agent-workbench.conversation",()=>ctx.slots.register({name:"agent-workbench.conversation"},({page,useSession,inputActions,renderFactorySlot}:PropsRuntime<"agent-workbench.conversation">&PropsRenderFactories)=>{
    const blank=useSession(session=>session.blank&&!session.running&&!session.promptAttempted);
    return <div className="workbench-page-conversation">{blank&&<CompanyWelcome page={page} language={ctx.locale.getSnapshot().active} onFill={text=>inputActions.setDraft(text)}/>} {renderFactorySlot("conversation.content",{variant:"embedded",phase:"active",hero:false})}</div>;
  }));
  return async(page,id,signal)=>{
    const reference=ctx.sessions.retain(id,{source:'agentResourceSelection',signal});
    try{await reference.ready;signal.throwIfAborted();restored.get(page)?.release();restored.set(page,reference);}
    catch(error){reference.release();throw error;}
  };
}

function createExecution(ctx:Context,account:import('./company/account.ts').BusinessAccount):WorkbenchPageExecution {
  const request=async(operation:string,input:object,signal:AbortSignal)=>{
    const response=await fetch('/api/agent-workbench/page',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation,...input}),signal});
    const value=await response.json();signal.throwIfAborted();if(!response.ok)throw Error(value.error??'PAGE_REQUEST_FAILED');return value;
  };
  return {
    identity:account,
    async open(page,sessionId,resourceId,signal){const result=await request('open',{pageId:page.id,sessionId,resourceId},signal);return {page,sessionId,resourceId,owner:result.owner,binding:result.binding};},
    call:(connection,operation,parameters,signal)=>request(operation==='page-bridge'?'catalog':operation,{owner:connection.owner,parameters},signal),
    close:async connection=>{await request('close',{owner:connection.owner},AbortSignal.timeout(5000));},
    prompt:async(connection,text,signal)=>{signal.throwIfAborted();const result=await ctx.remote.session.prompt({sessionId:connection.sessionId as any,requestId:crypto.randomUUID() as any,mode:'queue',content:[{type:'text',text}]},signal);signal.throwIfAborted();if(!result.ok)throw Error(result.error.message);},
  };
}
