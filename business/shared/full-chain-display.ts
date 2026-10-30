import { completeValue, fulfillmentPercent, knownNumber } from './configured-overview';

type Detail = [string, number | null, string, string?];
export type FullChainCard = {
  title: string;
  value: number | null;
  unit: string;
  scope: string;
  tab: string;
  details: Detail[];
};

function coveredValue(summary: any, field: string, count: string) {
  return (knownNumber(summary?.[count]) ?? 0) > 0 ? knownNumber(summary?.[field]) : null;
}
function coverage(summary: any, count: string) {
  return `${knownNumber(summary?.[count]) ?? '-'} / ${knownNumber(summary?.row_count) ?? '-'} 个SKU`;
}

/** Put available facts in view without presenting a partial base scope as company stock. */
export function fullChainCards(
  stock: any,
  orders: any,
  version = '',
  snapshotDate = '',
): FullChainCard[] {
  const openOrders = snapshotDate
    ? coveredValue(stock, 'known_open_orders', 'known_open_orders_count')
    : null;
  const allocated = snapshotDate
    ? coveredValue(stock, 'known_allocated', 'known_allocated_count')
    : null;
  const snapshotCount = knownNumber(stock?.order_snapshot_count);
  return [
    {
      title: '当前库存',
      value: coveredValue(stock, 'known_inventory', 'known_inventory_count'),
      unit: '箱',
      scope: `基地 · 范围 ${coverage(stock, 'known_inventory_count')}`,
      tab: 'structure',
      details: [
        ['基地可用', coveredValue(stock, 'known_available', 'known_available_count'), '箱'],
        ['分仓库存', null, '箱', '缺分仓库存快照'],
      ],
    },
    {
      title: '库存周转',
      value: coveredValue(stock, 'matched_stock_days', 'matched_turnover_count'),
      unit: '天',
      scope: `基地 · ${version ? version + '需求 · ' : ''}同范围 ${coverage(stock, 'matched_turnover_count')}`,
      tab: 'structure',
      details: [
        [
          '同范围库存',
          coveredValue(stock, 'matched_turnover_inventory', 'matched_turnover_count'),
          '箱',
        ],
        [
          '同范围计划日均需求',
          coveredValue(stock, 'matched_turnover_demand', 'matched_turnover_count'),
          '箱/天',
        ],
      ],
    },
    {
      title: '当前货龄',
      value: null,
      unit: '天',
      scope: '平均货龄缺少批次生产日期',
      tab: 'aging',
      details: [
        ['基地超60天库存', coveredValue(stock, 'known_over60', 'known_over60_count'), '箱'],
        ['超60天库存覆盖SKU', knownNumber(stock?.known_over60_count), '个'],
      ],
    },
    {
      title: '订单满足率',
      value: fulfillmentPercent(orders),
      unit: '%',
      scope: '本月累计履约 · 非当前待发',
      tab: 'shortage',
      details: [
        ['本月需求量', completeValue(orders, 'demand'), '箱'],
        ['本月缺货量', completeValue(orders, 'shortage'), '箱'],
      ],
    },
    {
      title: '当前订单',
      value: openOrders,
      unit: '箱',
      scope:
        openOrders == null
          ? '当前待发与备单阶段缺少来源'
          : `基地未备单量 · ${snapshotDate} · 范围 ${stock.known_open_orders_count}/${snapshotCount ?? '-'} 个SKU`,
      tab: 'shortage',
      details: [
        ['本月订单量', completeValue(orders, 'ordered'), '箱'],
        ['本月发货量', completeValue(orders, 'shipped'), '箱'],
        ...(allocated == null
          ? []
          : [
              [
                '基地已备单占用' +
                  (knownNumber(stock?.known_allocated_count) === snapshotCount
                    ? ''
                    : `（范围 ${stock.known_allocated_count}/${snapshotCount ?? '-'} 个SKU）`),
                allocated,
                '箱',
              ] as Detail,
            ]),
      ],
    },
  ];
}

export function formatChainValueParts(value: number | null, unit = '') {
  if (value == null || !Number.isFinite(value)) return { value: '-', unit: '' };
  const quantity = ['件', '箱', '件/天', '箱/天'].includes(unit);
  const scale = quantity
    ? Math.abs(value) >= 100000000
      ? 100000000
      : Math.abs(value) >= 10000
        ? 10000
        : 1
    : 1;
  const suffix = scale === 100000000 ? '亿' : scale === 10000 ? '万' : '';
  return {
    value: (value / scale).toLocaleString('zh-CN', { maximumFractionDigits: 2 }),
    unit: suffix + unit,
  };
}

export function formatChainValue(value: number | null, unit = '') {
  const formatted = formatChainValueParts(value, unit);
  return formatted.value + formatted.unit;
}

const inventoryQuantityLabels = new Set([
  '当前库存',
  '目标库存',
  '库存差额',
  '当前订单',
  '基地未备单量',
  '未发货订单占用',
  '未备单订单占用',
  '基地已备单占用',
  '已备单占用',
  '缺货量',
  '已发订单量',
  '发货量',
  '实际发货量',
  '超龄库存',
  '超60天库存',
  '本月订单量',
  '本月发货量',
  '当前待发总量',
  '备单量',
]);

// Older dashboard payloads contain formatted text instead of numeric quantities.
// Only known quantity metrics may acquire a unit; other metrics stay unchanged.
export function formatInventoryMetricTextParts(label: string, text: string) {
  if (!inventoryQuantityLabels.has(label)) return { value: text, unit: '' };
  const match = text
    .trim()
    .match(/^([+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)\s*(件|箱)?(（部分）)?$/u);
  if (!match) return { value: text, unit: '' };
  const formatted = formatChainValueParts(Number(match[1].replaceAll(',', '')), match[2] || '件');
  return { value: formatted.value, unit: formatted.unit + (match[3] || '') };
}
