import {buildFullChainWorkspace} from "../../qll/src/lib/full-chain/workspace-service.ts";
import type {FullChainData, WorkspaceFilters, WorkspaceScope} from "../../qll/src/lib/full-chain/types.ts";
import {summarizeStructure} from "../../qll/src/lib/full-chain/category-structure.ts";
import {currentSessionId} from "./channel.js";

// This reception build has no live adapter. All reads use this explicit fixed fixture.
const access = {trusted: true, principalId: "mock-principal", allowedBases: ["华东"], allowedBranches: ["上海分仓"], allowedCustomerIds: ["C1"]};
const fixed = {snapshotDate: "2026-09-30", category: "饺子"};
const data: FullChainData = {
  baseInventory: Array.from({length: 105}, (_, i) => ({...fixed, base: "华东", sku: `MOCK-${String(i+1).padStart(3,"0")}`, currentQty: i+1, targetQty: i===0 ? null : 20, plannedDailyQty: 2, externalDemand30d: 30, confirmedTransferOut30d: null})),
  branchInventory: [1,2].map(i => ({...fixed, base: null, branch: "上海分仓", sku: `MOCK-${String(i).padStart(3,"0")}`, currentQty: 50, availableQty: i===1 ? 15 : 0, targetQty: 30, plannedDailyQty: 3, externalDemand30d: 60})),
  customerInventory: [{...fixed, sku: "MOCK-001", customerId: "C1", customer: "授权模拟客户", branch: null, currentQty: 100, targetQty: null, sales30d: 300, sourceConflict: false}, {...fixed, sku: "MOCK-001", customerId: "C2", customer: "范围外模拟客户", branch: null, currentQty: 999, targetQty: null, sales30d: 300, sourceConflict: false}],
  customerPlanInventory: [{snapshotDate: fixed.snapshotDate, customerId: "C1", stockQty: 0, inTransitQty: 0}],
  agingBatches: [{...fixed, sku:"MOCK-001", layer:"customer", objectId:"C1", objectName:"授权模拟客户", batch:"mock-batch", qty:100, ageDays:44, dailyVelocity:10, source:"MOCK_DATA_ONLY"}],
  orders: [], pendingOrders: [], activeCustomerIds30d: ["C1","C2"], inventoryTrend: [],
};
const currentSnapshots = new Map<string, {request: any; workspace: any; session: string | undefined; expires: number}>();
let sequence = 0;
export function clearFacts() { currentSnapshots.clear(); }
if (typeof window !== "undefined") for (const event of ["gea-session-changing", "gea-session-changed", "gea-identity-changed", "light-refresh"]) window.addEventListener(event, clearFacts);
function validate(scope: string, filters: WorkspaceFilters) {
  if (!["company","all-channel"].includes(scope)) throw Error("查询范围无效");
  if (!filters || typeof filters!=="object" || Array.isArray(filters)) throw Error("筛选参数无效");
  for (const [key,value] of Object.entries(filters)) if (!["month","base","branch","customerId","category","sku"].includes(key) || typeof value!=="string" || !value.length || value.length>200) throw Error("筛选参数无效");
  if (filters.month && !/^20\d{2}-(0[1-9]|1[0-2])$/.test(filters.month)) throw Error("月份无效");
  if (filters.customerId && scope!=="all-channel") throw Error("当前范围不可查看客户明细");
  for (const [key,allow] of [["base",access.allowedBases],["branch",access.allowedBranches],["customerId",access.allowedCustomerIds]] as const) if (filters[key] && !allow.includes(filters[key]!)) throw Error("无权访问该组织范围");
  if ([filters.base,filters.branch,filters.customerId].filter(Boolean).length>1) throw Error("请选择单一组织层级");
}
function snapshot(id: string, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const item=currentSnapshots.get(id);
  if (!item || item.expires<Date.now() || item.session!==currentSessionId()) throw Error("当前会话快照不可用，请刷新工作台后重试");
  return item;
}
function detailRequest(item: any, input: any) {
  const filters={...item.request.filters};
  if (input!==undefined && (!input || typeof input!=="object" || Array.isArray(input))) throw Error("明细筛选无效");
  for (const [key,value] of Object.entries(input??{})) {
    if (!["base","branch","customerId","category","sku"].includes(key) || (filters[key]!==undefined && filters[key]!==value)) throw Error("明细不能改变当前查询范围");
    filters[key]=value;
  }
  validate(item.request.scope, filters);
  return {...item.request,filters};
}
async function workspace(request: any, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const value=await buildFullChainWorkspace({...request, adapter:{load:async()=>structuredClone(data)}});
  signal?.throwIfAborted();
  return {...value,dataMode:"MOCK_DATA_ONLY",fixture:"ticket14-fixed-channel + 105 fixed base SKUs",notice:"固定模拟输入，不代表真实客户数据或行权限"};
}
export async function load(options: any = {}) {
  const request={access,scope:options.scope??"company",filters:options.filters??{},now:new Date("2026-10-02T03:00:00Z")};
  validate(request.scope,request.filters);
  const session=currentSessionId();
  const value=await workspace(request,options.signal);
  if (session!==currentSessionId()) throw Error("页面会话已变化，请重新查询");
  // Unique generations prevent a late reader from aliasing a refreshed snapshot.
  value.workspaceId=`${value.workspaceId}:mock:${++sequence}`;
  currentSnapshots.set(value.workspaceId,{request,workspace:value,session,expires:Date.now()+300000});
  while(currentSnapshots.size>4) currentSnapshots.delete(currentSnapshots.keys().next().value!);
  return value;
}
export async function loadDetails(options: any, signal?: AbortSignal) {
  const item=snapshot(options.workspaceId,signal), request=detailRequest(item,options.filters);
  const pageNo=Number(options.pageNo??1),pageSize=Number(options.pageSize??10);
  if(!Number.isSafeInteger(pageNo)||pageNo<1||![10,20,50,100].includes(pageSize)) throw Error("分页参数无效");
  const {kind,layer}=options;
  if(!["structure","aging","orders"].includes(kind)||!["base","branch","customer"].includes(layer)) throw Error("明细类型无效");
  if(layer==="customer" && (request.scope!=="all-channel"||kind==="orders")) throw Error("当前范围不可查看客户明细");
  if((request.filters.base&&layer!=="base")||(request.filters.branch&&layer!=="branch")||(request.filters.customerId&&layer!=="customer")) throw Error("明细层级与筛选范围不一致");
  if(request.filters.sku) throw Error("SKU 已是最后一级");
  const value=await workspace(request,signal);
  snapshot(options.workspaceId,signal);
  const objectSelected=Boolean(request.filters.base||request.filters.branch||request.filters.customerId);
  const level=objectSelected?(request.filters.category!==undefined?"sku":"category"):"object";
  let rows:any[];
  if(kind==="structure") {
    rows=value.structure.filter(row=>row.layer===layer);
    if(level!=="sku") {
      const groups=new Map<string,any[]>();
      for(const row of rows) {const key=JSON.stringify([row.objectId,row.objectName,level==="category"?row.category:null]);const group=groups.get(key)??[];group.push(row);groups.set(key,group);}
      rows=[...groups.values()].map(group=>({...summarizeStructure(group,`mock:${level}:${group[0].key}`,group[0].objectName),category:level==="object"?"全部品类":group[0].category,children:[]}));
    }
  } else {
    const roots=kind==="aging"?value.agingDetails:value.orderDetails;
    const objects=roots?.find(row=>row.layer===layer)?.children??[];
    rows=level==="object"?objects:level==="category"?objects.flatMap(row=>row.children??[]):objects.flatMap(row=>row.children??[]).flatMap(row=>row.children??[]);
  }
  rows.sort((a,b)=>JSON.stringify([a.objectId,a.objectName,a.category,a.sku,a.key]).localeCompare(JSON.stringify([b.objectId,b.objectName,b.category,b.sku,b.key]),"en"));
  return {rows:rows.slice((pageNo-1)*pageSize,pageNo*pageSize).map(row=>({...row,children:kind==="structure"?(row.sku==="全部SKU"?[]:undefined):row.expandable?[]:undefined})),total:rows.length,pageNo,pageSize,dataMode:"MOCK_DATA_ONLY"};
}
export async function loadHistory(workspaceId: string, signal?: AbortSignal) {
  const item=snapshot(workspaceId,signal);
  const value=await workspace(item.request,signal);
  snapshot(workspaceId,signal);
  return {...value,workspaceId};
}
export async function loadTrend(options: any, signal?: AbortSignal) {
  const item=snapshot(options.workspaceId,signal),request=detailRequest(item,options.filters);
  const value=await workspace(request,signal);snapshot(options.workspaceId,signal);
  return {trends:value.trends,dataMode:"MOCK_DATA_ONLY"};
}
export {buildFullChainWorkspace};
