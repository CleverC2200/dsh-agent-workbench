import { dayOffset, metricNames, metricCalculationVersion } from './metric-model.mjs';
import { metricSnapshot } from './metric-components.mjs';
import { metricContract } from './metric-definitions.mjs';
import { workbenchEvidence, workbenchMetricDetail } from './live-presentation.mjs';

export function metricDetailsRequest(facts, key, selection, card = {}) {
  if (!metricNames.includes(key)) throw Error('未知指标');
  if (!facts?.periods?.month) throw Error('本期数据尚未返回，请稍后再查看明细');
  if (facts.metricCalculationVersion !== metricCalculationVersion)
    throw Error(`${key}数据口径已更新，请刷新看板后再查询明细`);
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
  const base = facts.base ?? '';
  const scope = base ? 'base' : 'national';
  const current = metricSnapshot(facts.periods.month, key, {base,turnoverScope:facts.turnoverScope ?? scope});
  const config =
    typeof ORDER_WORKBENCH_APS_CONFIG === 'undefined' ? undefined : ORDER_WORKBENCH_APS_CONFIG;
  const contract = { ...metricContract(key, config, scope), version: metricCalculationVersion };
  const parameters = {
    metric: key,
    start: facts.periods.month.start,
    endExclusive: facts.periods.month.end,
    base,
    expectedVersion: metricCalculationVersion,
  };
  return {
    text:
      `请使用 operations-order-kpi-details skill，在右侧生成“${label}指标明细”表格。\n当前报告：${selection.label}；本期月累计：${window(facts.periods.month)}；本周：${window(facts.periods.week)}。\n` +
      `点击的是${base ? base+'基地汇总卡' : '全国汇总卡'}的本期值，主周期为本期月累计，本周另列。按本次current、contract和queries回答，数值、单位、样本及待判定状态保持原意；旧会话、Skill和知识库不覆盖当前代码口径。明细未发布不等于底表无数据；剔除数未发布不写0。不从汇总编造明细，单页不推断全国分布或原因。独立询问这六项指标时使用gea_order_kpi，其他问题继续使用已授权Cube和知识库。`,
    context: {
      pageId: 'inventory-orderworkbench',
      instance: 'default',
      consumerCode: 'order',
      source: facts.source ?? 'gea-governed-sql',
      mock: false,
      period: { ...selection },
      filters: { dimension: scope, base },
      metricDetails: {
        skill: 'operations-order-kpi-details',
        metric: key,
        label,
        primaryPeriod: 'month',
        metricCalculationVersion,
        current: {
          ...current,
          target: card.target ?? current.target,
          status: card.status ?? current.status,
        },
        definition: workbenchMetricDetail({ ...facts, selected: 'month' }, key),
        comparisonPeriods: {
          month: {
            current: facts.periods.month?.start && facts.periods.month?.end,
            previous: facts.periods.previousMonth?.start && facts.periods.previousMonth?.end,
            year: facts.periods.yearMonth?.start && facts.periods.yearMonth?.end,
          },
          week: {
            current: facts.periods.week?.start && facts.periods.week?.end,
            previous: facts.periods.previousWeek?.start && facts.periods.previousWeek?.end,
            year: facts.periods.yearWeek?.start && facts.periods.yearWeek?.end,
          },
        },
        contract,
        queries: {
          summary: { tool: 'gea_order_kpi', parameters: { ...parameters, view: 'summary' } },
          details: {
            tool: 'gea_order_kpi',
            parameters: { ...parameters, view: 'details', page: 1 },
            scope: '明细分页不代替完整汇总；availability不为available时不编造原始明细。',
          },
        },
      },
      evidence: workbenchEvidence(facts),
    },
  };
}
