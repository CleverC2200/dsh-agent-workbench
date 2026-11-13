const contextLimit = 90000;
const sampleLimit = 3;
const detailedKeys = new Set([
  'quantities',
  'preparingStates',
  'states',
  'order_ids',
  'preparing_order_ids',
  'overdue_order_ids',
  'warning_order_ids',
  'shortage_order_ids',
  'rate_order_ids',
  'orders',
  'overdueOrders',
  'warningOrders',
  'preparingOrders',
]);

function aggregate(value) {
  if (Array.isArray(value)) return value.map(aggregate);
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype)
    return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([key, child]) => !detailedKeys.has(key) || child === null || typeof child !== 'object',
      )
      .map(([key, child]) => [key, aggregate(child)]),
  );
}

function sample(part, count) {
  if (!part || !Array.isArray(part.rows)) return part;
  return {
    ...part,
    rows: part.rows.slice(0, count),
    snapshotRows: part.snapshotRows ?? part.rows.length,
    detailScope: '仅传当前结果的少量明细样本；total保留来源值，不能用样本重算全量指标。',
  };
}

export function fulfillmentPageContext(snapshot) {
  if (!snapshot || snapshot.state === 'unavailable') return snapshot;
  const counts = snapshot.calculated?.orderCounts;
  const canReconcile =
    counts &&
    ['valid_orders', 'preparing_orders', 'opened_orders', 'unclassified_orders'].every((key) =>
      Number.isFinite(counts[key]),
    );
  const result = {
    ...snapshot,
    metricSemantics: {
      ...snapshot.metricSemantics,
      ...(canReconcile
        ? {
            countReconciliation: {
              publishedCounts: { ...counts },
              countDefinitions: {
                valid_orders: '有效明细按cust_order_no归并后的履约节点状态记录数。',
                preparing_orders:
                  '有效且prapare_order_status为备单中的明细，按cust_order_no去重计数。',
                opened_orders:
                  '有效且prapare_order_status命中已开状态列表的明细，按cust_order_no去重计数。',
                unclassified_orders:
                  'nodeMetrics中stage为空的节点状态未确认订单数；这是节点维度，不是未开/已开之外的第三种开立状态，不能解释为没有计入未开或已开。',
              },
              residualAfterPreparingAndOpened:
                counts.valid_orders - counts.preparing_orders - counts.opened_orders,
              residualAfterAllReportedCategories:
                counts.valid_orders -
                counts.preparing_orders -
                counts.opened_orders -
                counts.unclassified_orders,
              classificationRelationship:
                '本投影不提供分类集合成员关系，不能据此证明互斥、重叠或某类计数被排除在其他卡片外。',
              cause:
                '未查证；差额只表示已发布计数不能直接闭合，不定位为具体订单、去重、筛选或状态原因。',
              unknown:
                '未知不视为正常或零；不据此推定未知订单不计入未开、超时或预警等卡片。各卡片按自身definition解释。',
            },
          }
        : {}),
    },
    calculated: aggregate(snapshot.calculated),
    comparisons: aggregate(snapshot.comparisons),
    parts: Object.fromEntries(
      Object.entries(snapshot.parts ?? {}).map(([key, value]) => [key, sample(value, sampleLimit)]),
    ),
    ...(snapshot.detailPage ? { detailPage: sample(snapshot.detailPage, sampleLimit) } : {}),
    ...(snapshot.productionFuture
      ? { productionFuture: sample(snapshot.productionFuture, sampleLimit) }
      : {}),
    observationSemantics: {
      scope: '卡片及分组指标来自当前筛选与授权范围的完整输入；快照不包含完整订单明细。',
      details: '重复订单列表和节点逐单状态不随快照传输；明细样本不可当作完整记录或用于重算汇总。',
    },
  };
  if (JSON.stringify(result).length > contextLimit) {
    result.parts = Object.fromEntries(
      Object.entries(result.parts).map(([key, value]) => [key, sample(value, 0)]),
    );
    if (result.detailPage) result.detailPage = sample(result.detailPage, 0);
    if (result.productionFuture) result.productionFuture = sample(result.productionFuture, 0);
  }
  if (JSON.stringify(result).length > contextLimit)
    throw Error('FULFILLMENT_PAGE_CONTEXT_TOO_LARGE');
  return result;
}
