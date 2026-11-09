import { dayOffset, metricNames, metricCalculationVersion } from './metric-model.mjs';
import { amendmentMetricContract } from '../../business/inventory-orderworkbench/sku-amendments.mjs';
import { ontimeMetricContract } from '../../business/inventory-orderworkbench/ontime-queries.mjs';
import { workbenchEvidence, workbenchMetricDetail } from './live-presentation.mjs';

export function metricDetailsRequest(facts, key, selection) {
  if (!metricNames.includes(key)) throw Error('未知指标');
  if (!facts?.periods?.month) throw Error('本期数据尚未返回，请稍后再查看明细');
  if (
    ['改单率', '准交率'].includes(key) &&
    facts.metricCalculationVersion !== metricCalculationVersion
  )
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
  const text =
    `请使用 operations-order-kpi-details skill，在右侧生成“${label}指标明细”表格。\n` +
    `当前报告：${selection.label}；本期月累计：${window(facts.periods.month)}；本周：${window(facts.periods.week)}。\n` +
    '点击的是全国汇总卡的本期值，请以本期范围为主，按需单独列出本周，不混用两个周期。' +
    '按该 skill 的订单/库存明细列输出表格，标明实际库存快照和统计范围。' +
    '使用当前页面已发布口径及当前 Agent 授权查询真实明细；有限样本不当作完整清单，缺失字段标记待确认，不从汇总编造明细。' +
    (key === '改单率'
      ? '\n改单率按lastshipmenttime装车完成时间归属实际发货周期，执行单号＋客户关联日表；缺发货时间不以OMS新增或WMS关单替代。按商品明细数量合计：仅客户要求改单量≥0计入绝对数量差分子，完整有效量为分母；不加锁定期，不要求改单时间。使用本次上下文的contract及queries，不能沿用旧会话的张数口径、小时表或锁定期；先列数量分子、分母及比率，分页明细不代替全量汇总。'
      : key === '准交率'
        ? '\n准交率按TMS实际到货周期、执行单号去重；直接列已发布分子、完整分母和待判定数量，不能从样本反推。kamd/dc晚满18小时、其他客户晚满12小时算逾期；待判定保留分母。独立核对使用gea_order_ontime固定查询，不用旧Cube度量或样本率替代。'
        : '');
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
        ...(key === '准交率'
          ? {
              contract: ontimeMetricContract,
              queries: {
                summary: {
                  tool: 'gea_order_ontime',
                  parameters: {
                    start: facts.periods.month.start,
                    endExclusive: facts.periods.month.end,
                    base: '',
                    view: 'summary',
                  },
                },
                details: {
                  tool: 'gea_order_ontime',
                  parameters: {
                    start: facts.periods.month.start,
                    endExclusive: facts.periods.month.end,
                    base: '',
                    view: 'details',
                    page: 1,
                  },
                },
              },
            }
          : {}),
        ...(key === '改单率'
          ? {
              contract: amendmentMetricContract,
              queries: {
                summary: {
                  tool: 'gea_order_amendment',
                  parameters: {
                    start: facts.periods.month.start,
                    endExclusive: facts.periods.month.end,
                    base: '',
                    view: 'summary',
                  },
                },
                details: {
                  tool: 'gea_order_amendment',
                  parameters: {
                    start: facts.periods.month.start,
                    endExclusive: facts.periods.month.end,
                    base: '',
                    view: 'details',
                    page: 1,
                  },
                  scope: '与汇总相同的有效明细；每页200条，不能用单页重算全量比率',
                },
              },
            }
          : {}),
      },
      evidence: workbenchEvidence(facts),
    },
  };
}
