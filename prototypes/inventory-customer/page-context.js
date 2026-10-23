import { customerMetricDefinitions } from './metric-definitions.js';

/** Exact visible KPI names and units are data, not something the model should infer from summary keys. */
export function customerPageContext(value) {
  const s = value.summary ?? {};
  const total = s.customerCodes?.length;
  const metrics = [
    ['value', '库存价值', s.totalValue, '万元', s.missingValueCount],
    ['quantity', '库存数量', s.quantity, '箱', s.missingQuantityCount],
    ['structure', '结构合理性', s.structureScore, '分', s.structureCoverageCount],
    ['freshness', '库存新鲜度', s.normalRatio, '%', s.normalCoverageCount],
    ['turnover', '周转天数', s.turnover, '天', s.turnoverCoverageCount],
    ['largeDate', '大日期情况', s.largeDateQty, '箱', s.largeDateCoverageCount],
  ].map(([key, label, number, unit, count]) => ({ key, label, value: number ?? null, unit,
    coveredCount: ['value','quantity'].includes(key) ? (Number.isFinite(total) ? total-count : null) : count,
    missingCount: ['value','quantity'].includes(key) ? count : (Number.isFinite(total) ? total-count : null),
    definition: customerMetricDefinitions[key]?.formula ?? [],
    sourceNotes: customerMetricDefinitions[key]?.notes ?? [],
  }));
  return { ...value, metrics, metricSemantics: {
    scopes: '顶部六张卡片与summary覆盖当前角色/组织范围；列表的状态、区域、搜索筛选仅收窄totalFilteredRows和filteredCustomerCodes，不改变卡片汇总。Cube核对当前列表必须用filteredCustomerCodes，不把卡片全量当作筛选后数值。',
    lowCoverageCount: '有有效周转天数且周转天数低于60天的客户数，不是缺失输入的客户数',
    riskCount: '页面规则归类为高风险、关注或异常的客户数；不同于仅有大日期库存的客户数',
    normalRatio: '库存新鲜度=(库存数量-大日期库存数量)/库存数量；不是源normal_stock_qty/stock_qty',
    turnover: '仅对有效覆盖客户按库存及有效在途合计/近30日日均销量计算；在途缺失时为现货估算',
    value: 'totalValue已经除以10000，单位万元；缺金额客户不作为0补齐',
    limits: '仅说明实际字段覆盖与估算；在途缺失不能断定真实在途必大于0，也不能断定必然系统性低估。上游公式未独立复算的必须注明。',
  } };
}
