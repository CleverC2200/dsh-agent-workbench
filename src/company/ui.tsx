import React,{useEffect,useMemo,useRef,useState,useSyncExternalStore} from 'react';
import type {Context} from '@deepseek-ai/cordis';
import type {MainPanelId} from '@deepseek-ai/dsh-client-ui-layout/client';
import type {SessionId} from '@deepseek-ai/dsh-session/types';
import type {PropsRuntime,PropsRenderSlots,PropsRenderFactories,FactoryLocalComponentPropsOf} from '@deepseek-ai/dsh-client-ui-slots';
import type {} from '@deepseek-ai/dsh-client-ui-settings/client';
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client';
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client';
import type {WorkbenchController} from '../workbench.ts';
import type {BusinessAccount} from './account.ts';
import logo from './brand-logo.png';
import * as prompts from './conversation-prompts.ts';

const groups=[
 {title:'产销协同',items:[['inventory-apsplan','产销协同工作台']]},
 {title:'计划管理',items:[['plan-region-category','品类计划工作台(开发中)'],['gea-proof','销售计划'],['gea-regional-plan','区域计划(开发中)'],['plan-category-production','主生产计划(MPS)(开发中)'],['plan-capacity-assessment','产能评估(待设计)']]},
 {title:'库存管理',items:[['inventory-qll','全链库存工作台'],['inventory-aqkc','基地库存'],['inventory-fc','分仓库存'],['inventory-customer','客户库存(开发中)']]},
 {title:'订单管理',items:[['inventory-orderworkbench','订单管理工作台(开发中)'],['inventory-orderfulfillment','订单履约(开发中)']]},
] as const;
const agents:Record<string,prompts.ConversationPromptConfig>={
 'gea-proof':prompts.approvalConversation,'gea-regional-plan':prompts.regionalPlanConversation,
 'plan-region-category':prompts.categoryPlanConversation,'plan-category-production':prompts.mpsPlanConversation,
 'gea-inbox':prompts.inboxConversation,'inventory-dealer':prompts.inventoryConversation,
 'inventory-apsdemand':prompts.demandOpsConversation,'inventory-apsdelivery':prompts.deliveryOpsConversation,
 'inventory-aqkc':prompts.safetyStockConversation,'inventory-fc':prompts.branchStockConversation,
 'inventory-personal':prompts.inventoryWorkbenchConversation,'inventory-qll':prompts.fullChainStockConversation,
 'inventory-apsplan':prompts.supplyCoordinationConversation,'inventory-customer':prompts.customerStockConversation,
 'inventory-orderworkbench':prompts.orderManagementConversation,'inventory-orderfulfillment':prompts.orderFulfillmentConversation,
};
const unavailableAccount={state:'unknown',status:null};
const noSubscribe=()=>()=>{};
export function CompanyWelcome({page,onFill}:{page?:string;onFill?:(text:string)=>void}) {
 const agent=page?agents[page]:undefined;
 return agent?<section className="workbench-agent-welcome" aria-label={agent.name}>
  <img src={logo} alt="" width={44} height={44}/><h2>{agent.name}</h2><p>{agent.intro}<b>{agent.boundary}</b></p>
  <h3>你可以这样问</h3><div className="workbench-suggestions">{agent.prompts.map(prompt=><button key={prompt} type="button" disabled={!onFill} onClick={()=>onFill?.(prompt)}>{prompt}</button>)}</div>
 </section>:<section className="workbench-home-hero" aria-label="Synear GEA">
  <img src={logo} alt="" width={81} height={81}/><p>思念企业 AI 协作伙伴</p>
  <h1>让 AI 进入工作流程，让智能成为组织生产力。</h1>
  <p>从你正在解决的业务问题出发，分析数据、协同计划、推动任务闭环。选择一个场景开始，也可以直接提出你的问题。</p>
 </section>;
}

/** The company's public shell; native Workspace, Settings and Conversation remain their owners. */
export function mountCompanyUI(ctx:Context,workbench:WorkbenchController,Resources:React.ComponentType<{cwd?:string}>,restorePageSession:(page:MainPanelId,sessionId:SessionId,signal:AbortSignal)=>Promise<void>=async()=>{}):void {
 let account:BusinessAccount|undefined;
 const accountListeners=new Set<()=>void>();
 ctx.inject(['businessAccount'],scope=>{account=scope.businessAccount;for(const listener of accountListeners)listener();scope.effect(()=>()=>{if(account===scope.businessAccount){account=undefined;for(const listener of accountListeners)listener();}});});
 const subscribeAccount=(listener:()=>void)=>{accountListeners.add(listener);return()=>{accountListeners.delete(listener);};};
 function Account({wide,openSettings,settingsOpen}:PropsRuntime<'settings.launcher'>){
  const authority=useSyncExternalStore(subscribeAccount,()=>account,()=>account);
  const identity=useSyncExternalStore(authority?.subscribe??noSubscribe,authority?.getSnapshot??(()=>unavailableAccount),authority?.getSnapshot??(()=>unavailableAccount));
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [qr,setQr]=useState<{loginId:string;image:string}>();
  const pending=useRef<AbortController>();const root=useRef<HTMLDivElement>(null);const trigger=useRef<HTMLButtonElement>(null);const menu=useRef<HTMLDivElement>(null);
  const [avatarFailed,setAvatarFailed]=useState('');
  const user=identity.status?.authenticated?identity.status.user:null;
  const closeAccount=()=>{pending.current?.abort();setBusy(false);setOpen(false);setQr(undefined);};
  useEffect(()=>{if(settingsOpen)closeAccount();},[settingsOpen]);
  useEffect(()=>()=>pending.current?.abort(),[authority]);
  useEffect(()=>{if(!open)return;menu.current?.querySelector<HTMLButtonElement>('button')?.focus();
   const close=(event:PointerEvent)=>{if(event.target instanceof Node&&!root.current?.contains(event.target))closeAccount();};
   const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){closeAccount();trigger.current?.focus();}};
   const dismiss=()=>closeAccount();document.addEventListener('pointerdown',close);document.addEventListener('keydown',escape);window.addEventListener('blur',dismiss);window.addEventListener('resize',dismiss);
   return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',escape);window.removeEventListener('blur',dismiss);window.removeEventListener('resize',dismiss);};
  },[open]);
  useEffect(()=>{if(!qr||!authority)return;const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
   const poll=async()=>{try{const authenticated=await authority.pollLogin(qr.loginId,controller.signal);controller.signal.throwIfAborted();if(authenticated){setQr(undefined);setOpen(false);return;}timer=setTimeout(poll,1500);}catch(failure){if(!controller.signal.aborted){setError(failure instanceof Error?failure.message:String(failure));setQr(undefined);}}};
   timer=setTimeout(poll,1500);return()=>{controller.abort();clearTimeout(timer);};
  },[qr,authority]);
  const action=async(kind:'login'|'logout')=>{if(!authority||busy)return;pending.current?.abort();const controller=new AbortController();pending.current=controller;setBusy(true);setError('');
   try{if(kind==='login'){const qr=await authority.startLogin(controller.signal);controller.signal.throwIfAborted();setQr(qr);}else{await authority.logout(controller.signal);controller.signal.throwIfAborted();setOpen(false);}}
   catch(failure){if(!controller.signal.aborted)setError(failure instanceof Error?failure.message:String(failure));}
   finally{if(!controller.signal.aborted)setBusy(false);}
  };
  return <div className="workbench-account" ref={root}>
   <button ref={trigger} type="button" aria-label="账户菜单" aria-haspopup="menu" aria-expanded={open} onClick={()=>{if(open)closeAccount();else setOpen(true);}}><span className="workbench-avatar" aria-hidden="true">{user?.avatar&&avatarFailed!==user.avatar?<img src={user.avatar} alt="" referrerPolicy="no-referrer" onError={()=>setAvatarFailed(user.avatar??'')}/>:user?.name?.slice(0,1)||'G'}</span>{wide&&<span>{user?.name||'未登录'}</span>}</button>
   {open&&<div ref={menu} className="workbench-account-menu" role="menu" aria-label="账户菜单" onKeyDown={event=>{
    if(event.key==='Tab'){closeAccount();return;}
    if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const items=Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')??[]);const index=items.indexOf(document.activeElement as HTMLButtonElement);const next=event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowUp'?-1:1)+items.length)%items.length;items[next]?.focus();}
   }}><button type="button" role="menuitem" onClick={()=>{closeAccount();openSettings();}}>设置</button><button type="button" role="menuitem" disabled={!authority||busy} onClick={()=>void action(user?'logout':'login')}>{busy?'正在处理…':user?'退出登录':'登录 GEA'}</button>{qr&&<div><img src={qr.image} alt="使用飞书扫码登录 GEA" width={220} height={220}/><button type="button" role="menuitem" onClick={()=>setQr(undefined)}>取消扫码</button></div>}{(error||identity.error)&&<p role="alert">{error||identity.error}</p>}</div>}
  </div>;
 }
 function Sidebar({collapsed,usePanelInfo,renderSlot}:PropsRuntime<'sidebar'>&PropsRenderSlots<'sidebar.brand.mark'|'sidebar.brand.name'|'sidebar.panellist'|'sidebar.workspaces'|'sidebar.settings'|'sidebar.footer.action'>){
  const active=usePanelInfo(value=>value.activePanelId);
  const [history,setHistory]=useState(false);const [entries,setEntries]=useState(()=>ctx.slots.entries('main'));
  useEffect(()=>{const refresh=()=>setEntries([...ctx.slots.entries('main')]);const off=ctx.slots.subscribe('main',refresh);const offPanels=ctx.slots.subscribe('sidebar.panellist',refresh);const offLocale=ctx.locale.subscribe(refresh);const offPages=workbench.subscribe(refresh);return()=>{off();offPanels();offLocale();offPages();};},[]);
  const available=new Set(entries.map(entry=>entry.options.key));
  const expandHistory=()=>{setHistory(true);if(collapsed)ctx.layout.toggleSidebar();};
  useEffect(()=>workbench.subscribeHistory(expandHistory),[collapsed]);
  const start=()=>{setHistory(true);ctx.uiWorkspace.startSession();};
  const known=new Set<string>(groups.flatMap(group=>group.items.map(([id])=>id)));
  const panels=ctx.slots.entries('sidebar.panellist');
  const additional=entries.filter(entry=>entry.options.key&&entry.options.key!=='conversation'&&!known.has(entry.options.key)&&entry.options.key!=='gea-inbox').map(entry=>{
   const id=entry.options.key! as MainPanelId;
   const label=panels.find(panel=>panel.options.id===id)?.options.label;
   return {id,label:typeof label==='function'?label():label??workbench.label(id)};
  });
  return <aside className={'agent-workbench-ui workbench-sidebar'+(collapsed?' is-collapsed':'')} aria-label="思念 GEA 导航">
   <div className="workbench-sidebar-brand"><button type="button" aria-label={collapsed?'展开业务菜单':'收起侧边栏'} onClick={()=>ctx.layout.toggleSidebar()}><img src={logo} alt="" width={36} height={36}/></button>{!collapsed&&<div><strong>Synear GEA</strong><span>智能体工作台</span></div>}</div>
   <div className="workbench-sidebar-actions"><button type="button" aria-label="新建会话" onClick={start}>{collapsed?'+':'AI工作台'}</button><button type="button" aria-label="消息待办" disabled={!available.has('gea-inbox' as MainPanelId)} onClick={()=>void workbench.open('gea-inbox' as MainPanelId)}>{collapsed?'◇':'消息待办'}</button></div>
   <div className="workbench-nav-tabs"><button type="button" aria-pressed={!history} onClick={()=>{setHistory(false);if(collapsed)ctx.layout.toggleSidebar();}}>{collapsed?'▦':'业务工作台'}</button><button type="button" aria-pressed={history} onClick={expandHistory}>{collapsed?'◷':'历史会话'}</button></div>
   {!collapsed&&<div className="workbench-sidebar-browser"><nav hidden={history} aria-label="业务导航">{groups.map(group=><details key={group.title} open><summary>{group.title}</summary>{group.items.map(([id,title])=><button key={id} type="button" disabled={!available.has(id as MainPanelId)} aria-current={active===id?'page':undefined} onClick={()=>void workbench.open(id as MainPanelId)}>{title}</button>)}</details>)}{additional.length>0&&<details open><summary>公共工具与原型</summary>{additional.map(entry=><button key={entry.id} type="button" aria-current={active===entry.id?'page':undefined} onClick={()=>void workbench.open(entry.id)}>{entry.label}</button>)}</details>}</nav><div hidden={!history}>{renderSlot('sidebar.workspaces',{wide:true,expandSidebar:()=>ctx.layout.toggleSidebar()})}</div></div>}
   <footer>{renderSlot('sidebar.settings',{wide:!collapsed})}{renderSlot('sidebar.footer.action',{wide:!collapsed})}</footer>
  </aside>;
 }
 function Conversation({sessionId,useSession,useConversation,useSessions,renderFactorySlot}:PropsRuntime<'main.conversation'>&PropsRenderFactories){
  const session=useSession(value=>value);const conversation=useConversation(value=>value);
  const cwd=useSessions(value=>sessionId?value.byId[sessionId]?.cwd:undefined);
  const [historyError,setHistoryError]=useState('');
  useEffect(()=>{if(!sessionId)return;const page=workbench.takeHistoryPage();if(!page)return;const controller=new AbortController();
   void restorePageSession(page,sessionId,controller.signal).then(()=>{controller.signal.throwIfAborted();return workbench.open(page);}).catch(error=>{if(!controller.signal.aborted)setHistoryError(error instanceof Error?error.message:String(error));});
   return()=>controller.abort();
  },[sessionId]);
  const blank=!session||!conversation||(conversation.activeTargets.size===0&&session.blank&&!session.running&&!session.promptAttempted);
  const loading=session?.openState==='loading'&&!blank;
  const WelcomeControls=useMemo(()=>function CompanyMainWelcome({useWorkspaces,renderSlot,selectWorkspace}:FactoryLocalComponentPropsOf<'conversation.content','widthControls'>){
    const workspaces=useWorkspaces(value=>value.items);const current=workspaces.find(workspace=>workspace.sessionIds.includes(sessionId!));
    const [pickerOpen,setPickerOpen]=useState(false);
    return blank?<div className="workbench-main-welcome"><CompanyWelcome/><div className="workbench-native-selectors"><button type="button" onClick={()=>setPickerOpen(value=>!value)} aria-expanded={pickerOpen}>{current?.title||'选择工作区'}</button>{renderSlot('conversation.hero.workspace',{open:pickerOpen,selectedId:current?.workspaceId,onPick:id=>{setPickerOpen(false);void selectWorkspace(id);},onClose:()=>setPickerOpen(false)})}{renderSlot('conversation.hero.agentPreset',{})}</div><Resources cwd={cwd}/></div>:null;
  },[blank,cwd,sessionId]);
  const title=useSessions(value=>sessionId?value.byId[sessionId]?.title:undefined);
  return <section className="agent-workbench-ui workbench-main-conversation"><header className="workbench-main-toolbar"><strong>{title||'AI工作台'}</strong><button type="button" onClick={()=>workbench.showHistory()}>历史对话</button><button type="button" onClick={()=>ctx.uiWorkspace.startSession()}>新建会话</button></header>
   {historyError&&<p role="alert">{historyError}</p>}
   {renderFactorySlot('conversation.content',{variant:'main',phase:loading?'settling':'active',hero:false},{slots:{widthControls:WelcomeControls}})}
  </section>;
 }
 ctx.slots.inject('sidebar',()=>ctx.slots.register({name:'sidebar',priority:-20,children:{'sidebar.brand.mark':{kind:'single',scope:'root'},'sidebar.brand.name':{kind:'single',scope:'root'},'sidebar.panellist':{kind:'list',scope:'root'},'sidebar.workspaces':{kind:'single',scope:'root'},'sidebar.settings':{kind:'single',scope:'root'},'sidebar.footer.action':{kind:'list',scope:'root'}}},Sidebar));
 ctx.slots.inject('settings.launcher',()=>ctx.slots.register({name:'settings.launcher',priority:-20},Account));
 ctx.slots.inject('shell.leading',()=>ctx.slots.register({name:'shell.leading',priority:-20},()=> <div className="agent-workbench-ui workbench-leading"><button type="button" aria-label="展开业务菜单" onClick={()=>ctx.layout.toggleSidebar()}>☰</button><button type="button" aria-label="新建会话" onClick={()=>ctx.uiWorkspace.startSession()}>＋</button></div>));
 ctx.slots.inject('main.conversation',()=>ctx.slots.register({name:'main.conversation',priority:-20},Conversation));
}
