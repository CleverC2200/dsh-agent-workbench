import sqlConfiguration from '../../../../../sql.config.json';
import { sqlTemplate as configuredSql } from '../../../../../../shared/sql-config.ts';
import { BRANCH_WAREHOUSES, workbenchSql } from './workbench-sql';
import { currentOrderSkuQuery } from './workbench-current-order-sql';
import type { WorkbenchSqlQuery } from './workbench-sql-types';

// All queries are server-owned. GEA applies the session's row permissions to
// each source before aggregation. No browser-provided scope or SQL is accepted.
export const dailyReportSql = {
  stock: workbenchSql.safetyStockRows,
  age: {
    name: 'daily-report-age-skus',
    maxRows: 25_000,
    sql: configuredSql(sqlConfiguration, 'aqkc.web.src.lib.daily-report-sql.1', [
      BRANCH_WAREHOUSES,
    ]),
  },
  pending: {
    name: 'daily-report-current-orders',
    maxRows: 25_000,
    sql: configuredSql(sqlConfiguration, 'aqkc.web.src.lib.daily-report-sql.2', [
      currentOrderSkuQuery.sql.replace(
        configuredSql(sqlConfiguration, 'aqkc.web.src.lib.daily-report-sql.3'),
        configuredSql(sqlConfiguration, 'aqkc.web.src.lib.daily-report-sql.4'),
      ),
    ]),
  },
  fulfillment: {
    name: 'daily-report-fulfillment',
    maxRows: 25_000,
    sql: configuredSql(sqlConfiguration, 'aqkc.web.src.lib.daily-report-sql.5'),
  },
} satisfies Record<string, WorkbenchSqlQuery>;
