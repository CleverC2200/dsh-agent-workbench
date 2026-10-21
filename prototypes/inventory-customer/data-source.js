import { bindGovernedSql } from '../../business/shared/governed-parameters.ts';
import { executeAllGeaSqlPages } from '../../business/shared/sql-reader.ts';
import { mapCustomerInventoryRows } from './customer-inventory-model.js';

export { mapCustomerInventoryRows } from './customer-inventory-model.js';

export const CUSTOMER_INVENTORY_TABLE = 'agents_scm_cust_jxc_ai_daliy_d';

// Keep the SQL fixed. GEA supplies the current business identity and enforces
// the consumer's table/column grant before any row reaches this page.
export const CUSTOMER_INVENTORY_SQL = `
WITH sku AS (
  SELECT stat_date, cust_code, material_code,
    MAX(cust_name) AS cust_name, MAX(region_name) AS region_name,
    MAX(province_region_name) AS province_region_name,
    CASE WHEN COUNT(stock_qty) = COUNT(*) THEN SUM(stock_qty) END AS stock_qty,
    CASE WHEN COUNT(stock_amt) = COUNT(*) THEN SUM(stock_amt) END AS stock_amt,
    CASE WHEN COUNT(pack_unitqty) = COUNT(*) THEN SUM(pack_unitqty) END AS in_transit_qty,
    CASE WHEN COUNT(normal_stock_qty) = COUNT(*) THEN SUM(normal_stock_qty) END AS normal_stock_qty,
    CASE WHEN COUNT(big_final_qty) = COUNT(*) THEN SUM(big_final_qty) END AS large_date_qty,
    SUM(CASE WHEN big_final_qty < 0 OR big_final_qty > stock_qty THEN 1 ELSE 0 END) AS large_date_invalid_sku,
    CASE WHEN COUNT(sales_qty_30days) = COUNT(*) THEN SUM(sales_qty_30days) END AS sales_qty_30days
  FROM agents_scm_cust_jxc_ai_daliy_d
  WHERE stat_date = (SELECT MAX(stat_date) FROM agents_scm_cust_jxc_ai_daliy_d)
  GROUP BY stat_date, cust_code, material_code
), weighted AS (
  SELECT sku.stat_date, sku.cust_code, sku.material_code,
    sku.cust_name, sku.region_name, sku.province_region_name,
    sku.stock_qty, sku.stock_amt, sku.in_transit_qty, sku.normal_stock_qty,
    sku.large_date_qty, sku.large_date_invalid_sku, sku.sales_qty_30days,
    SUM(stock_qty) OVER (PARTITION BY stat_date, cust_code) AS total_stock,
    SUM(sales_qty_30days) OVER (PARTITION BY stat_date, cust_code) AS total_sales
  FROM sku
)
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
  SUM(large_date_qty) AS large_date_qty,
  COUNT(large_date_qty) AS large_date_coverage,
  SUM(large_date_invalid_sku) AS large_date_invalid_sku,
  SUM(in_transit_qty) AS in_transit_qty,
  COUNT(in_transit_qty) AS transit_coverage,
  COUNT(*) - COUNT(material_code) AS structure_missing_sku,
  SUM(CASE WHEN stock_qty < 0 THEN 1 ELSE 0 END) AS structure_negative_stock,
  SUM(CASE WHEN sales_qty_30days < 0 THEN 1 ELSE 0 END) AS structure_negative_sales,
  CASE WHEN COUNT(stock_qty) = COUNT(*) AND COUNT(sales_qty_30days) = COUNT(*)
    AND COUNT(material_code) = COUNT(*)
    AND MIN(stock_qty) >= 0 AND MIN(sales_qty_30days) >= 0
    AND MAX(total_stock) > 0 AND MAX(total_sales) > 0
    THEN 100 * (1 - 0.5 * SUM(ABS(stock_qty / NULLIF(total_stock, 0)
      - sales_qty_30days / NULLIF(total_sales, 0)))) END AS structure_score,
  CASE WHEN COUNT(stock_qty) = COUNT(*) AND COUNT(sales_qty_30days) = COUNT(*)
    AND MIN(stock_qty) >= 0 AND MIN(sales_qty_30days) >= 0
    THEN COUNT(DISTINCT CASE WHEN sales_qty_30days > 0
      AND stock_qty / (sales_qty_30days / 30) < 60 THEN material_code END) END AS shortage_sku,
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
FROM weighted inventory
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
    pageConcurrency: 3,
  });
  return mapCustomerInventoryRows(rows);
}
