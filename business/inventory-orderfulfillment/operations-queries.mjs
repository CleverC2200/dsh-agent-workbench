import { rowPacketSql } from '../shared/row-packets.mjs';
export const operationsPacketSize = 1024;
export const operationsPacketColumns = [
  'packet_index',
  'packet_count',
  'packet_scope_total',
  'packet_rows',
];
export const operationsPacketDatasets = new Set([
  'stock.age',
  'orders.facts',
  'orders.age',
  'product.unit.factors',
  'sku.attributes',
  'product.attributes',
  'product.master.attributes',
  'stock.sku',
  'supply.branch',
  'plan.sku',
  'orders.pending',
  'shortage.sku',
  'production.future',
  'supply.oem.stock',
  'plan.region',
]);
const specs = {
  month: { type: 'string', format: 'YYYY-MM-01' },
  today: { type: 'string', format: 'YYYY-MM-DD' },
  plan_end: { type: 'string', format: 'YYYY-MM-DD' },
  basis: { type: 'string', enum: ['基地口径', '销售口径'] },
  base: { type: 'string', nullable: true },
  region: { type: 'string', nullable: true },
  province: { type: 'string', nullable: true },
  sales_group: { type: 'string', nullable: true },
  page_size: { type: 'integer', minimum: 1, maximum: 1000 },
  offset: { type: 'integer', minimum: 0 },
};
const scope = (a, base = 'belong_base') =>
  `(:base IS NULL OR ${a}.${base}=:base) AND (:region IS NULL OR ${a}.region_name=:region) AND (:province IS NULL OR ${a}.province_region_name=:province) AND (:sales_group IS NULL OR ${a}.sales_group_name=:sales_group)`;
const knownSum = (field) => `CASE WHEN COUNT(${field})=COUNT(*) THEN SUM(${field}) ELSE NULL END`;
const ordersScope = `e.detailstatus=10 AND e.is_stat='1' AND ${scope('e')}`;
const pending = `e.prapare_order_status='备单中'`;
const planMeasures = `COUNT(*) AS source_rows,${knownSum('p.plan_qty_initial')} AS initial_plan,${knownSum('p.plan_qty_adjusted')} AS adjusted_plan,${knownSum('p.order_qty_origin')} AS ordered,SUM(p.order_qty_origin) AS ordered_known,${knownSum('p.act_dl_qty')} AS shipped,COUNT(p.order_qty_origin) AS ordered_coverage`;
const planColumns = [
  'source_rows',
  'initial_plan',
  'adjusted_plan',
  'ordered',
  'ordered_known',
  'shipped',
  'ordered_coverage',
];
const planWhere = `p.stat_month=:month AND p.source_flag=:basis AND ${scope('p', 'belong_name')}`;
const plan = (dimensions) =>
  `SELECT ${dimensions.map(([field, alias]) => `p.${field} AS ${alias}`).join(',')},${planMeasures} FROM agents_scm_demand_sales_f p WHERE ${planWhere} GROUP BY ${dimensions.map(([field]) => `p.${field}`).join(',')}`;
const orderGroups = `SELECT e.cust_order_no,
 CASE WHEN COUNT(e.belong_base)=COUNT(*) AND COUNT(DISTINCT e.belong_base)=1 THEN MAX(e.belong_base) ELSE '跨基地或归属未知' END AS base,
 CASE WHEN COUNT(e.prapare_order_status)=COUNT(*) AND COUNT(DISTINCT e.prapare_order_status)=1 THEN MAX(e.prapare_order_status) ELSE '状态缺失或不一致' END AS stage,
 CASE WHEN COUNT(e.header_addtime)=COUNT(*) THEN MIN(e.header_addtime) END AS created_at,
 CASE WHEN COUNT(e.needbillingdate)=COUNT(*) AND MIN(e.needbillingdate)>='2000-01-01' THEN MIN(e.needbillingdate) END AS need_billing_at,
 MAX(e.load_time) AS latest_load
 FROM agents_scm_execute_detail_hourly_d e WHERE ${ordersScope} AND e.cust_order_no IS NOT NULL GROUP BY e.cust_order_no`;
const shortScope = `SELECT e.executeorderno,e.material_code,CASE WHEN COUNT(e.cust_order_no)=COUNT(*) AND COUNT(e.cust_code)=COUNT(*) THEN MAX(e.cust_order_no) END AS customer_order,MAX(e.belong_base) AS base,MAX(e.product_item) AS item,MAX(e.material_name) AS material_name FROM agents_scm_execute_detail_hourly_d e WHERE ${ordersScope} AND ${pending} GROUP BY e.executeorderno,e.material_code HAVING COUNT(DISTINCT e.belong_base)=1 AND COUNT(DISTINCT e.cust_code)=1 AND COUNT(DISTINCT e.cust_order_no)=1`;
const shortRows = `SELECT s.base,s.item,t.material_code AS sku,s.material_name,MAX(s.customer_order) AS customer_order,
 CASE WHEN COUNT(*)=1 THEN MAX(t.after_inventory_short_qty) END AS inventory_gap,
 CASE WHEN COUNT(*)=1 THEN MAX(t.final_short_qty) END AS final_gap,
 COUNT(*) AS match_rows
 FROM agents_scm_shortage_trace_f t INNER JOIN (${shortScope}) s ON s.executeorderno=t.executeorderno AND s.material_code=t.material_code
 WHERE t.source_flag='缺货供应匹配' GROUP BY s.base,s.item,t.material_code,s.material_name,t.executeorderno`;
const stockWhere = `s.the_date=(SELECT MAX(d.the_date) FROM agents_scm_stock_detail_d d WHERE d.the_date<=:today)
 AND (:base IS NULL OR s.belong_base=:base)
 AND ((:region IS NULL AND :province IS NULL AND :sales_group IS NULL) OR scoped.material_code IS NOT NULL)`;
const stockFields = {
  current_stock: 'current_stock',
  available_stock: 'available_stock',
  pending_order_qty: 'ordered_qty',
  production_plan: 'produce_plan_adj',
  production_in: 'produce_in_qty',
};
const stockRows = `SELECT s.belong_base AS base,s.material_code AS sku,CASE WHEN COUNT(s.product_item)=COUNT(*) AND COUNT(DISTINCT s.product_item)=1 THEN MAX(s.product_item) ELSE '品项缺失或不一致' END AS item,MAX(s.the_date) AS stock_date,COUNT(*) AS source_rows,${Object.entries(
  stockFields,
)
  .map(([alias, field]) => `CASE WHEN COUNT(*)=1 THEN MAX(s.${field}) END AS ${alias}`)
  .join(
    ',',
  )} FROM agents_scm_stock_detail_d s LEFT JOIN (SELECT DISTINCT e.belong_base,e.material_code FROM agents_scm_execute_detail_hourly_d e WHERE ${ordersScope}) scoped ON scoped.belong_base=s.belong_base AND scoped.material_code=s.material_code WHERE ${stockWhere} GROUP BY s.belong_base,s.material_code`;

const productDictionary = `SELECT product.material_code,CASE WHEN COUNT(NULLIF(TRIM(product.sub_category),''))=COUNT(*) AND COUNT(DISTINCT NULLIF(TRIM(product.sub_category),''))=1 THEN MAX(NULLIF(TRIM(product.sub_category),'')) END AS item FROM agents_dim_product_list_mi product GROUP BY product.material_code`;
const planItem = `COALESCE(NULLIF(TRIM(p.product_categ_name),''),dictionary.item)`;
const oemProducts = `SELECT b.material_code FROM agents_scm_inventory_sku_data_d b LEFT JOIN (SELECT DISTINCT e.belong_base,e.material_code FROM agents_scm_execute_detail_hourly_d e WHERE ${ordersScope}) scoped ON scoped.belong_base=b.belong_base AND scoped.material_code=b.material_code WHERE b.month_date=(SELECT REPLACE(MAX(s.the_date),'-','') FROM agents_scm_stock_detail_d s WHERE s.the_date<=:today) AND b.warehouse_classify='03' AND (:base IS NULL OR b.belong_base=:base) AND ((:region IS NULL AND :province IS NULL AND :sales_group IS NULL) OR scoped.material_code IS NOT NULL)`;
const visibleProducts = `SELECT DISTINCT e.material_code FROM agents_scm_execute_detail_hourly_d e WHERE ${ordersScope} UNION SELECT s.material_code FROM agents_scm_stock_detail_d s LEFT JOIN (SELECT DISTINCT e.belong_base,e.material_code FROM agents_scm_execute_detail_hourly_d e WHERE ${ordersScope}) scoped ON scoped.belong_base=s.belong_base AND scoped.material_code=s.material_code WHERE ${stockWhere} UNION SELECT p.material_code FROM agents_scm_demand_sales_f p WHERE ${planWhere} UNION ${oemProducts}`;

export const operationsDatasets = {
  'product.master.attributes': {
    keys: ['sku'],
    columns: ['sku', 'item', 'series'],
    sql: `SELECT product.material_code AS sku,CASE WHEN COUNT(NULLIF(TRIM(product.prod_big_cls),''))=COUNT(*) AND COUNT(DISTINCT NULLIF(TRIM(product.prod_big_cls),''))=1 THEN MAX(NULLIF(TRIM(product.prod_big_cls),'')) END AS item,CASE WHEN COUNT(NULLIF(TRIM(product.prod_series),''))=COUNT(*) AND COUNT(DISTINCT NULLIF(TRIM(product.prod_series),''))=1 THEN MAX(NULLIF(TRIM(product.prod_series),'')) END AS series FROM agents_dim_material_prod_sales_info_d product INNER JOIN (${visibleProducts}) visible ON visible.material_code=product.material_code GROUP BY product.material_code`,
  },
  'product.attributes': {
    keys: ['sku'],
    columns: ['sku', 'item', 'series', 'snapshot_date'],
    sql: `SELECT product.material_code AS sku,CASE WHEN COUNT(NULLIF(TRIM(product.sub_category),''))=COUNT(*) AND COUNT(DISTINCT NULLIF(TRIM(product.sub_category),''))=1 THEN MAX(NULLIF(TRIM(product.sub_category),'')) END AS item,CASE WHEN COUNT(NULLIF(TRIM(product.series),''))=COUNT(*) AND COUNT(DISTINCT NULLIF(TRIM(product.series),''))=1 THEN MAX(NULLIF(TRIM(product.series),'')) END AS series,MAX(product.stat_period) AS snapshot_date FROM agents_dim_product_list_mi product INNER JOIN (${visibleProducts}) visible ON visible.material_code=product.material_code WHERE product.stat_period=(SELECT MAX(d.stat_period) FROM agents_dim_product_list_mi d WHERE d.stat_period<=:today) GROUP BY product.material_code`,
  },
  'sku.attributes': {
    keys: ['base', 'warehouse_code', 'sku'],
    columns: ['base', 'warehouse_code', 'sku', 'item', 'series', 'owner'],
    sql: `SELECT e.belong_base AS base,e.warehouseid AS warehouse_code,e.material_code AS sku,CASE WHEN COUNT(NULLIF(TRIM(e.product_item),''))=COUNT(*) AND COUNT(DISTINCT NULLIF(TRIM(e.product_item),''))=1 THEN MAX(NULLIF(TRIM(e.product_item),'')) END AS item,CASE WHEN COUNT(NULLIF(TRIM(e.series),''))=COUNT(*) AND COUNT(DISTINCT NULLIF(TRIM(e.series),''))=1 THEN MAX(NULLIF(TRIM(e.series),'')) END AS series,CASE WHEN COUNT(NULLIF(TRIM(e.director),''))=COUNT(*) AND COUNT(DISTINCT NULLIF(TRIM(e.director),''))=1 THEN MAX(NULLIF(TRIM(e.director),'')) END AS owner FROM agents_scm_execute_detail_hourly_d e WHERE ${ordersScope} GROUP BY e.belong_base,e.warehouseid,e.material_code`,
  },
  'warehouse.stock': {
    keys: ['base', 'warehouse_code'],
    columns: ['base', 'warehouse_code', 'warehouse', 'stock_date', 'stock_qty', 'source_rows'],
    sql: `SELECT b.belong_base AS base,b.warehouseid AS warehouse_code,MAX(b.warehouse_name) AS warehouse,MAX(b.month_date) AS stock_date,CASE WHEN COUNT(b.live_qty)=COUNT(*) THEN SUM(b.live_qty) END AS stock_qty,COUNT(*) AS source_rows FROM agents_scm_inventory_sku_data_d b INNER JOIN (SELECT DISTINCT e.warehouseid FROM agents_scm_execute_detail_hourly_d e WHERE ${ordersScope}) scoped ON scoped.warehouseid=b.warehouseid WHERE b.month_date=(SELECT REPLACE(MAX(s.the_date),'-','') FROM agents_scm_stock_detail_d s WHERE s.the_date<=:today) GROUP BY b.belong_base,b.warehouseid`,
  },
  'supply.branch': {
    keys: ['warehouse_code', 'sku'],
    columns: [
      'warehouse_code',
      'warehouse',
      'sku',
      'material_name',
      'base',
      'inventory',
      'available',
      'in_transit',
      'preparing_source',
      'source_rows',
    ],
    sql: `SELECT w.warehouseid AS warehouse_code,MAX(w.warehouse_name) AS warehouse,w.material_code AS sku,MAX(w.material_name) AS material_name,MAX(scoped.base) AS base,CASE WHEN COUNT(*)=1 THEN MAX(w.live_qty) END AS inventory,CASE WHEN COUNT(*)=1 THEN MAX(w.available_qty) END AS available,CASE WHEN COUNT(*)=1 THEN MAX(w.transfer_onway_qty) END AS in_transit,CASE WHEN COUNT(*)=1 THEN MAX(w.transfer_prepare_qty) END AS preparing_source,COUNT(*) AS source_rows FROM agents_scm_warehouse_total_data_d w INNER JOIN (SELECT e.warehouseid,e.material_code,CASE WHEN COUNT(e.belong_base)=COUNT(*) AND COUNT(DISTINCT e.belong_base)=1 THEN MAX(e.belong_base) END AS base FROM agents_scm_execute_detail_hourly_d e WHERE ${ordersScope} GROUP BY e.warehouseid,e.material_code) scoped ON scoped.warehouseid=w.warehouseid AND scoped.material_code=w.material_code GROUP BY w.warehouseid,w.material_code`,
  },

  'product.unit.factors': {
    keys: ['sku'],
    columns: ['sku', 'ton_per_piece', 'source_rows', 'known_quantities', 'distinct_factors'],
    sql: `SELECT unit_data.material_code AS sku,CASE WHEN COUNT(unit_data.ton_per_piece)=COUNT(*) AND COUNT(DISTINCT unit_data.ton_per_piece)=1 AND MIN(unit_data.ton_per_piece)>0 THEN MAX(unit_data.ton_per_piece) END AS ton_per_piece,COUNT(*) AS source_rows,COUNT(unit_data.ton_per_piece) AS known_quantities,COUNT(DISTINCT unit_data.ton_per_piece) AS distinct_factors FROM agents_dim_material_prod_sales_info_d unit_data INNER JOIN (SELECT DISTINCT schedule.material_code FROM agents_prod_schedule_detail_d schedule WHERE schedule.base_finish_day>=REPLACE(:today,'-','') AND schedule.base_finish_day<REPLACE(:plan_end,'-','') AND schedule.data_source='工厂') scheduled ON scheduled.material_code=unit_data.material_code INNER JOIN (SELECT DISTINCT e.material_code FROM agents_scm_execute_detail_hourly_d e WHERE ${ordersScope}) scope_material ON scope_material.material_code=unit_data.material_code GROUP BY unit_data.material_code`,
  },

  'supply.oem.stock': {
    keys: ['base', 'sku'],
    columns: [
      'base',
      'sku',
      'material_name',
      'snapshot_date',
      'quantity',
      'source_rows',
      'known_quantities',
      'negative_rows',
    ],
    sql: `SELECT b.belong_base AS base,b.material_code AS sku,CASE WHEN COUNT(DISTINCT b.material_name)=1 THEN MAX(b.material_name) END AS material_name,MAX(b.month_date) AS snapshot_date,CASE WHEN COUNT(b.live_qty)=COUNT(*) THEN SUM(b.live_qty) END AS quantity,COUNT(*) AS source_rows,COUNT(b.live_qty) AS known_quantities,SUM(CASE WHEN b.live_qty<0 THEN 1 ELSE 0 END) AS negative_rows FROM agents_scm_inventory_sku_data_d b LEFT JOIN (SELECT DISTINCT e.belong_base,e.material_code FROM agents_scm_execute_detail_hourly_d e WHERE ${ordersScope}) scoped ON scoped.belong_base=b.belong_base AND scoped.material_code=b.material_code WHERE b.month_date=(SELECT REPLACE(MAX(s.the_date),'-','') FROM agents_scm_stock_detail_d s WHERE s.the_date<=:today) AND b.warehouse_classify='03' AND (:base IS NULL OR b.belong_base=:base) AND ((:region IS NULL AND :province IS NULL AND :sales_group IS NULL) OR scoped.material_code IS NOT NULL) GROUP BY b.belong_base,b.material_code`,
  },

  'stock.age': {
    keys: ['base', 'sku', 'batch_date', 'production_date'],
    columns: [
      'base',
      'sku',
      'batch_date',
      'production_date',
      'quantity',
      'batch_rows',
      'known_quantities',
      'minimum_quantity',
    ],
    sql: `SELECT b.belong_base AS base,b.material_code AS sku,b.month_date AS batch_date,CASE WHEN b.live_qty=0 THEN NULL ELSE b.prod_date END AS production_date,SUM(b.live_qty) AS quantity,COUNT(*) AS batch_rows,COUNT(b.live_qty) AS known_quantities,MIN(b.live_qty) AS minimum_quantity FROM agents_scm_inventory_sku_data_d b LEFT JOIN (SELECT DISTINCT e.belong_base,e.material_code FROM agents_scm_execute_detail_hourly_d e WHERE ${ordersScope}) scoped ON scoped.belong_base=b.belong_base AND scoped.material_code=b.material_code WHERE b.month_date=(SELECT REPLACE(MAX(s.the_date),'-','') FROM agents_scm_stock_detail_d s WHERE s.the_date<=:today) AND b.warehouse_classify='01' AND (:base IS NULL OR b.belong_base=:base) AND ((:region IS NULL AND :province IS NULL AND :sales_group IS NULL) OR scoped.material_code IS NOT NULL) GROUP BY b.belong_base,b.material_code,b.month_date,CASE WHEN b.live_qty=0 THEN NULL ELSE b.prod_date END`,
  },

  'stock.sku': {
    keys: ['base', 'sku'],
    columns: [
      'base',
      'sku',
      'material_name',
      'item',
      'series',
      'stock_date',
      'source_rows',
      'stock_qty',
      'available_qty',
      'over60_source_qty',
      'unopened_qty',
      'allocated_qty',
      'main_plan_initial',
      'bp_plan_initial',
      'main_plan_adjusted',
      'bp_plan_adjusted',
      'transfer_plan_initial',
      'transfer_plan_adjusted',
      'sales_shipped',
      'transfer_shipped',
      'month_days',
    ],
    sql: `SELECT s.belong_base AS base,s.material_code AS sku,MAX(s.material_name) AS material_name,CASE WHEN COUNT(*)=1 THEN MAX(s.product_item) END AS item,CASE WHEN COUNT(*)=1 THEN MAX(s.series) END AS series,MAX(s.the_date) AS stock_date,COUNT(*) AS source_rows,CASE WHEN COUNT(*)=1 THEN MAX(s.current_stock) END AS stock_qty,CASE WHEN COUNT(*)=1 THEN MAX(s.available_stock) END AS available_qty,CASE WHEN COUNT(*)=1 THEN MAX(s.current_stock_60) END AS over60_source_qty,CASE WHEN COUNT(*)=1 THEN MAX(s.ordered_qty) END AS unopened_qty,CASE WHEN COUNT(*)=1 THEN MAX(s.allocated_qty) END AS allocated_qty,CASE WHEN COUNT(*)=1 THEN MAX(s.main_sales_plan_v1) END AS main_plan_initial,CASE WHEN COUNT(*)=1 THEN MAX(s.bp_sales_plan_v1) END AS bp_plan_initial,CASE WHEN COUNT(*)=1 THEN MAX(s.main_sales_plan_adj) END AS main_plan_adjusted,CASE WHEN COUNT(*)=1 THEN MAX(s.bp_sales_plan_adj) END AS bp_plan_adjusted,CASE WHEN COUNT(*)=1 THEN MAX(s.transfer_out_plan_v1) END AS transfer_plan_initial,CASE WHEN COUNT(*)=1 THEN MAX(s.transfer_out_plan_adj) END AS transfer_plan_adjusted,CASE WHEN COUNT(*)=1 THEN MAX(s.total_sales_qty) END AS sales_shipped,CASE WHEN COUNT(*)=1 THEN MAX(s.transfer_out_qty) END AS transfer_shipped,CASE WHEN COUNT(*)=1 THEN MAX(s.day_count_of_month) END AS month_days FROM agents_scm_stock_detail_d s LEFT JOIN (SELECT DISTINCT e.belong_base,e.material_code FROM agents_scm_execute_detail_hourly_d e WHERE ${ordersScope}) scoped ON scoped.belong_base=s.belong_base AND scoped.material_code=s.material_code WHERE ${stockWhere} GROUP BY s.belong_base,s.material_code`,
  },
  'orders.facts': {
    keys: ['executeorderno', 'executeorderlineno'],
    columns: [
      'executeorderno',
      'executeorderlineno',
      'cust_order_no',
      'cust_code',
      'material_code',
      'source_material_code',
      'fromorderno',
      'fromorderlineno',
      'belong_base',
      'header_addtime',
      'cust_name',
      'cust_type',
      'plant_flag',
      'product_item',
      'material_name',
      'region_name',
      'province_region_name',
      'sales_group_name',
      'pickup_point_name',
      'warehouseid',
      'warehouse_name',
      'prapare_order_status',
      'detailstatus',
      'is_stat',
      'needbillingdate',
      'lastbillingdate',
      'order_qty',
      'adjust_order_qty',
      'qtyallocated',
      'qtyshipped',
      'pack_unitqty',
      'packingunitmain',
      'packingunitconvertrate',
      'delivery_qty',
      'order_qty_origin',
      'sales_person',
      'order_person',
      'logistics_provider',
      'latestarrivaldate',
      'latestsendcardate',
      'requireddeliverytime',
      'director',
      'timeout_code',
      'timeout_name',
    ],
    sql: `SELECT e.executeorderno,e.executeorderlineno,e.cust_order_no,e.cust_code,e.material_code,e.source_material_code,e.fromorderno,e.fromorderlineno,e.belong_base,e.header_addtime,e.cust_name,e.cust_type,e.plant_flag,e.product_item,e.material_name,e.region_name,e.province_region_name,e.sales_group_name,e.pickup_point_name,e.warehouseid,e.warehouse_name,e.prapare_order_status,e.detailstatus,e.is_stat,e.needbillingdate,e.lastbillingdate,e.order_qty,e.adjust_order_qty,e.qtyallocated,e.qtyshipped,e.pack_unitqty,e.packingunitmain,e.packingunitconvertrate,e.delivery_qty,e.order_qty_origin,e.sales_person,e.order_person,e.logistics_provider,e.latestarrivaldate,e.latestsendcardate,e.requireddeliverytime,e.director,e.timeout_code,e.timeout_name FROM agents_scm_execute_detail_hourly_d e WHERE ${ordersScope} AND e.prapare_order_status IN ('备单中','已开未派','已派未到','装车中')`,
  },

  'plan.base': {
    keys: ['base'],
    columns: ['base', ...planColumns],
    sql: plan([['belong_name', 'base']]),
  },
  'plan.region': {
    keys: ['region', 'province', 'sales_group'],
    columns: ['region', 'province', 'sales_group', ...planColumns],
    sql: plan([
      ['region_name', 'region'],
      ['province_region_name', 'province'],
      ['sales_group_name', 'sales_group'],
    ]),
  },
  'plan.item': {
    keys: ['item', 'material_group'],
    columns: ['item', 'material_group', ...planColumns],
    sql: `SELECT ${planItem} AS item,p.material_group_name AS material_group,${planMeasures} FROM agents_scm_demand_sales_f p LEFT JOIN (${productDictionary}) dictionary ON dictionary.material_code=p.material_code WHERE ${planWhere} GROUP BY ${planItem},p.material_group_name`,
  },
  'plan.sku': {
    paged: true,
    keys: ['base', 'sku'],
    columns: ['base', 'sku', 'material_name', ...planColumns],
    sql: `SELECT p.belong_name AS base,p.material_code AS sku,MAX(p.material_name) AS material_name,${planMeasures} FROM agents_scm_demand_sales_f p WHERE ${planWhere} GROUP BY p.belong_name,p.material_code`,
  },
  'orders.stage': {
    keys: ['base', 'stage'],
    columns: ['base', 'stage', 'orders', 'latest_load'],
    sql: `SELECT o.base,o.stage,COUNT(*) AS orders,MAX(o.latest_load) AS latest_load FROM (${orderGroups}) o GROUP BY o.base,o.stage`,
  },
  'orders.age': {
    keys: ['created_at', 'need_billing_at'],
    columns: ['created_at', 'need_billing_at', 'orders', 'latest_load'],
    sql: `SELECT o.created_at,o.need_billing_at,COUNT(*) AS orders,MAX(o.latest_load) AS latest_load FROM (${orderGroups}) o WHERE o.stage='备单中' GROUP BY o.created_at,o.need_billing_at`,
  },
  'orders.pending': {
    paged: true,
    keys: ['cust_order_no'],
    columns: ['cust_order_no', 'base', 'stage', 'created_at', 'need_billing_at', 'latest_load'],
    sql: `SELECT o.cust_order_no,o.base,o.stage,o.created_at,o.need_billing_at,o.latest_load FROM (${orderGroups}) o WHERE o.stage='备单中'`,
  },
  'warehouse.stage': {
    keys: ['base', 'warehouse', 'pickup', 'stage'],
    columns: ['base', 'warehouse', 'pickup', 'stage', 'orders', 'latest_load'],
    sql: `SELECT e.belong_base AS base,e.warehouse_name AS warehouse,e.pickup_point_name AS pickup,e.prapare_order_status AS stage,COUNT(DISTINCT e.cust_order_no) AS orders,MAX(e.load_time) AS latest_load FROM agents_scm_execute_detail_hourly_d e WHERE ${ordersScope} AND e.prapare_order_status IN ('已开未派','已派未到','装车中','备单完毕','提货中') GROUP BY e.belong_base,e.warehouse_name,e.pickup_point_name,e.prapare_order_status`,
  },
  'shortage.sku': {
    keys: ['base', 'sku', 'item', 'material_name'],
    columns: [
      'base',
      'sku',
      'item',
      'material_name',
      'execution_sku_groups',
      'covered_groups',
      'inventory_coverage',
      'inventory_gap',
      'inventory_orders',
      'final_gap',
      'duplicate_groups',
    ],
    sql: `SELECT r.base,r.sku,r.item,r.material_name,COUNT(*) AS execution_sku_groups,COUNT(r.final_gap) AS covered_groups,COUNT(r.inventory_gap) AS inventory_coverage,${knownSum('r.inventory_gap')} AS inventory_gap,${knownSum('r.final_gap')} AS final_gap,CASE WHEN COUNT(r.customer_order)=COUNT(*) AND COUNT(r.inventory_gap)=COUNT(*) THEN COUNT(DISTINCT CASE WHEN r.inventory_gap>0 THEN r.customer_order END) END AS inventory_orders,SUM(CASE WHEN r.match_rows>1 THEN 1 ELSE 0 END) AS duplicate_groups FROM (${shortRows}) r GROUP BY r.base,r.sku,r.item,r.material_name`,
  },
  'stock.item': {
    keys: ['base', 'item'],
    columns: [
      'base',
      'item',
      'stock_date',
      'source_rows',
      'current_stock',
      'available_stock',
      'pending_order_qty',
      'production_plan',
      'production_in',
      'duplicate_skus',
    ],
    sql: `SELECT r.base,r.item,MAX(r.stock_date) AS stock_date,SUM(r.source_rows) AS source_rows,${Object.keys(
      stockFields,
    )
      .map((field) => `${knownSum('r.' + field)} AS ${field}`)
      .join(
        ',',
      )},SUM(CASE WHEN r.source_rows>1 THEN 1 ELSE 0 END) AS duplicate_skus FROM (${stockRows}) r GROUP BY r.base,r.item`,
  },
  'production.future': {
    keys: ['factory', 'factory_code', 'sku', 'day', 'unit', 'source'],
    columns: [
      'factory',
      'factory_code',
      'sku',
      'material_name',
      'day',
      'unit',
      'source',
      'planned_qty',
      'delivered_qty',
      'latest_load',
    ],
    sql: `SELECT p.factory_name AS factory,p.factory_code,p.material_code AS sku,MAX(p.material_name) AS material_name,p.base_finish_day AS day,p.measure_unit AS unit,p.data_source AS source,${knownSum('p.order_qty')} AS planned_qty,${knownSum('p.deliv_qty')} AS delivered_qty,MAX(p.load_time) AS latest_load FROM agents_prod_schedule_detail_d p INNER JOIN (SELECT DISTINCT CASE e.belong_base WHEN '郑州' THEN '3001' WHEN '遂平' THEN '9001' WHEN '华东' THEN '6001' WHEN '华南' THEN '7001' WHEN '西南' THEN '8001' WHEN '濮阳' THEN 'S101' END AS factory_code,e.material_code FROM agents_scm_execute_detail_hourly_d e WHERE ${ordersScope}) scoped ON scoped.factory_code=p.factory_code AND scoped.material_code=p.material_code WHERE p.base_finish_day>=REPLACE(:today,'-','') AND p.base_finish_day<REPLACE(:plan_end,'-','') AND p.data_source='工厂' GROUP BY p.factory_name,p.factory_code,p.material_code,p.base_finish_day,p.measure_unit,p.data_source`,
  },
};

function definition(sql, columns, pagination) {
  const parameterSpec = {};
  const bindings = new Map();
  const bound = sql.replace(/:([a-z_]+)/g, (_match, name) => {
    if (!specs[name]) throw Error('UNKNOWN_OPERATIONS_PARAMETER');
    if (!bindings.has(name)) {
      const key = 'gea_p' + (bindings.size + 1);
      bindings.set(name, key);
      parameterSpec[key] = { name, required: true, nullable: false, ...specs[name] };
    }
    return ':' + bindings.get(name);
  });
  return {
    title: '交付运营受控数据',
    parameterSpec,
    request: { sql: bound, parameters: {}, includeTotal: false },
    resultColumns: columns,
    ...(pagination ? { pagination } : {}),
  };
}

export function addOperationsQueries(config) {
  const result = structuredClone(config);
  for (const [name, dataset] of Object.entries(operationsDatasets)) {
    const id = 'operations.' + name;
    result.queries[id] = definition(
      `${dataset.sql} ORDER BY ${dataset.keys.join(',')} LIMIT :page_size OFFSET :offset`,
      dataset.columns,
      { countQuery: id + '.count' },
    );
    result.queries[id + '.count'] = definition(
      `SELECT COUNT(*) AS total FROM (${dataset.sql}) counted`,
      ['total'],
    );
    if (operationsPacketDatasets.has(name))
      result.queries[id + '.packets'] = definition(
        rowPacketSql(dataset.sql, dataset.columns, dataset.keys, operationsPacketSize),
        operationsPacketColumns,
      );
  }
  return result;
}
