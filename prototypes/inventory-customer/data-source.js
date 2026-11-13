import { bindGovernedSql } from '../../business/shared/governed-parameters.ts';
import { executeAllGeaSqlPages } from '../../business/shared/sql-reader.ts';
import { mapCustomerInventoryRows } from './customer-inventory-model.js';
import { CUSTOMER_PLAN_SQL, mergeCustomerPlanRows } from './plan-source.js';
import { CUSTOMER_MANAGER_SQL, mergeCustomerManagers } from './manager-source.js';
import { rowPacketSql, unpackRowPackets } from '../../business/shared/row-packets.mjs';

export { mapCustomerInventoryRows } from './customer-inventory-model.js';

export const CUSTOMER_INVENTORY_TABLE = 'agents_scm_cust_plan_order_analysis_d';
const inventoryColumns = ['snapshot_date','inventory_snapshot_date','organization_snapshot_date','cust_code','cust_name','region_name','province_name','inventory_sku_rows','cif_price_min','cif_price_max','cif_price_coverage','stock_qty','large_date_stock_qty','duplicate_sku_rows','stock_amt','sales_qty_30days','normal_stock_qty','large_date_qty','large_date_coverage','large_date_invalid_sku','in_transit_qty','transit_coverage','structure_missing_sku','structure_negative_stock','structure_negative_sales','structure_score','shortage_sku','no_sales_sku','sku_rows','stock_coverage','value_coverage','sales_coverage','normal_coverage'];
const planColumns = ['cust_code','plan_snapshot_date','monthly_plan_qty_coverage','monthly_plan_qty','shipped_qty_coverage','shipped_qty','unshipped_qty_coverage','unshipped_qty','budget_amount_coverage','budget_amount','shipped_amount_coverage','shipped_amount','unshipped_amount_coverage','unshipped_amount','plan_sku_rows','target_coverage','target_qty','standard_coverage','minimum_standard_days','maximum_standard_days','age_coverage','control_sku_count','preorder_coverage','source_preorder_qty','plan_transit_coverage','plan_in_transit_qty'];
const addressColumns = ['cust_code','dealer_receive_addr'];
const managerColumns = ['cust_code','manager_names','customer_manager','manager_snapshot'];
async function readCustomerRows(sql, columns, options, order = ['cust_code']) {
  const packets = await executeAllGeaSqlPages(rowPacketSql(sql, columns, order), {...options, rowsOnly: true});
  options.signal?.throwIfAborted();
  return unpackRowPackets(packets, columns, ['cust_code']);
}

export const CUSTOMER_INVENTORY_SQL = `
WITH snapshot AS (
  SELECT MAX(create_date) AS plan_date FROM agents_scm_cust_plan_order_analysis_d
), organization_date AS (
  SELECT MAX(stat_date) AS inventory_date FROM agents_scm_cust_jxc_ai_daliy_d
), plan_sku AS (
  SELECT p.create_date AS stat_date, p.cust_code, p.material_code,
    COUNT(*) AS source_rows,
    MAX(p.cust_name) AS cust_name,
    CASE WHEN COUNT(*) = 1 THEN MAX(p.stock_qty) END AS stock_qty,
    CASE WHEN COUNT(*) = 1 THEN MAX(p.in_transit_qty) END AS in_transit_qty,
    MIN(p.cif_price) AS cif_price_min, MAX(p.cif_price) AS cif_price_max,
    CASE WHEN COUNT(*) = 1 AND COUNT(p.cif_price) = 1 THEN 1 ELSE 0 END AS cif_price_complete,
    CASE WHEN COUNT(*) = 1 THEN MAX(p.stock_qty * p.cif_price) END AS stock_amt,
    CASE WHEN COUNT(*) = 1 THEN MAX(p.big_final_qty) END AS large_date_qty,
    SUM(CASE WHEN p.big_final_qty < 0 OR p.big_final_qty > p.stock_qty THEN 1 ELSE 0 END) AS large_date_invalid_sku,
    CASE WHEN COUNT(*) = 1 THEN MAX(p.daily_sales) * 30 END AS sales_qty_30days
  FROM agents_scm_cust_plan_order_analysis_d p
  WHERE p.create_date = (SELECT plan_date FROM snapshot)
  GROUP BY p.create_date, p.cust_code, p.material_code
), inventory_sku AS (
  SELECT cust_code, material_code, source_rows,
    cif_price_min, cif_price_max, cif_price_complete, stock_amt,
    stock_qty AS original_stock_qty,
    CAST(NULL AS DECIMAL(18,4)) AS normal_stock_qty,
    large_date_qty, large_date_invalid_sku
  FROM plan_sku
), inventory_customer AS (
  SELECT cust_code, COUNT(*) AS inventory_sku_rows,
    SUM(CASE WHEN source_rows > 1 THEN 1 ELSE 0 END) AS duplicate_sku_rows,
    MIN(cif_price_min) AS cif_price_min, MAX(cif_price_max) AS cif_price_max,
    SUM(cif_price_complete) AS cif_price_coverage,
    SUM(stock_amt) AS stock_amt, COUNT(stock_amt) AS value_coverage,
    CASE WHEN COUNT(original_stock_qty) = COUNT(*) THEN SUM(original_stock_qty) END AS large_date_stock_qty,
    SUM(normal_stock_qty) AS normal_stock_qty, COUNT(normal_stock_qty) AS normal_coverage,
    SUM(large_date_qty) AS large_date_qty, COUNT(large_date_qty) AS large_date_coverage,
    SUM(large_date_invalid_sku) AS large_date_invalid_sku
  FROM inventory_sku
  GROUP BY cust_code
), organization AS (
  SELECT cust_code, MAX(region_name) AS region_name, MAX(province_region_name) AS province_region_name
  FROM agents_scm_cust_jxc_ai_daliy_d
  WHERE stat_date = (SELECT inventory_date FROM organization_date)
  GROUP BY cust_code
), sku AS (
  SELECT p.stat_date, p.cust_code, p.material_code, p.cust_name,
    o.region_name, o.province_region_name,
    p.stock_qty, p.in_transit_qty, p.sales_qty_30days
  FROM plan_sku p
  LEFT JOIN organization o ON o.cust_code = p.cust_code
), weighted AS (
  SELECT sku.stat_date, sku.cust_code, sku.material_code,
    sku.cust_name, sku.region_name, sku.province_region_name,
    sku.stock_qty, sku.in_transit_qty, sku.sales_qty_30days,
    SUM(stock_qty) OVER (PARTITION BY stat_date, cust_code) AS total_stock,
    SUM(sales_qty_30days) OVER (PARTITION BY stat_date, cust_code) AS total_sales
  FROM sku
)
SELECT
  inventory.stat_date AS snapshot_date,
  inventory.stat_date AS inventory_snapshot_date,
  (SELECT inventory_date FROM organization_date) AS organization_snapshot_date,
  inventory.cust_code,
  MAX(cust_name) AS cust_name,
  MAX(region_name) AS region_name,
  MAX(province_region_name) AS province_name,
  MAX(i.inventory_sku_rows) AS inventory_sku_rows,
  MAX(i.cif_price_min) AS cif_price_min, MAX(i.cif_price_max) AS cif_price_max,
  MAX(i.cif_price_coverage) AS cif_price_coverage,
  SUM(stock_qty) AS stock_qty,
  MAX(i.large_date_stock_qty) AS large_date_stock_qty,
  MAX(i.duplicate_sku_rows) AS duplicate_sku_rows,
  MAX(i.stock_amt) AS stock_amt,
  SUM(sales_qty_30days) AS sales_qty_30days,
  MAX(i.normal_stock_qty) AS normal_stock_qty,
  MAX(i.large_date_qty) AS large_date_qty,
  MAX(i.large_date_coverage) AS large_date_coverage,
  MAX(i.large_date_invalid_sku) AS large_date_invalid_sku,
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
  MAX(i.value_coverage) AS value_coverage,
  COUNT(sales_qty_30days) AS sales_coverage,
  MAX(i.normal_coverage) AS normal_coverage
FROM weighted inventory
LEFT JOIN inventory_customer i ON i.cust_code = inventory.cust_code
GROUP BY stat_date, inventory.cust_code
ORDER BY stock_amt DESC, inventory.cust_code
`;

export const CUSTOMER_ADDRESS_SQL = `SELECT d.cust_code, MAX(d.dealer_receive_addr) AS dealer_receive_addr
FROM agents_dim_dealer_data_d d INNER JOIN (
  SELECT DISTINCT cust_code FROM agents_scm_cust_plan_order_analysis_d
  WHERE create_date=(SELECT MAX(create_date) FROM agents_scm_cust_plan_order_analysis_d)
) inventory_scope ON inventory_scope.cust_code=d.cust_code
GROUP BY d.cust_code ORDER BY d.cust_code`;

export async function loadCustomerInventory(options = {}) {
  const input = bindGovernedSql(CUSTOMER_INVENTORY_SQL);
  const inventoryRead = readCustomerRows(`/*customer-inventory:latest*/\n${input.sql}`, inventoryColumns, {
    parameters: input.parameters,
    signal: options.signal,
    pageConcurrency: 3,
    priority: 10,
  }, ['stock_amt DESC', 'cust_code']);
  const addressInput = bindGovernedSql(CUSTOMER_ADDRESS_SQL);
  const addressRead = readCustomerRows(addressInput.sql, addressColumns, { parameters: addressInput.parameters, signal: options.signal, pageConcurrency: 3, priority: -10 }).then(rows => ({ rows, state: "ready" }), error => { return { rows: [], state: error.code ?? "ADDRESS_SOURCE_UNAVAILABLE" }; });
  const planRead = (async () => { try {
    const planInput = bindGovernedSql(CUSTOMER_PLAN_SQL);
    const plans = await readCustomerRows(planInput.sql, planColumns, {
      parameters: planInput.parameters,
      signal: options.signal,
      pageConcurrency: 3,
    });
    return {plans,planState:'ready'};
  } catch (error) {
    return {plans:[],planState:error.code ?? 'PLAN_SOURCE_UNAVAILABLE'};
  } })();
  const managerInput = bindGovernedSql(CUSTOMER_MANAGER_SQL);
  const managerRead = readCustomerRows(managerInput.sql, managerColumns, {
    parameters: managerInput.parameters, signal: options.signal, pageConcurrency: 3, priority: -10,
  }).then(rows => ({ rows, state: 'ready' }), error => ({ rows: [], state: error.code ?? 'MANAGER_SOURCE_UNAVAILABLE' }));
  const supplements = {
    plans: {plans: [], planState: 'loading'},
    addresses: {rows: [], state: 'loading'},
    managers: {rows: [], state: 'loading'},
  };
  let rows;
  const compose = () => {
    const {plans, planState} = supplements.plans;
    const {addresses, managers} = supplements;
    const addressByCustomer = new Map(addresses.rows.map(row => [String(row.cust_code), row.dealer_receive_addr]));
    const joined = mergeCustomerManagers(rows, managers.rows).map(row => ({
      ...row, manager_state: managers.state,
      dealer_receive_addr: addressByCustomer.get(String(row.cust_code)) ?? null,
    }));
    const inventory = {...mapCustomerInventoryRows(mergeCustomerPlanRows(joined, plans)),
      planState, addressState: addresses.state, managerState: managers.state};

    const byCode = new Map(inventory.rows.map(row => [String(row.code), structuredClone(row)]));
    if (byCode.size !== inventory.rows.length) throw Error('CUSTOMER_PAGE_INCOMPLETE');
    inventory.readDetails = async (codes, {signal} = {}) => {
      (options.pageSignal ?? options.signal)?.throwIfAborted();
      signal?.throwIfAborted();
      if (!Array.isArray(codes) || codes.length > 20 || new Set(codes).size !== codes.length || codes.some(code => !byCode.has(code)))
        throw Error('CUSTOMER_PAGE_SCOPE_INVALID');
      return structuredClone(codes.map(code => byCode.get(code)));
    };
    return inventory;
  };
  const notify = () => {
    options.signal?.throwIfAborted();
    if (rows) options.onInventory?.(compose());
  };
  const enrichment = Promise.all([
    planRead.then(value => { supplements.plans = value; notify(); }),
    addressRead.then(value => { supplements.addresses = value; notify(); }),
    managerRead.then(value => { supplements.managers = value; notify(); }),
  ]);

  void enrichment.catch(() => {});
  rows = await inventoryRead;
  options.signal?.throwIfAborted();
  notify();
  await enrichment;
  options.signal?.throwIfAborted();
  return compose();
}
