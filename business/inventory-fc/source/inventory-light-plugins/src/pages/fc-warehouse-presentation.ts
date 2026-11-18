import config from '../../../../sql.config.json';
import type { FcWarehouseGroup } from './fc/components/warehouse-group-tabs';

const closedWarehouses = ['A052', 'A060', 'A070', 'A010', 'A240', 'A141', 'A150', 'A210', 'A220'];

export function fcWarehouseStatus(code: string) {
  return closedWarehouses.includes(code) ? '已关仓' : undefined;
}

export const fcBaseWarehouses = config.warehouseGroups.base;

export function presentFcWarehouses<T extends { warehouse_code: string }>(
  rows: readonly T[],
  group: FcWarehouseGroup = 'branch',
): T[] {
  const rank = (code: string) => closedWarehouses.indexOf(code) + 1;
  return rows
    .filter((row) => row.warehouse_code !== 'A540')
    .filter(
      (row) =>
        fcBaseWarehouses.some((item) => item.code === row.warehouse_code) === (group === 'base'),
    )
    .sort((a, b) =>
      group === 'base'
        ? fcBaseWarehouses.findIndex((item) => item.code === a.warehouse_code) -
          fcBaseWarehouses.findIndex((item) => item.code === b.warehouse_code)
        : rank(a.warehouse_code) - rank(b.warehouse_code),
    );
}

export function fcWarehouseOption(row: { warehouse_code: string; warehouse_name?: string | null }) {
  return {
    id: row.warehouse_code,
    name: `${fcBaseWarehouses.find((item) => item.code === row.warehouse_code)?.name || row.warehouse_name || row.warehouse_code}（${row.warehouse_code}）`,
    status: fcWarehouseStatus(row.warehouse_code),
  };
}

export function fcWarehouseLabel(row: { warehouse_code: string; warehouse_name?: string | null }) {
  const option = fcWarehouseOption(row);
  return option.name + (option.status ? ` · ${option.status}` : '');
}
