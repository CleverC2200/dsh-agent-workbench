import { compressForModel } from '../../src/page-interaction/shared/payload-budget.ts';

const contextLimit = 90000;

function metricContext(metric, contract) {
  if (!contract?.formula) return metric;
  const { formula: _formula, note: _note, ...values } = metric;
  return values;
}

export function orderPageContext(snapshot) {
  const contracts = snapshot.evidence?.metricContracts;
  const context = {
    ...snapshot,
    metrics: snapshot.metrics.map((metric) => metricContext(metric, contracts?.[metric.key])),
    ...(snapshot.evidence
      ? {
          evidence: {
            ...snapshot.evidence,
            periods: Object.fromEntries(
              Object.entries(snapshot.evidence.periods ?? {}).map(([name, period]) => [
                name,
                {
                  ...period,
                  metrics: Object.fromEntries(
                    Object.entries(period.metrics ?? {}).map(([key, metric]) => [
                      key,
                      metricContext(metric, contracts?.[key]),
                    ]),
                  ),
                },
              ]),
            ),
          },
        }
      : {}),
    contextProjection: {
      metricDefinitions:
        '各期指标共用evidence.metricContracts中的当前代码口径；数量、状态、样本和待判定均保留原值。',
    },
  };
  if (JSON.stringify(context).length <= contextLimit) return context;
  const {
    source,
    mock,
    pageId,
    instance,
    consumerCode,
    period,
    reportDate,
    filters,
    metrics,
    evidence,
    contextProjection,
    ...details
  } = context;
  const required = {
    source,
    mock,
    pageId,
    instance,
    consumerCode,
    period,
    reportDate,
    filters,
    metrics,
    evidence,
  };
  const available = contextLimit - JSON.stringify(required).length - 1000;
  if (available < 2000) throw Error('ORDER_METRIC_CONTEXT_TOO_LARGE');
  const summary = compressForModel(details, { budgetBytes: available });
  const result = {
    ...JSON.parse(summary.json),
    ...required,
    contextProjection: {
      ...contextProjection,
      detailsSummarized: true,
      note: '仅维度表及人工内容按同步预算保留摘要，不是完整明细；六项卡片和各比较期指标未截断，不改变业务分子分母或剔除数量。更多分组按当前周期、范围调用gea_order_kpi的groups入口。',
      detailSummary: summary.note,
    },
  };
  if (JSON.stringify(result).length > contextLimit) throw Error('ORDER_PAGE_CONTEXT_TOO_LARGE');
  return result;
}
