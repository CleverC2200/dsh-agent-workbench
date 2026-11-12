import sqlConfiguration from '../../../../../sql.config.json';
import { sqlTemplate as configuredSql } from '../../../../../../shared/sql-config.ts';
import type { WorkbenchSqlQuery } from './workbench-sql-types';

const branchWarehouses = configuredSql(
  sqlConfiguration,
  'aqkc.web.src.lib.workbench-current-order-sql.1',
);

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

export const currentOrderSkuQuery: WorkbenchSqlQuery = {
  name: 'workbench-current-order-skus',
  maxRows: 25_000,
  sql: configuredSql(sqlConfiguration, 'aqkc.web.src.lib.workbench-current-order-sql.4', [
    currentOrderCtes,
  ]),
};
