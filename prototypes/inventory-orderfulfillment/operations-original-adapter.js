import { operationsExportCell } from './operations-export.mjs';
import { templateOperationsTableCell } from './operations-table-cell.mjs';
import { createOperationsLoader } from './operations-loader.mjs';
import { bucketOrderAges } from './operations-model.mjs';
import { enrichOriginalData } from './operations-original-data.mjs';
import { knownShortageSummary, knownOrderPlanSummary } from './operations-original-aggregation.mjs';

const snapshotDay = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
const escaped = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const unknown = (value) =>
  value === null
    ? NaN
    : Array.isArray(value)
      ? value.map(unknown)
      : value && typeof value === 'object'
        ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, unknown(item)]))
        : value;
const rowTemplate = (name) => unknown(structuredClone(ORIGINAL_TEMPLATES[name]));
const finite = (value) =>
  value !== null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : NaN;
const total = (rows, key) =>
  rows.length && rows.every((row) => Number.isFinite(row[key]))
    ? rows.reduce((sum, row) => sum + row[key], 0)
    : NaN;
let port,
  connected = false,
  sequence = 0,
  active = 'overview';
const pending = new Map(),
  cache = new Map();
const needs = {
  overview: ['plan.base', 'orders.age', 'stock.sku', 'shortage.sku', 'orders.facts'],
  base: ['plan.base', 'stock.sku', 'orders.facts'],
  region: ['plan.region', 'orders.facts'],
  unopen: ['orders.pending', 'orders.facts'],
  item: [
    'plan.item',
    'plan.sku',
    'stock.sku',
    'orders.facts',
    'sku.attributes',
    'product.attributes',
    'product.master.attributes',
  ],
  shortage: [
    'shortage.sku',
    'stock.sku',
    'supply.oem.stock',
    'supply.branch',
    'sku.attributes',
    'stock.age',
    'product.unit.factors',
    'production.future',
    'orders.facts',
    'product.attributes',
    'product.master.attributes',
  ],
  warehouse: ['warehouse.stage', 'orders.facts', 'warehouse.stock'],
};
const originalSwitch = switchTab;
const originalKpis = renderKPI;
renderKPI = () => {
  originalKpis();
  const cards = [...document.querySelectorAll('#kpis .kpi')];
  for (const card of cards) {
    card.querySelectorAll('.tag').forEach((tag) => (tag.textContent = '—'));
    card.querySelectorAll('.bar i').forEach((bar) => (bar.style.width = '0%'));
  }
  const templateFootnotes = cards.map((card) => card.querySelector('.foot').innerHTML);
  if (cards[0])
    cards[0].querySelector('.foot').innerHTML =
      '纠偏计划 ' +
      f(D.correctionPlan) +
      ' <span class="tag info">差 —</span><span style="display:block;color:#94a3b8;font-size:10px;margin-top:1px">纠偏−评估差异 · 总计划(DMS) ' +
      f(D.baseProgress.find((row) => row.base === '合计')?.planDms) +
      '</span>';
  if (cards[1]) {
    const row = D.baseProgress.find((row) => row.base === '合计');
    const partial = !Number.isFinite(row?.orderTotal) && Number.isFinite(row?.orderedKnown);
    cards[1].querySelector('.foot').textContent =
      '报单进度 — / 应达 — · 下单合计 ' +
      (partial
        ? '已知 ' +
          f(row.orderedKnown) +
          '；覆盖 ' +
          num(row.orderCovered) +
          '/' +
          num(row.orderSourceRows) +
          '条'
        : f(row?.orderTotal));
  }
  if (cards[2])
    cards[2].querySelector('.foot').textContent = '开单进度 — / 应达 — · 参考月度评估计划量';
  if (cards[3])
    cards[3].querySelector('.foot').textContent = '发货进度 — / 应达 — · 参考月度评估计划量';
  if (cards[5]) cards[5].querySelector('.foot').textContent = '占未开 — · 承诺超期 —';
  if (cards[4])
    cards[4].title =
      '来源库存快照 ' +
      [...new Set((cache.get('stock.sku')?.rows ?? []).map((row) => row.stock_date))].join('、') +
      '；源字段：未备单订单量／未开订单量。';
  const shortage = knownShortageSummary(D.sku);
  if (cards[7]) {
    cards[7].querySelector('.val').textContent = shortage.knownSkus
      ? '已知 ' + f(shortage.qty)
      : '—';
    cards[7].querySelector('.foot').textContent = shortage.knownSkus
      ? '已关联来源小计；' + num(shortage.skus) + '个基地/SKU有缺货；全量覆盖待确认'
      : '当前累计缺货 —（—个SKU）· 全量缺货 —';
  }
  const pendingShip = D.baseProgress.find((row) => row.base === '合计');
  if (
    cards[6] &&
    !Number.isFinite(pendingShip?.pendingShip) &&
    Number.isFinite(pendingShip?.pendingShipKnown)
  ) {
    cards[6].querySelector('.val').textContent = '已知 ' + f(pendingShip.pendingShipKnown);
    cards[6].title =
      '数量完整的仓点小计；覆盖 ' +
      pendingShip.pendingShipCovered +
      '/' +
      pendingShip.pendingShipSourceRows +
      ' 个仓点，未覆盖部分未知。';
  }
  if (cards[8] && D.rateCoverage?.totalOrders) {
    if (!Number.isFinite(D.rate90above.qty) && D.rateCoverage.knownOrders > 0)
      cards[8].querySelector('.val').textContent = '已知 ' + f(D.rateCoverage.highQty);
    cards[8].querySelector('.foot').textContent =
      '可判定 ' +
      num(D.rateCoverage.knownOrders) +
      '/' +
      num(D.rateCoverage.totalOrders) +
      '单，其中≥90%为' +
      num(D.rateCoverage.highOrders) +
      '单；未完整覆盖时不计算全量占比';
  }
  for (const [index, card] of cards.entries()) {
    const foot = card.querySelector('.foot');
    if (foot.innerHTML !== templateFootnotes[index])
      card.title = [card.title, foot.textContent].filter(Boolean).join('；');
    foot.innerHTML = templateFootnotes[index];
    card.querySelector('.val').textContent = card
      .querySelector('.val')
      .textContent.replace(/^已知 /, '');
  }
  const order = D.baseProgress.find((row) => row.base === '合计');
  if (cards[1] && !Number.isFinite(order?.orderTotal) && Number.isFinite(order?.orderedKnown))
    cards[1].querySelector('.foot').innerHTML = templateFootnotes[1].replace(
      '下单合计 —',
      '下单合计 ' + f(order.orderedKnown),
    );
};
const originalTable = Table;
Table = (host, cfg) => {
  const protectedConfig = {
    ...cfg,
    cols: cfg.cols.map((column) => ({
      ...column,
      fmt: (value, row) => {
        if (
          host === 't_warehouse' &&
          ['maxShip', 'avgShip', 'maxOpen', 'avgOpen'].includes(column.k) &&
          !['t10', 't9', 't8', 't7', 't6', 't5', 't4', 't3', 't2', 't1', 'todayOpen'].every((key) =>
            Number.isFinite(row.total?.[key]),
          )
        )
          return '—';
        if (
          [
            'base',
            'date',
            'region',
            'province',
            'group',
            'pickup',
            'custName',
            'custType',
            'attr',
            'reason',
            'code',
            'name',
            'item',
            'series',
            'owner',
          ].includes(column.k) &&
          (value == null || value === '')
        )
          return '—';
        if (column.k === 'stock' && ['t_warehouse', 'bd_wh'].includes(host)) {
          if (row.code === '*') return '<span title="尚未分配具体仓库，库存不适用">—</span>';
          if (row.stockShared && Number.isFinite(row.total?.stock))
            return (
              '<span title="当前授权源的唯一仓库库存池；库存归属 ' +
              escaped(row.stockSourceBase) +
              '，不按订单基地分摊，不与同仓其他基地行重复相加">共享仓库 ' +
              fv(row.total.stock) +
              '</span>'
            );
        }
        if (['loading', 'openedUnassigned', 'assignedNotArrive'].includes(column.k)) {
          const quantity = row.total?.[column.k] ?? row[column.k];
          if (Number.isFinite(quantity))
            return (
              '<span title="按同名原始执行状态统计；未将备单完毕、提货中擅自合并，状态映射待业务确认">' +
              (column.fmt ? column.fmt(value, row) : fv(quantity)) +
              '</span>'
            );
        }
        if (
          ['prodToday', 'prod5sum'].includes(column.k) &&
          row.productionScope &&
          ['prodToday', 'prod1', 'prod2', 'prod3', 'prod4', 'prod5'].every((field) =>
            Number.isFinite(row[field]),
          )
        )
          return '<span title="' + escaped(row.productionScope) + '">0</span>';
        if (['lackOrdersToday', 'turn17Qty'].includes(column.k) && Number.isFinite(value))
          return '已知 ' + (column.k === 'lackOrdersToday' ? num(value) : fv(value));
        if (column.k === 'rate' && host === 'detail_drill')
          return Number.isFinite(row.totalQty) &&
            row.totalQty > 0 &&
            Number.isFinite(row.occupied) &&
            row.occupied >= 0 &&
            row.occupied <= row.totalQty
            ? ((row.occupied / row.totalQty) * 100).toFixed(1)
            : '—';
        if (
          column.k === 'rate' &&
          host === 't_item' &&
          (!Number.isFinite(row.plan) || row.plan <= 0 || !Number.isFinite(row.salesShip))
        )
          return '—';
        if (['id_base', 'id_sku'].includes(host) && ['shipRate', 'dRate'].includes(column.k)) {
          const plan = column.k === 'shipRate' ? row.plan : row.dplan,
            shipped = column.k === 'shipRate' ? row.ship : row.dship;
          if (!Number.isFinite(plan) || plan <= 0 || !Number.isFinite(shipped)) return '—';
        }
        if (column.k === 'order' && !Number.isFinite(value) && row.orderSources?.length) {
          const source = knownOrderPlanSummary(row.orderSources);
          if (source?.covered > 0)
            return (
              '<span title="已知下单量；覆盖 ' +
              source.covered +
              '/' +
              source.total +
              ' 条来源">已知 ' +
              fv(source.quantity) +
              '</span>'
            );
        }
        if (
          (host === 'id_base' || host === 'id_sku') &&
          column.k === 'lack' &&
          Number.isFinite(value)
        )
          return '已知 ' + fv(value);
        if (host === 't_item' && column.k === 'order' && !Number.isFinite(value)) {
          const source = D.itemOrderCoverage?.[row.item];
          if (source?.covered > 0)
            return (
              '<span title="已知报单量小计；覆盖 ' +
              source.covered +
              '/' +
              source.total +
              ' 条来源；其余未知">已知 ' +
              fv(source.quantity) +
              '</span>'
            );
        }
        if (
          column.k === 'pendingShip' &&
          !Number.isFinite(value) &&
          Number.isFinite(row.pendingShipKnown)
        )
          return (
            '<span title="数量完整仓点小计；覆盖 ' +
            row.pendingShipCovered +
            '/' +
            row.pendingShipSourceRows +
            ' 个仓点">已知 ' +
            fv(row.pendingShipKnown) +
            '</span>'
          );
        if (
          column.k === 'orderTotal' &&
          !Number.isFinite(value) &&
          Number.isFinite(row.orderedKnown)
        )
          return '已知 ' + fv(row.orderedKnown);
        if (host === 't_item_unopen' && !cache.has('orders.facts') && column.k !== 'item')
          return '—';
        if (
          host === 't_item_unopen' &&
          ['qty', 'unprepared'].includes(column.k) &&
          !Number.isFinite(value)
        ) {
          const source = D.itemUnopenCoverage?.[row.item]?.[column.k];
          if (source?.covered > 0)
            return (
              '<span title="已知品项小计；数量覆盖 ' +
              source.covered +
              '/' +
              source.total +
              ' 条备单中明细；品项不明 ' +
              source.unclassified +
              ' 条，未计入；其余数量未知">' +
              fv(source.quantity) +
              '</span>'
            );
        }
        if (Array.isArray(row.planSourceBindings) && row.planSourceBindings.includes(column.k))
          return (
            '<span title="当前月销售口径计划表补充；库存快照对应字段缺失；不覆盖已有库存字段">' +
            (column.fmt ? column.fmt(value, row) : num(value)) +
            '</span>'
          );
        if (
          column.k === 'dcInTransit' &&
          row.supplyEntityKind === 'warehouse' &&
          Number.isFinite(value)
        )
          return (
            '<span title="分仓仓点+SKU源在途总量；来源未提供快照日期；未按销售组织分摊，也未计入工厂补位">' +
            num(value) +
            '</span>'
          );
        if (column.k === 'odmStock' && Number.isFinite(value) && row.oemStockEvidence)
          return (
            '<span title="' +
            escaped(
              '03类OEM成品仓源净库存；快照' +
                row.oemStockEvidence.snapshotDate +
                '；负批次' +
                row.oemStockEvidence.negativeRows +
                '条；ODM完整覆盖未确认，未计入补位计算',
            ) +
            '">' +
            num(value) +
            '</span>'
          );
        if (value === '' || (typeof value === 'number' && !Number.isFinite(value))) return '—';
        if (
          value == null &&
          ![
            'qty',
            'orders',
            'd3',
            'd3_6',
            'd6_10',
            'd10p',
            't',
            'stock',
            'unopen',
            'openPending',
            'openedUnassigned',
            'assignedNotArrive',
            'loading',
            'rate95',
            'rate90_95',
            'rate80_90',
            'rate70_80',
            'rateBelow70',
            'unallocated',
            'maxShip',
            'avgShip',
            'maxOpen',
            'avgOpen',
            'sShipRate',
            'sDcRate',
            'prod5sum',
          ].includes(column.k)
        )
          return '—';
        if (
          column.k === 'sShipRate' ||
          column.k === 'sDcRate' ||
          column.k === 'prod5sum' ||
          column.k === 'shipDays'
        ) {
          const required =
            column.k === 'sShipRate'
              ? ['shipSales', 'planSalesMonth']
              : column.k === 'sDcRate'
                ? ['shipDc', 'planDcMonth']
                : column.k === 'prod5sum'
                  ? ['prodToday', 'prod1', 'prod2', 'prod3', 'prod4', 'prod5']
                  : ['shipDays'];
          if (required.some((key) => !Number.isFinite(row[key]))) return '—';
        }
        const rendered = column.fmt ? column.fmt(value, row) : value;
        return rendered == null || rendered === '' ? '—' : rendered;
      },
    })),
  };
  for (const column of protectedConfig.cols) {
    const format = column.fmt;
    column.fmt = (value, row) => templateOperationsTableCell(format(value, row));
  }
  return originalTable(host, protectedConfig);
};
const originalCsv = csv;
csv = (cfg, rows) =>
  originalCsv(
    {
      ...cfg,
      cols: cfg.cols.map((column) => ({
        ...column,
        raw: (value, row) => {
          const resolve = () => {
            if (
              cfg.title === '未开订单品项汇总' &&
              ['qty', 'unprepared'].includes(column.k) &&
              !Number.isFinite(value)
            ) {
              const source = D.itemUnopenCoverage?.[row.item]?.[column.k];
              if (source?.covered > 0) return '已知 ' + source.quantity;
            }
            if (column.k === 'stock' && row.stockShared && Number.isFinite(row.total?.stock))
              return '共享仓库 ' + row.total.stock;
            if (['lackOrdersToday', 'turn17Qty'].includes(column.k) && Number.isFinite(value))
              return '已知 ' + value;
            if (column.k === 'order' && !Number.isFinite(value) && row.orderSources?.length) {
              const source = knownOrderPlanSummary(row.orderSources);
              if (source?.covered > 0) return '已知 ' + source.quantity;
            }
            if (
              (cfg.title?.includes(' · 基地维度') || cfg.title?.includes(' · 单品维度')) &&
              column.k === 'lack' &&
              Number.isFinite(value)
            )
              return '已知 ' + value;
            if (
              column.k === 'orderTotal' &&
              !Number.isFinite(value) &&
              Number.isFinite(row.orderedKnown)
            )
              return '已知 ' + row.orderedKnown;
            if (
              cfg.title?.startsWith('品项进销存进度') &&
              column.k === 'order' &&
              !Number.isFinite(value)
            ) {
              const source = D.itemOrderCoverage?.[row.item];
              if (source?.covered > 0) return '已知 ' + source.quantity;
            }
            if (
              column.k === 'pendingShip' &&
              !Number.isFinite(value) &&
              Number.isFinite(row.pendingShipKnown)
            )
              return '已知 ' + row.pendingShipKnown;
            if (
              column.k === 'prod5sum' &&
              ['prodToday', 'prod1', 'prod2', 'prod3', 'prod4', 'prod5'].some(
                (key) => row[key] === '' || !Number.isFinite(Number(row[key])),
              )
            )
              return '';
            return column.raw ? column.raw(value, row) : value;
          };
          return operationsExportCell(column, resolve(), row);
        },
      })),
    },
    rows.map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([key, value]) => [
          key,
          typeof value === 'string' && /^[=+\-@\t\r]/.test(value)
            ? "'" + value
            : typeof value === 'number' && !Number.isFinite(value)
              ? ''
              : value,
        ]),
      ),
    ),
  );
const originalSkuMetrics = skuMetrics;
skuMetrics = (rows) => {
  const known = knownShortageSummary(rows);
  return {
    ...originalSkuMetrics(rows),
    curQty: known.qty,
    curSkus: known.skus,
    d5Qty: NaN,
    d5Skus: NaN,
    afterQty: NaN,
    afterSkus: NaN,
    turn17Qty: known.turnLackQty,
    turn17Skus: known.turnKnown ? known.turnSkus : NaN,
  };
};
const originalShortage = renderShortage;
renderShortage = () => {
  originalShortage();
  const known = knownShortageSummary(skuFiltered);
  const cards = [...document.querySelectorAll('#skpis .kpi')];
  const templateFootnotes = cards.map((card) => card.querySelector('.foot').innerHTML);
  const turn = document.getElementById('turn17_txt');
  const templateTurn = turn.textContent;
  for (const index of [0, 1]) {
    if (!cards[index]) continue;
    cards[index].querySelector('.val').textContent = known.knownSkus
      ? '已知 ' + (index === 0 ? f(known.qty) : num(known.skus))
      : '—';
    cards[index].querySelector('.foot').textContent = '已关联来源小计；未匹配部分未知';
  }
  if (cards[6]) {
    cards[6].querySelector('.val').textContent = known.turnKnown
      ? '已知 ' + num(known.turnSkus)
      : '—';
    cards[6].querySelector('.foot').textContent = '已折合件且可判定可发货天数的SKU子集';
  }
  document.getElementById('turn17_txt').textContent = known.turnKnown
    ? '已知 ' + num(known.turnSkus) + '个SKU'
    : '—';
  for (const [index, card] of cards.entries()) {
    const foot = card.querySelector('.foot');
    if (foot.innerHTML !== templateFootnotes[index]) card.title = foot.textContent;
    foot.innerHTML = templateFootnotes[index];
    card.querySelector('.val').textContent = card
      .querySelector('.val')
      .textContent.replace(/^已知 /, '');
  }
  turn.title = turn.textContent;
  turn.textContent = templateTurn;
};
RENDER.shortage = renderShortage;
function values() {
  const today = snapshotDay();
  return {
    month: today.slice(0, 7) + '-01',
    today,
    plan_end: new Date(Date.parse(today + 'T00:00:00Z') + 6 * 86400000).toISOString().slice(0, 10),
    basis: '销售口径',
    base: null,
    region: null,
    province: null,
    sales_group: null,
  };
}
function request(dataset, page = 1) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    port.postMessage({ type: 'query', id, dataset, page, filters: values() });
  });
}
async function read(dataset) {
  if (cache.has(dataset)) return cache.get(dataset);
  const first = await request(dataset);
  let rows = first.rows;
  if (first.size) {
    for (let page = 2; page <= Math.ceil(first.total / first.size); page++) {
      const next = await request(dataset, page);
      if (next.total !== first.total || next.configVersion !== first.configVersion)
        throw Error('读取期间数据发生变化，请重新进入页面');
      rows.push(...next.rows);
    }
    if (rows.length !== first.total) throw Error('数据未完整读取');
  }
  return { rows };
}
function update() {
  const baseRows = cache.get('plan.base')?.rows ?? [];
  D.baseProgress = baseRows.map((row) =>
    Object.assign(rowTemplate('baseProgress'), {
      base: escaped(row.base || '归属未知'),
      ym: values().month.slice(0, 7),
      orderTotal: finite(row.ordered),
      natShip: finite(row.shipped),
      orderSources: [row],
    }),
  );
  if (baseRows.length)
    D.baseProgress.push(
      Object.assign(rowTemplate('baseProgress'), {
        base: '合计',
        orderTotal: total(D.baseProgress, 'orderTotal'),
        natShip: total(D.baseProgress, 'natShip'),
      }),
    );
  D.correctionPlan =
    baseRows.length && baseRows.every((row) => Number.isFinite(finite(row.adjusted_plan)))
      ? baseRows.reduce((n, row) => n + Number(row.adjusted_plan), 0)
      : NaN;
  BASES.splice(0, BASES.length, ...D.baseProgress.filter((row) => row.base !== '合计'));
  D.areaProgress = (cache.get('plan.region')?.rows ?? []).map((row) =>
    Object.assign(rowTemplate('areaProgress'), {
      region: escaped(row.region),
      province: escaped(row.province),
      salesGroup: escaped(row.sales_group),
      orderSources: [row],
      planDms: finite(row.initial_plan),
      orderTotal: finite(row.ordered),
      natShip: finite(row.shipped),
    }),
  );
  const items = ['休闲', '水饺', '汤圆', '火锅料', '面点', '预制食材', '馄饨'];
  const itemRows = cache.get('plan.item')?.rows ?? [];
  D.itemOrderCoverage = Object.fromEntries(
    items.map((item) => [item, knownOrderPlanSummary(itemRows.filter((row) => row.item === item))]),
  );
  D.dailyItem = [
    ['纠偏计划', 'adjusted_plan'],
    ['累计报单量', 'ordered'],
    ['累计发货量', 'shipped'],
  ].map(([metric, key]) => ({
    metric,
    vals: [
      ...items.map((item) => {
        const rows = itemRows.filter((row) => row.item === item);
        return rows.length && rows.every((row) => Number.isFinite(finite(row[key])))
          ? rows.reduce((n, row) => n + Number(row[key]), 0)
          : NaN;
      }),
      ...Array(14).fill(NaN),
    ],
  }));
  const skuMap = new Map();
  for (const row of cache.get('plan.sku')?.rows ?? []) {
    const key = JSON.stringify([row.base, row.sku]);
    skuMap.set(
      key,
      Object.assign(rowTemplate('sku'), {
        pickup: escaped(row.base || '归属未知'),
        code: escaped(row.sku),
        name: escaped(row.material_name),
        planSalesStart: finite(row.initial_plan),
        planSalesFix: finite(row.adjusted_plan),
      }),
    );
  }
  for (const row of cache.get('shortage.sku')?.rows ?? []) {
    const key = JSON.stringify([row.base, row.sku]);
    const sku =
      skuMap.get(key) ??
      Object.assign(rowTemplate('sku'), {
        pickup: escaped(row.base),
        code: escaped(row.sku),
        name: escaped(row.material_name),
      });
    sku.item = escaped(row.item);
    skuMap.set(key, sku);
  }
  D.sku = [...skuMap.values()];
  skuFiltered = D.sku;
  const ageRows = cache.get('orders.age')?.rows;
  D.unopenPickup = [];
  if (ageRows) {
    const groups = bucketOrderAges(ageRows, snapshotDay());
    const map = { '0–2天': 'd3', '3–5天': 'd3_6', '6–9天': 'd6_10', '10天及以上': 'd10p' };
    const row = rowTemplate('unopenPickup');
    Object.assign(row, { base: '全部授权基地', pickup: '全部授权提货点' });
    Object.assign(row.total, {
      orders: groups.reduce((n, g) => n + g.orders, 0),
      d3: 0,
      d3_6: 0,
      d6_10: 0,
      d10p: 0,
    });
    for (const group of groups)
      if (map[group.age_band]) row.total[map[group.age_band]] = group.orders;
    D.unopenPickup = [row];
  }
  D.orderDetail = (cache.get('orders.pending')?.rows ?? []).map((row) =>
    Object.assign(rowTemplate('orderDetail'), {
      doc: escaped(row.cust_order_no),
      src: escaped(row.cust_order_no),
      date: escaped(row.created_at),
      pickup: escaped(row.base),
    }),
  );
  D.warehouse = (cache.get('warehouse.stage')?.rows ?? [])
    .filter(
      (row, i, rows) =>
        rows.findIndex((other) => other.base === row.base && other.warehouse === row.warehouse) ===
        i,
    )
    .map((row) =>
      Object.assign(rowTemplate('warehouse'), {
        base: escaped(row.base),
        name: escaped(row.warehouse),
      }),
    );
  D.liveCharts = ['c_ov_funnel', 'c_base_prog', 'c_item_ship', ...(ageRows ? ['c_ov_age'] : [])];
  enrichOriginalData(D, cache, rowTemplate, snapshotDay());
  skuFiltered = D.sku;
  D.meta = {
    period: values().month.slice(0, 7),
    generated: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }),
  };
  renderMeta();
  renderKPI();
  delete inited[active];
  originalSwitch(active);
}
let renderTimer;
const loader = createOperationsLoader({
  cache,
  read,
  changed() {
    if (renderTimer !== undefined) return;
    renderTimer = setTimeout(() => {
      renderTimer = undefined;
      update();
    }, 60);
  },
  status(value) {
    D.readStatus = value;
    renderMeta();
  },
});
async function load() {
  if (!connected || !port) return;
  await loader.load(needs[active]);
}
switchTab = (key) => {
  active = key;
  originalSwitch(key);
  void load();
};
function reset() {
  loader.reset();
  clearTimeout(renderTimer);
  renderTimer = undefined;
  cache.clear();
  for (const key of Object.keys(inited)) delete inited[key];
  regLevel = 0;
  regRegion = '';
  regProv = '';
  document
    .querySelectorAll('#f_region,#f_shortage,#sf_top_base')
    .forEach((node) => node.replaceChildren());
  for (const [id, chart] of Object.entries(CH)) {
    chart.dispose();
    delete CH[id];
  }
  document
    .querySelectorAll('.tbl-card,#base_drill,#item_drill,#sku_drill,#wh_drill,#unopen_body')
    .forEach((node) => node.replaceChildren());
  for (const task of pending.values()) task.reject(Error('授权或会话已变化'));
  pending.clear();
  port?.postMessage({ type: 'cancel' });
  D.readStatus = '等待当前用户授权数据';
  D.liveCharts = [];
  update();
}
boot();
reset();
document.documentElement.style.overflowY = 'hidden';
let measuredHeight = 0,
  heightFrame;
function reportHeight() {
  if (heightFrame !== undefined) return;
  heightFrame = requestAnimationFrame(() => {
    heightFrame = undefined;
    if (!port) return;
    const height = Math.ceil(document.body.getBoundingClientRect().height);
    if (height > 0 && height !== measuredHeight) {
      measuredHeight = height;
      port.postMessage({ type: 'height', height });
    }
  });
}
new ResizeObserver(reportHeight).observe(document.body);
window.addEventListener('message', (event) => {
  if (
    event.source !== parent ||
    event.data?.protocol !== 'delivery-operations-v1' ||
    event.data.type !== 'connect' ||
    !event.ports[0] ||
    port
  )
    return;
  port = event.ports[0];
  connected = event.data.connected;
  port.onmessage = ({ data }) => {
    if (data.type === 'reset') {
      connected = data.connected;
      reset();
      if (connected) void load();
      return;
    }
    if (data.type === 'session-ready') {
      connected = true;
      void load();
      return;
    }
    const task = pending.get(data.id);
    if (!task) return;
    pending.delete(data.id);
    if (data.error) task.reject(Error(data.error));
    else task.resolve(data.result);
  };
  port.start();
  reportHeight();
  if (connected) void load();
});
parent.postMessage({ protocol: 'delivery-operations-v1', type: 'ready' }, '*');
