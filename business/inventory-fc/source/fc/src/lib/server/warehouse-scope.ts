import sqlConfiguration from '../../../../../sql.config.json';
import { sqlTemplate as configuredSql } from '../../../../../../shared/sql-config.ts';

export function fulfillmentWarehouseScope(parameter: 1 | 2): string {
  return configuredSql(sqlConfiguration, 'fc.src.lib.server.warehouse-scope.1', [parameter]);
}
