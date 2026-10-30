// The business owner confirmed order sales_person is the customer manager.
// Keep one row per plan customer; conflicting or missing names remain unknown.
export const CUSTOMER_MANAGER_SQL = `SELECT e.cust_code,
  COUNT(DISTINCT NULLIF(TRIM(e.sales_person), '')) AS manager_names,
  CASE WHEN COUNT(DISTINCT NULLIF(TRIM(e.sales_person), '')) = 1
    THEN MAX(NULLIF(TRIM(e.sales_person), '')) END AS customer_manager,
  MAX(e.load_time) AS manager_snapshot
FROM agents_scm_execute_detail_hourly_d e
INNER JOIN (
  SELECT DISTINCT cust_code FROM agents_scm_cust_plan_order_analysis_d
  WHERE create_date = (SELECT MAX(create_date) FROM agents_scm_cust_plan_order_analysis_d)
) p ON p.cust_code = e.cust_code
GROUP BY e.cust_code ORDER BY e.cust_code`;

export function mergeCustomerManagers(rows, managers) {
  const byCustomer = new Map();
  for (const manager of managers) {
    const code = String(manager.cust_code);
    const existing = byCustomer.get(code);
    byCustomer.set(code, existing ? { customer_manager: null, manager_snapshot: null } : manager);
  }
  return rows.map(row => ({
    ...row,
    customer_manager: byCustomer.get(String(row.cust_code))?.customer_manager ?? null,
    manager_names: byCustomer.get(String(row.cust_code))?.manager_names ?? null,
    manager_matched: byCustomer.has(String(row.cust_code)),
    manager_snapshot: byCustomer.get(String(row.cust_code))?.manager_snapshot ?? null,
  }));
}
