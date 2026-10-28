export function customerSourceDateLabel(inventory) {
  return `计划及库存指标日期：${inventory.snapshot ?? '—'}；组织补充日期：${inventory.organizationSnapshot ?? '—'}`;
}
export function customerSourceDetailLabel(row) {
  return `数据快照：${row.planSnapshot ?? row.inventorySnapshot ?? '尚未取得'}；计划与库存指标统一使用计划表 ${row.skuCount ?? '—'} 个SKU。库存价值按同日stock_qty×cif_price计算，大日期有值覆盖 ${row.largeDateFieldCoverage??'—'}/${row.inventorySkuCount??'—'} SKU；${row.largeDatePartial?'大日期为已知数量，新鲜度为部分数据测算上限；':''}空值不补0，不回退旧库存。组织补充日期：${row.organizationSnapshot ?? '尚未取得'}。发货不等于实际到货，预算不等于目标库存金额。`;
}
