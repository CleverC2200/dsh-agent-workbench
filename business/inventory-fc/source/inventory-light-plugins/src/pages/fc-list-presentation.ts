import { agingAdvice } from '../../../fc/src/lib/inventory-aging';
import { formatReplenishmentValue } from '../../../fc/src/lib/replenishment-columns';
import { knownNumber } from '../../../../../shared/configured-overview';

/** These are display aliases, not replacements for the governed calculation fields. */
const fields: Record<string, string> = {
  inventory_qty: 'inventoryQty',
  available_qty: 'currentAvailableQty',
  current_order_demand: 'preparingQty',
  current_order_shortage: 'shortageQty',
  historical_turnover_days: 'historicalTurnoverDays',
  target_inventory_qty: 'targetInventoryQty',
  period_remaining_out: 'currentRemainingOutboundQty',
  rolling_ship_daily: 'actualDailyOutboundQty',
  open_transfer_reported_qty: 'inTransitQty',
  expected_month_end_qty: 'expectedMonthEndInventoryQty',
  recommended_qty: 'recommendedQty',
  forecast_turnover_days: 'forecastTurnoverDays',
  month_out_plan: 'currentOutboundQty',
  period_current_daily: 'plannedDailyShipment',
  month_ship_positive: 'currentMonthShippedQty',
  warehouse_month_transfer_plan: 'currentTransferQty',
  preparing: 'transferPendingQty',
  in_transit: 'transferShippedQty',
  period_next_out: 'nextOutboundQty',
  period_next_daily: 'nextDailyOutboundQty',
  period_next_transfer: 'nextTransferQty',
  daily_plan: 'forecastDailyShipment',
  cycle_days: 'cycleDays',
  safety_days: 'safetyDays',
  target_gap_qty: 'safetyStockGapQty',
  current_remaining_transfer_qty: 'currentRemainingTransferQty',
  transferred_qty: 'transferredQty',
  transfer_received_qty: 'transferReceivedQty',
};
export function fcReplenishmentDisplay(
  row: Record<string, unknown>,
  field: string,
): string | undefined {
  if (field === 'urgent') {
    if (knownNumber(row.recommended_qty) === null) return '-';
    return row.urgent === true || knownNumber(row.urgent) === 1 ? '是' : '否';
  }
  const key = fields[field];
  if (!key) return undefined;
  const raw = knownNumber(row[field]);
  const transfer = knownNumber(row.period_current_transfer ?? row.warehouse_month_transfer_plan);
  const transferred = knownNumber(row.transferred_qty);
  const value =
    field === 'current_remaining_transfer_qty' && raw === null
      ? transfer === 0
        ? 0
        : transfer !== null && transferred !== null
          ? Math.max(0, transfer - transferred)
          : null
      : raw;
  return value === null ? '-' : formatReplenishmentValue(value, key);
}

export function fcAgingDisplay(row: Record<string, unknown>, field: string): string | undefined {
  if (field === 'missing_age_13' || field === 'aging_suggestion') {
    const buckets = ['age0_30', 'age31_60', 'age61_90', 'age90_plus'].map((key) =>
      knownNumber(row[key]),
    );
    const known = knownNumber(row.age_weight_qty),
      unknown = knownNumber(row.unknown_age_qty);
    if (known === null || unknown === null || buckets.some((value) => value === null)) return '-';
    return agingAdvice(
      buckets.map((value) => value ?? 0),
      known + unknown,
      unknown,
    ).suggestion;
  }
  const value = knownNumber(row[field]);
  if (['age0_30', 'age31_60', 'age61_90', 'age90_plus'].includes(field)) {
    const known = knownNumber(row.age_weight_qty),
      unknown = knownNumber(row.unknown_age_qty);
    if (value === null || known === null || unknown === null) return '-';
    const denominator = known + unknown;
    return `${value.toLocaleString('zh-CN', { maximumFractionDigits: 3 })} / ${denominator > 0 ? ((value * 100) / denominator).toFixed(1) : '0.0'}%`;
  }
  if (['average_age', 'max_age', 'daily_movement', 'historical_turnover'].includes(field)) {
    if (
      value === null ||
      (field === 'historical_turnover' && knownNumber(row.daily_movement) === 0)
    )
      return '-';
    return value.toLocaleString('zh-CN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }
  return undefined;
}

/** Plan lists and their CSV share the original three-decimal quantity display. */
export function fcPlanDisplay(row: Record<string, unknown>, field: string): string | undefined {
  if (
    ![
      'period_current_out',
      'period_current_transfer',
      'period_next_out',
      'period_next_transfer',
    ].includes(field)
  )
    return undefined;
  const value = knownNumber(row[field]);
  return value === null ? '-' : value.toLocaleString('zh-CN', { maximumFractionDigits: 3 });
}

export function fcPlanStatus(row: Record<string, unknown>) {
  return [
    'period_current_out',
    'period_current_transfer',
    'period_next_out',
    'period_next_transfer',
  ].every((field) => {
    const n = knownNumber(row[field]);
    return n !== null && n >= 0;
  })
    ? '已确认'
    : '待补齐 / 确认';
}
