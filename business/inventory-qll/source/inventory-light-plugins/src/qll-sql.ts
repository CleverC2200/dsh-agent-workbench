import sqlConfiguration from '../../../sql.config.json';
import { sqlTemplate as configuredSql } from '../../../../shared/sql-config.ts';
// Fixed company queries selected from registered original15 096e2ccf43a2d766853163754d7469ccb8879fb1.
const BASE_SQL = configuredSql(sqlConfiguration, 'inventory-light-plugins.src.qll-sql.1');

const BRANCH_SQL = configuredSql(sqlConfiguration, 'inventory-light-plugins.src.qll-sql.2');

const BASE_AGE_SQL = configuredSql(sqlConfiguration, 'inventory-light-plugins.src.qll-sql.3');

const BRANCH_AGE_SQL = configuredSql(sqlConfiguration, 'inventory-light-plugins.src.qll-sql.4');

const ORDER_SQL = configuredSql(sqlConfiguration, 'inventory-light-plugins.src.qll-sql.5');

const PENDING_SQL = configuredSql(sqlConfiguration, 'inventory-light-plugins.src.qll-sql.6');

const ORDER_7D_SQL = configuredSql(sqlConfiguration, 'inventory-light-plugins.src.qll-sql.7');

const BRANCH_OUTBOUND_SQL = configuredSql(
  sqlConfiguration,
  'inventory-light-plugins.src.qll-sql.8',
);

const BRANCH_FULFILLMENT_SQL = configuredSql(
  sqlConfiguration,
  'inventory-light-plugins.src.qll-sql.9',
);

const BASE_CURRENT_ORDER_SQL = configuredSql(
  sqlConfiguration,
  'inventory-light-plugins.src.qll-sql.10',
);

const COMPANY_TREND_SQL = configuredSql(sqlConfiguration, 'inventory-light-plugins.src.qll-sql.11');

const ORDER_TREND_SQL = configuredSql(sqlConfiguration, 'inventory-light-plugins.src.qll-sql.12');

const AGING_TREND_SQL = configuredSql(sqlConfiguration, 'inventory-light-plugins.src.qll-sql.13');

export const companySqlTemplates = {
  BASE_SQL,
  BRANCH_SQL,
  BASE_AGE_SQL,
  BRANCH_AGE_SQL,
  ORDER_SQL,
  PENDING_SQL,
  ORDER_7D_SQL,
  BRANCH_OUTBOUND_SQL,
  BRANCH_FULFILLMENT_SQL,
  BASE_CURRENT_ORDER_SQL,
  COMPANY_TREND_SQL,
  ORDER_TREND_SQL,
  AGING_TREND_SQL,
} as const;
