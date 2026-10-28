const text=value=>value===null||value===undefined||value===''?'—':String(value);
const svgNode=(name,attributes={},content)=>{
  const node=document.createElementNS('http://www.w3.org/2000/svg',name);
  for(const [key,value] of Object.entries(attributes))node.setAttribute(key,String(value));
  if(content!==undefined)node.textContent=content;
  return node;
};
function plot(svg,labels,series,drill) {
  if(!svg)return;
  svg.replaceChildren();
  const max=Math.max(1,...series.flatMap(line=>line.values));
  svg.append(svgNode('path',{d:'M48 20V204H610',fill:'none',stroke:'#dce2eb'}));
  for(let i=0;i<=4;i++)svg.append(svgNode('text',{x:40,y:204-i*44,'text-anchor':'end',fill:'#7b8696','font-size':11},Math.round(max*i/4)));
  labels.forEach((label,i)=>svg.append(svgNode('text',{x:65+i*530/Math.max(1,labels.length-1),y:229,'text-anchor':'middle',fill:'#566276','font-size':12},label)));
  series.forEach((line,index)=>{
    const points=line.values.map((value,i)=>[65+i*530/Math.max(1,labels.length-1),204-value/max*176]);
    svg.append(svgNode('polyline',{points:points.map(point=>point.join(',')).join(' '),fill:'none',stroke:line.color,'stroke-width':2}));
    points.forEach(([x,y],i)=>{
      const node=svgNode('circle',{cx:x,cy:y,r:5,fill:line.color,tabindex:0,role:'button','aria-label':`${labels[i]}，${line.name} ${line.values[i]}张，查看订单`});
      node.append(svgNode('title',{},`${labels[i]} · ${line.name} ${line.values[i]}张`));
      const open=()=>drill(line.orders[i]);node.addEventListener('click',open);node.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();open();}});svg.append(node);
    });
    svg.append(svgNode('text',{x:50+index*135,y:12,fill:line.color,'font-size':11},line.name));
  });
}
export function renderCharts(computed,total,drill) {
  if(!computed) {
    const message='订单明细字段不足，节点状态与满足率图表未评估';
    for(const svg of document.querySelectorAll('svg.delivery-line-chart'))svg.replaceChildren(svgNode('text',{x:80,y:120,fill:'#8d98a8'},message));
    document.getElementById('orderStatusChartDetail').textContent=message;
    return;
  }
  const names=['备单中','派车中','装车中','在途'];
  const stages=['allocation','dispatch','loading','transit'];
  const definitions=[['总量','#657fa3',null],['预警','#e4a429','warning'],['超时','#e52b42','overdue'],['正常','#22a478','normal']];
  const series=definitions.map(([name,color,status])=>{
    const orders=stages.map(stage=>computed.nodes.states.filter(row=>row.stage===stage&&(!status||row.status===status)).map(row=>row.order));
    return {name,color,orders,values:orders.map(list=>list.length)};
  });
  const charts=document.querySelectorAll('svg.delivery-line-chart');
  plot(charts[0],names,series,drill);
  plot(charts[1],['<70%','70–80%','80–90%','90–95%','≥95%'],[{name:'订单数',color:'#e52b42',values:total?.buckets??[0,0,0,0,0],orders:total?.rate_order_ids??[[],[],[],[],[]]}],drill);
  for(const [index,description] of [
    '按当前有效节点统计订单；超时、预警、正常仅统计具备判定依据的订单。点击数据点查看对应订单。',
    '按完整原始需求与当前缺货量计算占单满足率，再按订单统计区间；数量缺失的订单不分档。点击数据点查看对应订单。',
  ].entries()) {
    const card=charts[index]?.closest('.dimension-card');
    if(card){card.querySelector('p').textContent=description;const note=card.querySelector('.dimension-note');if(note)note.textContent=description;}
  }
  const detail=document.getElementById('orderStatusChartDetail');
  if(detail)detail.textContent=`当前节点订单按订单去重；缺失时限或状态未确认 ${computed.nodes.unknown}张，不计作正常。满足率区间覆盖 ${total?.rate_coverage??0}/${total?.rate_total??0}张订单，未覆盖订单不分档。`;
}
let coordinationRows=[],coordinationPage=0,coordinationLimit=20;
let coordinationServer=null, requestCoordinationPage;
const columns=[
  ['基本信息','base','基地'],['基本信息','sku','产品编号'],['基本信息','material_name','产品名称'],['基本信息','product_item','品项'],['基本信息','series','系列'],['基本信息','stock_date','库存日期'],
  ['销售信息','main_plan_initial','主品销售计划（初版）'],['销售信息','main_plan_adjusted','主品销售计划（纠偏）'],['销售信息','bp_plan_initial','BP销售计划（初版）'],['销售信息','bp_plan_adjusted','BP销售计划（纠偏）'],['销售信息','transfer_plan_initial','调拨出库计划（初版）'],['销售信息','transfer_plan_adjusted','调拨出库计划（纠偏）'],['销售信息','next_month_sales_plan','下月销售计划'],
  ['生产信息','production_plan','生产计划'],['生产信息','production_in_qty','生产入库量'],
  ['库存信息','stock_qty','现库存'],['库存信息','available_qty','可用库存'],['库存信息','over60_source_qty','60天以上库存（源口径）'],
];
export function renderCoordination(result,{reset=true}={}) {
  if(reset){coordinationRows=result?.rows??[];coordinationServer=result?.serverPage?result:null;coordinationPage=coordinationServer?result.page-1:0;if(coordinationServer)coordinationLimit=result.size;}
  const table=document.getElementById('itemCoordinationTable');
  table.parentElement.classList.add('fulfillment-table-scroll');
  if(!table.querySelector('colgroup')) { const widths=document.createElement('colgroup'); for(let i=0;i<columns.length;i++){const col=document.createElement('col');col.style.width=(i===0?80:i===1?130:i===2?260:145)+'px';widths.append(col);} table.prepend(widths); }
  const headers=table.tHead;headers.replaceChildren();
  const groups=headers.insertRow(),labels=headers.insertRow();
  for(const [index,name] of ['基本信息','销售信息','生产信息','库存信息'].entries()) {
    const th=document.createElement('th');th.textContent=name;th.colSpan=columns.filter(column=>column[0]===name).length;th.className=`coord-group-${index+1}`;groups.append(th);
  }
  for(const [group,,label] of columns){const th=document.createElement('th');th.textContent=label;th.className=`coord-group-${['基本信息','销售信息','生产信息','库存信息'].indexOf(group)+1}`;labels.append(th);}
  const select=document.getElementById('itemCoordinationBase');
  if(reset){const previous=select.value;select.replaceChildren(new Option('全部基地',''));for(const base of [...new Set(result?.baseOptions??coordinationRows.map(row=>row.base).filter(Boolean))].sort())select.append(new Option(base,base));if(previous&&![...select.options].some(option=>option.value===previous))select.append(new Option(previous,previous));select.value=previous;}
  const search=document.getElementById('itemCoordinationSearch').value.trim().toLowerCase();
  const rows=coordinationServer?coordinationRows:coordinationRows.filter(row=>(!select.value||row.base===select.value)&&(!search||[row.sku,row.material_name,row.product_item].some(value=>String(value??'').toLowerCase().includes(search))));
  const total=coordinationServer?.total??rows.length;
  const pages=Math.max(1,Math.ceil(total/coordinationLimit));coordinationPage=Math.min(Math.max(0,coordinationPage),pages-1);
  const body=table.tBodies[0];body.replaceChildren();
  for(const row of coordinationServer?rows:rows.slice(coordinationPage*coordinationLimit,(coordinationPage+1)*coordinationLimit)){
    const line=body.insertRow();for(const [group,key] of columns){const td=line.insertCell();td.textContent=text(row[key]);td.className=`coord-group-${['基本信息','销售信息','生产信息','库存信息'].indexOf(group)+1}`;if(td.textContent==='—')td.title='当前源字段缺失或存在重复记录，未补零';}
  }
  if(!body.rows.length){const td=body.insertRow().insertCell();td.colSpan=columns.length;td.textContent='当前授权和筛选范围无产销协同记录';}
  document.getElementById('itemCoordinationCount').textContent=coordinationServer?`共${total}条`:`共${rows.length}条（当前授权${coordinationRows.length}条）`;
  document.getElementById('itemCoordinationPageInfo').textContent=`第 ${coordinationPage+1} / ${pages} 页`;
  document.getElementById('itemCoordinationPrev').disabled=coordinationPage===0;
  document.getElementById('itemCoordinationNext').disabled=coordinationPage>=pages-1;
  document.querySelector('#itemCoordinationPanel .dimension-note').textContent='使用当前授权范围的基地SKU库存及源销售、生产计划；按基本、销售、生产、库存分组。数量沿源单位，不将未指定期间的计划冒充未来5日计划；缺失字段不补零。';
}
export function clearPanels() {
  coordinationRows=[];coordinationPage=0;
  renderCoordination(null);
  for(const svg of document.querySelectorAll('svg.delivery-line-chart'))svg.replaceChildren(svgNode('text',{x:80,y:120,fill:'#8d98a8'},'等待读取当前授权数据'));
  document.getElementById('orderStatusChartDetail').textContent='等待读取当前授权数据';
}
export function bindPanelControls(loadPage) {
  requestCoordinationPage=loadPage;
  const update=()=>{if(requestCoordinationPage)void requestCoordinationPage({page:coordinationPage+1,size:coordinationLimit,base:document.getElementById('itemCoordinationBase').value||null,search:document.getElementById('itemCoordinationSearch').value.trim()||null});else renderCoordination(null,{reset:false});};
  const next=document.getElementById('itemCoordinationNext');
  const nav=document.createElement('nav');nav.className='order-pagination';nav.setAttribute('aria-label','产销协同分页');
  const size=document.createElement('select');size.setAttribute('aria-label','每页条数');
  for(const n of [20,50,100])size.append(new Option(`${n}条/页`,String(n)));
  next.after(nav);
  nav.append(document.getElementById('itemCoordinationCount'),size,document.getElementById('itemCoordinationPrev'),document.getElementById('itemCoordinationPageInfo'),next);
  size.addEventListener('change',()=>{coordinationLimit=Number(size.value);coordinationPage=0;update();});
  for(const id of ['itemCoordinationSearch','itemCoordinationBase'])document.getElementById(id).addEventListener(id.endsWith('Base')?'change':'input',()=>{coordinationPage=0;update();});
  document.getElementById('itemCoordinationPrev').addEventListener('click',()=>{coordinationPage--;update();});
  document.getElementById('itemCoordinationNext').addEventListener('click',()=>{coordinationPage++;update();});
}
