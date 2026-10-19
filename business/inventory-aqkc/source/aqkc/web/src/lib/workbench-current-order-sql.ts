import sqlConfiguration from '../../../../../sql.config.json';
import { sqlTemplate as configuredSql } from '../../../../../../shared/sql-config.ts';
import type { WorkbenchSqlQuery } from './workbench-sql-types';

// Keep the shortage's usable inventory in the same base-warehouse scope as
// the inventory and age cards. This source has both base_name and warehouseid.
const branchWarehouses = configuredSql(
  sqlConfiguration,
  'aqkc.web.src.lib.workbench-current-order-sql.1',
);

/** Aggregate both sources before joining so inventory lots cannot multiply orders. */
const currentOrderCtes = configuredSql(
  sqlConfiguration,
  'aqkc.web.src.lib.workbench-current-order-sql.2',
  [branchWarehouses],
);

export const currentOrdersQuery: WorkbenchSqlQuery = {
  name: 'workbench-current-orders',
  maxRows: 5,
  sql: configuredSql(sqlConfiguration, 'aqkc.web.src.lib.workbench-current-order-sql.3', [
    currentOrderCtes,
  ]),
};

/** Base markers distinguish a healthy snapshot with no SKU orders from a failed source. */
export const currentOrderSkuQuery: WorkbenchSqlQuery = {
  name: 'workbench-current-order-skus',
  maxRows: 25_000,
  sql: configuredSql(sqlConfiguration, 'aqkc.web.src.lib.workbench-current-order-sql.4', [
    currentOrderCtes,
  ]),
};
