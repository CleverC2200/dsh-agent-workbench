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
export function fullChainCards(stock: any, orders: any, version = ''): FullChainCard[] {
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
      value: null,
      unit: '箱',
      scope: '当前待发与备单阶段缺少来源',
      tab: 'shortage',
      details: [
        ['本月订单量', completeValue(orders, 'ordered'), '箱'],
        ['本月发货量', completeValue(orders, 'shipped'), '箱'],
      ],
    },
  ];
}

export function formatChainValue(value: number | null, unit = '') {
  if (value == null || !Number.isFinite(value)) return '-';
  if (['件', '箱', '件/天', '箱/天'].includes(unit) && Math.abs(value) >= 10000)
    return `${(value / 10000).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}万${unit}`;
  return value.toLocaleString('zh-CN', { maximumFractionDigits: 2 }) + unit;
}
