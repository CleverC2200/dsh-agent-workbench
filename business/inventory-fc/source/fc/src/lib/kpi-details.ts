import type { WarehouseSnapshot } from "./domain.ts";
import { inventoryAging } from "./inventory-aging.ts";

export function kpiAgingRows(snapshot: WarehouseSnapshot, kind: string) {
  return snapshot.inventory.flatMap(row => {
    const age = inventoryAging(row);
    const quantity = kind === "stagnant" ? age.buckets[3] : age.buckets[2] + age.buckets[3];
    return quantity > 0 ? [{ sku: row.sku, productName: row.productName, quantity, stagnantQty: age.buckets[3] }] : [];
  });
}
export function kpiShortageRows(snapshot: WarehouseSnapshot) {
  return snapshot.orders.flatMap(order => order.lines.filter(line => line.shortageQty > 0).map(line => ({
    orderNo: order.orderNo, customer: order.customer, sku: line.sku, productName: line.productName,
    orderedQty: line.orderedQty, allocatedQty: line.allocatedQty, shortageQty: line.shortageQty,
  })));
}
