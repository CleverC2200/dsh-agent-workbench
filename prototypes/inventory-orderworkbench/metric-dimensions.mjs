export const orderDimensionLabels = {
  base: '基地',
  item: '品项',
  category: '品类',
  director: '应责总监',
  sku: '产品编号',
  region: '大区',
  province: '省区',
  customer: '客户编码',
  salesRegion: '销售区域（省区优先、大区兜底）',
};

export function metricDimensionContract(metric) {
  const supported = ['base', 'item', 'category', 'director', 'sku'];
  if (['作废率', '改单率'].includes(metric))
    supported.push('region', 'province', 'customer', 'salesRegion');
  else if (['订单满足率', '准交率'].includes(metric))
    supported.push('customer', 'region', 'province', 'salesRegion');
  return {
    supported,
    labels: orderDimensionLabels,
    defaultDimensions: ['base', 'item'],
    maxDimensions: 3,
    skuMeaning:
      metric === '订单满足率'
        ? '履约源表new_material_code归集产品粒度，不冒充执行单原始商品明细。'
        : '沿当前指标发布的material_code商品粒度，不以SKU条数替代数量指标。',
    unsupported: Object.keys(orderDimensionLabels)
      .filter((key) => !supported.includes(key))
      .map((dimension) => ({
        dimension,
        reason: ['货龄（>60天库存占比）', '周转天数'].includes(metric)
          ? '当前指标为基地商品库存与计划，不具备客户或销售区域归属，不能将基地库存按订单客户重复分摊。'
          : '当前同口径来源未提供可核验的历史销售区域归属；不能按名称推断或借其他周期客户映射。',
      })),
  };
}

export function resolveMetricDimensions(metric, input) {
  const contract = metricDimensionContract(metric);
  let dimensions = input === undefined ? contract.defaultDimensions : input;
  if (
    !Array.isArray(dimensions) ||
    !dimensions.length ||
    dimensions.length > contract.maxDimensions ||
    new Set(dimensions).size !== dimensions.length ||
    dimensions.some((key) => typeof key !== 'string' || !Object.hasOwn(orderDimensionLabels, key))
  )
    throw Error('INVALID_ORDER_METRIC_DIMENSIONS');
  if (dimensions.some((key) => ['director', 'sku'].includes(key)) && !dimensions.includes('base'))
    dimensions = ['base', ...dimensions];
  if (dimensions.length > contract.maxDimensions) throw Error('INVALID_ORDER_METRIC_DIMENSIONS');
  const unsupported = dimensions.filter((key) => !contract.supported.includes(key));
  return { dimensions, contract, unsupported };
}
