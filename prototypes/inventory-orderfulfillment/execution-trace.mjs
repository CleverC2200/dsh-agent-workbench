import { shanghaiTime } from './order-metrics.mjs';

const fields=['carrier_name','carrier_id','waybillno','order_stage','odo_order_status','gpsisinraildate_to','arriveconfirm_time','expected_deliv_time','requireddeliverytimebak','requireddeliverytime','lastbillingdate','latestarrivaldate','latestsendcardate','peidan_status','paiche_status','zhuangche_status','zaitu_status','is_ontime','fromorderno'];
const key=row=>JSON.stringify([row.executeorderno,row.cust_code]);
const present=value=>value!==null&&value!==undefined&&value!=='';

/** Header facts never supply SKU quantities or multiply the authorized detail rows. */
export function attachExecutionTrace(facts,trace,nodeTrace) {
  if(!facts)return facts;
  const byKey=new Map(),duplicates=new Set();
  for(const row of trace?.rows??[]) {
    const id=key(row);if(byKey.has(id))duplicates.add(id);else byKey.set(id,row);
  }
  const permitted=field=>!trace?.rejectedColumns?.includes(field)&&(!trace?.returnedColumns||trace.returnedColumns.includes(field));
  const nodeFields={peidan_status:'prepare_status',paiche_status:'dispatch_status',zhuangche_status:'loading_status',zaitu_status:'transit_status'};
  const nodeByKey=new Map();
  for(const input of nodeTrace?.rows??[]){
    const id=JSON.stringify([input.execute_no,input.customer_code]);
    if(!nodeByKey.has(id))nodeByKey.set(id,[]);nodeByKey.get(id).push(input);
  }
  const rows=facts.rows.map(input=>{
    const row={...input};
    const source=byKey.get(key(row));
    if(!source||duplicates.has(key(row)))return row;
    const clean={};
    for(const field of fields)if(permitted(field)&&Number(source[field+'_conflict']??0)===0&&present(source[field]))clean[field]=source[field];
    if(clean.fromorderno&&row.fromorderno&&clean.fromorderno!==row.fromorderno)return row;
    const output={...row,execution_trace:clean,trace_stage_conflict:Number(source.order_stage_conflict??0)>0,
      trace_conflicts:fields.filter(field=>Number(source[field+'_conflict']??0)>0)};
    if(!present(output.logistics_provider)&&clean.carrier_name)output.logistics_provider=clean.carrier_name;
    if(!present(output.waybill_no)&&clean.waybillno)output.waybill_no=clean.waybillno;
    for(const field of ['lastbillingdate','latestarrivaldate','latestsendcardate','requireddeliverytime','requireddeliverytimebak'])
      if(shanghaiTime(output[field])===null&&shanghaiTime(clean[field])!==null)output[field]=clean[field];
    return output;
  });
  for(const row of rows){
    const candidates=(nodeByKey.get(key(row))??[]).filter(t=>t.order_no===row.cust_order_no);
    if(!candidates.length)continue;
    const extra={},conflicts=[];
    for(const [field,alias]of Object.entries(nodeFields)){
      if(nodeTrace?.rejectedColumns?.includes(alias)||nodeTrace?.returnedColumns&&!nodeTrace.returnedColumns.includes(alias))continue;
      if(row.trace_conflicts?.includes(field)||present(row.execution_trace?.[field]))continue;
      const values=new Set(candidates.map(t=>t[alias]).filter(present));
      if(values.size===1&&candidates.every(t=>present(t[alias])))extra[field]=[...values][0];
      else if(values.size>1)conflicts.push(field);
    }
    if(Object.keys(extra).length)row.execution_trace={...row.execution_trace,...extra};
    if(conflicts.length)row.trace_conflicts=[...new Set([...(row.trace_conflicts??[]),...conflicts])];
    row.node_trace_matched=true;
  }
  return {...facts,rows};
}

/** Arrival assessment is limited to the current creation-date list, not a formal period KPI. */
export function assessTraceArrivals(rows,{start,end}={}) {
  const groups=new Map();
  for(const row of rows.filter(r=>Number(r.detailstatus)===10&&String(r.is_stat)==='1')){
    const id=JSON.stringify([row.cust_order_no,row.cust_code]);
    if(!groups.has(id))groups.set(id,[]);groups.get(id).push(row);
  }
  let assessed=0,onTime=0,unknown=0,outsidePeriod=0;
  const first=start?shanghaiTime(start+' 00:00:00'):null;
  const last=end?shanghaiTime(end+' 00:00:00'):null;
  for(const lines of groups.values()){
    const exec=new Map();for(const line of lines)if(!exec.has(line.executeorderno))exec.set(line.executeorderno,line.execution_trace);
    if([...exec.values()].some(t=>!t)){unknown++;continue;}
    const shipments=lines.map(r=>r.packingunitmain==='CS'&&present(r.delivery_qty)?Number(r.delivery_qty):null);
    if(shipments.some(n=>n===null||!Number.isFinite(n)||n<0)||!shipments.some(n=>n>0)){unknown++;continue;}
    const arrived=[],deadlines=[];
    for(const trace of exec.values()){
      const arrival=shanghaiTime(trace.gpsisinraildate_to)??shanghaiTime(trace.arriveconfirm_time);
      const promises=[trace.requireddeliverytimebak,trace.requireddeliverytime,trace.expected_deliv_time].map(shanghaiTime);
      // Missing promise inputs cannot establish which of the three is latest.
      if(arrival===null||promises.some(t=>t===null))break;
      arrived.push(arrival);deadlines.push(Math.max(...promises)+12*3600000);
    }
    if(arrived.length!==exec.size){unknown++;continue;}
    const arrival=Math.max(...arrived);
    if((first!==null&&arrival<first)||(last!==null&&arrival>=last)){outsidePeriod++;continue;}
    assessed++;if(arrived.every((t,i)=>t<=deadlines[i]))onTime++;
  }
  return {scope:'当前创建日列表内、实际到货落在所选期间的完整订单样本；不是完整到货周期准交率',assessed,onTime,unknown,outsidePeriod,rate:assessed?onTime/assessed*100:null};
}
