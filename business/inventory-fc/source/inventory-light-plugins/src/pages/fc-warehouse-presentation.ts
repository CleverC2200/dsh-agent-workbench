const closedWarehouses = ['A052', 'A060', 'A070', 'A010', 'A240', 'A141', 'A150', 'A210', 'A220'];

export function fcWarehouseStatus(code: string) {
  return closedWarehouses.includes(code) ? '已关仓' : undefined;
}

export function presentFcWarehouses<T extends { warehouse_code: string }>(rows: readonly T[]): T[] {
  const rank = (code: string) => closedWarehouses.indexOf(code) + 1;
  return rows
    .filter((row) => row.warehouse_code !== 'A540')
    .sort((a, b) => rank(a.warehouse_code) - rank(b.warehouse_code));
}

export function fcWarehouseOption(row: { warehouse_code: string; warehouse_name?: string | null }) {
  return {
    id: row.warehouse_code,
    name: `${row.warehouse_name || row.warehouse_code}（${row.warehouse_code}）`,
    status: fcWarehouseStatus(row.warehouse_code),
  };
}

export function fcWarehouseLabel(row: { warehouse_code: string; warehouse_name?: string | null }) {
  const option = fcWarehouseOption(row);
  return option.name + (option.status ? ` · ${option.status}` : '');
}
