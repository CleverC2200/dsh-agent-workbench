import { randomUUID } from 'node:crypto';
import type { Context } from '@deepseek-ai/cordis';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { createPageBridge } from './page-bridge/host.ts';
import { createPageToolRegistry } from './page-bridge/registry.ts';
import { createHtmlSessions } from './html-sessions.ts';
import { htmlPageCatalog } from './html-page-catalog.ts';
import { apply as applyReferences } from './page-interaction/host.ts';
import type { PageElementEffect } from './page-bridge/catalog.ts';
import { MODEL_PAYLOAD_BUDGET, compressForModel } from './page-interaction/shared/payload-budget.ts';

function compressPageContext(
  result: unknown,
  options: { focus?: string },
): unknown {
  if (!result || typeof result !== "object" || Array.isArray(result))
    return result;
  const value = result as Record<string, unknown>;
  const source = value.context as {parts?: Record<string, unknown>} | null;
  // Preserve query choices and computed scope facts; focus narrows result rows, including top objects.
  const controls = source?.parts?.pageFilters === undefined ? undefined
    : compressForModel(source.parts.pageFilters, {budgetBytes: 2000});
  const insight = source?.parts?.inventoryInsight as {evidence?: Record<string, unknown>} | undefined;
  const evidence = insight?.evidence;
  const riskFacts = evidence && typeof evidence === "object" && !Array.isArray(evidence)
    ? compressForModel({...evidence, top:undefined}, {budgetBytes: 4000}) : undefined;
  const payload = controls || riskFacts ? {...source, parts:{
    ...source?.parts,
    ...(controls ? {pageFilters: undefined} : {}),
    ...(riskFacts ? {inventoryInsight:{...insight, evidence:{top:evidence?.top}}} : {}),
  }} : value.context ?? null;
  const metadataBytes = [controls, riskFacts].reduce((total, item) => total + (item ? Buffer.byteLength(item.json, "utf8") + 100 : 0), 0);
  const compressed = compressForModel(payload, {
    budgetBytes: MODEL_PAYLOAD_BUDGET - metadataBytes,
    ...(options.focus === undefined ? {} : { focus: options.focus }),
  });
  let context: unknown = value.context ?? null;
  try {
    context = JSON.parse(compressed.json);
  } catch {
    // 压缩结果不是合法 JSON 时退回原值：宁可大一点，也不能让上下文消失。
  }
  if ((controls || riskFacts) && context && typeof context === "object" && !Array.isArray(context)) {
    const record = context as Record<string, unknown>;
    const parts = {...record.parts as Record<string, unknown>};
    if (controls) parts.pageFilters = JSON.parse(controls.json);
    if (riskFacts) {
      const narrowed = parts.inventoryInsight as typeof insight;
      parts.inventoryInsight = {...narrowed, evidence:{...narrowed?.evidence, ...JSON.parse(riskFacts.json)}};
    }
    context = {...record, parts};
  }
  const actions = Array.isArray(value.actions) ? value.actions : [];
  return {
    ...value,
    context,
    ...(actions.length > 10
      ? { actions: actions.slice(0, 10), actionsTotal: actions.length }
      : {}),
    ...(compressed.compressed || controls?.compressed || riskFacts?.compressed
      ? { contextNote: [compressed.note, controls?.note, riskFacts?.note].filter(Boolean).join("；"), contextOmitted: compressed.omitted + (controls?.omitted ?? 0) + (riskFacts?.omitted ?? 0) }
      : {}),
  };
}


/** The installed business adapter owns credentials, identity and actual authorization. */
export interface PageBusinessGrant {
  readonly signal: AbortSignal;
  readonly access: unknown;
  readSql?(input: any, signal: AbortSignal): Promise<unknown>;
  workspace?(input: any, signal: AbortSignal): Promise<unknown>;
  observe?(context: Record<string, unknown>): void;
  snapshot?(): {sequence:number;state:unknown}|undefined;
  allowsEffect(effect: PageElementEffect | "view"): boolean;
  release(): void;
}
export interface BusinessPage { id:string;kind:'native'|'html';label:string;resourceId:string;pluginId?:string;catalog:{surface:string;tool:string}; }
export type AuthorizeBusinessPage = (sessionId:string,resourceId:string,signal:AbortSignal)=>Promise<PageBusinessGrant>;
type OwnedPage = {token:string;page:BusinessPage;session:string;grant:PageBusinessGrant;controller:AbortController;htmlLease?:string;lastContext?:string;off:()=>void};

/** One page owner, queue, tool registry and reference lifetime for both real rendering modes. */
export class PageRuntime {
  private readonly declarations=new Map<string,{page:BusinessPage;authorize:AuthorizeBusinessPage}>();
  private readonly owners=new Map<string,OwnedPage>();
  private readonly opening=new Map<string,AbortController>();
  private readonly bridge=createPageBridge();
  private readonly html=createHtmlSessions();
  private readonly tools;
  private readonly clearReferences;
  constructor(private readonly ctx:Context) {
    this.tools=createPageToolRegistry(ctx,this.bridge,{
      stateSnapshot:session=>this.ownerFor(session)?.grant.snapshot?.(),
      allowsEffect:(_surface,effect,session)=>this.ownerFor(session)?.grant.allowsEffect(effect)===true,
      allowsDataAction:(_surface,session)=>this.ownerFor(session)?.grant.allowsEffect('draft')===true,
      denyGlobalToolsInWorkbench:['mcp__browser__browser_find','mcp__browser__browser_evaluate','mcp__browser__browser_navigate','mcp__browser__browser_snapshot'],
    });
    this.clearReferences=applyReferences(ctx,{authorize:input=>{
      const value=input as {sessionId:string;owner:string;surface:string;tool?:string}; const owned=this.assert(value.owner);
      if(!owned.grant.allowsEffect('view'))throw Error('PAGE_REFERENCE_ACCESS_DENIED');
      const {surface,tool}=owned.page.catalog;
      if(owned.session!==value.sessionId||value.surface!==surface||(value.tool!==undefined&&value.tool!==tool))throw Error('PAGE_REFERENCE_ACCESS_DENIED');
    }});
    ctx.effect(()=>ctx.connection.fetch.register({path:'/api/agent-workbench/page',methods:['POST'],requestBody:'buffered',fetch:request=>this.fetchOperation(request)}));
    ctx.effect(()=>ctx.on('agent/disposed',({agent})=>{for(const owner of [...this.owners.values()])if(owner.session===agent.id)this.close(owner.token);}));
    ctx.effect(()=>()=>{for(const owner of [...this.owners.values()])this.close(owner.token);for(const transition of this.opening.values())transition.abort();this.opening.clear();this.tools.shutdown();this.bridge.resetAll();this.html.clear();});
    ctx.inject(['tools'],scope=>scope.effect(()=>scope.tools.register(defineTool({
      name:'gea_page',description:'读取当前业务页面的观察内容或执行页面自述的 refresh/filter/draft 动作。页面观察不是业务权限，草稿不是提交。',
      parameters:{action:{type:'string',required:true,enum:['context','refresh','filter','draft']},focus:{type:'string'},parameters:{type:'string'}},
      output:{schema:{type:'string'},render:(_args,value)=>[{type:'text',text:value}]},isConcurrencySafe:()=>false,timeoutMs:35000,
      execute:async(args,exec)=>{
        const owner=this.ownerFor(exec.agent?.id??'');
        if(!owner||!owner.htmlLease)return JSON.stringify({source:'GEA_PAGE',availability:'not-in-workbench',code:'PAGE_NOT_IN_WORKBENCH',action:args.action});
        if(!owner.grant.allowsEffect(args.action==='draft'?'draft':'view'))throw Error('EFFECT_NOT_ALLOWED');
        const parameters=args.parameters?JSON.parse(String(args.parameters)):{};
        const result=await this.html.invoke(owner.page.id,owner.session,String(args.action),parameters,AbortSignal.any([exec.signal,owner.controller.signal,owner.grant.signal]));
        if(args.action!=='context')return JSON.stringify(result);
        const focus=typeof args.focus==='string'?args.focus:typeof parameters?.focus==='string'?parameters.focus:undefined;
        const payload=JSON.stringify(compressPageContext(result,{...(focus===undefined?{}:{focus})}));
        if(owner.lastContext===payload)return JSON.stringify({source:'GEA_PAGE',availability:'unchanged',page:owner.page.label,unchanged:true});
        owner.lastContext=payload;return payload;
      },
    }))));
  }
  registerBusinessPage(page:BusinessPage,authorize:AuthorizeBusinessPage):()=>void {
    if(this.declarations.has(page.id))throw Error('BUSINESS_PAGE_ALREADY_REGISTERED');
    const declaration={page,authorize};this.declarations.set(page.id,declaration);
    return()=>{if(this.declarations.get(page.id)!==declaration)return;this.declarations.delete(page.id);for(const owner of [...this.owners.values()])if(owner.page.id===page.id)this.close(owner.token);};
  }
  private ownerFor(session:string){return [...this.owners.values()].find(owner=>owner.session===session);}
  private assert(token:unknown):OwnedPage {
    const owner=typeof token==='string'?this.owners.get(token):undefined;
    if(!owner||owner.controller.signal.aborted||owner.grant.signal.aborted)throw Error('PAGE_OWNER_RELEASED');
    return owner;
  }
  private close(token:string):void {
    const owner=this.owners.get(token);if(!owner)return;
    this.owners.delete(token);owner.off();owner.controller.abort();this.tools.dispose(owner.session);this.bridge.reset(owner.session);
    if(owner.htmlLease)this.html.close(owner.htmlLease);
    this.clearReferences(owner.session);owner.grant.release();
  }
  private async open(pageId:string,sessionId:string,resourceId:string,signal:AbortSignal){
    const declaration=this.declarations.get(pageId);
    if(!declaration||resourceId!==declaration.page.resourceId)throw Error('PAGE_RESOURCE_NOT_ALLOWED');
    if(!/^session-[0-9a-f-]{36}$/.test(sessionId)||!this.ctx.agents.get(sessionId as any))throw Error('PAGE_AGENT_MISSING');
    this.opening.get(sessionId)?.abort();
    const transition=new AbortController();this.opening.set(sessionId,transition);
    for(const old of [...this.owners.values()])if(old.session===sessionId)this.close(old.token);
    signal=AbortSignal.any([signal,transition.signal]);
    let grant:PageBusinessGrant;
    try{grant=await declaration.authorize(sessionId,resourceId,signal);}finally{if(this.opening.get(sessionId)===transition)this.opening.delete(sessionId);}

    try{signal.throwIfAborted();grant.signal.throwIfAborted();if(this.declarations.get(pageId)!==declaration)throw Error("BUSINESS_PAGE_RELEASED");}catch(error){grant.release();throw error;}
    for(const old of [...this.owners.values()])if(old.session===sessionId)this.close(old.token);
    const token=randomUUID(),controller=new AbortController();
    const owner:OwnedPage={token,page:declaration.page,session:sessionId,grant,controller,off:()=>{}};
    if(owner.page.kind==='html')owner.htmlLease=this.html.open(owner.page.id,sessionId,grant.access,token);
    this.owners.set(token,owner);
    const revoke=()=>this.close(token);grant.signal.addEventListener('abort',revoke,{once:true});owner.off=()=>grant.signal.removeEventListener('abort',revoke);
    if(grant.signal.aborted){this.close(token);throw Error('PAGE_IDENTITY_CHANGED');}
    return {owner:token,binding:owner.page.catalog};
  }
  private async fetchOperation(request:Request):Promise<Response>{
    try{
      const input=await request.json();if(JSON.stringify(input).length>500000)throw Error('REQUEST_TOO_LARGE');
      if(input.operation==='open')return Response.json(await this.open(input.pageId,input.sessionId,input.resourceId,request.signal));
      if(input.operation==='close'){if(typeof input.owner==='string')this.close(input.owner);return Response.json({closed:true});}
      const owner=this.assert(input.owner),signal=AbortSignal.any([request.signal,owner.controller.signal,owner.grant.signal]);
      let value:unknown;
      switch(input.operation){
        case 'access':value=owner.grant.access;break;
        case 'sql':if(!owner.grant.readSql)throw Error('METHOD_NOT_ALLOWED');value=await owner.grant.readSql(input.parameters,signal);break;
        case 'workspace':if(!owner.grant.workspace)throw Error('METHOD_NOT_ALLOWED');value=await owner.grant.workspace(input.parameters,signal);break;
        case 'context':{
          if(JSON.stringify(input.parameters).length>100000)throw Error('PAGE_CONTEXT_TOO_LARGE');
          if(input.parameters!==null&&(!input.parameters||typeof input.parameters!=='object'||Array.isArray(input.parameters)))throw Error('INVALID_PAGE_CONTEXT');
          if(owner.htmlLease)this.html.get(owner.htmlLease).context=input.parameters;
          if(input.parameters!==null)owner.grant.observe?.(input.parameters);
          value={synced:true};break;
        }
        case 'register':{
          if(!owner.htmlLease||!['refresh','filter','draft'].includes(input.parameters?.name))throw Error('ACTION_NOT_ALLOWED');
          const page=this.html.get(owner.htmlLease);page.actions=page.actions.filter((a:any)=>a.name!==input.parameters.name);page.actions.push({name:input.parameters.name,description:String(input.parameters.description).slice(0,300)});value={registered:true};break;
        }
        case 'events':if(!owner.htmlLease)throw Error('HTML_PAGE_REQUIRED');value=this.html.get(owner.htmlLease).queue.splice(0);break;
        case 'reply':if(!owner.htmlLease)throw Error('HTML_PAGE_REQUIRED');this.html.reply(owner.htmlLease,input.parameters);value={received:true};break;
        case 'catalog':{
          const parameters=input.parameters;
          if(parameters?.pageSource!=='self-report')throw Error('UNSUPPORTED_PAGE_CATALOG_SOURCE');
          const catalog=owner.page.kind==='html'?htmlPageCatalog({...owner.page.catalog,label:owner.page.label,elements:parameters.catalog?.elements}):parameters.catalog;
          if(catalog!==null&&catalog!==undefined){const {surface,tool}=owner.page.catalog;if(catalog.surface!==surface||catalog.tool!==tool)throw Error('PAGE_CATALOG_OWNER_MISMATCH');}
          this.tools.declare(owner.session,catalog);value={events:this.bridge.pull(owner.session,parameters.toolMessages)};break;
        }
        default:throw Error('PAGE_OPERATION_NOT_ALLOWED');
      }
      signal.throwIfAborted();return Response.json(value,{headers:{'cache-control':'no-store'}});
    }catch(error){return Response.json({error:error instanceof Error?error.message:String(error)},{status:400,headers:{'cache-control':'no-store'}});}
  }
}
