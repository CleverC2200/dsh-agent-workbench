import { ontimeWarehousesSql } from './ontime-queries.mjs';

export const cancellationWarehousesSql = ontimeWarehousesSql;

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
  'latestsendcardate',
  'orderstatus',
  'dms_last_update_qty',
  'change_order_qty',
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
export const cancellationSnapshotColumns = [...fields, 'canceltime', 'detailstatus'];
const quantityFields = ['change_order_qty', 'dms_last_update_qty', 'need_qty_origin'];
const lineKeys = [
  'cust_code',
  'cust_order_no',
  'executeorderno',
  'executeorderlineno',
  'material_code',
  'belong_base',
];
const executionLineKeys = lineKeys.filter((field) => field !== 'belong_base');
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
const sameSupplementLine = lineKeys
  .map(
    (key) =>
      `(CASE WHEN d.${key} IS NULL THEN 'N' ELSE CONCAT('V',d.${key}) END)=(CASE WHEN line_seen.${key} IS NULL THEN 'N' ELSE CONCAT('V',line_seen.${key}) END)`,
  )
  .join(' AND ');
export function cancellationEventsSql({
  dailySource,
  dailyOnly,
  periods = false,
  dimensions = false,
}) {
  const dailyQuantities = `SELECT ${lineKeys.join(',')},
    ${quantityFields
      .map(
        (field) => `CASE WHEN COUNT(${field})=COUNT(*) AND COUNT(DISTINCT ${field})=1
      THEN MAX(${field}) END AS ${field},
      CASE WHEN COUNT(${field})>0 AND (COUNT(${field})<>COUNT(*) OR COUNT(DISTINCT ${field})<>1)
      THEN 1 ELSE 0 END AS ${field}_conflict`,
      )
      .join(',')}
    FROM agents_scm_execute_detail_d WHERE (:gea_p900='' OR :gea_p900='郑州' OR belong_base=:gea_p900)
    GROUP BY ${lineKeys.join(',')}`;
  const recoveredFields = fields
    .map((field) =>
      quantityFields.includes(field)
        ? `COALESCE(h.${field},dq.${field}) AS ${field}`
        : field === 'latestsendcardate'
          ? 'COALESCE(h.latestsendcardate,d.latestsendcardate) AS latestsendcardate'
          : field === 'pickup_point'
            ? "CASE WHEN h.pickup_point IS NULL OR TRIM(h.pickup_point) IN ('','*') THEN d.pickup_point ELSE h.pickup_point END AS pickup_point"
            : `h.${field}`,
    )
    .join(',');
  const quantityConflict = `CASE ${quantityFields
    .map(
      (field) =>
        `WHEN h.${field} IS NULL AND dq.${field}_conflict>0 THEN 1
      WHEN COALESCE(h.${field},dq.${field}) IS NOT NULL THEN 0`,
    )
    .join(' ')} ELSE 0 END`;
  const source = `SELECT ${recoveredFields},${quantityConflict} AS quantity_conflict,COALESCE(h.canceltime,d.canceltime) AS cancelled
    FROM agents_scm_execute_detail_hourly_d h
    LEFT JOIN (
      SELECT cust_code,cust_order_no,executeorderno,belong_base,
        CASE WHEN COUNT(DISTINCT canceltime)=1 THEN MAX(canceltime) END AS canceltime,
        CASE WHEN COUNT(DISTINCT latestsendcardate)=1 THEN MAX(latestsendcardate) END AS latestsendcardate,
        CASE WHEN COUNT(DISTINCT NULLIF(TRIM(pickup_point),''))=1
          AND MAX(NULLIF(TRIM(pickup_point),''))<>'*'
          THEN MAX(NULLIF(TRIM(pickup_point),'')) END AS pickup_point
      FROM agents_scm_execute_detail_d WHERE (:gea_p900='' OR :gea_p900='郑州' OR belong_base=:gea_p900)
      GROUP BY cust_code,cust_order_no,executeorderno,belong_base
    ) d ON ${sameHeader}
    LEFT JOIN (${dailyQuantities}) dq ON ${sameQuantityLine}
    WHERE (:gea_p900='' OR :gea_p900='郑州' OR h.belong_base=:gea_p900)
    UNION ALL SELECT ${project('d')},0 AS quantity_conflict,d.canceltime AS cancelled FROM ${dailySource}
    LEFT JOIN agents_scm_execute_detail_hourly_d line_seen ON ${sameSupplementLine}
    WHERE (:gea_p900='' OR :gea_p900='郑州' OR d.belong_base=:gea_p900)
      AND (${dailyOnly} OR (d.detailstatus=10 AND line_seen.executeorderno IS NULL))`;

  const details = `SELECT ${fields.map((field) => (executionLineKeys.includes(field) ? field : `MAX(${field}) AS ${field}`)).join(',')},
    MAX(quantity_conflict) AS quantity_conflict,MAX(cancelled) AS cancelled,COUNT(*) AS source_rows,
    MIN(CASE WHEN orderstatus=90 THEN cancelled ELSE header_addtime END) AS first_business_time,
    MAX(CASE WHEN orderstatus=90 THEN cancelled ELSE header_addtime END) AS last_business_time
    FROM (SELECT DISTINCT ${fields.join(',')},quantity_conflict,cancelled FROM cancellation_source source_observations) distinct_lines
    GROUP BY ${executionLineKeys.join(',')}`;

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
  const effectiveQuantity =
    'CASE WHEN s.quantity_conflict>0 THEN NULL ELSE COALESCE(s.change_order_qty,s.dms_last_update_qty,s.need_qty_origin) END';
  const quantities = `SELECT ${fields.map((field) => 's.' + field).join(',')},s.cancelled,s.source_rows,
    s.first_business_time,s.last_business_time,
    NULLIF(NULLIF(TRIM(s.pickup_point),''),'*') AS scope_pickup_point,
    ${effectiveQuantity} AS effective_qty,
    CASE WHEN s.orderstatus=90 THEN s.cancelled ELSE s.header_addtime END AS business_time,
    s.latestsendcardate - INTERVAL '7' DAY AS locked,
    CASE WHEN NULLIF(TRIM(s.receive_wh),'') IS NULL THEN 0
      WHEN (${senderClass}) NOT IN ('01','02') OR r.warehouse_classify NOT IN ('01','02') THEN 0
      WHEN (${senderPickup}) IS NOT NULL AND r.pickup_point IS NOT NULL AND (${senderPickup})<>r.pickup_point THEN 0
      WHEN (${senderClass}) IN ('01','02') AND r.warehouse_classify IN ('01','02')
        AND (${senderPickup}) IS NOT NULL AND r.pickup_point IS NOT NULL
        THEN CASE WHEN (${senderPickup})=r.pickup_point THEN 1 ELSE 0 END
      ELSE NULL END AS short_transfer
    FROM (${details}) s LEFT JOIN (${cancellationWarehouseRecoverySql}) t
      ON s.source_rows=1 AND TRIM(s.warehouseid)='*' AND t.cust_code=s.cust_code
      AND (${effectiveQuantity})>0
      AND t.executeorderno=s.executeorderno AND t.fromorderno=s.cust_order_no AND t.receive_wh=s.receive_wh
    LEFT JOIN (${cancellationWarehousesSql}) f ON f.warehouseid=COALESCE(t.deliver_wh,s.warehouseid)
      LEFT JOIN (${cancellationWarehousesSql}) r ON r.warehouseid=s.receive_wh`;
  const inPeriod = (start, end) => `(q.business_time>=${start} AND q.business_time<${end})
    OR (q.source_rows>1 AND q.first_business_time<${end} AND q.last_business_time>=${start})
    OR (q.business_time IS NULL AND (q.header_addtime<${end} OR q.header_addtime IS NULL))`;
  const cohort = `SELECT ${periods ? 'rw.period_index,' : ''}${dimensions ? "CASE WHEN :gea_p900<>'' THEN :gea_p900 ELSE q.belong_base END AS base," : ''}q.cust_code,q.cust_order_no,q.executeorderno,
    q.executeorderlineno,q.material_code,q.cust_name AS name,q.region_name AS region,q.province_region_name AS province,
    q.header_addtime AS created,q.latestsendcardate AS latest_departure,q.orderstatus AS status,
    q.cancelled,q.business_time,q.locked,q.effective_qty,q.source_rows,q.short_transfer,q.scope_pickup_point
    FROM (${quantities}) q ${periods ? `INNER JOIN report_windows rw ON rw.enabled=TRUE AND (${inPeriod('rw.start_date', 'rw.end_date')})` : ''}
    WHERE ${periods ? '1=1' : '(' + inPeriod(':gea_p1', ':gea_p2') + ')'}
      AND q.latestsendcardate IS NOT NULL
      AND (:gea_p900<>'郑州' OR q.scope_pickup_point='01' OR q.scope_pickup_point IS NULL OR q.source_rows<>1)
      AND (q.source_rows<>1 OR TRIM(q.createsource)='20')
      AND (q.source_rows<>1 OR q.is_virtual IS NULL OR q.is_virtual NOT IN (1,2))
      AND (q.source_rows<>1 OR q.timeout_code IS NULL OR TRIM(q.timeout_code) NOT IN ('14','16'))
      AND (q.source_rows<>1 OR q.short_transfer IS NULL OR q.short_transfer=0)
      AND (q.source_rows<>1 OR q.orderstatus IS NULL OR q.orderstatus<>90 OR q.cancelled IS NULL
        OR q.cancelled>=q.locked)
      AND (q.source_rows<>1 OR q.orderstatus IS NULL OR q.orderstatus<>90 OR q.cancelled IS NULL
        OR q.header_addtime IS NULL OR q.cancelled<q.header_addtime
        OR q.cancelled>q.header_addtime + INTERVAL '12' HOUR)`;
  const classified = `SELECT ${periods ? 'period_index,' : ''}${dimensions ? 'base,' : ''}cust_code,cust_order_no,executeorderno,executeorderlineno,
    material_code,name,region,province,effective_qty,
    CASE WHEN status=90 AND cancelled>=locked AND cancelled>created + INTERVAL '12' HOUR
      THEN effective_qty ELSE 0 END AS cancel_numerator,
    CASE WHEN source_rows<>1 OR NULLIF(TRIM(cust_code),'') IS NULL
      OR NULLIF(TRIM(cust_order_no),'') IS NULL OR NULLIF(TRIM(executeorderno),'') IS NULL
      OR executeorderlineno IS NULL OR NULLIF(TRIM(material_code),'') IS NULL
      OR created IS NULL OR status IS NULL OR effective_qty IS NULL OR effective_qty<0
      OR (:gea_p900='郑州' AND scope_pickup_point IS NULL)
      OR (effective_qty<>0 AND short_transfer IS NULL)
      OR (status=90 AND (cancelled IS NULL OR cancelled<created OR latest_departure IS NULL))
      THEN 1 ELSE 0 END AS invalid_cancel
    FROM (${cohort}) cancellation_cohort`;
  const dimensionPrefix = dimensions
    ? 'WITH cancellation_source AS (' +
      source +
      '), cancellation_lines AS (' +
      details +
      '), cancellation_quantities AS (' +
      quantities.replace('FROM (' + details + ') s', 'FROM cancellation_lines s') +
      '), cancellation_cohort AS (' +
      cohort.replace('FROM (' + quantities + ') q', 'FROM cancellation_quantities q') +
      '), classified_cancellations AS (' +
      classified.replace('FROM (' + cohort + ') cancellation_cohort', 'FROM cancellation_cohort') +
      ') '
    : 'WITH cancellation_source AS (' + source + ') ';
  return `${dimensionPrefix}SELECT ${periods ? 'period_index,' : ''}${dimensions ? 'base,' : ''}cust_code,cust_order_no,executeorderno,executeorderlineno,
    material_code,name,region,province,cancel_numerator,effective_qty AS cancel_denominator,invalid_cancel
    FROM ${dimensions ? 'classified_cancellations' : '(' + classified + ') classified_cancellations'}`
    .replace(/\s+/g, ' ')
    .trim();
}

export function aggregateCancellationSql(
  events,
  { periods = false, sourceName = false, dimensions = [] } = {},
) {
  const grouped = dimensions.length ? dimensions.join(',') + ',' : '';
  return `SELECT ${periods ? 'period_index,' : ''}${grouped}'1' AS kind,region,province,
    CASE WHEN SUM(invalid_cancel)=0 THEN SUM(cancel_numerator) END AS numerator,
    CASE WHEN SUM(invalid_cancel)=0 THEN SUM(cancel_denominator) END AS denominator,
    SUM(CASE WHEN invalid_cancel=0 THEN cancel_numerator ELSE 0 END) AS sample_numerator,
    SUM(CASE WHEN invalid_cancel=0 THEN cancel_denominator ELSE 0 END) AS sample_denominator,
    SUM(CASE WHEN invalid_cancel=0 THEN 1 ELSE 0 END) AS sample_records,
    SUM(CASE WHEN invalid_cancel>0 THEN cancel_denominator ELSE 0 END) AS unknown_quantity,
    COUNT(*) AS records,SUM(invalid_cancel) AS invalid
    FROM ${sourceName ? events : '(' + events + ')'} cancellation_events
    GROUP BY ${periods ? 'period_index,' : ''}${grouped}region,province`;
}
