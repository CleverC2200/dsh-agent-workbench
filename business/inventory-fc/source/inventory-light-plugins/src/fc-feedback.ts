import type { WarehouseSnapshot } from '../../fc/src/lib/domain.ts';

/** A partial ratio uses the same SKU cohort in numerator and denominator. */
export function forecastCoverage(snapshot: WarehouseSnapshot) {
  const bySku = new Map(snapshot.replenishments.map((row) => [row.sku, row]));
  const skus = new Set([...bySku.keys(), ...snapshot.inventory.map((row) => row.sku)]);
  const known = [...skus]
    .map((sku) => bySku.get(sku))
    .filter(
      (row) =>
        row &&
        Number.isFinite(row.inventoryQty) &&
        row.forecastDailyShipment != null &&
        Number.isFinite(row.forecastDailyShipment) &&
        row.forecastDailyShipment >= 0,
    );
  const inventory = known.reduce((sum, row) => sum + row!.inventoryQty, 0);
  const daily = known.reduce((sum, row) => sum + row!.forecastDailyShipment!, 0);
  return {
    value: daily > 0 ? inventory / daily : null,
    known: known.length,
    total: skus.size,
    partial: known.length < skus.size,
  };
}

export function parseActualQuantity(text: string): number | null {
  if (!/^\d+$/.test(text)) return null;
  const value = Number(text);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function dmsWorkbookRows(rows: { sku: string; productName: string; quantity: number }[]) {
  return [
    ['商品编码', '数量', '商品名称'],
    ...rows.map((row) => [String(row.sku), row.quantity, row.productName]),
  ];
}
