import { dayOffset, metricNames } from './metric-model.mjs';
import { workbenchEvidence, workbenchMetricDetail } from './live-presentation.mjs';

export function metricDetailsRequest(facts, key, selection) {
  if (!metricNames.includes(key)) throw Error('未知指标');
  if (!facts?.periods?.month) throw Error('本期数据尚未返回，请稍后再查看明细');
  const label =
    key === '周转天数'
      ? '可发货天数'
      : key === '订单满足率'
        ? '满足率'
        : key === '货龄（>60天库存占比）'
          ? '60天及以上货龄占比'
          : key;
  const window = (period) =>
    !period || period.start >= period.end
      ? '尚无已结束日期'
      : `${period.start} 至 ${dayOffset(period.end, -1)}`;
  const text =
    `请使用 operations-order-kpi-details skill，在右侧生成“${label}指标明细”表格。\n` +
    `当前报告：${selection.label}；本期月累计：${window(facts.periods.month)}；本周：${window(facts.periods.week)}。\n` +
    '点击的是全国汇总卡的本期值，请以本期范围为主，按需单独列出本周，不混用两个周期。' +
    '按该 skill 的订单/库存明细列输出表格，标明实际库存快照和统计范围。' +
    '使用当前页面已发布口径及当前 Agent 授权查询真实明细；有限样本不当作完整清单，缺失字段标记待确认，不从汇总编造明细。';
  return {
    text,
    context: {
      pageId: 'inventory-orderworkbench',
      instance: 'default',
      consumerCode: 'order',
      source: facts.source ?? 'gea-governed-sql',
      mock: false,
      period: { ...selection },
      filters: { dimension: 'national', base: '' },
      metricDetails: {
        skill: 'operations-order-kpi-details',
        metric: key,
        label,
        primaryPeriod: 'month',
        definition: workbenchMetricDetail({ ...facts, selected: 'month' }, key),
      },
      evidence: workbenchEvidence(facts),
    },
  };
}
