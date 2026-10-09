import type { WarehouseSnapshot } from "./domain.ts";
import { summarizeSnapshot } from "./domain.ts";

export type DmsAdjustment = { sku: string; actualQty?: number; reason: string };
export type DmsExport = { mode: "download"; warehouseId: string; warehouseName: string; month: string; skuCount: number; confirmationRows: Array<{ sku: string; productName: string; quantity: number | null }>; missingQuantityCount: number; knownQuantityTotal: number; totalQuantity: number | null; rows: Array<{ sku: string; productName: string; quantity: number | null }> };
export function createDmsWorkbook(XLSX: typeof import("xlsx"), rows: DmsExport["rows"]) {
  const sheet = XLSX.utils.aoa_to_sheet([["商品编码", "商品名称", "数量"], ...rows.filter(row => row.quantity !== null && row.quantity > 0).map(row => [String(row.sku), row.productName, row.quantity])]);
  sheet["!cols"] = [{ wch: 24 }, { wch: 48 }, { wch: 16 }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "补货清单");
  return workbook;
}
export class DmsValidationError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
export function mergeDmsAdjustments(snapshot: WarehouseSnapshot, adjustments: DmsAdjustment[]) {
  if (snapshot.page) throw new DmsValidationError("需要完整分仓清单，不能导出当前分页", 409);
  const bySku = new Map(adjustments.map(row => [row.sku, row]));
  const valid = new Set(snapshot.replenishments.map(row => row.sku));
  if (bySku.size !== adjustments.length || adjustments.some(row => !valid.has(row.sku))) throw new DmsValidationError("人工调整包含重复或当前分仓月份无效的 SKU，请在草稿中撤销对应修改后重试");
  const merged = { ...snapshot, replenishments: snapshot.replenishments.map(row => ({ ...row,
    actualQty: bySku.get(row.sku)?.actualQty ?? row.recommendedQty,
    reason: bySku.get(row.sku)?.reason ?? "",
  })) };
  if (merged.replenishments.some(row => row.actualQty !== null && (!Number.isSafeInteger(row.actualQty) || row.actualQty < 0))) throw new DmsValidationError("提交数量必须为非负整数", 409);
  const rows = merged.replenishments
    .filter(row => row.actualQty !== null && row.actualQty > 0)
    .map(row => ({ sku: row.sku, productName: row.productName, quantity: row.actualQty }));
  if (!rows.length) throw new DmsValidationError("暂无补货量大于 0 的商品，无需导出");
  const confirmationRows = rows;
  return { snapshot: merged, rows, confirmationRows, missingQuantityCount: merged.replenishments.filter(row => row.actualQty === null).length, knownQuantityTotal: merged.replenishments.reduce((sum, row) => sum + (row.actualQty ?? 0), 0), totalQuantity: summarizeSnapshot(merged).actualTotal };
}
