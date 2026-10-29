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
    normalRatio: '库存新鲜度统一使用计划表同日全部SKU的stock_qty和big_final_qty；覆盖不足保持未知，不是normal_stock_qty/stock_qty，不回退旧日期。',
    turnover: '仅对有效覆盖客户按库存及有效在途合计/近30日日均销量计算；在途缺失时为现货估算',
    value: '库存价值=Σ(计划表同日stock_qty×cif_price)÷10000，单位万元。要求全部SKU的数量和单价完整；空值不补0，不回退旧库存表，预算不能替代。',
    regionalInventoryValues: '按大区拆分价值读取regionalInventoryValues。groupsByName是summary.customerCodes全部客户的互斥分组，不是当前6行；knownValueTotal是全量已知合计，与summary.totalValue同次数据。missingCount须披露，整组未知为null。仅看到的组数等于groupCount才可声称逐组加总完整；partial投影不得当全量。来源是页面受控SQL，不是Cube度量；不同capturedAt不作精确对账。',
    regionalCustomerCounts: '当前卡片角色/组织范围的大区客户数读取regionalInventoryValues.groupsByName各组customerCount；当前列表范围读取filteredRegionalInventoryValues，组数须与groupCount一致，互斥分组加总等于各自customerCount。无需切换区域筛选或用旧库存Cube代替计划表客户集合。',
    unknownOrganization: '分组名区域未知只表示组织归属缺失，不表示库存价值缺失。价值覆盖看coveredCount/missingCount；有覆盖时knownValue=0保留真实0或正负抵消，不得臆断为缺价，也不把组织未知转成金额null。',
    pageControls: '元素目录为页面显式登记的受控控件，不等于整棵DOM。可以通过登记的filter动作或可编辑customer-control元素调整region/status/tab/search/page；未登记的控件只能说当前工具无法操作，不能断言页面没有该控件，更不能把动作未注册等同数据未授权。',
    cubeMetadata: 'inspect_cube_model的members_truncated=true表示返回成员不完整，不表示字段未发布或没有权限。按工具实际schema的limit或单个keyword继续定位成员；不要把多个字段关键词拼成一个短语反复查询，也不猜aliasMember。页面已提供的大区客户数和价值优先用同次页面分组结果；计划表Cube没有已确认的组织维度或客户去重度量时，不用record_count替代客户数，也不换旧表客户集合冒充计划客户集合。',
    assessmentCompleteness: '综合状态保留已确认的结构及大日期风险；结构分或大日期占比缺失时，同格额外标明数据不足及原因，不能把需关注或高风险理解为完整风险已知，也不能因缺失抹掉已知风险。',
    sources: '六项指标统一来自agents_scm_cust_plan_order_analysis_d最新create_date的全部客户+SKU；近30日销量=daily_sales×30，大日期=big_final_qty。组织字段仍缺，仅组织维度使用旧表，日期单独说明。右侧独立Cube模型未更改。',
    limits: '仅说明实际字段覆盖与估算；在途缺失不能断定真实在途必大于0，也不能断定必然系统性低估。上游公式未独立复算的必须注明。',
  } };
}
