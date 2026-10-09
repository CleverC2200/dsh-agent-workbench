/** Field scope follows currentOrderCtes; interpretation must not narrow an allocation to one stage. */
export const currentOrderMetricScopes = {
  orderQuantity: "备单中订单量＋已备单未发货占用量（最新已同步快照）",
  preparingQuantity: "仅备单中订单量，不含已备单未发货",
  allocatedQuantity: "当前待发订单的全部占用量，含备单中占用与已备单未发货占用；不等于仅已备单未发货量",
} as const;

export interface CurrentOrderBase {
  base: string;
  orderQuantity: number | null;
  shortageQuantity: number | null;
  allocatedQuantity: number | null;
  preparingQuantity: number | null;
  orderSnapshot: string;
  inventorySnapshot: string;
}
const BASES = ["郑州", "华东", "西南", "遂平", "华南"];
type OrderSummaryRow = Record<string, string | number | null | undefined>;

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Reused for JSON workspace normalization; missing values must not become zero. */
export function normalizeCurrentOrderBases(value: unknown): CurrentOrderBase[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row) => row && typeof row === "object" && BASES.includes(row.base)).map((row) => ({
    base: row.base,
    orderQuantity: numberOrNull(row.orderQuantity),
    shortageQuantity: numberOrNull(row.shortageQuantity),
    allocatedQuantity: numberOrNull(row.allocatedQuantity),
    preparingQuantity: numberOrNull(row.preparingQuantity),
    orderSnapshot: typeof row.orderSnapshot === "string" ? row.orderSnapshot : "",
    inventorySnapshot: typeof row.inventorySnapshot === "string" ? row.inventorySnapshot : "",
  }));
}

export function currentOrderBases(rows: OrderSummaryRow[]): CurrentOrderBase[] {
  return normalizeCurrentOrderBases(rows.map((row) => ({
    base: row["workbench.base"],
    orderQuantity: row["workbench.order_quantity"],
    shortageQuantity: row["workbench.shortage_quantity"],
    allocatedQuantity: row["workbench.allocated_quantity"],
    preparingQuantity: row["workbench.preparing_quantity"],
    orderSnapshot: row["workbench.order_snapshot"],
    inventorySnapshot: row["workbench.inventory_snapshot"],
  })));
}

/** Deficits have already been calculated per base/material, so quantities are additive. */
function currentOrderSummary(rows: CurrentOrderBase[], paths: string[] = ["全国"]) {
  const bases = paths.includes("全国") ? BASES : [...new Set(paths.map((path) => path.replace(/基地$/, "")))];
  const sum = (key: "orderQuantity" | "shortageQuantity" | "preparingQuantity") => {
    if (!bases.length) return "-";
    let total = 0;
    for (const base of bases) {
      const matches = rows.filter((row) => row.base === base);
      if (matches.length !== 1 || matches[0][key] === null) return "-";
      total += matches[0][key];
    }
    return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(total);
  };
  return { order: sum("orderQuantity"), shortage: sum("shortageQuantity"), preparing: sum("preparingQuantity") };
}

export function currentOrderMetricHelpers(rows: CurrentOrderBase[], paths: string[] = ["全国"]) {
  const { order, shortage } = currentOrderSummary(rows, paths);
  return [{ label: "当前订单量", value: order }, { label: "当前缺货量", value: shortage }];
}

export function currentOrderCard(rows: CurrentOrderBase[], paths: string[] = ["全国"]) {
  const { order, shortage, preparing } = currentOrderSummary(rows, paths);
  return {
    title: "当前订单", value: order,
    helpers: [{ label: "缺货量", value: shortage }, { label: "备单量", value: preparing }],
    tone: "neutral" as const,
  };
}

/** Same monthly fulfillment scope; only rows with actual shipments contribute helpers. */
export function shippedOrderMetricHelpers(rows: OrderSummaryRow[]) {
  const orders = rows.filter(row => row["workbench.domain"] === "order");
  const sum = (key: string) => {
    const values = orders.map(row => numberOrNull(row[key]));
    return !values.length || values.some(value => value === null) ? "-"
      : new Intl.NumberFormat("zh-CN", {maximumFractionDigits: 0}).format(values.reduce<number>((sum, value) => sum + value!, 0));
  };
  return [{label: "已发订单量", value: sum("workbench.shipped_order_quantity")},
    {label: "发货量", value: sum("workbench.shipped_quantity")}];
}
