import { createOntimeQueries } from './ontime-queries.mjs';
export { ontimeTraceHeadersSql } from './ontime-queries.mjs';
import { skuAmendmentEventsSql, aggregateAmendmentSql } from './sku-amendments.mjs';
import { cancellationEventsSql, aggregateCancellationSql } from './sku-cancellations.mjs';

const sameExecution = ['cust_code', 'cust_order_no', 'executeorderno', 'belong_base']
  .map(
    (key) =>
      `(CASE WHEN seen.${key} IS NULL THEN 'N' ELSE CONCAT('V',seen.${key}) END)=(CASE WHEN d.${key} IS NULL THEN 'N' ELSE CONCAT('V',d.${key}) END)`,
  )
  .join(' AND ');

const dailySource = `agents_scm_execute_detail_d d LEFT JOIN
  (SELECT DISTINCT cust_code,cust_order_no,executeorderno,belong_base,1 AS header_present
   FROM agents_scm_execute_detail_hourly_d) seen ON ${sameExecution}`;
const dailyOnly = 'seen.header_present IS NULL';

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
  FROM ${dailySource}
  WHERE (:gea_p900='' OR d.belong_base=:gea_p900) AND ${dailyOnly}`;

export const cancellationEvents = cancellationEventsSql({
  dailySource,
  dailyOnly,
});

export const amendmentEventsSql = skuAmendmentEventsSql({});

export const amendmentCohortSql = skuAmendmentEventsSql({
  stage: 'cohort',
});
export const amendmentClassifiedSql = skuAmendmentEventsSql({
  stage: 'classified',
});

export const cancellationChangesSql = aggregateCancellationSql(cancellationEvents);
export const amendmentChangesSql = aggregateAmendmentSql(amendmentEventsSql);
export const changesSql = cancellationChangesSql + ' UNION ALL ' + amendmentChangesSql;
export const baseCancellationChangesSql = aggregateCancellationSql(cancellationEvents, { base: true });
export const baseAmendmentChangesSql = aggregateAmendmentSql(amendmentEventsSql, false, false, true);
export const baseChangesSql = baseCancellationChangesSql + ' UNION ALL ' + baseAmendmentChangesSql;
export const customersSql = aggregateAmendmentSql(amendmentEventsSql, true);

export function periodChangesSql(kind, { base = false } = {}) {
  const periodCancellations = cancellationEventsSql({
    dailySource,
    dailyOnly,
    periods: true,
  });
  const cancellation = aggregateCancellationSql('period_cancel_events', {
    periods: true,
    sourceName: true,
    base,
  });
  const amendment = aggregateAmendmentSql(skuAmendmentEventsSql({ periods: true }), false, true, base);
  return {
    ctes: kind === '2' ? '' : `period_cancel_events AS (${periodCancellations})`,
    sql:
      kind === '1'
        ? cancellation
        : kind === '2'
          ? amendment
          : cancellation + ' UNION ALL ' + amendment,
  };
}

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
    d.belong_base,d.detailstatus,d.is_stat,d.product_item FROM ${dailySource}
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
  MAX(new_material_name) AS name,SUM(need_qty_origin) AS demand,SUM(qtyshipped) AS sent,
  MAX(final_period) AS period_start,MAX(final_period) AS period_end,
  CASE WHEN COUNT(need_qty_origin)=COUNT(*) AND COUNT(qtyshipped)=COUNT(*)
    AND COUNT(fromorderno_month)=COUNT(*) AND MIN(need_qty_origin)>=0 AND MIN(qtyshipped)>=0
    AND NULLIF(TRIM(fromorderno),'') IS NOT NULL AND NULLIF(TRIM(cust_code),'') IS NOT NULL
    AND NULLIF(TRIM(new_material_code),'') IS NOT NULL THEN 0 ELSE 1 END AS invalid
  FROM (SELECT DISTINCT fromorderno,cust_code,new_material_code,belong_base,product_categ_name,pinxiang,
    new_material_name,need_qty_origin,qtyshipped,executeorderno,fromorderno_month,final_period
    FROM (SELECT m.*,MAX(fromorderno_month) OVER (PARTITION BY fromorderno,cust_code) AS final_period,
        MAX(fromorderno_month) OVER (PARTITION BY fromorderno,cust_code,new_material_code) AS product_period
      FROM agents_order_execute_isontime_mi m
      WHERE exp_flag='否' AND (order_qty_origin>0 OR need_qty_origin>0)
        AND pickup_point_kpi IN ('郑州','华东','西南','华南','遂平')) observations
    WHERE (fromorderno_month=product_period OR fromorderno_month IS NULL)
      AND (:gea_p900='' OR belong_base=:gea_p900)) cleaned
  GROUP BY fromorderno,cust_code,new_material_code`;

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

export const ordersSql = `SELECT m.base,m.category,m.item,m.sku,MAX(m.name) AS name,
  SUM(m.demand) AS demand,
  SUM(GREATEST(m.demand-LEAST(m.sent,m.demand),0)) AS shortage,
  SUM(CASE WHEN m.invalid=0 THEN m.demand ELSE 0 END) AS sample_demand,
  SUM(CASE WHEN m.invalid=0 THEN GREATEST(m.demand-LEAST(m.sent,m.demand),0) ELSE 0 END) AS sample_shortage,
  SUM(CASE WHEN m.invalid=0 THEN 1 ELSE 0 END) AS sample_records,
  COUNT(*) AS records,SUM(m.invalid) AS invalid,
  0 AS missing_ship_date,0 AS unmatched_order,0 AS missing_trace,0 AS missing_ship_time
  FROM (${mergedProducts}) m
  WHERE m.period_end>=:gea_p1 AND m.period_end<:gea_p2
  GROUP BY m.base,m.category,m.item,m.sku`;

export const ontimeExecutionProductsSql = `SELECT cust_order_no,cust_code,material_code,executeorderno,
  belong_base,detailstatus,
  CASE WHEN COUNT(DISTINCT NULLIF(TRIM(product_item),''))=1 THEN MAX(NULLIF(TRIM(product_item),'')) END AS product_item,
  MAX(CASE WHEN is_virtual IN (1,2) THEN 1 ELSE 0 END) AS virtual_excluded
  FROM (${executionRows
    .replace(
      'belong_base,detailstatus,is_stat,product_item FROM',
      'belong_base,detailstatus,is_stat,product_item,is_virtual FROM',
    )
    .replace(
      'd.belong_base,d.detailstatus,d.is_stat,d.product_item FROM',
      'd.belong_base,d.detailstatus,d.is_stat,d.product_item,d.is_virtual FROM',
    )}) execution_rows
  WHERE (:gea_p900='' OR belong_base=:gea_p900)
  GROUP BY cust_order_no,cust_code,material_code,executeorderno,belong_base,detailstatus`;
export const {
  ontimeSql,
  ontimeSummarySql,
  ontimePeriodSummarySql,
  ontimeAgentSummarySql,
  ontimeAgentDetailsSql,
} = createOntimeQueries(ontimeExecutionProductsSql);
