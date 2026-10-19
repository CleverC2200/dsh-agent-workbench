import { knownNumber } from '../../../../../shared/configured-overview';

/** Each displayed subtotal carries its own valid customer-SKU count. Never add
 * stock and transit subtotals drawn from different rows to form the headline. */
export function dealerStockOverview(
  summary: any,
  snapshotDate?: string | null,
  units?: { stockQuantity?: string; salesQuantity?: string; inventoryAmount?: string },
) {
  const count = (field: string) => knownNumber(summary?.[field]);
  const value = (field: string) =>
    (count('valid_' + field) ?? 0) > 0 ? knownNumber(summary?.[field]) : null;
  return {
    stockSourceAvailable: !!summary,
    stockRowCount: count('row_count'),
    snapshotDate,
    inventoryDateLabel: summary
      ? `${summary.earliest_upload ?? '-'} 至 ${summary.latest_upload ?? '-'}`
      : null,
    inventoryDailyCustomerCount: count('customer_count'),
    totalInventory: value('inventory'),
    totalTransitInventory: value('in_transit'),
    matchedTotalInventory: value('total_inventory'),
    totalInventoryValue: value('inventory_value'),
    totalSales7: value('sales7'),
    totalSales30: value('sales30'),
    sales7Coverage: count('valid_sales7'),
    sales30Coverage: count('valid_sales30'),
    stockValidCount: count('valid_inventory'),
    transitValidCount: count('valid_in_transit'),
    inventoryTotalValidCount: count('valid_total_inventory'),
    inventoryValueValidCount: count('valid_inventory_value'),
    coverValidCount: count('valid_cover'),
    onhandCoverValidCount: count('valid_onhand_cover'),
    onhandCoverDays:
      units?.stockQuantity === 'box' &&
      units?.salesQuantity === 'box' &&
      (count('valid_onhand_cover') ?? 0) > 0
        ? knownNumber(summary?.onhand_days)
        : null,
    stockCoverDays:
      units?.stockQuantity === 'box' &&
      units?.salesQuantity === 'box' &&
      (count('valid_cover') ?? 0) > 0
        ? knownNumber(summary?.cover_days)
        : null,
    inventoryValueUnit: units?.inventoryAmount === 'CNY' ? '元' : '源值',
    salesQuantityUnit: units?.salesQuantity === 'box' ? '箱' : '源量',
    negativeStockCount: count('negative_inventory'),
    missingUploadCount: summary ? Number(summary.row_count) - Number(summary.upload_count) : null,
  };
}
