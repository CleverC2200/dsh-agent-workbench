// A refresh can empty the hourly table, and its retention does not cover history.
// Prefer a whole hourly execution header, including cancelled/excluded rows, so
// the daily snapshot cannot resurrect obsolete SKU membership or order status.
const sameExecution = ['cust_code', 'cust_order_no', 'executeorderno', 'belong_base']
  .map((key) => `h.${key}<=>d.${key}`)
  .join(' AND ');
const dailyOnly = `NOT EXISTS (SELECT 1 FROM agents_scm_execute_detail_hourly_d h WHERE ${sameExecution})`;

// Source order counts must not be inferred from cancel_qty/order_qty.
// Daily and hourly snapshots publish the same OMS event fields. Keep the newer
// hourly value; recover a missing value only from an unambiguous exact header.
export const orderEventRowsSql = `SELECT h.cust_code,h.cust_order_no,h.belong_base,
  h.region_name,h.province_region_name,h.cust_name,h.header_addtime,
  h.requireddeliverytime,h.orderstatus,
  COALESCE(h.canceltime,d.canceltime) AS canceltime,
  COALESCE(h.custchangetime,d.custchangetime) AS custchangetime
  FROM agents_scm_execute_detail_hourly_d h LEFT JOIN (
    SELECT cust_code,cust_order_no,executeorderno,belong_base,
      CASE WHEN COUNT(DISTINCT canceltime)=1 THEN MAX(canceltime) END AS canceltime,
      CASE WHEN COUNT(DISTINCT custchangetime)=1 THEN MAX(custchangetime) END AS custchangetime
    FROM agents_scm_execute_detail_d
    WHERE (:gea_p900='' OR belong_base=:gea_p900)
    GROUP BY cust_code,cust_order_no,executeorderno,belong_base
  ) d ON d.cust_code=h.cust_code AND d.cust_order_no=h.cust_order_no
    AND d.executeorderno=h.executeorderno AND d.belong_base=h.belong_base
  WHERE (:gea_p900='' OR h.belong_base=:gea_p900)
  UNION ALL
  SELECT d.cust_code,d.cust_order_no,d.belong_base,
    d.region_name,d.province_region_name,d.cust_name,d.header_addtime,
    d.requireddeliverytime,d.orderstatus,d.canceltime,d.custchangetime
  FROM agents_scm_execute_detail_d d
  WHERE (:gea_p900='' OR d.belong_base=:gea_p900) AND ${dailyOnly}`;

const orderHeaders = `SELECT cust_code,cust_order_no,
  MAX(region_name) AS region,MAX(province_region_name) AS province,MAX(cust_name) AS name,
  MIN(header_addtime) AS created,MAX(requireddeliverytime) AS delivery,
  CASE WHEN COUNT(header_addtime)=COUNT(*)
    AND COUNT(orderstatus)=COUNT(*)
    AND NULLIF(TRIM(cust_order_no),'') IS NOT NULL AND NULLIF(TRIM(cust_code),'') IS NOT NULL
    THEN 0 ELSE 1 END AS invalid_header,
  CASE WHEN COUNT(DISTINCT requireddeliverytime)=1 AND COUNT(requireddeliverytime)=COUNT(*)
    THEN 0 ELSE 1 END AS invalid_lock,
  CASE WHEN MIN(orderstatus)=90 AND MAX(orderstatus)=90 THEN 90 ELSE MAX(CASE WHEN orderstatus<>90 THEN orderstatus END) END AS status,
  MAX(canceltime) AS cancelled,MAX(custchangetime) AS changed,
  CASE WHEN COUNT(DISTINCT canceltime)>1 THEN 1 ELSE 0 END AS cancel_conflict
  FROM (${orderEventRowsSql}) event_rows
  WHERE (:gea_p900='' OR belong_base=:gea_p900)
  GROUP BY cust_code,cust_order_no`;

const lockedHeaders = `SELECT h.cust_code,h.cust_order_no,h.name,h.region,h.province,h.created,h.delivery,
  h.invalid_header,h.invalid_lock,h.status,h.cancelled,h.changed,h.cancel_conflict,
  CASE WHEN delivery<=created + INTERVAL '7' DAY THEN created + INTERVAL '12' HOUR
    ELSE delivery - INTERVAL '7' DAY END AS locked
  FROM (${orderHeaders}) h
  WHERE h.created>=:gea_p1 AND h.created<:gea_p2`;

const events = `SELECT cust_code,cust_order_no,name,region,province,
  CASE WHEN status=90 AND cancelled<:gea_p2 AND cancelled<created + INTERVAL '12' HOUR THEN 0 ELSE 1 END AS cancel_denominator,
  CASE WHEN status=90 AND cancelled<:gea_p2 AND cancelled>=locked AND cancelled>=created + INTERVAL '12' HOUR THEN 1 ELSE 0 END AS cancel_numerator,
  CASE WHEN status<>90 OR cancelled>=:gea_p2 THEN 1 ELSE 0 END AS change_denominator,
  CASE WHEN (status<>90 OR cancelled>=:gea_p2) AND changed>=locked AND changed<:gea_p2 THEN 1 ELSE 0 END AS change_numerator,
  CASE WHEN invalid_header>0 OR (status=90 AND (cancelled IS NULL OR cancel_conflict>0 OR cancelled<created
    OR (cancelled<:gea_p2 AND invalid_lock>0))) THEN 1 ELSE 0 END AS invalid_cancel,
  CASE WHEN invalid_header>0 OR (status=90 AND cancelled IS NULL)
    OR ((status<>90 OR cancelled>=:gea_p2) AND changed IS NOT NULL
      AND (changed<created OR changed>=:gea_p2 OR invalid_lock>0)) THEN 1 ELSE 0 END AS invalid_change
  FROM (${lockedHeaders}) locked_orders`;

/** The original region/customer tables now receive order counts, not quantities. */
export const changesSql = [
  ['1', 'cancel'],
  ['2', 'change'],
]
  .map(
    ([kind, field]) => `SELECT '${kind}' AS kind,region,province,
  CASE WHEN SUM(invalid_${field})=0 THEN SUM(${field}_numerator) END AS numerator,
  CASE WHEN SUM(invalid_${field})=0 THEN SUM(${field}_denominator) END AS denominator,
  SUM(CASE WHEN invalid_${field}=0 THEN ${field}_numerator ELSE 0 END) AS sample_numerator,
  SUM(CASE WHEN invalid_${field}=0 THEN ${field}_denominator ELSE 0 END) AS sample_denominator,
  SUM(CASE WHEN invalid_${field}=0 THEN 1 ELSE 0 END) AS sample_records,
  COUNT(*) AS records,SUM(invalid_${field}) AS invalid
  FROM (${events}) order_events GROUP BY region,province`,
  )
  .join(' UNION ALL ');

export const customersSql = `SELECT region,province,cust_code AS customer,MAX(name) AS name,
  CASE WHEN SUM(invalid_change)=0 THEN SUM(change_numerator) END AS numerator,
  CASE WHEN SUM(invalid_change)=0 THEN SUM(change_denominator) END AS denominator,
  COUNT(*) AS records,SUM(invalid_change) AS invalid
  FROM (${events}) order_events GROUP BY region,province,cust_code`;

// Collapse the latest header observation before joining any product quantities.
export const traceHeadersSql = `SELECT t.executeorderno,t.cust_code,
  CASE WHEN COUNT(DISTINCT COALESCE(t.lastshipmenttime,t.wms_order_close_time))=1
    AND COUNT(COALESCE(t.lastshipmenttime,t.wms_order_close_time))=COUNT(*)
    THEN MAX(COALESCE(t.lastshipmenttime,t.wms_order_close_time)) END AS shipped,
  CASE WHEN COUNT(DISTINCT COALESCE(t.gpsisinraildate_to,t.arriveconfirm_time))=1
    AND COUNT(COALESCE(t.gpsisinraildate_to,t.arriveconfirm_time))=COUNT(*)
    THEN MAX(COALESCE(t.gpsisinraildate_to,t.arriveconfirm_time)) END AS arrived,
  CASE WHEN COUNT(t.requireddeliverytimebak)=COUNT(*) AND COUNT(t.requireddeliverytime)=COUNT(*)
    AND COUNT(CAST(t.expected_deliv_time AS DATETIME))=COUNT(*)
    AND COUNT(DISTINCT t.requireddeliverytimebak)=1 AND COUNT(DISTINCT t.requireddeliverytime)=1
    AND COUNT(DISTINCT t.expected_deliv_time)=1
    THEN GREATEST(MAX(t.requireddeliverytimebak),MAX(t.requireddeliverytime),MAX(CAST(t.expected_deliv_time AS DATETIME))) + INTERVAL '12' HOUR END AS deadline
  FROM agents_scm_order_trace_final_di t INNER JOIN
    (SELECT executeorderno,cust_code,MAX(update_time) AS updated FROM agents_scm_order_trace_final_di GROUP BY executeorderno,cust_code) latest
    ON latest.executeorderno=t.executeorderno AND latest.cust_code=t.cust_code AND latest.updated=t.update_time
  GROUP BY t.executeorderno,t.cust_code`;

const executionRows = `SELECT cust_order_no,cust_code,material_code,executeorderno,
  belong_base,detailstatus,is_stat,product_item FROM agents_scm_execute_detail_hourly_d
  WHERE (:gea_p900='' OR belong_base=:gea_p900)
  UNION ALL SELECT d.cust_order_no,d.cust_code,d.material_code,d.executeorderno,
    d.belong_base,d.detailstatus,d.is_stat,d.product_item FROM agents_scm_execute_detail_d d
  WHERE (:gea_p900='' OR d.belong_base=:gea_p900) AND ${dailyOnly}`;

export const executionProductsSql = `SELECT cust_order_no,cust_code,material_code,executeorderno,
  belong_base,detailstatus,
  CASE WHEN COUNT(DISTINCT NULLIF(TRIM(product_item),''))=1
    THEN MAX(NULLIF(TRIM(product_item),'')) END AS product_item
  FROM (${executionRows}) execution_rows
  WHERE detailstatus=10 AND is_stat='1' AND (:gea_p900='' OR belong_base=:gea_p900)
  GROUP BY cust_order_no,cust_code,material_code,executeorderno,belong_base,detailstatus`;

const mergedProducts = `SELECT fromorderno,cust_code,new_material_code AS sku,
  MAX(belong_base) AS base,MAX(product_categ_name) AS category,MAX(pinxiang) AS item,
  MAX(new_material_name) AS name,MAX(need_qty_origin) AS demand,MAX(qtyshipped) AS sent,
  MIN(fromorderno_month) AS period_start,MAX(fromorderno_month) AS period_end,
  CASE WHEN COUNT(*)=1 AND COUNT(need_qty_origin)=1 AND COUNT(qtyshipped)=1
    AND COUNT(fromorderno_month)=1 AND MAX(need_qty_origin)>=0 AND MAX(qtyshipped)>=0
    AND NULLIF(TRIM(fromorderno),'') IS NOT NULL AND NULLIF(TRIM(cust_code),'') IS NOT NULL
    AND NULLIF(TRIM(new_material_code),'') IS NOT NULL THEN 0 ELSE 1 END AS invalid
  FROM (SELECT DISTINCT fromorderno,cust_code,new_material_code,belong_base,product_categ_name,pinxiang,
    new_material_name,need_qty_origin,qtyshipped,executeorderno,fromorderno_month
    FROM agents_order_execute_isontime_mi
    WHERE exp_flag='否' AND (order_qty_origin>0 OR need_qty_origin>0)
      AND (:gea_p900='' OR belong_base=:gea_p900)) cleaned
  GROUP BY fromorderno,cust_code,new_material_code`;

// The fulfillment source also declares its exact child executions (comma list).
// Use those only when no unambiguous execution-detail link exists. Never bypass
// a known but incomplete split, or substitute the source's refresh complete_time.
export const fulfillmentExecutionsSql = `SELECT DISTINCT m.fromorderno,m.cust_code,m.new_material_code,
  TRIM(child_execution) AS executeorderno
  FROM agents_order_execute_isontime_mi m
  LATERAL VIEW explode_split(COALESCE(m.executeorderno,''),',') children AS child_execution
  WHERE m.exp_flag='否' AND (m.order_qty_origin>0 OR m.need_qty_origin>0)
    AND (:gea_p900='' OR m.belong_base=:gea_p900)`;

export const fulfillmentShippingSql = `SELECT e.fromorderno,e.cust_code,e.new_material_code,
  CASE WHEN COUNT(t.shipped)=COUNT(*) THEN MAX(t.shipped) END AS shipped,
  SUM(CASE WHEN t.executeorderno IS NULL THEN 1 ELSE 0 END) AS missing_trace
  FROM (${fulfillmentExecutionsSql}) e LEFT JOIN (${traceHeadersSql}) t
    ON t.executeorderno=e.executeorderno AND t.cust_code=e.cust_code
  GROUP BY e.fromorderno,e.cust_code,e.new_material_code`;

// The upstream business period is assigned once per original order, after final
// shipment. Do not reassign each SKU through incomplete downstream trace tables.
export const ordersSql = `SELECT m.base,m.category,m.item,m.sku,MAX(m.name) AS name,
  SUM(m.demand) AS demand,
  SUM(GREATEST(m.demand-LEAST(m.sent,m.demand),0)) AS shortage,
  SUM(CASE WHEN m.invalid=0 THEN m.demand ELSE 0 END) AS sample_demand,
  SUM(CASE WHEN m.invalid=0 THEN GREATEST(m.demand-LEAST(m.sent,m.demand),0) ELSE 0 END) AS sample_shortage,
  SUM(CASE WHEN m.invalid=0 THEN 1 ELSE 0 END) AS sample_records,
  COUNT(*) AS records,SUM(m.invalid) AS invalid,
  0 AS missing_ship_date,0 AS unmatched_order,0 AS missing_trace,0 AS missing_ship_time
  FROM (${mergedProducts}) m
  WHERE m.period_end>=:gea_p1 AND m.period_start<:gea_p2
  GROUP BY m.base,m.category,m.item,m.sku`;

const arrivedOrders = `SELECT h.cust_order_no,h.cust_code,
  CASE WHEN COUNT(t.arrived)=COUNT(*) AND COUNT(t.deadline)=COUNT(*)
    THEN MIN(CASE WHEN t.arrived<=t.deadline THEN 1 ELSE 0 END) END AS ontime,
  MAX(t.arrived) AS arrival_date,
  CASE WHEN COUNT(t.arrived)=COUNT(*) AND COUNT(t.deadline)=COUNT(*)
    THEN 0 ELSE 1 END AS invalid
  FROM (${executionProductsSql}) h LEFT JOIN (${traceHeadersSql}) t
    ON t.executeorderno=h.executeorderno AND t.cust_code=h.cust_code
  GROUP BY h.cust_order_no,h.cust_code
  HAVING MAX(t.arrived)>=:gea_p1 AND MAX(t.arrived)<:gea_p2`;

/** Repeat the whole-order verdict, never count one order once per SKU. */
const memberTuple = ['h.belong_base', 'd.product_categ_name', 'h.product_item', 'h.material_code']
  .map((field) => `LENGTH(COALESCE(${field},'')),':',COALESCE(${field},'')`)
  .join(',');
export const ontimeSql = `SELECT h.cust_order_no AS order_no,h.cust_code AS customer,
  MAX(a.ontime) AS ontime,MAX(a.arrival_date) AS arrival_date,MAX(a.invalid) AS invalid,
  ARRAY_AGG(CONCAT(${memberTuple})) AS members
  FROM (${executionProductsSql}) h INNER JOIN (${arrivedOrders}) a
    ON a.cust_order_no=h.cust_order_no AND a.cust_code=h.cust_code
  LEFT JOIN (SELECT material_code,CASE WHEN COUNT(DISTINCT product_categ_name)=1 THEN MAX(product_categ_name) END AS product_categ_name
    FROM agents_scm_material_in_out_summary_d GROUP BY material_code) d ON d.material_code=h.material_code
  GROUP BY h.cust_order_no,h.cust_code`;
