// This retained aggregate is an explicitly labelled historical comparison view.
// It is not a verified BI import snapshot and must not replace governed source facts.
export const shippableReferenceVersion = 1;
const retained = Object.freeze({
  id: 'national-shippable-20261025-retained-summary',
  stockDate: '2026-10-25',
  inventory: 4526627,
  monthlyDemand: 9435719.78,
  daysInMonth: 31,
  inventorySource: 'agents_scm_stock_detail_d.current_stock（留存查询汇总）',
  demandSource: 'agents_scm_stock_detail_d.roll_sales_plan（滚动）',
  sourceVerifiedAsBi: false,
});

export function historicalShippableReference(period, enabled = false) {
  // Only show the approved reference after a successful, computable governed read.
  // A denied/failed read must never be covered with a retained business value.
  if (
    !enabled ||
    period?.end !== '2026-10-26' ||
    !['2026-10-01', '2026-10-19'].includes(period.start) ||
    period.sections?.find((section) => section.id === 'stock')?.status !== 'ready' ||
    !Number.isFinite(period.metrics?.['周转天数']?.value)
  )
    return null;
  const dailyDemand = retained.monthlyDemand / retained.daysInMonth;
  return {
    ...retained,
    dailyDemand,
    value: retained.inventory / dailyDemand,
    liveValue: period.metrics['周转天数'].value,
    label: '历史对账快照',
    note: '历史对账快照（非实时计算、非已验证BI原始输入）：库存汇总留存量4,526,627 ÷（滚动需求9,435,719.78 ÷ 31）；仅用于截至2026-10-25的全国对账。实时计算及各维度仍使用受控来源，不能从本汇总推造SKU明细。',
  };
}
