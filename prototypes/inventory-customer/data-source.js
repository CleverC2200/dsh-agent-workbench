import { bindGovernedSql } from '../../business/shared/governed-parameters.ts';
import { executeAllGeaSqlPages } from '../../business/shared/sql-reader.ts';
import { mapCustomerInventoryRows } from './customer-inventory-model.js';

export { mapCustomerInventoryRows } from './customer-inventory-model.js';

export const CUSTOMER_INVENTORY_TABLE = 'agents_scm_cust_jxc_ai_daliy_d';

// Keep the SQL fixed. GEA supplies the current business identity and enforces
// the consumer's table/column grant before any row reaches this page.
export const CUSTOMER_INVENTORY_SQL = `
SELECT
  DATE_FORMAT(inventory.stat_date, '%Y-%m-%d') AS snapshot_date,
  inventory.cust_code,
  MAX(cust_name) AS cust_name,
  MAX(region_name) AS region_name,
  MAX(province_region_name) AS province_name,
  SUM(stock_qty) AS stock_qty,
  SUM(stock_amt) AS stock_amt,
  SUM(sales_qty_30days) AS sales_qty_30days,
  SUM(normal_stock_qty) AS normal_stock_qty,
  COUNT(DISTINCT CASE
    WHEN stock_qty > 0 AND sales_qty_30days = 0 THEN material_code
    ELSE NULL
  END) AS no_sales_sku,
  COUNT(*) AS sku_rows,
  COUNT(stock_qty) AS stock_coverage,
  COUNT(stock_amt) AS value_coverage,
  COUNT(sales_qty_30days) AS sales_coverage,
  COUNT(normal_stock_qty) AS normal_coverage
  ,MAX(dealer.dealer_receive_addr) AS dealer_receive_addr
FROM agents_scm_cust_jxc_ai_daliy_d inventory
LEFT JOIN (
  SELECT cust_code, MAX(dealer_receive_addr) AS dealer_receive_addr
  FROM agents_dim_dealer_data_d
  GROUP BY cust_code
) dealer ON dealer.cust_code = inventory.cust_code
WHERE inventory.stat_date = (
  SELECT MAX(stat_date) FROM agents_scm_cust_jxc_ai_daliy_d
)
GROUP BY stat_date, inventory.cust_code
ORDER BY stock_amt DESC, inventory.cust_code
`;

export async function loadCustomerInventory(options = {}) {
  const input = bindGovernedSql(CUSTOMER_INVENTORY_SQL);
  const rows = await executeAllGeaSqlPages(`/*customer-inventory:latest*/\n${input.sql}`, {
    parameters: input.parameters,
    signal: options.signal,
  });
  return mapCustomerInventoryRows(rows);
}
