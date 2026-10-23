import { shanghaiTime } from './order-metrics.mjs';

const fields=['carrier_name','carrier_id','waybillno','order_stage','odo_order_status','gpsisinraildate_to','arriveconfirm_time','expected_deliv_time','requireddeliverytimebak','requireddeliverytime','lastbillingdate','latestarrivaldate','latestsendcardate','peidan_status','paiche_status','zhuangche_status','zaitu_status','is_ontime','fromorderno'];
const key=row=>JSON.stringify([row.executeorderno,row.cust_code]);
const present=value=>value!==null&&value!==undefined&&value!=='';
const statusGroups=[['备单中'],['派车中','已开未派','已派未到'],['装车中','厂外侯车','厂外候车','厂内侯车','厂内候车'],['在途','运输中'],['已完成']];
const phase=status=>statusGroups.findIndex(group=>group.includes(status));

/** Header facts never supply SKU quantities or multiply the authorized detail rows. */
export function attachExecutionTrace(facts,trace) {
  if(!facts)return facts;
  const byKey=new Map(),duplicates=new Set();
  for(const row of trace?.rows??[]) {
    const id=key(row);if(byKey.has(id))duplicates.add(id);else byKey.set(id,row);
  }
  const permitted=field=>!trace?.rejectedColumns?.includes(field)&&(!trace?.returnedColumns||trace.returnedColumns.includes(field));
  const rows=facts.rows.map(input=>{
    const row={...input,source_prapare_order_status:input.prapare_order_status,prapare_order_status:null,trace_status_owned:true,trace_status_unknown:true};
    const source=byKey.get(key(row));
    if(!source||duplicates.has(key(row)))return row;
    const clean={};
    for(const field of fields)if(permitted(field)&&Number(source[field+'_conflict']??0)===0&&present(source[field]))clean[field]=source[field];
    if(clean.fromorderno&&row.fromorderno&&clean.fromorderno!==row.fromorderno)return row;
    const output={...row,execution_trace:clean,trace_stage_conflict:Number(source.order_stage_conflict??0)>0,
      trace_conflicts:fields.filter(field=>Number(source[field+'_conflict']??0)>0)};
    const stage=phase(clean.order_stage),detail=phase(clean.odo_order_status);
    if(!output.trace_stage_conflict&&!output.trace_conflicts.includes('odo_order_status')&&(stage>=0||detail>=0)&&(stage<0||detail<0||stage===detail)){
      output.prapare_order_status=detail>=0?clean.odo_order_status:clean.order_stage;
      output.trace_status_unknown=false;
    }
    if(clean.carrier_name)output.logistics_provider=clean.carrier_name;
    if(clean.waybillno)output.waybill_no=clean.waybillno;
    for(const field of ['lastbillingdate','latestarrivaldate','latestsendcardate','requireddeliverytime','requireddeliverytimebak'])
      if(shanghaiTime(clean[field])!==null)output[field]=clean[field];
    return output;
  });
  const orders=new Map();
  for(const row of rows.filter(r=>Number(r.detailstatus)===10&&String(r.is_stat)==='1')){
    const id=JSON.stringify([row.cust_order_no,row.cust_code]);if(!orders.has(id))orders.set(id,[]);orders.get(id).push(row);
  }
  for(const lines of orders.values()){
    const unknown=lines.some(r=>r.trace_status_unknown);
    const active=lines.filter(r=>phase(r.prapare_order_status)!==4);
    const latest=active.length?Math.max(...active.map(r=>phase(r.prapare_order_status))):4;
    const statuses=[...new Set(lines.filter(r=>phase(r.prapare_order_status)===latest).map(r=>r.prapare_order_status))];
    const status=unknown?null:statuses.length===1?statuses[0]:statusGroups[latest]?.[0]??null;
    for(const row of lines){row.prapare_order_status=status;row.trace_status_unknown=unknown;}
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
