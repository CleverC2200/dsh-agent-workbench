import { metricTarget, workbenchMetricState } from './performance-rules.mjs';
import { stockComponents } from './metric-model.mjs';
import { metricSpecs } from './metric-definitions.mjs';

export function metricSnapshot(
  period,
  key,
  { base = '', turnoverScope = base ? 'base' : 'national' } = {},
) {
  const metric = period.metrics[key];
  const rows = (id) =>
    period.sections.find((part) => part.id === id && part.status === 'ready')?.rows ?? [];
  const sum = (data, field) =>
    data.length &&
    data.every(
      (row) =>
        row[field] !== null &&
        row[field] !== undefined &&
        row[field] !== '' &&
        Number.isFinite(Number(row[field])),
    )
      ? data.reduce((total, row) => total + Number(row[field]), 0)
      : null;
  let numerator = null,
    denominator = null,
    quantityUnit = '商品数量',
    pending = null;
  if (['作废率', '改单率'].includes(key)) {
    const data = rows('changes').filter(
      (row) => String(row.kind) === (key === '作废率' ? '1' : '2'),
    );
    numerator = metric.provisional
      ? (metric.population?.knownNumerator ?? null)
      : sum(data, metric.sample ? 'sample_numerator' : 'numerator');
    denominator = metric.provisional
      ? (metric.population?.denominator ?? null)
      : sum(data, metric.sample ? 'sample_denominator' : 'denominator');
    pending = sum(data, 'invalid');
  } else if (key === '订单满足率') {
    const data = rows('orders');
    denominator = sum(data, metric.sample ? 'sample_demand' : 'demand');
    const shortage = sum(data, metric.sample ? 'sample_shortage' : 'shortage');
    numerator = denominator !== null && shortage !== null ? denominator - shortage : null;
    pending = sum(data, 'invalid');
  } else if (key === '准交率') {
    numerator = metric.counts?.onTime ?? null;
    denominator = metric.counts?.total ?? null;
    pending = metric.counts?.pending ?? null;
    quantityUnit = '张执行单';
  } else if (key === '货龄（>60天库存占比）') {
    numerator = sum(rows('ages'), 'aged_qty');
    denominator = sum(rows('ages'), 'stock_qty');
    pending = sum(rows('ages'), 'invalid');
  } else if (key === '周转天数') {
    const quantities = stockComponents(rows('stock'), turnoverScope);
    numerator = quantities?.numerator ?? null;
    denominator = quantities?.denominator ?? null;
    quantityUnit = '分子：现存商品数量；分母：商品数量/天';
  }
  return {
    value: metric.value,
    target: metricTarget(key, base),
    status: workbenchMetricState(key, metric.value, base),
    unit: metric.unit,
    periodBasis: metricSpecs[key].dateBasis,
    ...(metricSpecs[key].cancellationBoundary
      ? { cancellationBoundary: metricSpecs[key].cancellationBoundary }
      : {}),
    formula: metric.note,
    numerator,
    denominator,
    quantityUnit,
    pending,
    ...(key === '准交率'
      ? {
          known: metric.counts?.known ?? null,
          late: metric.counts ? metric.counts.known - metric.counts.onTime : null,
        }
      : {}),
    pendingUnit:
      key === '准交率'
        ? '张执行单'
        : key === '订单满足率'
          ? '个候选原单产品组'
          : key === '货龄（>60天库存占比）'
            ? '个库存汇总粒度'
            : '条候选商品明细',
    scope:
      key === '准交率'
        ? '完整候选执行单分母（含待判定），样本率仅作补充'
        : metric.provisional
          ? '暂算分子/全量有效量分母'
          : metric.sample
            ? '可判定样本，非全量'
            : '当前卡片统计集合',
    sample: metric.sample ?? null,
    provisional: metric.provisional === true,
    missingReason: metric.missingReason ?? null,
    excluded: null,
    countMeaning:
      'pending为已保留集合内待判定计数，单位随指标粒度；不是剔除数。excluded未发布，不能写0。',
  };
}
