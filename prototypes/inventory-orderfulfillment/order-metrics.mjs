const number=value=>value===null||value===undefined||value===''?null:Number.isFinite(Number(value))?Number(value):null;
export function shanghaiTime(value) {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/.test(value)) return null;
  const time=Date.parse(value.slice(0,19).replace(' ','T')+'+08:00');
  const valid=Number.isFinite(time)&&time>=Date.parse('2000-01-01T00:00:00+08:00');
  return valid&&new Date(time+8*3600000).toISOString().slice(0,19)===value.slice(0,19).replace(' ','T')?time:null;
}
export function deadlineStatus(deadline,now) {
  const time=shanghaiTime(deadline);
  if(time===null||!Number.isFinite(now)) return 'unknown';
  if(now>time) return 'overdue';
  const local=new Date(time+8*3600000);
  const minute=local.getUTCHours()*60+local.getUTCMinutes();
  const night=minute>=18*60||minute<=10*60+30;
  let warning=time-2*3600000;
  if(night) {
    const midnight=Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate())-8*3600000;
    warning=midnight+14*3600000-(minute<=10*60+30?86400000:0);
  }
  return now>=warning?'warning':'normal';
}
export function lineQuantities(row) {
  const rate=number(row.packingunitconvertrate);
  const converted=key=>rate>0&&number(row[key])!==null?number(row[key])/rate:null;
  const same=(direct,convertedValue)=>direct!==null&&convertedValue!==null&&Math.abs(direct-convertedValue)>0.01?null:direct??convertedValue;
  const unitKnown=row.packingunitmain==='CS';
  const allocated=unitKnown?same(number(row.pack_unitqty),converted('qtyallocated')):null;
  const shipped=unitKnown?same(number(row.delivery_qty),converted('qtyshipped')):null;
  const original=unitKnown?number(row.order_qty):null;
  const adjusted=unitKnown?number(row.adjust_order_qty):null;
  const currentShort=original!==null&&original>=0&&allocated!==null&&allocated>=0?Math.max(original-allocated,0):null;
  const rawShort=adjusted!==null&&adjusted>=0&&allocated!==null&&allocated>=0?Math.max(adjusted-allocated,0):null;
  return {original,adjusted,allocated,shipped,currentShort,rawShort,
    allocationRate:adjusted>0&&rawShort!==null?100*(adjusted-rawShort)/adjusted:null,
    skuRate:original>0&&currentShort!==null?100*(original-currentShort)/original:null};
}
const key=row=>JSON.stringify([row.cust_order_no,row.cust_code,row.material_code,row.belong_base]);
const nodeDefinitions=[
  {stage:'allocation',names:['备单中'],field:'lastbillingdate'},
  {stage:'dispatch',names:['派车中','已开未派','已派未到'],field:'latestarrivaldate'},
  {stage:'loading',names:['装车中'],field:'latestsendcardate'},
  {stage:'transit',names:['在途','运输中'],field:'requireddeliverytime'},
];
export function nodeMetrics(rows,now) {
  const orders=new Map();
  for(const row of rows.filter(row=>Number(row.detailstatus)===10&&String(row.is_stat)==='1')) {
    const id=row.cust_order_no;
    if(!id)continue;
    if(!orders.has(id))orders.set(id,[]);
    orders.get(id).push(row);
  }
  const states=[];
  for(const [order,lines] of orders) {
    const indices=lines.map(row=>nodeDefinitions.findIndex(node=>node.names.includes(row.prapare_order_status)));
    const index=Math.max(...indices);
    if(index<0||indices.includes(-1)) {states.push({order,stage:null,status:'unknown'});continue;}
    const node=nodeDefinitions[index];
    const current=lines.filter((row,i)=>indices[i]===index);
    const statuses=current.map(row=>deadlineStatus(row[node.field],now));
    const missing=lines.some(row=>nodeDefinitions.slice(0,index+1).some(def=>shanghaiTime(row[def.field])===null));
    const status=statuses.includes('overdue')?'overdue':statuses.includes('warning')?'warning':missing?'unknown':'normal';
    states.push({order,stage:node.stage,status,missingTimes:missing});
  }
  const stages=Object.fromEntries(nodeDefinitions.map(node=>[node.stage,{overdue:0,warning:0,unknown:0,total:0}]));
  for(const row of states)if(row.stage){stages[row.stage].total++;if(row.status in stages[row.stage])stages[row.stage][row.status]++;}
  return {states,stages,overdue:states.filter(row=>row.status==='overdue').length,
    warning:states.filter(row=>row.status==='warning').length,
    unknown:states.filter(row=>row.status==='unknown'||row.missingTimes).length};
}
function groupedQuantities(rows) {
  if(rows.length===1)return lineQuantities(rows[0]);
  if(!rows.length)return {};
  const values=rows.map(lineQuantities);
  const sameSourceLine=rows.every(row=>row.fromorderno&&row.fromorderlineno)&&new Set(rows.map(row=>JSON.stringify([row.fromorderno,row.fromorderlineno]))).size===1;
  const demand=key=>sameSourceLine&&values.every(row=>row[key]!==null&&row[key]>=0)&&new Set(values.map(row=>row[key])).size===1?values[0][key]:null;
  const sum=key=>values.every(row=>row[key]!==null&&row[key]>=0)?values.reduce((total,row)=>total+row[key],0):null;
  const original=demand('original'),adjusted=demand('adjusted'),allocated=sum('allocated'),shipped=sum('shipped');
  const currentShort=original!==null&&allocated!==null?Math.max(original-allocated,0):null;
  const rawShort=adjusted!==null&&allocated!==null?Math.max(adjusted-allocated,0):null;
  return {original,adjusted,allocated,shipped,currentShort,rawShort,
    skuRate:original>0&&currentShort!==null?100*(original-currentShort)/original:null,
    allocationRate:adjusted>0&&rawShort!==null?100*(adjusted-rawShort)/adjusted:null};
}
export function computeOrderMetrics(rows,{now=Date.now()}={}) {
  const unique=new Map(),duplicate=new Set();
  for(const row of rows) {
    const id=JSON.stringify([row.executeorderno,row.executeorderlineno]);
    if(!row.executeorderno||row.executeorderlineno===null||row.executeorderlineno===undefined||unique.has(id)) duplicate.add(id);
    else unique.set(id,row);
  }
  const facts=[...unique].filter(([id])=>!duplicate.has(id)).map(([,row])=>row);
  const groups=new Map();
  for(const row of facts) {const id=key(row);if(!groups.has(id))groups.set(id,[]);groups.get(id).push(row);}
  const quantities=[];
  for(const group of groups.values()) {
    const row=group[0];
    const valid=group.filter(item=>Number(item.detailstatus)===10&&String(item.is_stat)==='1');
    const single=valid.length===1?valid[0]:null;
    const q=groupedQuantities(valid);
    const consistent=field=>group.every(item=>item[field]!==null&&item[field]!==undefined&&item[field]!=='')&&new Set(group.map(item=>item[field])).size===1?row[field]:null;
    quantities.push({order_no:row.cust_order_no,customer_code:row.cust_code,sku:row.material_code,base:row.belong_base,
      source_rows:group.length,valid_rows:valid.length,original_qty:q.original??null,adjusted_qty:q.adjusted??null,allocated_qty:q.allocated??null,shipped_qty:q.shipped??null,
      ordered_qty:single?number(single.order_qty_origin):null,source_short_qty:q.currentShort??null,raw_short_qty:q.rawShort??null,
      sales_person:consistent('sales_person'),order_person:consistent('order_person'),carrier:consistent('logistics_provider'),
      sku_allocation_rate:q.skuRate??null,allocation_rate:q.allocationRate??null,
      business_stage:new Set(valid.map(row=>row.prapare_order_status)).size===1?valid[0]?.prapare_order_status:null,
      quantity_issue:valid.length===0?'无有效执行明细':q.original===null||q.adjusted===null?'拆单需求不一致或缺失，归并未确认':''});
  }
  const pending=facts.filter(row=>Number(row.detailstatus)===10&&String(row.is_stat)==='1'&&row.prapare_order_status==='备单中');
  const orderGroups=new Map();
  for(const q of quantities) {
    if(q.valid_rows===0)continue;
    const id=JSON.stringify([q.order_no,q.customer_code,q.base]);
    if(!orderGroups.has(id))orderGroups.set(id,[]);
    orderGroups.get(id).push(q);
  }
  for(const group of orderGroups.values()) {
    const complete=group.every(q=>q.original_qty!==null&&q.source_short_qty!==null);
    const demand=complete?group.reduce((sum,q)=>sum+q.original_qty,0):0;
    const short=complete?group.reduce((sum,q)=>sum+q.source_short_qty,0):0;
    for(const q of group) q.order_allocation_rate=complete&&demand>0?100*(demand-short)/demand:null;
  }
  const pendingGroups=new Map();
  for(const row of pending) {const id=JSON.stringify([row.fromorderno,row.source_material_code||row.material_code]);if(!pendingGroups.has(id))pendingGroups.set(id,[]);pendingGroups.get(id).push(row);}
  const eligible=[...pendingGroups.values()].map(group=>groupedQuantities(group));
  const covered=eligible.filter(q=>q.rawShort!==null&&q.adjusted!==null&&q.adjusted>=0);
  const complete=duplicate.size===0&&covered.length===pendingGroups.size&&pendingGroups.size>0;
  const pendingIssues={splitDemandGroups:[...pendingGroups.values()].filter(group=>group.length>1&&groupedQuantities(group).adjusted===null).length,
    unresolvedAdjustedDemand:eligible.filter(q=>q.adjusted===null).length,
    missingAdjustedField:pending.filter(row=>number(row.adjust_order_qty)===null).length,
    missingOrInconsistentAllocation:eligible.filter(q=>q.allocated===null).length};
  const demand=covered.reduce((sum,q)=>sum+q.adjusted,0),raw=covered.reduce((sum,q)=>sum+q.rawShort,0);
  const preparing=new Map();
  for(const row of pending) {
    const id=row.cust_order_no;
    if(!preparing.has(id))preparing.set(id,[]);
    preparing.get(id).push(deadlineStatus(row.lastbillingdate,now));
  }
  const states=[...preparing].map(([order,statuses])=>({order,status:statuses.includes('overdue')?'overdue':statuses.includes('warning')?'warning':statuses.includes('unknown')?'unknown':'normal'}));
  const preparingStates=new Map(states.map(row=>[row.order,row.status]));
  for(const q of quantities) if(q.business_stage==='备单中') q.preparing_status=preparingStates.get(q.order_no)??'unknown';
  const nodes=nodeMetrics(facts,now);
  const nodeStates=new Map(nodes.states.map(row=>[row.order,row.status]));
  for(const q of quantities)q.node_status=nodeStates.get(q.order_no)??'unknown';
  return {quantities,sourceRows:rows.length,duplicateExecutionKeys:duplicate.size,readAt:new Date(now).toISOString(),
    nodes,
    pendingGroups:pendingGroups.size,pendingCoverage:covered.length,pendingIssues,pendingRawShortQty:complete?raw:null,
    pendingAllocationRate:complete&&demand>0?100*(demand-raw)/demand:null,
    preparingStates:states,preparingOverdue:states.filter(row=>row.status==='overdue').length,
    preparingWarning:states.filter(row=>row.status==='warning').length,preparingUnknown:states.filter(row=>row.status==='unknown').length,
    missingFields:{virtualFlag:facts.filter(row=>number(row.is_virtual)===null).length,
      groupingCode:facts.filter(row=>!row.source_material_code).length,
      latestBillingAt:pending.filter(row=>shanghaiTime(row.lastbillingdate)===null).length},
    gaps:{shipmentRate:'虚拟标志存在空值，产品归集编码和完整排除规则未确认；不以明细发货比例冒充全量满足率',
      cancellationRate:'主表为执行明细，尚不能证明覆盖全部O接收订单；可读取作废事件，不代替完整订单分母',
      changeRate:'改单量含义及有效提报归并尚未确认；严重值不等号在文档中存在冲突',
      onTimeRate:'缺GPS进入围栏/人工到货确认时间；关单和签收数量不能代替实际到货时间'}};
}

export function comparisonMetrics(facts,dimension,shortages=null,{now=Date.now()}={}) {
  const groups=new Map();
  for(const row of facts) {
    const name=row[dimension]||'未提供归属';
    if(!groups.has(name))groups.set(name,[]);
    groups.get(name).push(row);
  }
  return [...groups].map(([group_name,rows])=>{
    const valid=rows.filter(row=>Number(row.detailstatus)===10&&String(row.is_stat)==='1');
    const computed=computeOrderMetrics(rows,{now});
    const orders=new Set(valid.map(row=>row.cust_order_no));
    const preparing=new Set(valid.filter(row=>row.prapare_order_status==='备单中').map(row=>row.cust_order_no));
    const q=computed.quantities.filter(row=>orders.has(row.order_no)&&row.valid_rows>0);
    const complete=q.length>0&&q.every(row=>row.original_qty!==null&&row.source_short_qty!==null);
    const demand=complete?q.reduce((sum,row)=>sum+row.original_qty,0):0;
    const missing=complete?q.reduce((sum,row)=>sum+row.source_short_qty,0):0;
    const orderRates=new Map();
    for(const order of orders) {
      const lines=q.filter(row=>row.order_no===order);
      const covered=lines.length>0&&lines.every(row=>row.original_qty!==null&&row.source_short_qty!==null);
      const total=covered?lines.reduce((sum,row)=>sum+row.original_qty,0):0;
      orderRates.set(order,total>0?100*(total-lines.reduce((sum,row)=>sum+row.source_short_qty,0))/total:null);
    }
    const buckets=[0,0,0,0,0];
    for(const rate of orderRates.values())if(rate!==null)buckets[rate<70?0:rate<80?1:rate<90?2:rate<95?3:4]++;
    const pendingKeys=new Set(valid.filter(row=>row.prapare_order_status==='备单中').map(row=>JSON.stringify([row.executeorderno,row.material_code])));
    const linked=shortages===null?[]:shortages.filter(row=>valid.some(fact=>fact.executeorderno===row.execution_order&&fact.material_code===row.sku));
    const covered=new Map();
    for(const row of linked){const id=JSON.stringify([row.execution_order,row.sku]);if(number(row.after_inventory_short_qty)!==null&&Number(row.source_rows)===1)covered.set(id,Number(row.after_inventory_short_qty));}
    const stages=[['allocation','备单中'],['dispatch','派车中'],['loading','装车中'],['transit','在途'],[null,'状态未确认']].map(([stage,name])=>{
      const states=computed.nodes.states.filter(row=>row.stage===stage);
      return {name,total:states.length,overdue:states.filter(row=>row.status==='overdue').length,warning:states.filter(row=>row.status==='warning').length,
        preparing:states.filter(row=>preparing.has(row.order)).length,orders:states.map(row=>row.order),
        overdueOrders:states.filter(row=>row.status==='overdue').map(row=>row.order),warningOrders:states.filter(row=>row.status==='warning').map(row=>row.order),
        preparingOrders:states.filter(row=>preparing.has(row.order)).map(row=>row.order)};
    });
    return {group_name,stages,order_ids:[...orders],preparing_order_ids:[...preparing],
      overdue_order_ids:computed.nodes.states.filter(row=>row.status==='overdue').map(row=>row.order),
      warning_order_ids:computed.nodes.states.filter(row=>row.status==='warning').map(row=>row.order),
      shortage_order_ids:[...new Set(linked.filter(row=>Number(row.source_rows)===1&&number(row.after_inventory_short_qty)>0).map(row=>row.order_no))],
      rate_order_ids:buckets.map((_,i)=>[...orderRates].filter(([,rate])=>rate!==null&&(rate<70?0:rate<80?1:rate<90?2:rate<95?3:4)===i).map(([order])=>order)),
      source_orders:orders.size,source_order_count:new Set(rows.map(row=>row.cust_order_no)).size,
      overdue:computed.nodes.overdue,warning:computed.nodes.warning,unknown:computed.nodes.unknown,preparing:preparing.size,
      shortage_qty:covered.size?[...covered.values()].reduce((sum,value)=>sum+value,0):pendingKeys.size===0?0:null,
      shortage_coverage:covered.size,shortage_total:pendingKeys.size,
      shortage_orders:shortages===null?null:new Set(linked.filter(row=>Number(row.source_rows)===1&&number(row.after_inventory_short_qty)>0).map(row=>row.order_no)).size,
      allocation_rate:complete&&demand>0?100*(demand-missing)/demand:null,
      buckets,rate_coverage:[...orderRates.values()].filter(rate=>rate!==null).length,rate_total:orders.size};
  }).sort((a,b)=>a.group_name.localeCompare(b.group_name,'zh-CN'));
}
