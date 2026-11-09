import { ontimeWarehousesSql } from './ontime-queries.mjs';

// User confirmed on 2026-11-09: movement pickup_point is the published
// warehouse-master 归属工厂提货点 projection, not 自身提货点. Reduce the
// warehouse mapping before joining; missing/conflicting assignments stay unknown.
export const cancellationWarehousesSql = ontimeWarehousesSql;

// Recover '*' only from the actual latest trace version. Retain all observations
// at that version: partial/multiple warehouses or header identities cannot be
// resolved by choosing MAX, nor by falling back to an older non-null version.
// Apply this recovery only to positive known quantities; quantity-missing rows
// remain pending under the separate quantity contract.
export const cancellationWarehouseRecoverySql = `SELECT t.executeorderno,t.cust_code,
  MAX(NULLIF(TRIM(t.fromorderno),'')) AS fromorderno,
  MAX(NULLIF(TRIM(t.receive_wh),'')) AS receive_wh,
  MAX(NULLIF(TRIM(t.deliver_wh),'')) AS deliver_wh
  FROM agents_scm_order_trace_final_di t INNER JOIN
    (SELECT executeorderno,cust_code,MAX(update_time) AS updated
      FROM agents_scm_order_trace_final_di GROUP BY executeorderno,cust_code) latest
    ON latest.executeorderno=t.executeorderno AND latest.cust_code=t.cust_code AND latest.updated=t.update_time
  GROUP BY t.executeorderno,t.cust_code
  HAVING COUNT(NULLIF(TRIM(t.fromorderno),''))=COUNT(*)
    AND COUNT(DISTINCT NULLIF(TRIM(t.fromorderno),''))=1
    AND COUNT(NULLIF(TRIM(t.receive_wh),''))=COUNT(*)
    AND COUNT(DISTINCT NULLIF(TRIM(t.receive_wh),''))=1
    AND COUNT(NULLIF(TRIM(t.deliver_wh),''))=COUNT(*)
    AND COUNT(DISTINCT NULLIF(TRIM(t.deliver_wh),''))=1
    AND MAX(NULLIF(TRIM(t.deliver_wh),''))<>'*'`;

// Cancellation quantities belong to actual execution lines, never one unit per order.
const fields = [
  'cust_code',
  'cust_order_no',
  'executeorderno',
  'executeorderlineno',
  'material_code',
  'belong_base',
  'region_name',
  'province_region_name',
  'cust_name',
  'header_addtime',
  'requireddeliverytime',
  'orderstatus',
  'dms_last_update_qty',
  'need_qty_origin',
  'createsource',
  'is_virtual',
  'timeout_code',
  'warehouseid',
  'receive_wh',
  'pickup_point',
  'warehouse_classify',
];
const project = (alias) => fields.map((field) => `${alias}.${field}`).join(',');
const quantityFields = ['dms_last_update_qty', 'need_qty_origin'];
const lineKeys = [
  'cust_code',
  'cust_order_no',
  'executeorderno',
  'executeorderlineno',
  'material_code',
  'belong_base',
];
const sameQuantityLine = lineKeys
  .map(
    (key) =>
      `(CASE WHEN h.${key} IS NULL THEN 'N' ELSE CONCAT('V',h.${key}) END)=(CASE WHEN dq.${key} IS NULL THEN 'N' ELSE CONCAT('V',dq.${key}) END)`,
  )
  .join(' AND ');
const sameHeader = ['cust_code', 'cust_order_no', 'executeorderno', 'belong_base']
  .map(
    (key) =>
      `(CASE WHEN h.${key} IS NULL THEN 'N' ELSE CONCAT('V',h.${key}) END)=(CASE WHEN d.${key} IS NULL THEN 'N' ELSE CONCAT('V',d.${key}) END)`,
  )
  .join(' AND ');

export function cancellationEventsSql({ dailySource, dailyOnly, periods = false }) {
  // Preserve hourly SKU membership and every known hourly quantity, including 0.
  // Only when both hourly quantities are NULL, recover the unique non-null
  // daily effective quantity at the exact line identity; never add daily SKUs.
  const missingHourlyQuantity = quantityFields.map((field) => `h.${field} IS NULL`).join(' AND ');
  const dailyQuantities = `SELECT ${lineKeys.join(',')},
    CASE WHEN COUNT(COALESCE(dms_last_update_qty,need_qty_origin))=COUNT(*)
      AND COUNT(DISTINCT COALESCE(dms_last_update_qty,need_qty_origin))=1
      THEN MAX(COALESCE(dms_last_update_qty,need_qty_origin)) END AS recovered_qty
    FROM agents_scm_execute_detail_d WHERE (:gea_p900='' OR belong_base=:gea_p900)
    GROUP BY ${lineKeys.join(',')}`;
  const source = `SELECT ${project('h')},dq.recovered_qty AS daily_recovered_qty,COALESCE(h.canceltime,d.canceltime) AS cancelled
    FROM agents_scm_execute_detail_hourly_d h LEFT JOIN (
      SELECT cust_code,cust_order_no,executeorderno,belong_base,
        CASE WHEN COUNT(DISTINCT canceltime)=1 THEN MAX(canceltime) END AS canceltime
      FROM agents_scm_execute_detail_d WHERE (:gea_p900='' OR belong_base=:gea_p900)
      GROUP BY cust_code,cust_order_no,executeorderno,belong_base
    ) d ON ${sameHeader}
    LEFT JOIN (${dailyQuantities}) dq ON ${sameQuantityLine} AND (${missingHourlyQuantity})
    WHERE (:gea_p900='' OR h.belong_base=:gea_p900)
    UNION ALL SELECT ${project('d')},NULL AS daily_recovered_qty,d.canceltime AS cancelled FROM ${dailySource}
    WHERE (:gea_p900='' OR d.belong_base=:gea_p900) AND ${dailyOnly}`;
  // Identical observations may be repeated by the snapshot. Conflicting values
  // on one execution line remain unknown rather than choosing a quantity.
  const details = `SELECT ${fields.map((field) => (lineKeys.includes(field) ? field : `MAX(${field}) AS ${field}`)).join(',')},
    MAX(daily_recovered_qty) AS daily_recovered_qty,MAX(cancelled) AS cancelled,COUNT(*) AS source_rows,
    MIN(CASE WHEN orderstatus=90 THEN cancelled ELSE header_addtime END) AS first_business_time,
    MAX(CASE WHEN orderstatus=90 THEN cancelled ELSE header_addtime END) AS last_business_time
    FROM (SELECT DISTINCT ${fields.join(',')},daily_recovered_qty,cancelled FROM (${source}) source_observations) distinct_lines
    GROUP BY ${lineKeys.join(',')}`;
  // User-authorized missing-warehouse fallback: compare the order pickup point
  // with the receiving warehouse's factory pickup. Keep actual/verified trace
  // warehouses authoritative. Daily source publishes class names, hourly codes.
  const missingWarehouse =
    "NULLIF(NULLIF(TRIM(s.warehouseid),''),'*') IS NULL AND t.deliver_wh IS NULL";
  const sourceClass = `CASE
    WHEN TRIM(s.warehouse_classify) IN ('01','工厂成品仓') THEN '01'
    WHEN TRIM(s.warehouse_classify) IN ('02','工厂外租库','工厂外租仓') THEN '02'
    WHEN TRIM(s.warehouse_classify) IN ('03','20','21','OEM成品仓','分仓成品仓','电商仓','工厂中转仓') THEN 'other'
    ELSE NULL END`;
  const senderClass = `CASE WHEN ${missingWarehouse} THEN (${sourceClass}) ELSE f.warehouse_classify END`;
  const senderPickup = `CASE WHEN ${missingWarehouse}
    THEN NULLIF(NULLIF(TRIM(s.pickup_point),''),'*') ELSE f.pickup_point END`;
  const quantities = `SELECT ${fields.map((field) => 's.' + field).join(',')},s.cancelled,s.source_rows,
    s.first_business_time,s.last_business_time,
    COALESCE(s.dms_last_update_qty,s.need_qty_origin,s.daily_recovered_qty) AS effective_qty,
    CASE WHEN s.orderstatus=90 THEN s.cancelled ELSE s.header_addtime END AS business_time,
    CASE WHEN s.requireddeliverytime<=s.header_addtime + INTERVAL '7' DAY
      THEN s.header_addtime + INTERVAL '12' HOUR
      ELSE s.requireddeliverytime - INTERVAL '7' DAY END AS locked,
    CASE WHEN NULLIF(TRIM(s.receive_wh),'') IS NULL THEN 0
      WHEN (${senderClass}) NOT IN ('01','02') OR r.warehouse_classify NOT IN ('01','02') THEN 0
      WHEN (${senderPickup}) IS NOT NULL AND r.pickup_point IS NOT NULL AND (${senderPickup})<>r.pickup_point THEN 0
      WHEN (${senderClass}) IN ('01','02') AND r.warehouse_classify IN ('01','02')
        AND (${senderPickup}) IS NOT NULL AND r.pickup_point IS NOT NULL
        THEN CASE WHEN (${senderPickup})=r.pickup_point THEN 1 ELSE 0 END
      ELSE NULL END AS short_transfer
    FROM (${details}) s LEFT JOIN (${cancellationWarehouseRecoverySql}) t
      ON s.source_rows=1 AND TRIM(s.warehouseid)='*' AND t.cust_code=s.cust_code
      AND COALESCE(s.dms_last_update_qty,s.need_qty_origin,s.daily_recovered_qty)>0
      AND t.executeorderno=s.executeorderno AND t.fromorderno=s.cust_order_no AND t.receive_wh=s.receive_wh
    LEFT JOIN (${cancellationWarehousesSql}) f ON f.warehouseid=COALESCE(t.deliver_wh,s.warehouseid)
      LEFT JOIN (${cancellationWarehousesSql}) r ON r.warehouseid=s.receive_wh`;
  const inPeriod = (start, end) => `(q.business_time>=${start} AND q.business_time<${end})
    OR (q.source_rows>1 AND q.first_business_time<${end} AND q.last_business_time>=${start})
    OR (q.business_time IS NULL AND (q.header_addtime<${end} OR q.header_addtime IS NULL))`;
  const cohort = `SELECT ${periods ? 'rw.period_index,' : ''}q.cust_code,q.cust_order_no,q.executeorderno,
    q.executeorderlineno,q.material_code,q.cust_name AS name,q.region_name AS region,q.province_region_name AS province,
    q.header_addtime AS created,q.requireddeliverytime AS delivery,q.orderstatus AS status,
    q.cancelled,q.business_time,q.locked,q.effective_qty,q.source_rows,q.short_transfer
    FROM (${quantities}) q ${periods ? `INNER JOIN report_windows rw ON rw.enabled=TRUE AND (${inPeriod('rw.start_date', 'rw.end_date')})` : ''}
    WHERE ${periods ? '1=1' : '(' + inPeriod(':gea_p1', ':gea_p2') + ')'}
      AND (q.source_rows<>1 OR TRIM(q.createsource)='20')
      AND (q.source_rows<>1 OR q.is_virtual IS NULL OR q.is_virtual NOT IN (1,2))
      AND (q.source_rows<>1 OR q.timeout_code IS NULL OR TRIM(q.timeout_code) NOT IN ('14','16'))
      AND (q.source_rows<>1 OR q.short_transfer IS NULL OR q.short_transfer=0)
      AND (q.source_rows<>1 OR q.orderstatus IS NULL OR q.orderstatus<>90 OR q.cancelled IS NULL
        OR q.header_addtime IS NULL OR q.cancelled<q.header_addtime
        OR q.cancelled>q.header_addtime + INTERVAL '12' HOUR)`;
  const classified = `SELECT ${periods ? 'period_index,' : ''}cust_code,cust_order_no,executeorderno,executeorderlineno,
    material_code,name,region,province,effective_qty,
    CASE WHEN status=90 AND cancelled>=locked AND cancelled>created + INTERVAL '12' HOUR
      THEN effective_qty ELSE 0 END AS cancel_numerator,
    CASE WHEN source_rows<>1 OR NULLIF(TRIM(cust_code),'') IS NULL
      OR NULLIF(TRIM(cust_order_no),'') IS NULL OR NULLIF(TRIM(executeorderno),'') IS NULL
      OR executeorderlineno IS NULL OR NULLIF(TRIM(material_code),'') IS NULL
      OR created IS NULL OR status IS NULL OR effective_qty IS NULL OR effective_qty<0
      OR (effective_qty<>0 AND short_transfer IS NULL)
      OR (status=90 AND (cancelled IS NULL OR cancelled<created OR delivery IS NULL))
      THEN 1 ELSE 0 END AS invalid_cancel
    FROM (${cohort}) cancellation_cohort`;
  return `SELECT ${periods ? 'period_index,' : ''}cust_code,cust_order_no,executeorderno,executeorderlineno,
    material_code,name,region,province,cancel_numerator,effective_qty AS cancel_denominator,invalid_cancel
    FROM (${classified}) classified_cancellations`;
}

export function aggregateCancellationSql(events, { periods = false, sourceName = false } = {}) {
  return `SELECT ${periods ? 'period_index,' : ''}'1' AS kind,region,province,
    CASE WHEN SUM(invalid_cancel)=0 THEN SUM(cancel_numerator) END AS numerator,
    CASE WHEN SUM(invalid_cancel)=0 THEN SUM(cancel_denominator) END AS denominator,
    SUM(CASE WHEN invalid_cancel=0 THEN cancel_numerator ELSE 0 END) AS sample_numerator,
    SUM(CASE WHEN invalid_cancel=0 THEN cancel_denominator ELSE 0 END) AS sample_denominator,
    SUM(CASE WHEN invalid_cancel=0 THEN 1 ELSE 0 END) AS sample_records,
    SUM(CASE WHEN invalid_cancel>0 THEN cancel_denominator ELSE 0 END) AS unknown_quantity,
    COUNT(*) AS records,SUM(invalid_cancel) AS invalid
    FROM ${sourceName ? events : '(' + events + ')'} cancellation_events
    GROUP BY ${periods ? 'period_index,' : ''}region,province`;
}
