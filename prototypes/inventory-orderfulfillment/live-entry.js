import { ready, call, publish, reportElements, action } from '../../business/shared/channel.js';
import { quotePage } from '../../src/page-interaction/quote.ts';
import { createPageViewState } from '../../business/shared/view-state.js';
import {
  createFulfillmentReader,
  createLoadOwner,
  shanghaiToday,
  nextDay,
  plannedShippingDays,
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
    region: org.startsWith('region:') && org.includes('大区') ? org.slice(7) : null,
    province:
      $('deliveryRegionQuery').value ||
      (org.startsWith('region:') && !org.includes('大区') ? org.slice(7) : null),
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
function renderOrders(body, orders, quantities, traces, warehouse) {
  if (!body) return;
  if (!orders) {
    placeholder(body, '订单数据不可用或未获授权');
    return;
  }
  body.replaceChildren();
  const quantityMap = new Map((quantities?.rows ?? []).map((row) => [key(row), row]));
  for (const row of orders.rows) {
    const q = quantityMap.get(key(row));
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
    const risk = flags.some((x) => x.includes('超时'))
      ? '超时'
      : flags.some((x) => x.includes('预警'))
        ? '预警'
        : flags.length === 4 && flags.every((x) => x.includes('正常'))
          ? '正常'
          : '—';
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
      value(row, 'channel', orders),
      value(row, 'sales_person', orders),
      value(row, 'order_person', orders),
      value(row, 'base', orders),
      value(carrier, 'carrier', warehouse),
      value(row, 'source_status', orders),
      risk,
      '—',
      value(q, 'original_qty', quantities),
      value(q, 'adjusted_qty', quantities),
      value(q, 'allocated_qty', quantities),
      value(q, 'shipped_qty', quantities),
      value(q, 'ordered_qty', quantities),
    ];
    for (const v of values) tr.append(cell(v));
    if (body.id === 'deliveryOrderDetailRows') {
      tr.append(cell('未接入'), cell('—'));
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
    const line = table.createTBody().insertRow();
    for (const v of [
      value(row, 'material_name', orders) + ' / ' + value(row, 'sku', orders),
      value(q, 'original_qty', quantities),
      value(q, 'source_short_qty', quantities),
      '—',
    ])
      line.append(cell(v));
    content.append(table);
    button.addEventListener('click', () => {
      detail.hidden = !detail.hidden;
      button.setAttribute('aria-expanded', String(!detail.hidden));
    });
    body.append(tr, detail);
  }
  if (!body.children.length) placeholder(body, '当前授权与筛选范围无记录');
}
function renderInventory(result) {
  const body = $('itemInventoryPanel').querySelector('tbody');
  if (!result) {
    placeholder(body, '库存数据不可用或未获授权');
    return;
  }
  body.replaceChildren();
  for (const row of result.rows) {
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
      plannedShippingDays(row)?.toFixed(1) ?? '—',
      '—',
      '—',
      '—',
      '—',
      '—',
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
      '；可发货天数按10日初版、20日纠偏、月末下月初版计划计算；月需求为思念与BP销售计划合计，调出计划按0.5计入。非指定快照日、缺计划或零分母保持未知；OEM和批次货龄尚缺依据。';
}
function renderComparison(body, result, warehouse = false) {
  if (!body || !result) return;
  body.replaceChildren();
  for (const row of result.rows) {
    const tr = document.createElement('tr');
    for (const item of warehouse
      ? ['', value(row, 'group_name', result), '—', '—', '—', '—', '—']
      : [
          '',
          value(row, 'group_name', result),
          value(row, 'source_orders', result),
          '—',
          '—',
          '—',
          '—',
          '—',
          '—',
          '—',
          '—',
          '—',
          '—',
        ])
      tr.append(cell(item));
    body.append(tr);
  }
  if (!body.children.length) placeholder(body, '当前授权范围无记录');
}
function renderSummary(results, selected) {
  const summary = get(results, 'orders.summary')?.rows[0],
    trace = get(results, 'trace.summary')?.rows[0];
  for (const group of document.querySelectorAll('.summary.fulfillment-summary')) {
    const metrics = [...group.querySelectorAll(':scope > .metric')];
    if (group.classList.contains('item-summary')) continue;
    for (const [index, field] of [
      [1, 'overdue_orders'],
      [2, 'warning_orders'],
    ]) {
      const strong = metrics[index]?.querySelector('.metric-head strong');
      if (strong) setMetric(strong, value(trace, field, get(results, 'trace.summary')));
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
        }
      }
    }
    for (const breakdown of group.querySelectorAll('[data-breakdown="open-total"]')) {
      const total = [...breakdown.children]
        .find((node) => node.textContent.startsWith('总数'))
        ?.querySelector('strong');
      if (total)
        total.textContent = value(summary, 'source_orders', get(results, 'orders.summary')) + ' 张';
    }
  }
  const h3 = document.querySelector('#fulfillmentView > .fulfillment-analysis h3');
  if (h3)
    h3.textContent = localPreview
      ? '当前数据库读取范围的订单履约情况'
      : '当前授权范围的订单履约情况';
  const p = document.querySelector('#fulfillmentView > .fulfillment-analysis > p');
  if (p)
    p.textContent = `当前范围来源订单 ${value(summary, 'source_orders', get(results, 'orders.summary'))} 张；已关联追踪 ${value(trace, 'matched_orders', get(results, 'trace.summary'))} 张，超时 ${value(trace, 'overdue_orders', get(results, 'trace.summary'))} 张，预警 ${value(trace, 'warning_orders', get(results, 'trace.summary'))} 张。仅说明可关联源记录，不作为完整实时履约结论。`;
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
      '源表有作废数量，但缺订单标识及下单12小时后作废事件，不能计算文档要求的订单张数比例。',
    ],
    ['改单率', '源表有改单数量，但缺改单发生时间、锁定期及有效提报订单分母。'],
    [
      '满足率',
      '源需求存在缺值和重复执行；缺有效订单排除与渠道需求取值依据，不能按源数量直接相除。',
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
    '来源订单 ' +
    value(summary, 'source_orders', get(results, 'orders.summary')) +
    ' 张；明细为当前分页';
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
    'orders.summary',
    'trace.summary',
    'orders.detail',
    'orders.quantities',
    'trace.detail',
    'warehouse.detail',
    'sku.detail',
    'orders.by_base',
    'orders.by_province',
    'orders.by_carrier',
  ];
  const progressive = {};
  const settled = await Promise.allSettled(
    ids.map(async (id) => {
      try {
        const value = await (id.endsWith('.summary')
          ? reader.summary(id, selected, task.signal)
          : reader.collection(id, selected, {
              signal: task.signal,
              page: 1,
              size: 20,
            }));
        if (!task.current()) return value;
        progressive[id] = { status: 'fulfilled', value };
        const versions = Object.values(progressive)
          .filter((part) => part.status === 'fulfilled')
          .map((part) => part.value.configVersion);
        if (new Set(versions).size > 1) {
          owner.invalidate();
          clear('配置已变化，请重新查询');
          return value;
        }
        if (progressive['orders.summary'] && progressive['trace.summary'])
          renderSummary(progressive, selected);
        if (get(progressive, 'orders.detail') && get(progressive, 'orders.quantities')) {
          for (const target of ['deliveryOrderDetailRows', 'warehouseOrderDetailRows'])
            renderOrders(
              $(target),
              get(progressive, 'orders.detail'),
              get(progressive, 'orders.quantities'),
              get(progressive, 'trace.detail'),
              get(progressive, 'warehouse.detail'),
            );
        }
        if (id === 'sku.detail') renderInventory(value);
        return value;
      } catch (reason) {
        if (task.current()) progressive[id] = { status: 'rejected', reason };
        throw reason;
      }
    }),
  );
  if (!task.current()) return;
  const results = Object.fromEntries(ids.map((id, i) => [id, settled[i]]));
  const versions = settled
    .filter((x) => x.status === 'fulfilled')
    .map((x) => x.value.configVersion);
  if (new Set(versions).size > 1) {
    clear('配置已变化，请重新查询');
    return;
  }
  renderSummary(results, selected);
  const orders = get(results, 'orders.detail'),
    quantities = get(results, 'orders.quantities'),
    trace = get(results, 'trace.detail'),
    warehouse = get(results, 'warehouse.detail');
  renderOrders($('deliveryOrderDetailRows'), orders, quantities, trace, warehouse);
  renderOrders($('warehouseOrderDetailRows'), orders, quantities, trace, warehouse);
  renderInventory(get(results, 'sku.detail'));
  renderComparison($('deliveryBaseCompareRows'), get(results, 'orders.by_base'));
  renderComparison($('deliveryRegionCompareRows'), get(results, 'orders.by_province'));
  renderComparison(
    $('warehouseBaseDetailPanel').querySelector('tbody'),
    get(results, 'orders.by_base'),
    true,
  );
  renderComparison(
    $('warehouseLogisticsDetailPanel').querySelector('tbody'),
    get(results, 'orders.by_carrier'),
    true,
  );
  snapshot = {
    source: localPreview ? 'direct-doris' : 'gea-governed-sql',
    authorization: localPreview ? 'database-account-only' : 'current-gea-identity',
    mock: false,
    consumerCode: 'order01',
    filters: selected,
    dimension,
    readAt: new Date().toISOString(),
    parts: Object.fromEntries(
      ids.map((id) => [
        id,
        results[id].status === 'fulfilled'
          ? { state: 'ready', ...results[id].value }
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
          : id === 'orders.detail'
            ? $('deliveryOrderDetailRows')
            : null;
      if (target) placeholder(target, issue(item.reason));
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
$('deliveryStatusQuery').title = '按当前已读取分页的关联源节点标记过滤；全量指标不由当前页推算';
view.subscribe((state, event) => {
  if (event === 'released') {
    owner.invalidate();
    clear();
    connected = false;
    return;
  }
  const previous = JSON.stringify(selectedFilters());
  for (const id of filtersIds) if (typeof state[id] === 'string') $(id).value = state[id];
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
