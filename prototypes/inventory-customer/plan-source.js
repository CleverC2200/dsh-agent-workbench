export const CUSTOMER_PLAN_SQL = `
WITH snapshot AS (
  SELECT MAX(stat_date) AS inventory_date FROM agents_scm_cust_jxc_ai_daliy_d
), plan_date AS (
  SELECT MAX(create_date) AS plan_date FROM agents_scm_cust_plan_order_analysis_d
  WHERE create_date <= (SELECT inventory_date FROM snapshot)
), plan_sku AS (
  SELECT cust_code, material_code, MAX(create_date) AS plan_date,
    CASE WHEN COUNT(*) = 1 THEN MAX(target_inventory) END AS target_qty,
    CASE WHEN COUNT(*) = 1 THEN MAX(label_turnover_days) END AS standard_days,
    CASE WHEN COUNT(*) = 1 THEN MAX(avg_stock_age) END AS average_age,
    CASE WHEN COUNT(*) = 1 THEN MAX(in_transit_qty) END AS in_transit_qty,
    CASE WHEN COUNT(*) = 1 THEN MAX(pre_order_qty) END AS pre_order_qty
  FROM agents_scm_cust_plan_order_analysis_d
  WHERE create_date = (SELECT plan_date FROM plan_date)
  GROUP BY cust_code, material_code
), inventory_keys AS (
  SELECT DISTINCT cust_code, material_code FROM agents_scm_cust_jxc_ai_daliy_d
  WHERE stat_date = (SELECT inventory_date FROM snapshot)
)
SELECT k.cust_code, MAX(p.plan_date) AS plan_snapshot_date,
  COUNT(*) AS plan_sku_rows, COUNT(p.target_qty) AS target_coverage,
  SUM(p.target_qty) AS target_qty,
  COUNT(p.standard_days) AS standard_coverage,
  MIN(p.standard_days) AS minimum_standard_days,
  MAX(p.standard_days) AS maximum_standard_days,
  COUNT(p.average_age) AS age_coverage,
  SUM(CASE WHEN p.average_age >= 90 THEN 1 ELSE 0 END) AS control_sku_count,
  COUNT(p.pre_order_qty) AS preorder_coverage,
  SUM(p.pre_order_qty) AS source_preorder_qty,
  COUNT(CASE WHEN p.plan_date=(SELECT inventory_date FROM snapshot) THEN p.in_transit_qty END) AS plan_transit_coverage,
  SUM(CASE WHEN p.plan_date=(SELECT inventory_date FROM snapshot) THEN p.in_transit_qty END) AS plan_in_transit_qty
FROM inventory_keys k LEFT JOIN plan_sku p
  ON k.cust_code=p.cust_code AND k.material_code=p.material_code
GROUP BY k.cust_code ORDER BY k.cust_code
`;

export function mergeCustomerPlanRows(rows, plans) {
  const byCustomer = new Map(plans.map(row => [String(row.cust_code), row]));
  return rows.map(row => ({ ...row, ...(byCustomer.get(String(row.cust_code)) ?? {}) }));
}
