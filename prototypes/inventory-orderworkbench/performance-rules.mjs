import { normalizeWorkbenchBase } from '../../business/inventory-orderworkbench/base-scope.mjs';

export const metricLimits = {
  作废率: { healthy: 6, warning: 10, direction: 'lower' },
  改单率: { healthy: 2, warning: 5, direction: 'lower' },
  订单满足率: { healthy: 95, warning: 90, direction: 'higher' },
  准交率: { healthy: 98.5, warning: 94, direction: 'higher' },
};
const stockLimits = { national: 12.5, 郑州: 12.5, other: 11 };
export const shippableDaysTarget = `全国<${stockLimits.national}天（郑州≤${stockLimits.郑州}天，其他基地<${stockLimits.other}天）`;
export const performanceStyleVersion = 13;

export function shippableDaysState(value, base = '') {
  base = normalizeWorkbenchBase(base);
  if (value === null || value === undefined || !Number.isFinite(value)) return '数据不足';
  if (base === '未映射' || base === '归属待补全') return '数据不足';
  const met =
    base === '郑州'
      ? value <= stockLimits.郑州
      : value < (base && base !== '合计' ? stockLimits.other : stockLimits.national);
  return met ? '健康' : '严重';
}

export function metricTarget(name, base = '') {
  base = normalizeWorkbenchBase(base);
  const limit = metricLimits[name];
  if (limit) return `${limit.direction === 'lower' ? '<' : '>'}${limit.healthy}%`;
  if (name === '周转天数')
    return base === '郑州'
      ? `≤${stockLimits.郑州}天`
      : base && base !== '合计'
        ? `<${stockLimits.other}天`
        : shippableDaysTarget;
  return name === '货龄（>60天库存占比）' ? '越低越好' : null;
}

export function metricGroupTarget(name, base, dimensions) {
  return name === '周转天数' && !dimensions.includes('base')
    ? `<${stockLimits.national}天`
    : metricTarget(name, base);
}

export function workbenchMetricState(name, value, base = '') {
  if (value === null || value === undefined || !Number.isFinite(value)) return '数据不足';
  const limit = metricLimits[name];
  if (limit)
    return limit.direction === 'lower'
      ? value < limit.healthy
        ? '健康'
        : value <= limit.warning
          ? '预警'
          : '严重'
      : value > limit.healthy
        ? '健康'
        : value >= limit.warning
          ? '预警'
          : '严重';
  if (name === '周转天数') return shippableDaysState(value, base);
  return name === '货龄（>60天库存占比）' ? '当前范围' : '判定标准未定义';
}

export function performanceCurrentCell(name, value, text, base = '') {
  if (value === null || value === undefined || !Number.isFinite(value)) return text;
  const bad =
    name === '订单满足率'
      ? value <= metricLimits.订单满足率.healthy
      : name === '准交率'
        ? value <= metricLimits.准交率.healthy
        : name === '改单率' || name === '作废率'
          ? value >= metricLimits[name].healthy
          : name === '周转天数'
            ? shippableDaysState(value, base) === '严重'
            : false;
  return { text, state: bad ? 'bad' : 'good', raw: value };
}

export function highlightAgePeak(rows, ageIndex) {
  const candidates = rows.filter((row) => row[0] !== '合计' && Number.isFinite(row[ageIndex]?.raw));
  if (!candidates.length) return rows;
  const peak = Math.max(...candidates.map((row) => row[ageIndex].raw));
  for (const row of candidates) if (row[ageIndex].raw === peak) row[ageIndex].state = 'warning';
  return rows;
}
