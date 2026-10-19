import sqlConfiguration from '../../../sql.config.json';
import { sqlTemplate as configuredSql } from '../../../../shared/sql-config.ts';
import { loadWarehouseCatalog } from '../../fc/src/lib/server/warehouse-catalog';
import { loadWarehouseSnapshot } from '../../fc/src/lib/server/warehouse-snapshot';
const planning = {
  query: async (sql: string) => {
    if (sql.includes('to_regclass'))
      return {
        rows: [{ order_fulfillment: true, imported_plans: null, cycle_config: null }],
      };
    throw Error('此能力需要 GEA 持久化支持，可交给对话区继续处理');
  },
};
export const readWarehouseFacts = async (database: any, warehouseId: string, now = new Date()) => {
  const calculationDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const catalogPromise = loadWarehouseCatalog(database);
  const shippedPromise = catalogPromise.then(async (directory) => {
    const warehouse = directory.warehouses.find((row) => row.id === warehouseId);
    if (!warehouse) throw Error('GEA 未返回该分仓映射');
    const shipped = await database.query(
      configuredSql(sqlConfiguration, 'inventory-light-plugins.src.warehouse-input.1'),
      [warehouse.pickupPointCode, calculationDate.slice(0, 7) + '-01'],
    );
    return { warehouse, shipped };
  });
  const [base, { warehouse, shipped }] = await Promise.all([
    loadWarehouseSnapshot(warehouseId, database, now, planning),
    shippedPromise,
  ]);
  return {
    base,
    warehouse,
    calculationDate,
    shipped: new Map(
      shipped.rows.map((row: any) => [
        String(row.sku),
        row.shipped_qty == null ? null : Number(row.shipped_qty),
      ]),
    ),
  };
};
