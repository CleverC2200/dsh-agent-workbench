// Source order counts must not be inferred from cancel_qty/order_qty.
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
  FROM agents_scm_execute_detail_hourly_d
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
const traceHeaders = `SELECT t.executeorderno,t.cust_code,
  CASE WHEN COUNT(DISTINCT t.lastshipmenttime)=1 AND COUNT(t.lastshipmenttime)=COUNT(*) THEN MAX(t.lastshipmenttime) END AS shipped,
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

const executionProducts = `SELECT DISTINCT cust_order_no,cust_code,material_code,executeorderno,
  belong_base,detailstatus FROM agents_scm_execute_detail_hourly_d
  WHERE detailstatus=10 AND is_stat='1' AND (:gea_p900='' OR belong_base=:gea_p900)`;

const shippingDates = `SELECT h.cust_order_no,h.cust_code,h.material_code,
  CASE WHEN COUNT(t.shipped)=COUNT(*) THEN MAX(t.shipped) END AS shipped,
  SUM(CASE WHEN t.executeorderno IS NULL THEN 1 ELSE 0 END) AS missing_trace
  FROM (${executionProducts}) h LEFT JOIN (${traceHeaders}) t
    ON t.executeorderno=h.executeorderno AND t.cust_code=h.cust_code
  GROUP BY h.cust_order_no,h.cust_code,h.material_code`;

// Only the observed customer-prefix separator is formatting, not arbitrary order punctuation.
const sourceKey = (field, customer) => `CASE WHEN ${field} LIKE CONCAT(${customer},'-%')
  AND LENGTH(${field})-LENGTH(REPLACE(${field},'-',''))=1
  THEN REPLACE(${field},'-','') ELSE ${field} END`;
const normalizedShipping = `SELECT ${sourceKey('h.cust_order_no', 'h.cust_code')} AS source_key,
  h.cust_code,h.material_code,COUNT(DISTINCT h.cust_order_no) AS references_count,
  CASE WHEN COUNT(t.shipped)=COUNT(*) THEN MAX(t.shipped) END AS shipped,
  SUM(CASE WHEN t.executeorderno IS NULL THEN 1 ELSE 0 END) AS missing_trace
  FROM (${executionProducts}) h LEFT JOIN (${traceHeaders}) t
    ON t.executeorderno=h.executeorderno AND t.cust_code=h.cust_code
  GROUP BY ${sourceKey('h.cust_order_no', 'h.cust_code')},h.cust_code,h.material_code`;
const sourceReferences = `SELECT ${sourceKey('fromorderno', 'cust_code')} AS source_key,
  cust_code,new_material_code,COUNT(DISTINCT fromorderno) AS references_count
  FROM agents_order_execute_isontime_mi
  WHERE exp_flag='否' AND (order_qty_origin>0 OR need_qty_origin>0)
    AND (:gea_p900='' OR belong_base=:gea_p900)
  GROUP BY ${sourceKey('fromorderno', 'cust_code')},cust_code,new_material_code`;

const mergedProducts = `SELECT fromorderno,cust_code,new_material_code AS sku,
  MAX(belong_base) AS base,MAX(product_categ_name) AS category,MAX(pinxiang) AS item,
  MAX(new_material_name) AS name,MAX(need_qty_origin) AS demand,MAX(qtyshipped) AS sent,
  MIN(fromorderno_month) AS received,
  CASE WHEN COUNT(*)=1 AND COUNT(need_qty_origin)=1 AND COUNT(qtyshipped)=1
    AND MAX(need_qty_origin)>0 AND MAX(qtyshipped)>=0
    AND NULLIF(TRIM(fromorderno),'') IS NOT NULL AND NULLIF(TRIM(cust_code),'') IS NOT NULL
    AND NULLIF(TRIM(new_material_code),'') IS NOT NULL THEN 0 ELSE 1 END AS invalid
  FROM (SELECT DISTINCT fromorderno,cust_code,new_material_code,belong_base,product_categ_name,pinxiang,
    new_material_name,need_qty_origin,qtyshipped,executeorderno,fromorderno_month
    FROM agents_order_execute_isontime_mi
    WHERE exp_flag='否' AND (order_qty_origin>0 OR need_qty_origin>0)
      AND (:gea_p900='' OR belong_base=:gea_p900)) cleaned
  GROUP BY fromorderno,cust_code,new_material_code`;

const matchedProducts = `SELECT m.base,m.category,m.item,m.sku,m.name,m.demand,m.sent,m.received,m.invalid,
  CASE WHEN s.cust_order_no IS NOT NULL THEN s.shipped
    WHEN n.references_count=1 AND r.references_count=1 THEN n.shipped END AS shipped,
  CASE WHEN s.cust_order_no IS NOT NULL THEN 1
    WHEN n.references_count=1 AND r.references_count=1 THEN 1 ELSE 0 END AS order_linked,
  CASE WHEN s.cust_order_no IS NOT NULL THEN s.missing_trace
    WHEN n.references_count=1 AND r.references_count=1 THEN n.missing_trace END AS trace_missing
  FROM (${mergedProducts}) m LEFT JOIN (${shippingDates}) s
    ON s.cust_order_no=m.fromorderno AND s.cust_code=m.cust_code AND s.material_code=m.sku
  LEFT JOIN (${normalizedShipping}) n ON n.source_key=${sourceKey('m.fromorderno', 'm.cust_code')}
    AND n.cust_code=m.cust_code AND n.material_code=m.sku
  LEFT JOIN (${sourceReferences}) r ON r.source_key=${sourceKey('m.fromorderno', 'm.cust_code')}
    AND r.cust_code=m.cust_code AND r.new_material_code=m.sku`;

export const ordersSql = `SELECT m.base,m.category,m.item,m.sku,MAX(m.name) AS name,
  SUM(CASE WHEN m.shipped>=:gea_p1 AND m.shipped<:gea_p2 THEN m.demand END) AS demand,
  SUM(CASE WHEN m.shipped>=:gea_p1 AND m.shipped<:gea_p2 THEN GREATEST(m.demand-LEAST(m.sent,m.demand),0) END) AS shortage,
  SUM(CASE WHEN m.invalid=0 AND m.shipped>=:gea_p1 AND m.shipped<:gea_p2 THEN m.demand ELSE 0 END) AS sample_demand,
  SUM(CASE WHEN m.invalid=0 AND m.shipped>=:gea_p1 AND m.shipped<:gea_p2 THEN GREATEST(m.demand-LEAST(m.sent,m.demand),0) ELSE 0 END) AS sample_shortage,
  SUM(CASE WHEN m.invalid=0 AND m.shipped>=:gea_p1 AND m.shipped<:gea_p2 THEN 1 ELSE 0 END) AS sample_records,
  COUNT(*) AS records,SUM(m.invalid)+SUM(CASE WHEN m.shipped IS NULL THEN 1 ELSE 0 END) AS invalid,
  SUM(CASE WHEN m.shipped IS NULL THEN 1 ELSE 0 END) AS missing_ship_date,
  SUM(CASE WHEN m.shipped IS NULL AND m.order_linked=0 THEN 1 ELSE 0 END) AS unmatched_order,
  SUM(CASE WHEN m.shipped IS NULL AND m.trace_missing>0 THEN 1 ELSE 0 END) AS missing_trace,
  SUM(CASE WHEN m.shipped IS NULL AND m.order_linked=1 AND m.trace_missing=0 THEN 1 ELSE 0 END) AS missing_ship_time
  FROM (${matchedProducts}) m
  WHERE (m.shipped>=:gea_p1 AND m.shipped<:gea_p2)
    OR (m.shipped IS NULL AND (m.sent>0 OR m.sent IS NULL) AND m.received>=:gea_p1 AND m.received<:gea_p2)
  GROUP BY m.base,m.category,m.item,m.sku`;

const arrivedOrders = `SELECT h.cust_order_no,h.cust_code,
  CASE WHEN COUNT(t.arrived)=COUNT(*) AND COUNT(t.deadline)=COUNT(*)
    THEN MIN(CASE WHEN t.arrived<=t.deadline THEN 1 ELSE 0 END) END AS ontime,
  MAX(t.arrived) AS arrival_date,
  CASE WHEN COUNT(t.arrived)=COUNT(*) AND COUNT(t.deadline)=COUNT(*)
    THEN 0 ELSE 1 END AS invalid
  FROM (${executionProducts}) h LEFT JOIN (${traceHeaders}) t
    ON t.executeorderno=h.executeorderno AND t.cust_code=h.cust_code
  GROUP BY h.cust_order_no,h.cust_code
  HAVING MAX(t.arrived)>=:gea_p1 AND MAX(t.arrived)<:gea_p2`;

/** Repeat the whole-order verdict, never count one order once per SKU. */
const memberTuple = [
  'h.belong_base',
  'd.product_categ_name',
  'd.material_group_name',
  'h.material_code',
]
  .map((field) => `LENGTH(COALESCE(${field},'')),':',COALESCE(${field},'')`)
  .join(',');
export const ontimeSql = `SELECT h.cust_order_no AS order_no,h.cust_code AS customer,
  MAX(a.ontime) AS ontime,MAX(a.arrival_date) AS arrival_date,MAX(a.invalid) AS invalid,
  ARRAY_AGG(CONCAT(${memberTuple})) AS members
  FROM (${executionProducts}) h INNER JOIN (${arrivedOrders}) a
    ON a.cust_order_no=h.cust_order_no AND a.cust_code=h.cust_code
  LEFT JOIN (SELECT material_code,CASE WHEN COUNT(DISTINCT product_categ_name)=1 THEN MAX(product_categ_name) END AS product_categ_name,
    CASE WHEN COUNT(DISTINCT material_group_name)=1 THEN MAX(material_group_name) END AS material_group_name
    FROM agents_scm_material_in_out_summary_d GROUP BY material_code) d ON d.material_code=h.material_code
  GROUP BY h.cust_order_no,h.cust_code`;
