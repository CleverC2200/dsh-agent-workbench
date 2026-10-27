const validNumber=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
export function summaryDetails(computed,facts=[]) {
  const valid=computed?.quantities.filter(row=>row.valid_rows>0)??[];
  const sourceLines=new Map();
  const key=(order,customer,sku,base)=>JSON.stringify([order,customer,sku,base]);
  for(const line of facts){if(Number(line.detailstatus)!==10||String(line.is_stat)!=='1')continue;const id=key(line.cust_order_no,line.cust_code,line.material_code,line.belong_base);if(!sourceLines.has(id))sourceLines.set(id,[]);sourceLines.get(id).push(line);}
  const opened=new Set(['派车中','已开未派','已派未到','厂外侯车','厂外候车','厂内侯车','厂内候车','装车中','备单完毕','运输中','在途','已发货','已完成']);
  const qty=rows=>{
    if(!computed||computed.duplicateExecutionKeys>0)return null;
    let sum=0;
    for(const row of rows){
      const lines=sourceLines.get(key(row.order_no,row.customer_code,row.sku,row.base))??[];
      const rates=new Set(lines.map(line=>validNumber(line.packingunitconvertrate)&&Number(line.packingunitconvertrate)>0?Number(line.packingunitconvertrate):null));
      if(rates.size!==1||rates.has(null)||!lines.length)return null;
      const executionLines=new Map();
      for(const line of lines){const id=JSON.stringify([line.executeorderno,line.executeorderlineno]);if(executionLines.has(id)||!validNumber(line.adjust_order_qty)||Number(line.adjust_order_qty)<0)return null;executionLines.set(id,line);}
      sum+=[...executionLines.values()].reduce((total,line)=>total+Number(line.adjust_order_qty)*Number(line.packingunitconvertrate),0);
    }
    return sum;
  };
  const pending=valid.filter(row=>row.business_stage==='备单中'),ready=valid.filter(row=>opened.has(row.business_stage));
  const rate=rows=>{
    const covered=rows.filter(row=>validNumber(row.original_qty)&&Number(row.original_qty)>0&&validNumber(row.source_short_qty)&&Number(row.source_short_qty)>=0);
    const demand=covered.reduce((sum,row)=>sum+Number(row.original_qty),0),short=covered.reduce((sum,row)=>sum+Number(row.source_short_qty),0);
    return {value:demand>0?100*Math.abs(demand-short)/demand:null,covered:covered.length,total:rows.length};
  };
  const rates={pending:rate(pending),opened:rate(ready),total:rate(valid)};
  const stateQuantity=(status,stage)=>{const ids=new Set((computed?.nodes.states??[]).filter(row=>row.status===status&&(!stage||row.stage===stage)).map(row=>row.order));return qty(valid.filter(row=>ids.has(row.order_no)));};
  return {pending:qty(pending),opened:qty(ready),total:qty(valid),pendingRate:rates.pending.value,openedRate:rates.opened.value,totalRate:rates.total.value,rateCoverage:rates,stateQuantity};
}
export function renderSummaryDetails(document,computed,facts,selected,shortageSource) {
  document.querySelector('.author-questions')?.remove();
  const details=summaryDetails(computed,facts);
  const openedStatuses=new Set(['派车中','已开未派','已派未到','厂外侯车','厂外候车','厂内侯车','厂内候车','装车中','备单完毕','运输中','在途','已发货','已完成']);
  const sourceShortage=openedOnly=>{
    if(!shortageSource)return null;
    const keys=new Set(facts.filter(row=>Number(row.detailstatus)===10&&String(row.is_stat)==='1'&&(!openedOnly||openedStatuses.has(row.prapare_order_status))).map(row=>JSON.stringify([row.executeorderno,row.material_code,row.cust_code])));
    const rows=shortageSource.rows.filter(row=>keys.has(JSON.stringify([row.execution_order,row.sku,row.customer_code])));
    if(!rows.length||rows.some(row=>Number(row.source_rows)!==1||!validNumber(row.after_inventory_short_qty)))return null;
    return rows.reduce((sum,row)=>sum+Number(row.after_inventory_short_qty),0);
  };
  const quantity=value=>value===null?'—件':Number(value.toFixed(2)).toLocaleString('zh-CN')+'件';
  const percent=value=>value===null?'—':value.toFixed(1)+'%';
  const coverage=value=>`覆盖率 ${value.total?(100*value.covered/value.total).toFixed(1):'0.0'}%`;
  const coverageNode=value=>{const small=document.createElement('small');small.className='metric-coverage';small.textContent=coverage(value);small.title=`可计算明细 ${value.covered}/${value.total}。`+'按订单与SKU归并明细统计；仅对原始数量和缺货量有效且分母大于零的明细加权，缺值不补零，不代表全量满足率';return small;};
  const append=(target,text)=>{if(!target)return;const small=document.createElement('small');small.className='metric-extra';small.textContent=text;small.title='现行订单数量 adjust_order_qty 按源换算率折算为EA件；缺数量、换算或重复键时保持未知';target.append(small);};
  for(const card of document.querySelectorAll('.summary.fulfillment-summary > .metric')){
    card.querySelectorAll('.metric-extra,.metric-period,.metric-coverage').forEach(node=>node.remove());
    const period=document.createElement('small');period.className='metric-period';period.textContent=`统计周期：${selected.start.slice(5)} 00:00—${selected.end_exclusive.slice(5)} 00:00`; period.title=`订单创建时间 ${selected.start} 至 ${selected.end_exclusive}（不含结束日）；库存以来源快照日为准`;card.prepend(period);
  }
  for(const group of document.querySelectorAll('.summary.fulfillment-summary:not(.item-summary)')){
    const cards=[...group.querySelectorAll(':scope > .metric')],warehouse=group.classList.contains('warehouse-summary');
    append(cards[0]?.querySelector('.metric-head strong'),quantity(warehouse?details.opened:details.pending));
    for(const span of cards[0]?.querySelectorAll('[data-breakdown="open-total"] > span')??[]){append(span,quantity(span.textContent.startsWith('总数')?details.total:warehouse?details.pending:details.opened));}
    for(const[index,status]of [[1,'overdue'],[2,'warning']]){
      append(cards[index]?.querySelector('.metric-head strong'),quantity(details.stateQuantity(status)));
      [...cards[index]?.querySelectorAll('.metric-breakdown > span')??[]].forEach((span,i)=>append(span,quantity(details.stateQuantity(status,['allocation','dispatch','loading','transit'][i]))));
    }
    const rateCard=cards[warehouse?3:4],breakdown=rateCard?.querySelector('.metric-breakdown');
    if(rateCard){rateCard.classList.add('satisfaction-metric');const strong=rateCard.querySelector('.metric-head strong');if(strong){strong.textContent=percent(warehouse?details.openedRate:details.pendingRate);strong.title='仅对可计算明细按原始需求量与当前缺货量加权；缺值不补零，不代表全量满足率';strong.after(coverageNode(details.rateCoverage[warehouse?'opened':'pending']));}}
    if(breakdown){breakdown.replaceChildren();for(const[label,name]of [[warehouse?'未开订单满足率':'已开订单满足率',warehouse?'pending':'opened'],['总订单满足率','total']]){const span=document.createElement('span');span.textContent=label;const strong=document.createElement('strong');strong.textContent=percent(details.rateCoverage[name].value);span.append(strong,coverageNode(details.rateCoverage[name]));breakdown.append(span);}}
    if(!warehouse){const foot=cards[3]?.querySelector('.metric-breakdown');if(foot){foot.replaceChildren();for(const[label,value]of [['已开缺货量',sourceShortage(true)],['总缺货量',sourceShortage(false)]]){const span=document.createElement('span');span.textContent=label;append(span,quantity(value));foot.append(span);}}}
  }
  const item=document.querySelector('.item-summary .metric strong');append(item,quantity(details.pending));
}
