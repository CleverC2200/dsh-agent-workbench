// Source: 客户库存知识库, revision 431, 2026-10-20.
// Formula and business classification stay separate from implementation caveats.
export const customerMetricDefinitions = {
  value: {
    title: '库存价值',
    purpose: '客户库存总金额。',
    formula: [
      '客户库存价值（元）＝Σ（客户SKU库存数量 × SAP销售单单价）',
      '库存价值（万元）＝Σ客户库存价值（元）÷ 10,000',
    ],
    rules: ['缺失：库存价值的健康、需关注及高风险判定标准。'],
    notes: ['当前取数：Σ stock_amt ÷ 10,000。', '缺失：SAP销售单单价的源字段映射与计算核验结果。'],
  },
  quantity: {
    title: '库存数量',
    purpose: '客户现库存量，不含在途库存。',
    formula: [
      '库存数量＝Σ客户现库存数量',
      '客户现库存数量＝最新提报库存－（客户月销售计划 ÷ 当月自然天数）× 距最近提报天数＋周期内实际到货数量',
    ],
    rules: ['缺失：库存总数量的健康、需关注及高风险判定标准。'],
    notes: [
      '当前取数：Σ stock_qty，单位：箱。',
      '缺失：原始库存提报、月销售计划及周期内实际到货明细；页面未独立复算上游推演。',
      '缺货SKU判定：SKU近30日销量 > 0，且SKU现库存数量 ÷ SKU近30日日均动销量 < 60天。',
    ],
  },
  structure: {
    title: '结构合理性',
    purpose: '客户SKU库存占比与近30日销量占比的匹配程度。',
    formula: [
      '客户结构分＝100 ×［1－½ × Σ｜SKU库存占比－SKU销量占比｜］',
      'SKU库存占比＝SKU可售库存数量 ÷ 客户全部可售库存数量',
      'SKU销量占比＝SKU近30日销量 ÷ 客户全部SKU近30日销量',
      '汇总结构分＝Σ有效客户结构分 ÷ 有效客户数',
    ],
    rules: ['结构分 ≥ 80分：健康。', '65分 ≤ 结构分 < 80分：需关注。', '结构分 < 65分：高风险。'],
    notes: [
      '待确认：原文公式未标绝对值；当前按文档90分示例采用绝对值。',
      '待确认：当前以 stock_qty 作为可售库存数量代理。',
      '库存或销量缺失、为负，或分母为0：不评分；同客户同SKU先合并。',
      '汇总仅计算有效客户，并展示覆盖数。',
    ],
  },
  freshness: {
    title: '库存新鲜度',
    purpose: '非大日期库存数量占库存总数量的比例。',
    formula: ['库存新鲜度＝（库存总数量－大日期库存数量）÷ 库存总数量 × 100%'],
    rules: ['缺失：库存新鲜度的健康、需关注及高风险判定标准。'],
    notes: [
      '当前取数：大日期库存数量使用 over120_final_qty，不再使用正常库存差额估算。',
      '单个SKU数量差异单独记录，不拦截客户或城市汇总；汇总分母无效或汇总大日期数量不在0至总库存范围内时，占比及新鲜度无法计算。',
      '仅汇总有效客户的分子与分母，并展示覆盖数。',
    ],
  },
  turnover: {
    title: '周转天数',
    purpose: '现库存与在途库存按近30日动销速度可覆盖的天数。',
    formula: [
      '近30日日均动销量＝近30日销量 ÷ 30',
      '客户周转天数＝（客户现库存量＋客户在途量）÷ 客户近30日日均动销量',
      '汇总周转天数＝Σ（有效客户现库存量＋有效客户在途量）÷ Σ有效客户近30日日均动销量',
    ],
    rules: [
      '低覆盖客户：近30日销量 > 0，且覆盖天数 < 60天。',
      '缺失：周转天数的健康、需关注及高风险完整判定标准。',
    ],
    notes: [
      '当前字段：现库存 stock_qty；在途 pack_unitqty；近30日销量 sales_qty_30days。',
      '在途字段不完整时，当前估算公式＝现库存量 ÷ 近30日日均动销量；标注“估算口径”。',
      '库存或在途为负、销量不为正：不计算。',
      '平均货龄不等于周转天数；不套用货龄90天或120天阈值。',
    ],
  },
  largeDate: {
    title: '大日期情况',
    purpose: '客户侧货龄达到120天的批次剩余库存及其占比。',
    formula: [
      '批次货龄天数＝库存快照日期－商品生产日期',
      '客户SKU大日期库存数量＝Σ（批次剩余库存数量 × I［批次货龄 ≥ 120天］）',
      '大日期库存数量＝Σ客户SKU大日期库存数量',
      '大日期库存占比＝大日期库存数量 ÷ 同范围库存总数量 × 100%',
      '大日期风险客户数＝COUNT（客户大日期库存占比 ≥ 5%的客户）',
    ],
    rules: [
      '客户大日期库存占比 ≥ 5%：大日期风险客户。',
      '缺失：健康、需关注及高风险三级判定标准。',
    ],
    notes: [
      'I［条件］：条件成立取1，否则取0。',
      '当前取数：Σ over120_final_qty，单位：箱；使用数据侧提供的客户大日期库存结果。',
      '页面不重复推演批次，不再使用 stock_qty－normal_stock_qty 估算。',
      '源数量保留；SKU差异单独记录，不作为业务风险。仅汇总口径无法计算时保留空值并说明原因。',
      '缺失值不补0；分母为0不计算占比；数量覆盖和占比覆盖分别展示。',
    ],
  },
};

export function customerMetricEvidence(summary, count, format) {
  return [
    `库存 ${format(summary.quantity)} 箱；库存价值 ${format(summary.totalValue, 1)} 万；上游推演与SAP单价待核验。`,
    `结构分 ${format(summary.structureScore, 1)}；有效覆盖 ${summary.structureCoverageCount}/${count} 客户（可售库存代理、绝对值待确认）。`,
    `周转 ${format(summary.turnover, 1)} 天（${summary.turnoverEstimated ? '在途缺失，含现货估算' : '含在途'}）；覆盖 ${summary.turnoverCoverageCount}/${count} 客户；低覆盖 ${summary.lowCoverageCount} 家。`,
    `大日期库存 ${format(summary.largeDateQty)} 箱，占比 ${format(summary.largeDateRatio, 1)}%；数量覆盖 ${summary.largeDateCoverageCount}/${count} 客户；占比覆盖 ${summary.largeDateRatioCoverageCount}/${count}；数量异常 ${summary.largeDateInvalidCount} 家。`,
    `风险/待处理 ${summary.riskCount} 家（含需关注）；高风险及异常 ${summary.highRiskCount} 家；待评估 ${summary.unknownCount} 家。`,
    '控补客户需要平均货龄≥90天；测算补货缺口需要周转标准、剩余计划与熔断信息，当前同快照来源未接入，不伪造结果。',
  ];
}
