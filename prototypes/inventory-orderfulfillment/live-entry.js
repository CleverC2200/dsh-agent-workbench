import { ready, call, publish, reportElements, action } from '../../business/shared/channel.js';
import { quotePage } from '../../src/page-interaction/quote.ts';
import { createPageViewState } from '../../business/shared/view-state.js';
import { computeOrderMetrics, comparisonMetrics } from './order-metrics.mjs';
import {renderCharts,renderCoordination,clearPanels,bindPanelControls} from './live-panels.js';
import {
  createFulfillmentReader,
  createLoadOwner,
  shanghaiToday,
  nextDay,
  plannedShippingDays,
  batchAges,
} from './live-model.mjs';

const configNode = document.getElementById('agent-sql-config');
const config = configNode ? JSON.parse(configNode.textContent) : null;
const localNode = document.getElementById('agent-sql-direct');
const localPreview = localNode ? JSON.parse(localNode.textContent) : null;
const status = document.getElementById('prototypeStatus');
const view = createPageViewState('inventory-orderfulfillment');
const owner = createLoadOwner();
const reader =
  config?.agentId === 'inventory-orderfulfillment'
    ? createFulfillmentReader(config, async (_request, options) => {
        if (localPreview) {
          if (localPreview.path !== '/api/agents/orderfulfillment/query')
            throw Error('INVALID_SQL_TRANSPORT');
          const response = await fetch(localPreview.path, {
            method: 'POST',
            signal: options.signal,
            headers: {
              'Content-Type': 'application/json',
              'X-SQL-Preview': localPreview.token,
            },
            body: JSON.stringify({
              queryId: options.queryId,
              parameters: options.values,
            }),
          });
          const result = await response.json();
          if (!response.ok)
            throw Object.assign(Error(result.message ?? 'SOURCE_QUERY_FAILED'), result);
          return result;
        }
        return call(
          'sql',
          { queryId: options.queryId, parameters: options.values },
          { signal: options.signal },
        );
      })
    : null;
let connected = false,
  snapshot,
  withdraw = () => {},
  quoteTask,
  publication = Promise.resolve(),
  revision = 0;
let currentDetailData=null;
let dimension = 'deliveryDimensionPanel';
const $ = (id) => document.getElementById(id);
const value = (row, key, result) => {
  const denied = result?.rejectedColumns?.some(
    (column) =>
      (typeof column === 'string'
        ? column
        : (column.outputAlias ?? column.alias ?? column.name ?? column.columnName)) === key,
  );
  return denied
    ? '无权限'
    : row?.[key] === null || row?.[key] === undefined || row?.[key] === ''
      ? '—'
      : String(row[key]);
};
const cell = (text) => {
  const node = document.createElement('td');
  node.textContent = text;
  return node;
};
const channelLabels={jxs:'经销商',dc:'配送中心（KA-DC）',kamd:'门店（KA-MD）',kajxs:'KA经销商',bpjxs:'BP经销商',fxs:'分销商',hwkh:'海外客户',nbkh:'内部客户'};
const channelLabel=value=>value==='—'||value==='无权限'?value:channelLabels[value]??`类型名称待确认（${value}）`;
const withUnit=(value,unit)=>value==='—'||value==='无权限'?value:`${value} ${unit}`;
const quantityText=(row,field,result)=>withUnit(value(row,field,result),'箱');
const channelFilter=document.querySelector('#deliveryChannelFilter');
channelFilter.replaceChildren();
for(const [code,label] of [['','全部客户类型'],...Object.entries(channelLabels),...['myjxs','nbkhwl','skjxs'].map(code=>[code,channelLabel(code)])]) {
  const option=document.createElement('option');option.value=code;option.textContent=label;channelFilter.append(option);
}
function setMetric(node, text) {
  const unit = node.querySelector('.metric-unit');
  node.replaceChildren(document.createTextNode(text), ...(unit ? [unit] : []));
}
const key = (row) => JSON.stringify([row.order_no, row.customer_code, row.sku, row.base]);
const filtersIds = [
  'fulfillmentBaseFilter',
  'deliveryOrgFilter',
  'deliveryChannelFilter',
  'warehouseProviderFilter',
  'deliveryOrderNumberQuery',
  'deliveryCustomerQuery',
  'deliveryRegionQuery',
  'deliveryBaseQuery',
  'deliveryStatusQuery',
];
function selectedFilters() {
  const today = shanghaiToday(),
    org = $('deliveryOrgFilter').value;
  return {
    start: today,
    end_exclusive: nextDay(today),
    base: $('deliveryBaseQuery').value || $('fulfillmentBaseFilter').value || null,
    region:org.startsWith('area:')?org.slice(5): org.startsWith('region:') && org.includes('大区') ? org.slice(7) : null,
    province:
      $('deliveryRegionQuery').value ||
      (org.startsWith('province:')?org.slice(9):org.startsWith('region:') && !org.includes('大区') ? org.slice(7) : null),
    sales_group: org.startsWith('org:') ? org.slice(4) : null,
    channel: $('deliveryChannelFilter').value || null,
    customer: $('deliveryCustomerQuery').value.trim() || null,
    order: $('deliveryOrderNumberQuery').value.trim() || null,
    sku: null,
    carrier:
      dimension === 'warehouseDimensionPanel' ? $('warehouseProviderFilter').value || null : null,
  };
}
function placeholder(body, message = '待数据接入') {
  if (!body) return;
  body.replaceChildren();
  const row = body.insertRow();
  const target = row.insertCell();
  target.colSpan = Math.max(
    1,
    body.closest('table').querySelectorAll('thead tr:last-child th').length,
  );
  target.textContent = message;
}
function clear(message = '正在读取当前授权数据…') {
  clearPanels();
  currentDetailData=null;
  $('salesConfirmOverlay').hidden=true;
  $('confirmationHistoryOverlay').hidden=true;
  for(const id of ['salesConfirmOrder','confirmationHistoryStatus','confirmationHistoryDetails'])$(id).textContent='';
  snapshot = undefined;
  withdraw();
  withdraw = () => {};
  quoteTask?.abort();
  for (const body of document.querySelectorAll('tbody')) placeholder(body, message);
  for (const node of document.querySelectorAll('.metric strong')) setMetric(node, '—');
  for (const analysis of document.querySelectorAll('.fulfillment-analysis')) {
    const title = analysis.querySelector('h3');
    if (title) title.textContent = message;
    const p = analysis.querySelector(':scope > p');
    if (p) p.textContent = '仅展示当前授权范围的数据，未接入的指标保持未知。';
    const stamp = analysis.querySelector('.fulfillment-analysis-head > span');
    if (stamp) stamp.textContent = '数据待加载';
  }
  const current = ++revision;
  if (connected)
    publication = publication
      .catch(() => {})
      .then(async () => {
        if (current !== revision) return;
        try {
          await publish({
            source: localPreview ? 'direct-doris' : 'gea-governed-sql',
            state: 'unavailable',
            parts: {},
          });
        } catch {}
      });
  status.textContent = message;
}
function activateTab(button) {
  const list = button.closest('[role="tablist"]');
  for (const tab of list.querySelectorAll('[role="tab"]')) {
    const active = tab === button;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    const panel = $(tab.getAttribute('aria-controls'));
    if (panel) panel.hidden = !active;
  }
  if (button.dataset.fulfillmentDimension) {
    dimension = button.dataset.fulfillmentDimension;
    for (const group of document.querySelectorAll('.summary.fulfillment-summary')) {
      group.hidden = group.classList.contains('item-summary')
        ? dimension !== 'itemDimensionPanel'
        : group.classList.contains('warehouse-summary')
          ? dimension !== 'warehouseDimensionPanel'
          : dimension !== 'deliveryDimensionPanel';
    }
    const mainAnalysis = document.querySelector('#fulfillmentView > .fulfillment-analysis');
    if (mainAnalysis) mainAnalysis.hidden = dimension === 'itemDimensionPanel';
    for (const node of document.querySelectorAll('.delivery-filter-only'))
      node.hidden = dimension === 'warehouseDimensionPanel';
    $('warehouseProviderLabel').hidden = $('warehouseProviderFilter').hidden =
      dimension !== 'warehouseDimensionPanel';
    document
      .querySelector('.fulfillment-dimensions')
      .classList.toggle('delivery-dimension-active', dimension === 'deliveryDimensionPanel');
  }
  if (button.dataset.itemProgressTab)
    $('itemCoordinationFilters').hidden =
      button.dataset.itemProgressTab !== 'itemCoordinationPanel';
}
for (const button of document.querySelectorAll('[role="tab"][aria-controls]'))
  button.addEventListener('click', () => {
    activateTab(button);
    saveView();
    if (button.dataset.fulfillmentDimension && connected) void load();
  });
function saveView() {
  view.update({
    ...Object.fromEntries(filtersIds.map((id) => [id, $(id).value])),
    dimension,
  });
}
function issue(error) {
  return /DENIED|FORBIDDEN|NOT_ALLOWED/.test(error?.code ?? '')
    ? '当前用户无权限查看：' + error.code
    : '数据读取失败：' + (error?.code ?? error?.message ?? 'QUERY_FAILED');
}
function get(results, id) {
  const item = results[id];
  return item?.status === 'fulfilled' ? item.value : null;
}
const metricCache=new WeakMap();
function calculatedMetrics(results) {
  const facts=get(results,'orders.facts');
  if(!facts||!facts.rows.every(row=>Object.hasOwn(row,'executeorderno')&&Object.hasOwn(row,'executeorderlineno')))return null;
  if(!metricCache.has(facts))metricCache.set(facts,computeOrderMetrics(facts.rows));
  return metricCache.get(facts);
}
function sourceCountsAgree(results) {
  const facts=get(results,'orders.facts'),summary=get(results,'orders.summary');
  if(!facts||!summary)return true;
  if(facts.rows.some(row=>!Object.hasOwn(row,'cust_order_no')))return true;
  const orders=new Set(facts.rows.map(row=>row.cust_order_no).filter(value=>value!==null&&value!==undefined));
  return Number(summary.rows[0]?.source_orders)===orders.size;
}
function completeOrderRows(facts) {
  const aliases={order_no:'cust_order_no',customer_code:'cust_code',sku:'material_code',created_at:'header_addtime',customer_name:'cust_name',base:'belong_base',region:'region_name',province:'province_region_name',sales_group:'sales_group_name',channel:'cust_type',source_status:'prapare_order_status',material_name:'material_name',sales_person:'sales_person',order_person:'order_person',carrier:'logistics_provider'};
  return {...facts,rows:facts.rows.filter(row=>Number(row.detailstatus)===10&&String(row.is_stat)==='1').map(row=>Object.fromEntries(Object.entries(aliases).map(([target,source])=>[target,row[source]??null]))),rejectedColumns:[]};
}
function replaceOptions(select,choices,emptyLabel) {
  const current=select.value;
  select.replaceChildren(new Option(emptyLabel,''));
  for(const [code,label] of choices)select.append(new Option(label,code));
  if(current&&!choices.some(([code])=>code===current))select.append(new Option(current,current));
  select.value=current;
}
function updateSourceFilters(rows) {
  const values=field=>[...new Set(rows.map(row=>row[field]).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'zh-CN'));
  for(const id of ['fulfillmentBaseFilter','deliveryBaseQuery'])replaceOptions($(id),values('belong_base').map(value=>[value,value]),'全部基地');
  replaceOptions($('warehouseProviderFilter'),values('logistics_provider').map(value=>[value,value]),'全部承运商');
  replaceOptions($('deliveryOrgFilter'),[
    ...values('sales_group_name').map(value=>['org:'+value,'销售组 · '+value]),
    ...values('province_region_name').map(value=>['province:'+value,'省区 · '+value]),
    ...values('region_name').map(value=>['area:'+value,'大区 · '+value]),
  ],'全部');
}
function renderOrders(body, orders, quantities, traces, warehouse) {
  if (!body) return;
  if (!orders) {
    placeholder(body, '订单数据不可用或未获授权');
    return;
  }
  body.replaceChildren();
  const quantityMap = new Map((quantities?.rows ?? []).map((row) => [key(row), row]));
  const orderGroups=new Map();
  for(const row of orders.rows) {
    const id=JSON.stringify([row.order_no,row.customer_code,row.base]);
    if(!orderGroups.has(id))orderGroups.set(id,new Map());
    if(!orderGroups.get(id).has(key(row)))orderGroups.get(id).set(key(row),row);
  }
  const rendered=new Set();
  for (const items of orderGroups.values()) {
    const lines=[...items.values()];
    const row=lines[0];
    if(rendered.has(key(row)))continue;
    rendered.add(key(row));
    const qs=lines.map(line=>quantityMap.get(key(line)));
    const sum=field=>qs.every(q=>q&&q[field]!==null&&q[field]!==undefined)?qs.reduce((total,q)=>total+Number(q[field]),0):null;
    const same=field=>qs.every(q=>q&&q[field]!==null&&q[field]!==undefined)&&new Set(qs.map(q=>q[field])).size===1?qs[0][field]:null;
    const demand=sum('original_qty'),short=sum('source_short_qty');
    const q=qs.some(Boolean)?{original_qty:demand,adjusted_qty:sum('adjusted_qty'),allocated_qty:sum('allocated_qty'),shipped_qty:sum('shipped_qty'),ordered_qty:sum('ordered_qty'),
      order_allocation_rate:demand>0&&short!==null?100*(demand-short)/demand:null,
      business_stage:same('business_stage'),node_status:same('node_status')??'unknown',sales_person:same('sales_person'),order_person:same('order_person'),carrier:same('carrier'),
      quantity_issue:qs.map(q=>q?.quantity_issue).filter(Boolean).join('；')}:null;
    const trace = (traces?.rows ?? []).find(
      (t) =>
        t.order_no === row.order_no &&
        t.customer_code === row.customer_code &&
        (!t.sku || t.sku === row.sku),
    );
    const carrier = (warehouse?.rows ?? []).find(
      (t) =>
        t.order_no === row.order_no && t.customer_code === row.customer_code && t.base === row.base,
    );
    const flags = trace
      ? [
          trace.prepare_status,
          trace.dispatch_status,
          trace.loading_status,
          trace.transit_status,
        ].filter(Boolean)
      : [];
    let risk = flags.some((x) => x.includes('超时'))
      ? '超时'
      : flags.some((x) => x.includes('预警'))
        ? '预警'
        : flags.length === 4 && flags.every((x) => x.includes('正常'))
          ? '正常'
          : '—';
    if(q?.node_status) risk={overdue:'超时',warning:'预警',normal:'正常',unknown:'—'}[q.node_status];
    if ($('deliveryStatusQuery').value && risk !== $('deliveryStatusQuery').value) continue;
    const tr = document.createElement('tr');
    tr.className = 'delivery-order-main-row';
    const expand = cell('');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'delivery-order-expander';
    button.innerHTML =
      '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3.5 6 4.5 4.5L12.5 6"/></svg>';
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-label', '展开 SKU 明细');
    expand.append(button);
    tr.append(expand);
    const values = [
      value(row, 'order_no', orders),
      value(row, 'created_at', orders),
      value(row, 'customer_name', orders) + ' / ' + value(row, 'customer_code', orders),
      value(row, 'sales_group', orders),
      value(row, 'province', orders),
      value(row, 'region', orders),
      channelLabel(value(row, 'channel', orders)),
      q?value(q,'sales_person',quantities):value(row, 'sales_person', orders),
      q?value(q,'order_person',quantities):value(row, 'order_person', orders),
      value(row, 'base', orders),
      (q?value(q,'carrier',quantities):value(carrier, 'carrier', warehouse))==='—'?'源数据未提供':q?value(q,'carrier',quantities):value(carrier,'carrier',warehouse),
      q?.business_stage??value(row, 'source_status', orders),
      risk,
      q?.order_allocation_rate===null||q?.order_allocation_rate===undefined?'—':Number(q.order_allocation_rate).toFixed(1)+'%',
      quantityText(q, 'original_qty', quantities),
      quantityText(q, 'adjusted_qty', quantities),
      quantityText(q, 'allocated_qty', quantities),
      quantityText(q, 'shipped_qty', quantities),
      quantityText(q, 'ordered_qty', quantities),
    ];
    for (const v of values) {
      const node=cell(v);
      if(v==='—')node.title='当前授权结果缺少该字段，或完整计算条件不足；不是零';
      tr.append(node);
    }
    tr.cells[14].title=q?.quantity_issue||'整单占单满足率＝（原始数量－当前缺货量）÷原始数量；整单全部SKU有有效数量才计算';
    if (body.id === 'deliveryOrderDetailRows') {
      const confirmation=cell('');confirmation.className='confirmation-status-cell';
      const statusButton=document.createElement('button');statusButton.type='button';statusButton.className='confirmation-status';statusButton.textContent='未接入';
      statusButton.title='查看确认状态与操作记录';statusButton.addEventListener('click',()=>{
        $('confirmationHistoryStatus').textContent=`订单号：${row.order_no}；确认状态未接入`;
        $('confirmationHistoryDetails').textContent='尚未接入真实确认状态和操作记录接口，无法查询历史记录。';
        $('confirmationHistoryOverlay').hidden=false;
      });confirmation.append(statusButton);
      const operation=cell('');operation.className='confirmation-operation-cell';
      const confirmButton=document.createElement('button');confirmButton.type='button';confirmButton.className='sales-confirm-trigger';
      confirmButton.textContent='销售确认';confirmButton.title='查看销售确认信息';
      confirmButton.addEventListener('click',()=>{
        const seller=value(q,'sales_person',quantities);
        $('salesConfirmOrder').textContent=`订单号：${row.order_no}\n经销商名称：${value(row,'customer_name',orders)}\n销售人员：${seller==='—'?'源数据未提供':seller}\n确认推送给销售？\n尚未接入真实推送接口，当前仅可查看，不能提交或修改确认状态。`;
        $('salesConfirmOverlay').hidden=false;
      });
      operation.append(confirmButton);
      tr.append(confirmation, operation);
    }
    const detail = document.createElement('tr');
    detail.className = 'delivery-order-sku-row';
    detail.hidden = true;
    const content = detail.insertCell();
    content.colSpan = tr.cells.length;
    const table = document.createElement('table');
    table.className = 'delivery-order-sku-table';
    const header = table.createTHead().insertRow();
    for (const label of ['SKU 名称及编码', 'SKU 订货数量', 'SKU 缺货数量', '商品满足率']) {
      const th = document.createElement('th');
      th.textContent = label;
      header.append(th);
    }
    const skuBody=table.createTBody();
    for(const item of lines) {
      const skuQuantity=quantityMap.get(key(item));
      const line=skuBody.insertRow();
      for (const v of [
        value(item, 'material_name', orders) + ' / ' + value(item, 'sku', orders),
        quantityText(skuQuantity, 'original_qty', quantities),
        quantityText(skuQuantity, 'source_short_qty', quantities),
        skuQuantity?.sku_allocation_rate===null||skuQuantity?.sku_allocation_rate===undefined?'—':Number(skuQuantity.sku_allocation_rate).toFixed(1)+'%',
      ])line.append(cell(v));
    }
    content.append(table);
    button.addEventListener('click', () => {
      detail.hidden = !detail.hidden;
      button.setAttribute('aria-expanded', String(!detail.hidden));
    });
    body.append(tr, detail);
  }
  if (!body.children.length) placeholder(body, '当前授权与筛选范围无记录');
  const note=body.closest('section, .warehouse-detail-panel')?.querySelector('.dimension-note');
  if(note)note.textContent='按订单、客户及基地归并全部已授权明细，主行展示整单数量，展开显示SKU；缺少人员、物流及确认字段时保持未知。';
}
function renderInventory(result, ages) {
  const body = $('itemInventoryPanel').querySelector('tbody');
  if (!result) {
    placeholder(body, '库存数据不可用或未获授权');
    return;
  }
  body.replaceChildren();
  const calculatedAges=ages?batchAges(ages.rows,selectedFilters().start):[];
  for (const row of result.rows) {
    const age = calculatedAges.find(item => item.base === row.base && item.sku === row.sku);
    const tr = document.createElement('tr');
    for (const text of [
      value(row, 'material_name', result) + ' / ' + value(row, 'sku', result),
      '—',
      value(row, 'product_item', result),
      value(row, 'series', result),
      value(row, 'product_tag', result),
      value(row, 'transfer_tag', result),
      value(row, 'base', result),
      value(row, 'stock_qty', result),
      '—',
      plannedShippingDays(row)===null?'—':plannedShippingDays(row).toFixed(1)+' 天',
      value(age, 'age_lt40', ages),
      value(age, 'age_40_60', ages),
      value(age, 'age_60_90', ages),
      value(age, 'age_90_120', ages),
      value(age, 'age_ge120', ages),
    ])
      tr.append(cell(text));
    body.append(tr);
  }
  if (!body.children.length) placeholder(body, '当前授权范围无库存记录');
  const note = $('itemDimensionPanel').querySelector(':scope > .dimension-note');
  if (note)
    note.textContent =
      '源库存日期：' +
      [...new Set(result.rows.map((row) => row.stock_date).filter(Boolean))].join('、') +
      '；可发货天数按10日初版、20日纠偏、月末下月初版计划计算。批次货龄独立读取截至所选日期前一日的工厂仓快照，缺日期或负库存不计算；数量沿源单位，OEM归属未确认。';
}
function drillOrders(body,row,orderIds) {
  if(!currentDetailData)return;
  const warehousePanel=body.closest('#warehouseBaseDetailPanel,#warehouseLogisticsDetailPanel');
  const dimension=body.id==='deliveryRegionCompareRows'?'province':warehousePanel?.id==='warehouseLogisticsDetailPanel'?'carrier':'base';
  const ids=new Set(orderIds);
  const {orders,quantities,trace,warehouse}=currentDetailData;
  const filtered={...orders,rows:orders.rows.filter(item=>(row.group_name===null||(item[dimension]||'未提供归属')===row.group_name)&&ids.has(item.order_no))};
  $('deliveryStatusQuery').value='';
  renderOrders($(warehousePanel?'warehouseOrderDetailRows':'deliveryOrderDetailRows'),filtered,quantities,trace,warehouse);
  $(warehousePanel?'warehouseOrderTab':'deliveryOrderListTab').click();
  const note=$(warehousePanel?'warehouseOrderDetailPanel':'deliveryOrderListPanel').querySelector('.dimension-note');
  if(note)note.textContent=`当前下钻：${row.group_name}，${ids.size}张订单；切换筛选后按新范围重新查询。`;
}
function renderComparison(body, result, warehouse = false, calculated = null) {
  if (!body || !result) return;
  const expanded=new Set([...body.querySelectorAll('tr[data-compare-group]')].filter(row=>row.querySelector('[aria-expanded="true"]')).map(row=>row.dataset.compareGroup));
  body.replaceChildren();
  for (const row of calculated??result.rows) {
    const tr = document.createElement('tr');
    tr.dataset.compareGroup=row.group_name;
    for (const item of warehouse
      ? ['', value(row, 'group_name', result),
          calculated?(row.unknown?'≥':'')+row.overdue:'—',
          calculated?(row.unknown?'≥':'')+row.warning:'—',
          calculated?row.preparing:'—',
          calculated&&row.allocation_rate!==null?row.allocation_rate.toFixed(1)+'%':'—',
          calculated&&row.shortage_orders!==null?(row.shortage_coverage<row.shortage_total?'≥':'')+row.shortage_orders:'—']
      : [
          '',
          value(row, 'group_name', result),
          calculated?row.source_orders:value(row, 'source_orders', result),
          calculated?(row.unknown?'≥':'')+row.overdue:'—',
          calculated?(row.unknown?'≥':'')+row.warning:'—',
          calculated?row.preparing:'—',
          calculated&&row.shortage_qty!==null?(row.shortage_coverage<row.shortage_total?'≥':'')+row.shortage_qty:'—',
          calculated&&row.allocation_rate!==null?row.allocation_rate.toFixed(1)+'%':'—',
          ...(calculated?row.buckets.map(count=>row.rate_coverage<row.rate_total?'≥'+count:count):['—','—','—','—','—']),
        ])
      tr.append(cell(item));
    for(const index of warehouse?[2,3,4,6]:[2,3,4,5,8,9,10,11,12])tr.cells[index].textContent=withUnit(tr.cells[index].textContent,'张');
    if(!warehouse)tr.cells[6].textContent=withUnit(tr.cells[6].textContent,'件');
    if(calculated&&!warehouse) {
      tr.cells[2].title=`有效订单${row.source_orders}张；含作废及未纳统来源订单${row.source_order_count}张`;
      tr.cells[3].title=tr.cells[4].title=`按最末有效节点判断；信息不完整${row.unknown}张，不计作正常`;
      tr.cells[6].title=`减库存后缺货量，覆盖待备执行单SKU ${row.shortage_coverage}/${row.shortage_total}项；未覆盖不补零`;
      tr.cells[7].title=`按本组完整原始数量与当前缺货量加权的占单满足率；可计算订单${row.rate_coverage}/${row.rate_total}张，缺数量或零分母不补零；不是SKU百分比平均，也不是发货满足率`;
      for(let i=8;i<13;i++)tr.cells[i].title=`完整需求可计算订单${row.rate_coverage}/${row.rate_total}张；未知订单不分入任何区间`;
    }
    body.append(tr);
    if(calculated) {
      const detail=document.createElement('tr');detail.hidden=!expanded.has(row.group_name);
      detail.className=body.id==='deliveryRegionCompareRows'?'delivery-region-compare-detail':'delivery-base-compare-detail';
      const content=detail.insertCell();content.colSpan=warehouse?7:13;
      const wrap=document.createElement('div');wrap.className='base-status-detail-wrap';
      const table=document.createElement('table');table.className='dimension-table base-status-detail-table';
      const header=table.createTHead().insertRow();
      for(const title of ['状态','订单总数','超时订单','预警订单','未开订单数']){const th=document.createElement('th');th.textContent=title;header.append(th);}
      const inner=table.createTBody();
      for(const stage of row.stages) {
        const line=inner.insertRow();
        for(const text of [stage.name,...[stage.total,stage.overdue,stage.warning,stage.preparing].map(n=>n+' 张')])line.append(cell(text));
        for(const [i,ids] of [stage.orders,stage.orders,stage.overdueOrders,stage.warningOrders,stage.preparingOrders].entries()) {
          const link=document.createElement('button');link.type='button';link.className='compare-drilldown';link.textContent=line.cells[i].textContent;
          link.addEventListener('click',()=>drillOrders(body,row,ids));line.cells[i].replaceChildren(link);
        }
      }
      wrap.append(table);content.append(wrap);body.append(detail);
      const toggle=document.createElement('button');toggle.type='button';toggle.className='delivery-order-expander';toggle.setAttribute('aria-expanded',String(!detail.hidden));toggle.setAttribute('aria-label',`展开 ${row.group_name} 状态明细`);
      toggle.innerHTML='<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3.5 6 4.5 4.5L12.5 6"/></svg>';
      toggle.addEventListener('click',()=>{detail.hidden=!detail.hidden;toggle.setAttribute('aria-expanded',String(!detail.hidden));});tr.cells[0].append(toggle);
      const selections=warehouse?{1:row.order_ids,2:row.overdue_order_ids,3:row.warning_order_ids,4:row.preparing_order_ids,5:row.order_ids,6:row.shortage_order_ids}:{1:row.order_ids,2:row.order_ids,3:row.overdue_order_ids,4:row.warning_order_ids,5:row.preparing_order_ids,6:row.shortage_order_ids,7:row.order_ids,...Object.fromEntries(row.rate_order_ids.map((ids,i)=>[8+i,ids]))};
      for(const [index,ids] of Object.entries(selections)) {
        const target=tr.cells[Number(index)];
        if(target.textContent==='—')continue;
        const link=document.createElement('button');link.type='button';link.className='compare-drilldown';link.textContent=target.textContent;
        link.addEventListener('click',()=>drillOrders(body,row,ids));target.replaceChildren(link);
      }
    }
  }
  if (!body.children.length) placeholder(body, '当前授权范围无记录');
  const note=body.closest('section')?.querySelector('.dimension-note');
  if(note)note.textContent='按当前筛选及授权范围完整明细汇总有效订单；满足率为占单满足率，区间按订单去重，未覆盖订单不补零；≥表示仅已知部分。';
}
function renderGrantedDetails(results) {
  const sourceFacts=get(results,'orders.facts');
  const orders = get(results,'orders.facts')?completeOrderRows(get(results,'orders.facts')):get(results, 'orders.detail'),
    quantities = calculatedMetrics(results) ? {...get(results,'orders.facts'),rows:calculatedMetrics(results).quantities,returnedColumns:undefined,rejectedColumns:[]} : null,
    trace = get(results, 'trace.detail'),
    warehouse = get(results, 'warehouse.detail');
  if(currentDetailData?.factSource!==sourceFacts||!currentDetailData) {
    renderOrders($('deliveryOrderDetailRows'), orders, quantities, trace, warehouse);
    renderOrders($('warehouseOrderDetailRows'), orders, quantities, trace, warehouse);
    currentDetailData={orders,quantities,trace,warehouse,factSource:sourceFacts};
  }
  if(results['sku.detail'])renderInventory(get(results, 'sku.detail'), get(results, 'sku.age'));
  const facts=get(results,'orders.facts');
  const shortage=get(results,'shortage.detail');
  const comparison=(dimension)=>facts?comparisonMetrics(facts.rows,dimension,shortage?.rows??null):null;
  if(facts){
    const total=comparisonMetrics(facts.rows.map(row=>({...row,all_scope:'当前范围'})),'all_scope',shortage?.rows??null)[0];
    renderCharts(calculatedMetrics(results),total,ids=>drillOrders($('deliveryBaseCompareRows'),{group_name:null},ids));
    updateSourceFilters(facts.rows);
  }
  if(results['sku.detail']&&currentDetailData.inventorySource!==get(results,'sku.detail')) {
    renderCoordination(get(results,'sku.detail'));currentDetailData.inventorySource=get(results,'sku.detail');
  }
  renderComparison($('deliveryBaseCompareRows'), facts?{rows:[]}:get(results, 'orders.by_base'),false,comparison('belong_base'));
  renderComparison($('deliveryRegionCompareRows'), facts?{rows:[]}:get(results, 'orders.by_province'),false,comparison('province_region_name'));
  renderComparison(
    $('warehouseBaseDetailPanel').querySelector('tbody'),
    facts?{rows:[]}:get(results, 'orders.by_base'),
    true,
    comparison('belong_base'),
  );
  renderComparison(
    $('warehouseLogisticsDetailPanel').querySelector('tbody'),
    facts?{rows:[]}:get(results, 'orders.by_carrier'),
    true,
    comparison('logistics_provider'),
  );
  return {facts,comparison};
}
function renderSummary(results, selected) {
  const computed=calculatedMetrics(results);
  const summary = get(results, 'orders.summary')?.rows[0],
    trace = get(results, 'trace.summary')?.rows[0],
    open = get(results, 'orders.open.summary')?.rows[0],
    shortage = get(results, 'shortage.summary')?.rows[0];
  for (const group of document.querySelectorAll('.summary.fulfillment-summary')) {
    const metrics = [...group.querySelectorAll(':scope > .metric')];
    if (group.classList.contains('item-summary')) {
      const unopened=metrics[0]?.querySelector('strong');
      const missing=metrics[1]?.querySelector('strong');
      const future=metrics[2]?.querySelector('strong');
      if(unopened)setMetric(unopened,value(open,'preparing_orders',get(results,'orders.open.summary')));
      if(missing){setMetric(missing,value(shortage,'final_short_qty',get(results,'shortage.summary')));missing.title=`已关联源终缺量；覆盖${shortage?.final_quantity_coverage??'—'}/${shortage?.matched_sku_rows??'—'}项，不代表未关联订单为零`;}
      if(future){setMetric(future,'—');future.title='当前源生产计划未提供可确认的未来5日入库日期与数量，不能用月度生产计划代替';}
      const notes=group.querySelectorAll('.metric > small');
      if(notes[0])notes[0].textContent='当前授权范围有效待备订单';
      if(notes[1])notes[1].textContent='已关联源终缺，未覆盖订单不补零';
      if(notes[2])notes[2].textContent='缺少可确认的未来5日排产明细';
      continue;
    }
    const openMetric=metrics[0]?.querySelector('.metric-head strong');
    if(openMetric) {
      setMetric(openMetric,value(open,'preparing_orders',get(results,'orders.open.summary')));
      openMetric.title='有效明细状态10、备单状态为备单中的来源订单去重张数；混合状态订单可能同时出现在已开分类中';
    }
    const shortMetric=metrics[3]?.querySelector('.metric-head strong');
    if(shortMetric) {
      const complete=Number(shortage?.matched_sku_rows)>0 && Number(shortage?.matched_sku_rows)===Number(shortage?.after_inventory_coverage);
      setMetric(shortMetric,complete?value(shortage,'after_inventory_short_qty',get(results,'shortage.summary')):'—');
      shortMetric.title=`待备订单减库存后源缺货；覆盖${shortage?.matched_orders??'—'}张订单、${shortage?.after_inventory_coverage??'—'}/${shortage?.matched_sku_rows??'—'}项；尚未扣减排产调拨，不等于终缺，不代表全部未开订单；重复键保持未知`;
      const label=metrics[3].querySelector('.metric-head > span');
      if(label) { label.textContent='未开订单缺货量（已关联）';label.title=shortMetric.title; }
    }
    const allocation=metrics[4]?.querySelector('.metric-head strong');
    if(allocation&&computed) {
      setMetric(allocation,computed.pendingAllocationRate===null?'—':computed.pendingAllocationRate.toFixed(1));
      allocation.title=`按完整待备SKU调整需求与换算后实占量计算；覆盖${computed.pendingCoverage}/${computed.pendingGroups}项；重复需求不直接求和`;
    }
    for (const [index, field] of [
      [1, 'overdue_orders'],
      [2, 'warning_orders'],
    ]) {
      const strong = metrics[index]?.querySelector('.metric-head strong');
      if (strong) setMetric(strong, value(trace, field, get(results, 'trace.summary')));
    }
    if(computed) {
      const overdue=metrics[1]?.querySelector('.metric-head strong');
      const warning=metrics[2]?.querySelector('.metric-head strong');
      if(overdue) {
        setMetric(overdue,computed.nodes.unknown?'≥'+computed.nodes.overdue:computed.nodes.overdue);
        overdue.title=`按文档四个节点时限计算，订单按最末已知节点去重；${computed.nodes.unknown}张订单存在缺失时间或未确认状态，未计作正常`;
      }
      if(warning) {
        setMetric(warning,computed.nodes.unknown?'≥'+computed.nodes.warning:computed.nodes.warning);
        warning.title=`按文档2小时及夜间规则计算四个节点预警；${computed.nodes.unknown}张订单信息不完整`;
      }
    }
    for (const [kind, suffix] of [
      ['overdue-stages', 'overdue'],
      ['warning-stages', 'warning'],
    ]) {
      const nodes = group.querySelectorAll(`[data-breakdown="${kind}"] strong`);
      for (const [i, stage] of ['allocation', 'dispatch', 'loading', 'transit'].entries()) {
        if (nodes[i]) {
          nodes[i].textContent =
            value(trace, stage + '_' + suffix, get(results, 'trace.summary')) + ' 张';
          nodes[i].title =
            '当前范围可关联追踪订单按该节点源标记去重；不同节点可能重叠，不代表最新在办节点';
          if(computed) {
            const counts=computed.nodes.stages[stage];
            const count=counts[suffix];
            nodes[i].textContent=(counts.unknown?'≥'+count:String(count))+' 张';
            nodes[i].title=`依据文档节点时限，当前节点${counts.total}张，未知${counts.unknown}张；判定时点${computed.readAt}`;
          }
        }
      }
    }
    for (const breakdown of group.querySelectorAll('[data-breakdown="open-total"]')) {
      const total = [...breakdown.children]
        .find((node) => node.textContent.startsWith('总数'))
        ?.querySelector('strong');
      if (total)
        total.textContent = value(open, 'valid_orders', get(results, 'orders.open.summary')) + ' 张';
      const opened=[...breakdown.children].find(node=>node.textContent.startsWith('已开'))?.querySelector('strong');
      if(opened) opened.textContent=value(open,'opened_orders',get(results,'orders.open.summary'))+' 张';
    }
  }
  const h3 = document.querySelector('#fulfillmentView > .fulfillment-analysis h3');
  if (h3)
    h3.textContent = Number(summary?.source_orders)===0?'当前授权与日期范围暂无订单':localPreview
      ? '当前数据库读取范围的订单履约情况'
      : '当前授权范围的订单履约情况';
  const p = document.querySelector('#fulfillmentView > .fulfillment-analysis > p');
  if (p)
    p.textContent = `当前范围来源订单 ${value(summary, 'source_orders', get(results, 'orders.summary'))} 张；有效待备 ${value(open,'preparing_orders',get(results,'orders.open.summary'))} 张；源缺货关联 ${value(shortage,'matched_orders',get(results,'shortage.summary'))} 张，减库存后缺货 ${value(shortage,'after_inventory_short_qty',get(results,'shortage.summary'))}，源终缺 ${value(shortage,'final_short_qty',get(results,'shortage.summary'))}，终缺覆盖 ${value(shortage,'final_quantity_coverage',get(results,'shortage.summary'))}/${value(shortage,'matched_sku_rows',get(results,'shortage.summary'))} 项，重复键 ${value(shortage,'duplicate_sku_rows',get(results,'shortage.summary'))} 项。已关联追踪 ${value(trace, 'matched_orders', get(results, 'trace.summary'))} 张，超时 ${value(trace, 'overdue_orders', get(results, 'trace.summary'))} 张，预警 ${value(trace, 'warning_orders', get(results, 'trace.summary'))} 张。源终缺按上游字段展示，未重新分配供应，不把未关联记录补零。`;
  if(p&&computed) p.textContent+=` 主表计算：待备超时至少${computed.preparingOverdue}张、预警至少${computed.preparingWarning}张，缺最晚开单时间${computed.preparingUnknown}张；待备需求覆盖${computed.pendingCoverage}/${computed.pendingGroups}项。整单满足率按完整原始需求与缺货量加权，不是SKU百分比平均；归并不明确时不计算。`;
  const inventory = get(results, 'sku.detail');
  const itemAnalysis = document.querySelector('.item-analysis');
  if (results['sku.detail']) {
    itemAnalysis.querySelector('h3').textContent = inventory
      ? '当前授权范围的品项库存情况'
      : '品项库存读取失败';
    itemAnalysis.querySelector(':scope > p').textContent = inventory
      ? `当前范围共有 ${inventory.total} 条基地与 SKU 库存记录，当前页展示 ${inventory.rows.length} 条。可发货天数按源计划计算；缺失数据保持未知，不以当前页汇总替代全量指标。`
      : '当前范围的品项库存暂不可用，请核对受控查询结果。';
    itemAnalysis.querySelector('.fulfillment-analysis-foot > span').textContent =
      '依据当前受控查询；未来排产、OEM及批次货龄缺少依据时保持未知。';
  }
  const analysis = $('fulfillmentAnalysisDimensions');
  analysis.replaceChildren();
  for (const [name, description] of [
    [
      '作废率',
      '已接来源单、执行单、作废时间和明细状态；执行明细不等于全部O接收订单，完整分母未确认，作废率不直接推算。',
    ],
    ['改单率', '已接客户改单时间；锁定期、有效提报分母及数量取值规则未完整确认，暂不计算。'],
    [
      '满足率',
      '订单明细已按（原始数量－当前缺货）÷原始数量计算整单及SKU满足率，EA按换算率对齐；多个执行单的需求归并不明确时保持未知。全量发货满足率仍缺产品归集与完整排除依据。',
    ],
    ['准交率', '已有完成样本及准时标记，但缺当期全部应交付订单分母及加12小时口径的确认。'],
    ['可发货天数', '品项表已按指定库存快照及计划版本计算；缺值或零计划不补零。'],
  ]) {
    const line = document.createElement('p');
    const label = document.createElement('strong');
    label.textContent = name + '：';
    line.append(label, document.createTextNode(description));
    analysis.append(line);
  }
  for (const stamp of document.querySelectorAll('.fulfillment-analysis-head > span'))
    stamp.textContent = (localPreview ? '数据库只读 ' : '受控读取 ') + shanghaiToday();
  $('fulfillmentBaseScope').textContent =
    (selected.base || '全部基地') + (localPreview ? ' · 本地数据库范围' : ' · 当前授权范围');
  document.querySelector('.freshness').textContent =
    '按源下单日期 ' + selected.start + '；源快照时间未知，库存以各源日期为准';
  const foot = document.querySelector('.fulfillment-analysis-foot > span');
  if (foot)
    foot.textContent =
      (localPreview ? '数据库真实数据 · 未验证GEA用户权限' : '依据当前受控查询') +
      ' · 未接入指标保持未知';
  $('deliveryOrderCount').textContent =
    '来源订单 '+value(summary,'source_orders',get(results,'orders.summary'))+' 张；明细按完整授权输入归并有效订单';
}
let activeRead;
async function load() {
  const selected = selectedFilters();
  const key = JSON.stringify(selected);
  if (activeRead?.key === key && activeRead.current()) return;
  const task = owner.begin();
  activeRead = { key, current: task.current };
  clear();
  if (!connected || !reader) {
    status.textContent = reader ? '等待工作台连接' : '缺少受控查询配置';
    return;
  }
  saveView();
  const ids = [
    'orders.facts',
    'orders.summary',
    'orders.open.summary',
    'shortage.summary',
    'shortage.detail',
    'trace.summary',
    'sku.detail',
    'sku.age',
  ];
  const progressive = {};
  const settled = await Promise.allSettled(
    ids.map(async (id) => {
      try {
        const value = await (id==='orders.facts'||id==='shortage.detail'||id==='sku.detail'||id==='sku.age'
          ? reader.all(id,selected,{signal:task.signal}) : id.endsWith('.summary')
          ? reader.summary(id, selected, task.signal)
          : reader.collection(id, selected, {
              signal: task.signal,
              page: 1,
              size: 20,
            }));
        if (!task.current()) return value;
        progressive[id] = { status: 'fulfilled', value };
        if(!sourceCountsAgree(progressive)) {
          owner.invalidate();
          clear('源数据在读取期间发生变化，已清除不同批次结果，请稍后重新打开页面');
          return value;
        }
        const versions = Object.values(progressive)
          .filter((part) => part.status === 'fulfilled')
          .map((part) => part.value.configVersion);
        if (new Set(versions).size > 1) {
          owner.invalidate();
          clear('配置已变化，请重新查询');
          return value;
        }
        if (progressive['orders.summary'])
          renderSummary(progressive, selected);
        if(get(progressive,'orders.facts')&&['orders.facts','shortage.detail','sku.detail','sku.age'].includes(id))renderGrantedDetails(progressive);
        return value;
      } catch (reason) {
        if (task.current()) progressive[id] = { status: 'rejected', reason };
        throw reason;
      }
    }),
  );
  if (!task.current()) return;
  const results = Object.fromEntries(ids.map((id, i) => [id, settled[i]]));
  if(!sourceCountsAgree(results)) {
    owner.invalidate();clear('源数据在读取期间发生变化，已清除不同批次结果，请稍后重新打开页面');return;
  }
  const versions = settled
    .filter((x) => x.status === 'fulfilled')
    .map((x) => x.value.configVersion);
  if (new Set(versions).size > 1) {
    clear('配置已变化，请重新查询');
    return;
  }
  renderSummary(results, selected);
  const {facts,comparison}=renderGrantedDetails(results);
  snapshot = {
    source: localPreview ? 'direct-doris' : 'gea-governed-sql',
    authorization: localPreview ? 'database-account-only' : 'current-gea-identity',
    mock: false,
    consumerCode: 'order01',
    filters: selected,
    dimension,
    comparisons:facts?{base:comparison('belong_base'),province:comparison('province_region_name'),scope:'当前筛选与授权范围完整输入；缺失覆盖不补零'}:null,
    calculated:calculatedMetrics(results) ? {...calculatedMetrics(results),quantities:calculatedMetrics(results).quantities.slice(0,50),quantityTotal:calculatedMetrics(results).quantities.length,detailScope:'前50个订单SKU组合样本；汇总覆盖基于完整输入，不用样本替代全量'} : null,
    readAt: new Date().toISOString(),
    parts: Object.fromEntries(
      ids.map((id) => [
        id,
        results[id].status === 'fulfilled'
          ? { state: 'ready', ...results[id].value, ...(['orders.facts','sku.detail','sku.age','shortage.detail'].includes(id)?{rows:results[id].value.rows.slice(0,50),detailScope:'完整指标输入的前50行样本；total为完整总行数，不用样本代替全量'}:{}) }
          : {
              state: 'unavailable',
              code: results[id].reason?.code ?? 'QUERY_FAILED',
            },
      ]),
    ),
    sourceGaps: config.sourceGaps,
  };
  const failures = settled.filter((x) => x.status === 'rejected');
  status.textContent =
    (localPreview
      ? '数据库真实数据 · 本地只读 · 未验GEA用户权限'
      : 'GEA受控只读 · 当前用户权限范围') + (failures.length ? ' · 部分数据不可用' : '');
  for (const [id, item] of Object.entries(results))
    if (item.status === 'rejected') {
      const target =
        id === 'sku.detail'
          ? $('itemInventoryPanel').querySelector('tbody')
          : id === 'orders.facts'
            ? $('deliveryOrderDetailRows')
            : null;
      if (target) placeholder(target, issue(item.reason));
      if(id==='orders.facts')placeholder($('warehouseOrderDetailRows'),issue(item.reason));
    }
  const data = snapshot;
  publication = publication
    .catch(() => {})
    .then(async () => {
      if (!task.current()) return;
      try {
        await publish(data, { signal: task.signal });
        if (task.current())
          withdraw = reportElements('fulfillment-live', [
            {
              id: 'fulfillment:scope',
              role: 'field',
              label: '订单履约',
              value: '当前授权范围 · ' + selected.start,
            },
          ]);
      } catch (error) {
        if (task.current()) status.textContent = issue(error);
      }
    });
}
let timer;
for (const id of filtersIds) {
  const node = $(id);
  node.addEventListener(node.tagName === 'SELECT' ? 'change' : 'input', () => {
    owner.invalidate();
    clear();
    saveView();
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (connected) void load();
    }, 250);
  });
}
$('deliveryStatusQuery').title = '按当前已读取订单的节点时限判断过滤；全量指标不由当前页推算';
view.subscribe((state, event) => {
  if (event === 'released') {
    owner.invalidate();
    clear();
    connected = false;
    return;
  }
  const previous = JSON.stringify(selectedFilters());
  for (const id of filtersIds) if (typeof state[id] === 'string') {
    const node=$(id);
    if(node.tagName==='SELECT'&&state[id]&&![...node.options].some(option=>option.value===state[id]))node.append(new Option(state[id],state[id]));
    node.value=state[id];
  }
  const tab = document.querySelector(`[data-fulfillment-dimension="${state.dimension}"]`);
  if (tab) activateTab(tab);
  if (previous !== JSON.stringify(selectedFilters())) {
    owner.invalidate();
    clear();
  }
  if (connected) void load();
});
document.addEventListener('click', async (event) => {
  const button = event.target.closest(
    '[data-fulfillment-question],#fulfillmentAnalysisChat,#itemAnalysisChat',
  );
  if (!button || !snapshot) return;
  quoteTask?.abort();
  const controller = new AbortController();
  quoteTask = controller;
  try {
    await quotePage(
      {
        label: '订单履约分析',
        text:
          button.dataset.fulfillmentQuestion ||
          '请根据当前订单履约页面授权数据、源日期和覆盖率分析风险，未知项不得补零。',
      },
      controller.signal,
    );
    if (!controller.signal.aborted)
      $('fulfillmentQuoteStatus').textContent = '已转入当前对话草稿，确认后发送。';
  } catch (error) {
    if (!controller.signal.aborted) $('fulfillmentQuoteStatus').textContent = error.message;
  }
});
action('context', '读取当前授权订单履约数据', () => {
  if (!snapshot || !connected) throw Error('PAGE_CONTEXT_NOT_READY');
  return snapshot;
});
function invalidate(event) {
  owner.invalidate();
  clearTimeout(timer);
  clear('身份或会话已变化，旧数据已清除');
  for(const [id,label] of [['fulfillmentBaseFilter','全部基地'],['deliveryBaseQuery','全部基地'],['deliveryOrgFilter','全部'],['warehouseProviderFilter','全部承运商']])$(id).replaceChildren(new Option(label,''));
  if (event?.type !== 'gea-identity-changed') connected = false;
}
for (const event of ['gea-identity-changed', 'gea-session-changing', 'pagehide'])
  window.addEventListener(event, invalidate);
window.addEventListener('gea-session-changed', () => {
  connected = true;
  void load();
});
void ready.then(() => {
  connected = true;
  return load();
});
const submitConfirmation=$('salesConfirmForm').querySelector('button[type="submit"]');
updateSourceFilters([]);
bindPanelControls();
for(const list of document.querySelectorAll('[role="tablist"]'))list.addEventListener('keydown',event=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  const tabs=[...list.querySelectorAll('[role="tab"]')];
  const index=tabs.indexOf(event.target);if(index<0)return;
  const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowLeft'?-1:1)+tabs.length)%tabs.length;
  event.preventDefault();tabs[next].click();tabs[next].focus();
});
submitConfirmation.disabled=true;
submitConfirmation.title='尚未接入真实销售确认接口，不能提交';
$('salesConfirmForm').addEventListener('submit',event=>event.preventDefault());
for(const button of document.querySelectorAll('[data-close-sales-confirm]'))button.addEventListener('click',()=>{$('salesConfirmOverlay').hidden=true;});
for(const button of document.querySelectorAll('[data-close-confirmation-history]'))button.addEventListener('click',()=>{$('confirmationHistoryOverlay').hidden=true;});
for(const id of ['salesConfirmOverlay','confirmationHistoryOverlay'])$(id).addEventListener('click',event=>{if(event.target===$(id))$(id).hidden=true;});
document.addEventListener('keydown',event=>{if(event.key==='Escape'){ $('salesConfirmOverlay').hidden=true;$('confirmationHistoryOverlay').hidden=true; }});
