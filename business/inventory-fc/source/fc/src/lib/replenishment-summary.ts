import type { WarehouseSnapshot } from './domain.ts';

/** Display-only partial totals: never replace the complete-total submission guard. */
export function summarizeCalculatedReplenishment(
  snapshot: WarehouseSnapshot,
): import('./workbench-page.ts').CalculatedSummary {
  if (snapshot.page) return snapshot.page.overview.calculated;
  const rows = snapshot.replenishments.filter(
    (row) => row.recommendedQty !== null && Number.isFinite(row.recommendedQty),
  );
  const urgent = rows.filter((row) => row.urgent);
  const missingCount = snapshot.replenishments.length - rows.length;
  return {
    computedCount: rows.length,
    missingCount,
    partial: missingCount > 0,
    quantity: rows.length ? rows.reduce((sum, row) => sum + row.recommendedQty!, 0) : null,
    skuCount: rows.length ? rows.filter((row) => row.recommendedQty! > 0).length : null,
    urgentQuantity: rows.length ? urgent.reduce((sum, row) => sum + row.recommendedQty!, 0) : null,
    urgentCount: rows.length ? urgent.length : null,
  };
}
