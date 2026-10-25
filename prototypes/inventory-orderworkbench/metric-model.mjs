import { deriveMetrics } from 'dsh-agent-manage/aps-compute/metrics';

export const metricNames = [
  '作废率',
  '改单率',
  '订单满足率',
  '准交率',
  '货龄（>60天库存占比）',
  '周转天数',
];
export const dayOffset = (day, amount) =>
  new Date(Date.parse(day + 'T00:00:00Z') + amount * 86400000).toISOString().slice(0, 10);
const finite = (value) =>
  value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
const sum = (rows, key) =>
  rows.length && rows.every((row) => finite(row[key]))
    ? rows.reduce((total, row) => total + Number(row[key]), 0)
    : null;
const invalid = (rows, key = 'invalid') =>
  rows.some((row) => !finite(row[key]) || Number(row[key]) !== 0);
export const metricValue = (metrics, name) => metrics?.[name]?.value ?? null;
export function stockDaily(row) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(row.stock_date) ||
    !finite(row.sales_plan) ||
    !finite(row.transfer_plan)
  )
    return null;
  const days = new Date(
    Date.UTC(Number(row.stock_date.slice(0, 4)), Number(row.stock_date.slice(5, 7)), 0),
  ).getUTCDate();
  return (Number(row.sales_plan) + 0.5 * Number(row.transfer_plan)) / days;
}
export function computeWorkbenchMetrics(period, filter = () => true) {
  const section = (name) => period.sections.find((section) => section.id === name);
  const rows = (name) =>
    section(name)?.status === 'ready' ? section(name).rows.filter(filter) : [];
  const orders = rows('orders'),
    stock = rows('stock'),
    ages = rows('ages'),
    changes = rows('changes');
  const supply = stock.map((row) => ({
    ...row,
    demand: stockDaily(row),
    invalid: Number(row.invalid) + (Number(row.source_rows) === 1 ? 0 : 1),
  }));
  const derived = deriveMetrics({
    start: period.start,
    end: dayOffset(period.end, -1),
    granularity: period.kind,
    sections: [
      { id: 'orders', status: section('orders')?.status ?? 'error', rows: orders },
      { id: 'shippable', status: section('stock')?.status ?? 'error', rows: supply },
    ],
  });
  const result = {};
  const put = (name, value, note, unit = '%') => (result[name] = { name, value, unit, note });
  for (const [kind, name] of [
    ['1', '作废率'],
    ['2', '改单率'],
  ]) {
    const selected = changes.filter((row) => String(row.kind) === kind),
      denominator = sum(selected, 'denominator'),
      numerator = sum(selected, 'numerator');
    put(
      name,
      denominator !== null && denominator !== 0 && numerator !== null
        ? (numerator / denominator) * 100
        : null,
      '按创建日期汇总' + (kind === '1' ? '作废' : '改单') + '量 ÷ 下单量；空数量按0，保留正负',
    );
  }
  result['订单满足率'] = derived['订单满足率'];
  const judged = sum(orders, 'judged'),
    ontime = sum(orders, 'ontime');
  put(
    '准交率',
    !invalid(orders, 'invalid_judgment') && judged > 0 && ontime !== null
      ? (ontime / judged) * 100
      : null,
    `准交执行记录 ÷ 有效判定记录；${sum(orders, 'unjudged') ?? 0}条空判定不计分母（非订单去重张数）`,
  );
  const total = sum(ages, 'stock_qty'),
    aged = sum(ages, 'aged_qty');
  put(
    '货龄（>60天库存占比）',
    !invalid(ages) && total > 0 && aged !== null && aged >= 0 && aged <= total
      ? (aged / total) * 100
      : null,
    `基地01/02批次≥60天库存 ÷ 同范围库存；排除${sum(ages, 'excluded') ?? 0}条零数量或无生产日期批次`,
  );
  put(
    '周转天数',
    derived['可发货天数'].value,
    '可用库存 ÷（滚动销售计划＋0.5×滚动调出计划）×快照月自然天数' +
      (supply.some((row) => row.invalid) ? '；存在缺值、负值或重复库存记录' : ''),
    '天',
  );
  for (const [id, names] of [
    ['orders', ['订单满足率', '准交率']],
    ['changes', ['作废率', '改单率']],
    ['stock', ['周转天数']],
    ['ages', ['货龄（>60天库存占比）']],
  ]) {
    const part = section(id);
    if (part?.status === 'error')
      for (const name of names)
        Object.assign(result[name], { value: null, note: '查询未完成：' + part.code });
    else if (!rows(id).length)
      for (const name of names)
        Object.assign(result[name], { value: null, note: '所选周期及授权范围内无来源数据' });
  }
  return result;
}
export function metricState(name, value) {
  if (value === null) return '数据不足';
  if (name === '作废率') return value < 6 ? '健康' : value <= 10 ? '预警' : '严重';
  if (name === '改单率') return value < 2 ? '健康' : value <= 5 ? '预警' : '严重';
  if (name === '订单满足率') return value > 95 ? '健康' : value >= 90 ? '预警' : '严重';
  if (name === '准交率') return value > 98.5 ? '健康' : value >= 94 ? '预警' : '严重';
  if (name === '周转天数') return value > 8 && value < 12 ? '健康' : value <= 15 ? '预警' : '严重';
  return '判定标准未定义';
}
export function metricDelta(current, previous, name) {
  const a = metricValue(current, name),
    b = metricValue(previous, name);
  return a === null || b === null
    ? '—'
    : `${a - b >= 0 ? '+' : ''}${(a - b).toFixed(2)}${name === '周转天数' ? '天' : 'pp'}`;
}
export function reportPeriods(start, end, now = new Date()) {
  const today = new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10);
  const limit = end < today ? end : today;
  const monthStart = start.slice(0, 7) + '-01';
  const monthEnd = new Date(Date.UTC(Number(start.slice(0, 4)), Number(start.slice(5, 7)), 1))
    .toISOString()
    .slice(0, 10);
  const monthly = start === monthStart && end === monthEnd;
  const last = dayOffset(limit, -1);
  const date = new Date(last + 'T00:00:00Z');
  const weekStart = monthly ? dayOffset(last, -((date.getUTCDay() + 6) % 7)) : start;
  const inventoryEnd = end < dayOffset(today, 1) ? end : dayOffset(today, 1);
  const month = { start: monthStart, end: limit, inventoryEnd, kind: 'month' },
    week = { start: weekStart, end: limit, inventoryEnd, kind: 'week' };
  const monthBack = (period, count) => {
    const d = new Date(period.start + 'T00:00:00Z');
    d.setUTCMonth(d.getUTCMonth() - count);
    const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
      .toISOString()
      .slice(0, 10);
    const s = d.toISOString().slice(0, 10),
      e = dayOffset(s, Math.round((Date.parse(period.end) - Date.parse(period.start)) / 86400000));
    return { start: s, end: e < next ? e : next, kind: 'month' };
  };
  return {
    selected: monthly ? 'month' : 'week',
    month,
    previousMonth: monthBack(month, 1),
    yearMonth: monthBack(month, 12),
    week,
    previousWeek: { start: dayOffset(week.start, -7), end: dayOffset(week.end, -7), kind: 'week' },
    yearWeek: { start: dayOffset(week.start, -364), end: dayOffset(week.end, -364), kind: 'week' },
  };
}
