const finite = (value) =>
  value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
/** Reasons use returned source coverage; unknown coverage is never called an empty database. */
export function customerMissingReason(row, field) {
  const source = 'agents_scm_cust_plan_order_analysis_d';
  if (Array.isArray(row.customerCodes) && !row.customerCodes.length)
    return '当前范围无来源记录：请核对筛选及数据加载状态，不代表整个数据库为空。';
  if (row.duplicateSkuCount > 0 && field !== 'manager')
    return `系统未能计算：${source} 同日期、客户、物料粒度重复 ${row.duplicateSkuCount}项；未擅自加总。`;
  const coverage = (covered, total, label) =>
    finite(covered) && finite(total) && Number(covered) < Number(total)
      ? `源数据未提供：${source}.${label} 有值覆盖 ${covered}/${total} 个SKU；缺失不补0。`
      : `系统未能计算：${label} 的完整性、重复粒度或计算条件未满足；不是0。`;
  if (field === 'manager') {
    if (row.managerState && row.managerState !== 'ready')
      return `系统读取未成功：客户经理来源 ${row.managerState}，不能认定sales_person为空。`;
    if (row.managerNames > 1)
      return `系统无法唯一归并：当前客户对应 ${row.managerNames}名sales_person，未擅自指定客户经理。`;
    if (row.managerMatched === false)
      return '系统未匹配：按客户编码未找到对应的小时订单记录，需核对客户关联与同步范围。';
    if (row.managerNames === 0)
      return '源数据未提供：agents_scm_execute_detail_hourly_d.sales_person为空。';
    return '客户经理缺少可确认的唯一归属，需核对sales_person来源及关联结果。';
  }
  const supplementary = {
    inTransit: ['inTransitCoverage', 'skuCount', 'in_transit_qty'],
    monthlyPlanQty: [null, 'planSkuCount', 'plannum_rate'],
    shippedQty: [null, 'planSkuCount', 'ship_qty'],
    unshippedQty: [null, 'planSkuCount', 'unship_qty'],
    budgetAmount: [null, 'planSkuCount', 'simulation_need_mny'],
    shippedAmount: [null, 'planSkuCount', 'ship_amount'],
    unshippedAmount: [null, 'planSkuCount', 'unship_amount'],
  };
  if (supplementary[field]) {
    const [covered, total, label] = supplementary[field];
    return covered
      ? coverage(row[covered], row[total], label)
      : `源数据未提供完整覆盖：${source}.${label}；当前客户的计划字段未完整匹配，缺失不补0。`;
  }
  if (field === 'value')
    return coverage(
      row.valueCoverage ?? row.cifPriceCoverage,
      row.inventorySkuCount,
      'stock_qty × cif_price（库存价值）',
    );
  if (field === 'quantity') return coverage(row.stockCoverage, row.skuCount, 'stock_qty');
  if (field === 'largeDateQty')
    return coverage(row.largeDateFieldCoverage, row.inventorySkuCount, 'big_final_qty');
  if (field === 'normalRatio' || field === 'largeDateRatio') {
    if (row.largeDateQty == null) return customerMissingReason(row, 'largeDateQty');
    if (row.largeDateQuantity == null) return customerMissingReason(row, 'quantity');
    return '系统未能计算：大日期占比/新鲜度需要有效且大于0的同范围库存分母，大日期数量须在0至库存数量之间；未补0。';
  }
  if (field === 'structureScore' && finite(row.salesCoverage) && row.salesCoverage < row.skuCount)
    return coverage(row.salesCoverage, row.skuCount, 'daily_sales');
  if (field === 'structureScore' && finite(row.stockCoverage) && row.stockCoverage < row.skuCount)
    return customerMissingReason(row, 'quantity');
  if (field === 'structureScore')
    return row.structureIssues?.length
      ? `系统未能计算：${row.structureIssues.join('；')}；结构分保留未知。`
      : '系统未能计算：stock_qty与daily_sales的同范围覆盖或占比条件不足，不能把缺失结构分当健康。';
  if (field === 'turnover') {
    if (row.quantity == null) return customerMissingReason(row, 'quantity');
    if (row.sales30 == null) return coverage(row.salesCoverage, row.skuCount, 'daily_sales');
    return '系统未能计算：日均销量须大于0，库存及销量须为有效非负数；无动销不显示为0天。';
  }
  return `当前字段缺少完整来源或计算依据：${field}；无法确认具体原因时不归咎于源表无数据。`;
}
