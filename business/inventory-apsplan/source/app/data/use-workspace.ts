import {useEffect,useRef,useState} from 'react';
import {request,setLiveContext,onRefresh} from './host-bridge';
import {createGeaWorkspace} from './gea-workspace';
import {readMockWorkspace} from './mock-workspace';
import {deriveMetrics, type MetricData} from 'dsh-agent-manage/aps-compute/metrics';
type Data=MetricData & {readAt:string;limitations:string[]};
type Result={key:string;data:Data|null;previous:Data|null;annual:Data|null;error:string;busy:boolean};
export function useWorkspace(enabled:boolean,date:string,granularity:string){
 const key=JSON.stringify([date,granularity]);
 const [result,setResult]=useState<Result>({key:'',data:null,previous:null,annual:null,error:'',busy:false});
 const generation=useRef(0);
 useEffect(()=>{
  if(!enabled)return;
  let active=true;
  const workspace=APS_MOCK?readMockWorkspace:createGeaWorkspace(request);
  let controller:AbortController|undefined;
  const input={date,granularity,version:'滚动',orderType:'M'};
  async function load(refresh=false, externalSignal?:AbortSignal){
   controller?.abort();controller=new AbortController();
   const signal=externalSignal?AbortSignal.any([controller.signal,externalSignal]):controller.signal;
   const id=++generation.current;
   const current=()=>active&&id===generation.current&&!signal.aborted;
   let loaded:Data|null=null;
   function publish(data:Data,busy:boolean){
    loaded=data;
    const failures=data.sections.filter(section=>section.status==='error');
    const error=failures.map((section:{id:string;error?:{code?:string;message?:string}})=>`${section.id}：${section.error?.message || '读取失败'}（${section.error?.code || 'QUERY_FAILED'}）`).join('；');
    setResult({key,data,previous:null,annual:null,error,busy});
    setLiveContext({realData:!APS_MOCK,simulated:APS_MOCK,status:busy?'loading':failures.length?'partial':APS_MOCK?'mock':'ready',period:input,readAt:data.readAt,metrics:deriveMetrics(data),sources:data.sections.map(({rows,...section})=>({...section,groups:rows.length})),limitations:data.limitations},data);
   }
   setResult({key,data:null,previous:null,annual:null,error:'',busy:true});
   setLiveContext({realData:false,status:'loading',period:input});
   try{
    // Core cards enter the bounded queue first without blocking other slots.
    const data:Data=await workspace({...input,refresh,signal,onProgress:(data:Data)=>{if(current())publish(data,true)}});
    if(!current())return;
    publish(data,false);
    const comparisonResult=await workspace({...input,comparison:true,refresh,signal,onComparison:(comparison:any)=>{if(current())setResult(r=>({...r,...comparison}))}}).then(
     comparison=>({comparison}),error=>({error}),
    );
    if(!current())return;
    if('comparison' in comparisonResult)setResult(r=>({...r,...comparisonResult.comparison}));
    else setResult(r=>({...r,error:[r.error,'对比期读取失败：'+String(comparisonResult.error)].filter(Boolean).join('；')}));
   }catch(error){if(signal.aborted&&active&&id===generation.current){
    setResult({key,data:null,previous:null,annual:null,error:'读取已取消',busy:false});setLiveContext({realData:false,status:'cancelled',period:input});
   }else if(current()){
    setResult({key,data:loaded,previous:null,annual:null,error:String(error),busy:false});
    setLiveContext({realData:!!loaded,status:'error',period:input,error:String(error)});
   }}
  }
  const logout=()=>{controller?.abort();++generation.current;setLiveContext({realData:false,status:'identity-changed',period:input});setResult({key,data:null,previous:null,annual:null,error:'登录状态变化，请重新打开工作台',busy:false})};
  window.addEventListener('aps-identity-changed',logout);
  const sessionChanged=()=>void load();
  window.addEventListener('gea-session-changing',logout);
  window.addEventListener('gea-session-changed',sessionChanged);
  const releaseRefresh=onRefresh(signal=>load(true,signal));void load();
  return()=>{active=false;releaseRefresh();controller?.abort();++generation.current;window.removeEventListener('aps-identity-changed',logout);window.removeEventListener('gea-session-changing',logout);window.removeEventListener('gea-session-changed',sessionChanged)};
 },[enabled,key,date,granularity]);
 return result.key===key?result:{key,data:null,previous:null,annual:null,error:'',busy:enabled};
}
