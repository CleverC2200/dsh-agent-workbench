import sqlConfiguration from '../../../../../sql.config.json';
import { sqlTemplate as configuredSql } from '../../../../../../shared/sql-config.ts';
import { currentOrdersQuery, currentOrderSkuQuery } from './workbench-current-order-sql';
import type { WorkbenchSqlQuery } from './workbench-sql-types';

const LATEST_SAFETY_STOCK = configuredSql(sqlConfiguration, 'aqkc.web.src.lib.workbench-sql.1');

// warehouse_classify='20' is the published branch-warehouse classification.
// Match physical warehouse IDs before assigning age stock to a production base:
// OCP can label a branch lot with the supplying base_name.
export const BRANCH_WAREHOUSES = configuredSql(
  sqlConfiguration,
  'aqkc.web.src.lib.workbench-sql.2',
);

const LATEST_INVENTORY_AGE = configuredSql(sqlConfiguration, 'aqkc.web.src.lib.workbench-sql.3', [
  BRANCH_WAREHOUSES,
]);

export const workbenchSql = {
  currentOrders: currentOrdersQuery,
  currentOrderSkus: currentOrderSkuQuery,
  scope: {
    name: 'workbench-scope',
    maxRows: 100,
    sql: configuredSql(sqlConfiguration, 'aqkc.web.src.lib.workbench-sql.4', [LATEST_SAFETY_STOCK]),
  },
  safetyStockRows: {
    name: 'workbench-safety-stock-rows',
    // Latest snapshots now include >25k rows across months/versions; keep a finite
    // full-result bound shared by GEA and direct reads instead of truncating them.
    maxRows: 50_000,
    sql: configuredSql(sqlConfiguration, 'aqkc.web.src.lib.workbench-sql.5', [LATEST_SAFETY_STOCK]),
  },
  supportByBase: (days: number): WorkbenchSqlQuery => ({
    name: 'workbench-support-by-base',
    maxRows: 200,
    sql: configuredSql(sqlConfiguration, 'aqkc.web.src.lib.workbench-sql.6', [
      BRANCH_WAREHOUSES,
      Math.max(0, Math.floor(days)),
      Math.max(0, Math.floor(days)),
    ]),
  }),
  orderStructure: {
    name: 'workbench-order-structure',
    maxRows: 25_000,
    sql: configuredSql(sqlConfiguration, 'aqkc.web.src.lib.workbench-sql.7'),
  },
  ageStructure: (overAgeDays: number): WorkbenchSqlQuery => ({
    name: 'workbench-age-structure',
    maxRows: 25_000,
    sql: configuredSql(sqlConfiguration, 'aqkc.web.src.lib.workbench-sql.8', [
      LATEST_INVENTORY_AGE,
      Math.max(0, Math.floor(overAgeDays)),
      Math.max(0, Math.floor(overAgeDays)),
      Math.max(0, Math.floor(overAgeDays)),
      Math.max(0, Math.floor(overAgeDays)),
    ]),
  }),
} satisfies Record<string, WorkbenchSqlQuery | ((value: number) => WorkbenchSqlQuery)>;

/** Retry an omitted base through the same governed resource and consumer. */
export function safetyStockRowsForBase(base: string): WorkbenchSqlQuery {
  return {
    name: 'workbench-safety-stock-base-retry',
    maxRows: 10_000,
    parameters: { gea_p1: base },
    sql: configuredSql(sqlConfiguration, 'aqkc.web.src.lib.workbench-sql.9'),
  };
}

export type WorkbenchSqlName = keyof typeof workbenchSql;
