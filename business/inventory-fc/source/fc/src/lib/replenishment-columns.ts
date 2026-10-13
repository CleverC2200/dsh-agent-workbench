import type { ReplenishmentRow } from './domain.ts';

export const REPLENISHMENT_COLUMNS: Record<string, string> = {
  sku: '产品编码',
  productName: '产品名称',
  inventoryQty: '现库存',
  currentAvailableQty: '可用库存',
  preparingQty: '备单中量',
  shortageQty: '缺货量',
  historicalTurnoverDays: '回顾周转天数',
  targetInventoryQty: '目标库存',
  currentRemainingOutboundQty: '本月剩余出货计划',
  actualDailyOutboundQty: '30日日均',
  inTransitQty: '调拨中',
  expectedMonthEndInventoryQty: '预计月末库存',
  currentRemainingTransferQty: '本月剩余调拨计划',
  recommendedQty: '建议补货量',
  actualQty: '实际补货量',
  category: '产品大类',
  materialGroup: '物料组',
  forecastTurnoverDays: '展望周转天数',
  currentOutboundQty: '本月出货计划',
  plannedDailyShipment: '本月计划日均出货',
  currentMonthShippedQty: '本月已发货量',
  currentTransferQty: '本月调拨计划',
  transferredQty: '已调拨',
  transferReceivedQty: '本月调拨入库',
  transferPendingQty: '本月调拨未发',
  transferShippedQty: '本月调拨在途',
  nextOutboundQty: '次月出货计划',
  nextDailyOutboundQty: '次月计划日均出货',
  nextTransferQty: '次月调拨计划',
  forecastDailyShipment: '展望30日日均出货',
  cycleDays: '补货周期(天)',
  safetyDays: '安全库存天数',
  safetyStockGapQty: '安全库存差异量',
  urgent: '紧急SKU',
  reason: '备注',
  planSourceLabel: '计划来源',
  calculationMissing: '计算状态',
};
export const REPLENISHMENT_DEFAULT_COLUMNS = Object.keys(REPLENISHMENT_COLUMNS);
export const REPLENISHMENT_COLUMN_HINTS: Record<string, string> = {
  transferReceivedQty: '本月实际调拨入库流水，排除盘盈与退货入库',
  transferPendingQty: '本月创建的调拨订单尚未发货数量，按收货仓归属并换算为件',
  transferShippedQty: '本月发货的调拨订单未收货数量；发货日期缺失不能记为0',
  actualDailyOutboundQty: '近30日实际出库量 ÷ 30，向上取整；缺失时显示待核实',
  currentRemainingTransferQty:
    'max(本月调拨计划 - 已调拨量, 0)，显示向上取整；已调拨缺失时显示待核实',
  shortageQty: 'max(0, 备单中剩余需求量 - 当前可用库存量)，按 SKU 汇总',
  preparingQty: '当前分仓备单中（PREPARING）订单量，按 SKU 汇总；不包含已备单未发货订单',
  currentMonthShippedQty:
    '已交付订单实际发货日期在本月的正向发货量，按交付单行去重、件单位汇总；退货单不计入',
  transferredQty: '本月调拨入库 + 本月下单未发 + 本月发货未收；各阶段去重，任一未核实则合计待核实',
  inTransitQty: '未发调拨订单量 + 已发未收调拨量；按入库分仓归属，跨月份统计全部未完成量',
  historicalTurnoverDays: '可用库存 ÷ 近30日日均出库量；当前缺少经核实的 SKU 级近30日出库数据',
  forecastTurnoverDays: '现库存 ÷ 展望30日日均出货；分母为0显示—',
  currentTransferQty: '人工计划优先；否则 max(0, 安全天数×本月计划日均 - 可用库存 + 本月出货计划)',
  nextTransferQty: '人工计划优先；否则 max(0, 安全天数×次月计划日均 - 预计月末库存 + 次月出货计划)',
  safetyDays: '补货周期 + 3天备货期',
  targetInventoryQty: '安全库存天数 × 本月计划日均出货',
  currentRemainingOutboundQty: 'max(本月出货计划 - 本月已发货量, 0)',
  forecastDailyShipment:
    '从明日起取30天：[本月计划日均×本月剩余天数 + 次月计划日均×补足天数]÷30，向上取整；各月日均也向上取整，不依赖已发货量',
  safetyStockGapQty: 'max(0, 安全库存天数×展望30日日均出货 - 可用库存)',
  expectedMonthEndInventoryQty: '可用库存 + 本月调拨计划 - 本月出货计划',
  recommendedQty: 'max(0, max(缺货量, 目标库存量 - 订单扣减后可供库存量) - 调拨中量)，向上取整为件',
};

/** Preserve ordering but append new fields for users with old saved preferences. */
export function mergeReplenishmentColumns(saved: string[]): string[] {
  const aliases: Record<string, string> = {
    availableQty: 'currentAvailableQty',
    monthlyDemand: 'currentOutboundQty',
  };
  if (
    !saved.includes('preparingQty') ||
    !saved.includes('actualDailyOutboundQty') ||
    !saved.includes('currentRemainingTransferQty')
  )
    return [...REPLENISHMENT_DEFAULT_COLUMNS];
  return [
    ...new Set([
      ...saved.map((key) => aliases[key] ?? key).filter((key) => key in REPLENISHMENT_COLUMNS),
      ...REPLENISHMENT_DEFAULT_COLUMNS,
    ]),
  ];
}
export function replenishmentCellValue(row: ReplenishmentRow, key: string): string | number {
  if (key === 'materialGroup' && !hasMaterialGroup(row.materialGroup)) return '';
  if (key === 'inTransitQty' && 'openTransferQty' in row) return row.openTransferQty ?? '待核实';
  if (key === 'calculationMissing')
    return row.calculationMissing?.length
      ? `缺少：${row.calculationMissing.join('、')}`
      : row.recommendedQty !== null
        ? '已计算'
        : '计算要素待核实';
  if (key === 'urgent') return row.recommendedQty === null ? '待核实' : row.urgent ? '是' : '否';
  if (key === 'reason') return row.reason || '—';
  if (
    (key === 'targetInventoryQty' || key === 'plannedDailyShipment') &&
    row.currentOutboundQty === null
  )
    return '待核实';
  if (key === 'forecastTurnoverDays' && row.forecastDailyShipment === 0) return '—';
  const value = row[key as keyof ReplenishmentRow];
  return typeof value === 'number' || typeof value === 'string' ? value : '待核实';
}

export function hasMaterialGroup(value: string | null | undefined): boolean {
  return !!value?.trim() && !['未提供', '未分类', '待核实', '—'].includes(value.trim());
}
export function visibleReplenishmentColumns(
  columns: string[],
  snapshot: {
    replenishments: ReplenishmentRow[];
    page?: { overview: { hasMaterialGroup?: boolean } };
  },
): string[] {
  const available =
    snapshot.page?.overview.hasMaterialGroup ??
    snapshot.replenishments.some((row) => hasMaterialGroup(row.materialGroup));
  return available ? columns : columns.filter((column) => column !== 'materialGroup');
}

const CEILING_COLUMNS = new Set([
  'expectedMonthEndInventoryQty',
  'targetInventoryQty',
  'currentRemainingOutboundQty',
  'currentRemainingTransferQty',
  'actualDailyOutboundQty',
  'plannedDailyShipment',
  'nextDailyOutboundQty',
  'forecastDailyShipment',
  'recommendedQty',
  'currentOutboundQty',
  'currentTransferQty',
  'nextOutboundQty',
  'nextTransferQty',
]);
const DECIMAL_COLUMNS = new Set([
  'historicalTurnoverDays',
  'forecastTurnoverDays',
  'safetyStockGapQty',
]);
/** Presentation only: keep the unrounded source values for calculations and ordering. */
export function formatReplenishmentCell(row: ReplenishmentRow, key: string): string {
  const value = replenishmentCellValue(row, key);
  if (typeof value !== 'number') return value;
  if (!Number.isFinite(value)) return '待核实';
  if (CEILING_COLUMNS.has(key)) return Math.ceil(value).toLocaleString('zh-CN');
  if (DECIMAL_COLUMNS.has(key))
    return value.toLocaleString('zh-CN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return value.toLocaleString('zh-CN', { maximumFractionDigits: 3 });
}
