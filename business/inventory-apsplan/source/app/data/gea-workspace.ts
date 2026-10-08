import registry from './gea-queries.json';
import {readGovernedSql,GeaQueryError,type SqlTransport} from './gea-sql';
type Row=Record<string,any>;
type Input={date:string;granularity:string;version:string;orderType:string;stage?:string;comparison?:boolean;refresh?:boolean;signal?:AbortSignal;onProgress?:(data:any)=>void;onComparison?:(data:any)=>void};
const {labels,notes,paths}=registry;
const queries=registry.queries as Record<string,{sql:string;parameters:string[]}>;
// First paint only waits for the four sources used by the intelligent-workbench
// KPI cards. Detail-only sources continue in the background stage.
const primary=['stock','orders','finance','sales-budget'];
// KPI comparison does not need detail tables, product drill-downs or daily
// shipment exports. Keeping this list small avoids re-reading six large sources
// for both the previous period and the same period last year.
const comparisonKeys=['demand-accuracy','sales-accuracy','finance','sales-budget','stock','orders','shippable'];
const numericFields=new Set(['records','inventory','demand','target','missing_demand','missing_target','predicted','actual','predicted_amount','actual_amount','missing_actual','missing_predicted','planned','initial_plan','missing_plan','available','invalid','budget','quantity','weighted_age','older_quantity','ordered','allocated','value','previous','last_year','actual_all','income','missing_qty','missing_income','shortage','shipped','adjusted_plan','initial_deviation','adjusted_deviation']);
const iso=(d:Date)=>d.toISOString().slice(0,10);
const date=(s:string)=>new Date(s+'T00:00:00Z');
const shiftDays=(s:string,n:number)=>{const d=date(s);d.setUTCDate(d.getUTCDate()+n);return iso(d)};
const shiftMonths=(s:string,n:number)=>{const d=date(s),day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+n);const end=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,end));return iso(d)};
export function period(end:string,kind:string):[string,string]{const d=date(end);return [kind==='year'?end.slice(0,4)+'-01-01':kind==='month'?end.slice(0,7)+'-01':kind==='week'?shiftDays(end,-((d.getUTCDay()+6)%7)):end,end]}
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const monthly=(start:string,end:string,kind:string)=>['month','year'].includes(kind)&&start.endsWith('-01')&&(end===today()||date(shiftDays(end,1)).getUTCDate()===1);
// One adapter owns a bounded queue shared by main and comparison requests.
export function createGeaWorkspace(transport:SqlTransport){
 const unavailable=new Map<string,unknown>();
 const sharedReads=new Map<string,Promise<Row[]>>();
 let running=0;const waiting:Array<()=>void>=[];
 async function limited<T>(task:()=>Promise<T>):Promise<T>{if(running>=3)await new Promise<void>(r=>waiting.push(r));else running++;try{return await task()}finally{const next=waiting.shift();if(next)next();else running--}}
 async function run(input:Input,bounds=period(input.date,input.granularity),selected?:string[]){
  const [start,end]=bounds,kind=input.granularity;
  const values:Row={start,end,anchor:input.date,version:input.version,order_type:input.orderType,month_start:start.slice(0,7).replace('-',''),month_end:end.slice(0,7).replace('-',''),day_start:start.replaceAll('-',''),day_end:end.replaceAll('-',''),iso_month_start:start.slice(0,7),iso_month_end:end.slice(0,7),start_month:start.slice(0,7),end_month:end.slice(0,7),age_limit:180,ratio_group:'warehouse_examine'};
  async function read(name:string):Promise<Row[]>{
   const q=queries[name];if(!q)throw new GeaQueryError('QUERY_NOT_REGISTERED','未登记的查询');
   const parameters=Object.fromEntries(q.parameters.map((key,i)=>{if(!(key in values))throw new GeaQueryError('PARAMETER_MISSING','查询参数缺失');return ['gea_p'+(i+1),values[key]]}));
   input.signal?.throwIfAborted();
   if(unavailable.has(q.sql))throw unavailable.get(q.sql);
   const cacheKey=JSON.stringify([q.sql,parameters]);
   let job=sharedReads.get(cacheKey);
   if(!job){
    job=readGovernedSql((method,payload)=>limited(async()=>{
     input.signal?.throwIfAborted();
     if(unavailable.has(q.sql))throw unavailable.get(q.sql);
     return transport(method,payload,{signal:input.signal});
    }),q.sql,parameters,{signal:input.signal}).catch(error=>{
     if(sharedReads.get(cacheKey)===job)sharedReads.delete(cacheKey);
     if(!input.signal?.aborted && /RESOURCE_NOT_PUBLISHED|数据表未发布/.test(String(error?.code)+' '+String(error?.message)))unavailable.set(q.sql,error);
     throw error;
    });
    sharedReads.set(cacheKey,job);
   }
   // Consumers annotate rows by scope; never mutate the shared raw response.
   const rows=await job;
   input.signal?.throwIfAborted();
   if(rows.length>12000)throw new GeaQueryError('GEA_RESULT_INCOMPLETE','聚合结果超过完整返回上限，请缩小范围');
   return rows.map(row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key,numericFields.has(key)&&typeof value==='string'&&value.trim()!==''&&Number.isFinite(Number(value))?Number(value):value])));
  }
  let orgPromise:Promise<Row[]>|undefined;
  async function section(key:string){
   const result={id:key,label:(labels as Row)[key],note:(notes as Row)[key]};
   try{
    if(['demand-accuracy','sales-accuracy','finance','sales-budget'].includes(key)&&!monthly(start,end,kind))return {...result,status:'empty',rows:[]};
    let query=key==='plans'?(kind==='year'?'plans-source-year':'plans-source'):key;
    if(['orders','orders-products'].includes(key)&&start.slice(0,7)===end.slice(0,7))query=key==='orders'?'orders-month':'orders-month-products';
    const rows=await read(query);
    if(key==='plans')for(const row of rows){const matches=paths.filter(p=>p[2]===row.sales_group&&(!row.province||p[1]===row.province));const unique=new Map(matches.map(p=>[JSON.stringify(p),p]));if(unique.size===1)[row.region,row.province,row.sales_group]=[...unique.values()][0]}
    if(key==='sales-accuracy')for(const row of rows){const parents=new Set(paths.filter(p=>p[1]&&p[1]===row.province).map(p=>p[0]));if(parents.size===1)row.region=[...parents][0]}
    if(['finance','sales-budget'].includes(key)){
     const orgs=await (orgPromise??=read('sales-org'));const codes=['region_code','province_code','group_code'];
     for(const row of rows){const matched=orgs.filter(o=>codes.every(k=>o[k]===row[k]));const matches=paths.filter(p=>matched.some(o=>o.sales_group===p[2]&&(p[1]===null||o.province===p[1])));const unique=new Map(matches.map(p=>[JSON.stringify(p),p]));
      if(unique.size===1)[row.region,row.province,row.sales_group]=[...unique.values()][0];
      else for(const [i,field] of ['region','province','sales_group'].entries()){let names=new Set(matched.map(o=>o[field]).filter(Boolean));if(!names.size)names=new Set(orgs.filter(o=>codes.slice(0,i+1).every(k=>o[k]===row[k])).map(o=>o[field]).filter(Boolean));row[field]=names.size===1?[...names][0]:null}
      if(key==='finance'&&row.currency!=='CNY')row.invalid=typeof row.invalid==='number'&&typeof row.records==='number'?row.invalid+row.records:null;
     }
    }
    return {...result,status:rows.length?'ready':'empty',rows};
   }catch(e){const error=e as GeaQueryError;return {...result,status:'error',rows:[],error:{code:error.code||'GEA_QUERY_FAILED',message:error.message,stage:error.stage}}}
  }
  const keys=selected??(input.stage==='primary'?primary:input.stage==='remaining'?Object.keys(labels).filter(k=>!primary.includes(k)):[...primary,...Object.keys(labels).filter(k=>!primary.includes(k))]);
  const byId=new Map<string,any>();
  const snapshot=()=>({mode:'gea-governed-sql',realData:true,readOnly:true,readAt:new Date().toISOString(),start,end,granularity:kind,orderType:input.orderType,version:input.version,
   sections:(input.stage==='primary'&&!selected?Object.keys(labels):keys).map(id=>byId.get(id)??{id,label:(labels as Row)[id],note:(notes as Row)[id],status:'loading',rows:[]}),
   limitations:['由 GEA 当前用户和 Agent aps 的授权范围读取；权限拒绝与不完整返回不补零。','各来源日期和完整性请在数据来源中核对。','正式派单与写回尚未接入。']});
  await Promise.all(keys.map(async key=>{const result=await section(key);byId.set(key,result);if(!selected&&!input.signal?.aborted)input.onProgress?.(snapshot());}));
  return snapshot();
 }
 return async(input:Input):Promise<any>=>{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(input.date)||!Number.isFinite(date(input.date).valueOf())||iso(date(input.date))!==input.date||input.date>today()||!['year','month','week','day'].includes(input.granularity)||!['月初','滚动','纠偏'].includes(input.version)||!['M','Z'].includes(input.orderType)||![undefined,'primary','remaining'].includes(input.stage))throw new GeaQueryError('APS_INVALID_FILTER','筛选参数无效');
  if(input.refresh&&!input.comparison&&input.stage!=='remaining'){sharedReads.clear();unavailable.clear()}
  if(!input.comparison)return run(input);
  const bounds=period(input.date,input.granularity);
  const previous=bounds.map(s=>input.granularity==='year'?shiftMonths(s,-12):input.granularity==='month'?shiftMonths(s,-1):shiftDays(s,input.granularity==='week'?-7:-1)) as [string,string];
  const annual=bounds.map(s=>shiftMonths(s,-12)) as [string,string];
  const before=await run({...input,date:previous[1]},previous,comparisonKeys);
  if(!input.signal?.aborted)input.onComparison?.({previous:before});
  return {previous:before,annual:JSON.stringify(previous)===JSON.stringify(annual)?before:await run({...input,date:annual[1]},annual,comparisonKeys)};
 }
}
