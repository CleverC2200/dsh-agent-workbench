import type { CustomerOrder } from './domain.ts';
export const ORDER_STATUSES = ['全部', '缺口'] as const;
export type OrderStatusFilter = (typeof ORDER_STATUSES)[number];
export function filterCurrentOrders(
  rows: CustomerOrder[],
  search: string,
  status: OrderStatusFilter = '全部',
) {
  const query = search.trim().toLowerCase();
  return rows.filter(
    (row) =>
      (status === '全部' || row.status === status) &&
      `${row.orderNo} ${row.customer} ${row.lines.map((line) => `${line.sku} ${line.productName}`).join(' ')}`
        .toLowerCase()
        .includes(query),
  );
}

/** Every positive customer-order shortage is included in the shortage filter. */
export function currentOrderStatus(
  shortage: number | null,
  ordered: number | null,
): '正常' | '缺口' | '-' {
  if (shortage === null || ordered === null) return '-';
  if (shortage <= 0) return '正常';
  return '缺口';
}
