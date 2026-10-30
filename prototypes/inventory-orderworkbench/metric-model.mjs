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
  rows.length && rows.every((row) => row[key] == null || finite(row[key]))
    ? rows.reduce((total, row) => total + Number(row[key] ?? 0), 0)
    : null;
const invalid = (rows, key = 'invalid') =>
  rows.some((row) => !finite(row[key]) || Number(row[key]) !== 0);
export const metricValue = (metrics, name) => metrics?.[name]?.value ?? null;
export function stockDaily(row) {
  if (Object.hasOwn(row, 'daily_demand')) return row.daily_demand == null ? 0 : finite(row.daily_demand) ? Number(row.daily_demand) : null;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(row.stock_date) ||
    (row.sales_plan != null && !finite(row.sales_plan)) ||
    (row.transfer_plan != null && !finite(row.transfer_plan))
  )
    return null;
  const days = new Date(
    Date.UTC(Number(row.stock_date.slice(0, 4)), Number(row.stock_date.slice(5, 7)), 0),
  ).getUTCDate();
  return (Number(row.sales_plan ?? 0) + 0.5 * Number(row.transfer_plan ?? 0)) / days;
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
    missingValuePolicy: 'zero',
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
    stock.some((row) => Number(row.source_rows) !== 1) ? null : derived['可发货天数'].value,
    '可用库存 ÷ 同范围滚动版本计划日均需求' +
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
    if (part?.status === 'loading')
      for (const name of names)
        Object.assign(result[name], { value: null, note: '正在读取所选周期数据', loading: true });
    else if (part?.status === 'error')
      for (const name of names)
        Object.assign(result[name], { value: null, note: '查询未完成：' + part.code });
    else if (!rows(id).length)
      for (const name of names)
        Object.assign(result[name], { value: null, note: '所选周期及授权范围内无来源数据' });
  }
  for (const name of metricNames) if (result[name]?.value == null)
    result[name].missingReason = workbenchMetricMissingReason(period,name,filter,result[name].note);
  return result;
}
export function workbenchMetricMissingReason(period,name,filter=()=>true,note='') {
  const id = ['作废率','改单率'].includes(name) ? 'changes' : name === '周转天数' ? 'stock' : name === '货龄（>60天库存占比）' ? 'ages' : 'orders';
  const part=period?.sections?.find(section=>section.id===id);
  if(!part||part.status==='loading')return '系统尚未完成读取：所选周期数据未加载完成，暂不能判定源表缺数据。';
  if(part.status!=='ready')return `系统读取未成功：${part.code??part.status}；需核对查询或字段发布，不是0。`;
  const source=part.rows.filter(filter);
  if(!source.length)return `源数据未提供：所选周期及当前授权、分组范围的 ${id} 查询结果无记录；不代表整张表为空。`;
  const fields = name==='订单满足率'?['demand','shortage']:name==='准交率'?['judged','ontime']:name==='周转天数'?['available']:name==='货龄（>60天库存占比）'?['stock_qty','aged_qty']:['numerator','denominator'];
  const absent=fields.filter(field=>source.some(row=>row[field]==null));
  // Existing zero policies are retained; a known zero denominator is a calculation condition.
  if(absent.length && !['作废率','改单率'].includes(name))return `源数据未提供：计算${name}需要的 ${absent.join('、')} 存在空值；${note}`;
  if(source.some(row=>Number(row.source_rows)>1))return `系统未能计算：同一统计粒度存在重复记录，不能直接加总；${note}`;
  const total=field=>source.reduce((sum,row)=>sum+Number(row[field]??0),0);
  if(['作废率','改单率'].includes(name)) {
    const selected=source.filter(row=>String(row.kind)===(name==='作废率'?'1':'2'));
    if(!selected.length)return `源数据未提供：agents_order_cancel_change_di 在当前分组没有${name==='作废率'?'作废':'改单'}类型记录。`;
    if(selected.reduce((sum,row)=>sum+Number(row.denominator??0),0)===0)return `系统未能计算：agents_order_cancel_change_di 当前分组下单量分母合计为0，不能计算${name}。`;
  }
  if(name==='订单满足率'&&total('demand')===0)return '系统未能计算：agents_order_execute_isontime_mi 当前分组需求量合计为0，订单满足率没有有效分母。';
  if(name==='准交率'&&total('judged')===0)return `源数据未提供有效判定：agents_order_execute_isontime_mi.is_ontime 当前分组有效判定0条，空判定${total('unjudged')}条，不能计算准交率。`;
  if(name==='周转天数'&&source.some(row=>stockDaily(row)===null))return '系统未能计算：滚动计划日期、日均需求或数量格式无效，无法按周期换算。';
  if(name==='周转天数'&&source.reduce((sum,row)=>sum+Number(stockDaily(row)??0),0)<=0)return '系统未能计算：同范围滚动计划日均需求合计不大于0，可发货天数没有有效分母。';
  if(name==='货龄（>60天库存占比）'&&total('stock_qty')<=0)return '系统未能计算：agents_scm_inventory_sku_data_d 当前分组有效批次库存合计不大于0，货龄占比没有有效分母。';
  return `系统未能计算：${name}的有效分母、数量范围或判定条件不满足；${note||'缺失不补0，零分母不计算比率。'}`;
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
