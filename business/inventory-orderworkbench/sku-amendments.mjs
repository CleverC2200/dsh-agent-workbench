// Quantity sums over daily execution details; no source-order/SKU deduplication.
export function skuAmendmentEventsSql({ headers, stage = 'events' }) {
  const fields = [
    'cust_code',
    'cust_order_no',
    'executeorderno',
    'belong_base',
    'material_code',
    'region_name',
    'province_region_name',
    'cust_name',
    'header_addtime',
    'requireddeliverytime',
    'detailstatus',
    'is_stat',
    'change_order_qty',
    'dms_last_update_qty',
    'order_qty_origin',
  ];
  const projection = (alias) => fields.map((field) => `${alias}.${field}`).join(',');
  const source = `SELECT ${projection('d')},d.custchangetime AS changed
    FROM agents_scm_execute_detail_d d
    WHERE (:gea_p900='' OR d.belong_base=:gea_p900)
      AND d.header_addtime>=:gea_p1 AND d.header_addtime<:gea_p2`;
  const sameOrder = ['cust_code', 'cust_order_no']
    .map(
      (key) =>
        `(CASE WHEN h.${key} IS NULL THEN 'N' ELSE CONCAT('V',h.${key}) END)=(CASE WHEN s.${key} IS NULL THEN 'N' ELSE CONCAT('V',s.${key}) END)`,
    )
    .join(' AND ');
  const cohort = `SELECT ${projection('s')},s.changed,h.invalid_header,h.status AS header_status,h.cancelled,
    COALESCE(s.change_order_qty,0) AS requested_qty,
    COALESCE(s.dms_last_update_qty,s.order_qty_origin,0) AS effective_qty,
    CASE WHEN s.requireddeliverytime<=s.header_addtime + INTERVAL '7' DAY
      THEN s.header_addtime + INTERVAL '12' HOUR
      ELSE s.requireddeliverytime - INTERVAL '7' DAY END AS locked
    FROM (${source}) s INNER JOIN (${headers}) h
      ON ${sameOrder}`;
  const lines = `${cohort}
    WHERE s.detailstatus=10 AND s.is_stat='1'
      AND (h.status<>90 OR h.status IS NULL)
      AND (s.change_order_qty IS NOT NULL OR s.dms_last_update_qty IS NOT NULL
        OR s.order_qty_origin IS NOT NULL)`;
  const classified = `SELECT cust_code,cust_order_no,material_code,cust_name,region_name,province_region_name,
    requested_qty,effective_qty,ABS(requested_qty-effective_qty) AS difference_qty,
    changed,header_addtime,requireddeliverytime,locked,
    invalid_header,header_status,cancelled,detailstatus,is_stat,
    CASE WHEN changed>=locked THEN ABS(requested_qty-effective_qty) ELSE 0 END AS changed_quantity,
    CASE WHEN invalid_header>0 OR NULLIF(TRIM(material_code),'') IS NULL
      OR detailstatus<>10 OR is_stat<>'1' OR detailstatus IS NULL OR is_stat IS NULL
      THEN 1 ELSE 0 END AS invalid_denominator,
    CASE WHEN invalid_header>0 OR NULLIF(TRIM(material_code),'') IS NULL
      OR detailstatus<>10 OR is_stat<>'1' OR detailstatus IS NULL OR is_stat IS NULL
      OR (requested_qty<>effective_qty AND (changed IS NULL OR header_addtime IS NULL
        OR requireddeliverytime IS NULL OR requireddeliverytime<header_addtime
        OR changed<header_addtime))
      THEN 1 ELSE 0 END AS invalid_line
    FROM (${lines}) amendment_lines`;
  const events = `SELECT cust_code,cust_order_no,material_code,cust_name AS name,
    region_name AS region,province_region_name AS province,
    CASE WHEN invalid_line=0 THEN changed_quantity ELSE 0 END AS change_numerator,
    effective_qty AS change_denominator,invalid_denominator,invalid_line AS invalid_change,
    CASE WHEN invalid_line>0 THEN difference_qty ELSE 0 END AS unknown_quantity
    FROM (${classified}) classified_details`;
  const selected = { cohort, lines, classified, events }[stage];
  if (!selected) throw new Error('Unknown amendment query stage');
  return selected;
}

export function aggregateAmendmentSql(events, customer = false) {
  return `SELECT ${customer ? 'region,province,cust_code AS customer,MAX(name) AS name' : "'2' AS kind,region,province"},
    CASE WHEN SUM(invalid_change)=0 THEN SUM(change_numerator) END AS numerator,
    CASE WHEN SUM(invalid_denominator)=0 THEN SUM(change_denominator) END AS denominator,
    ${
      customer
        ? ''
        : `SUM(CASE WHEN invalid_change=0 THEN change_numerator ELSE 0 END) AS sample_numerator,
    SUM(CASE WHEN invalid_change=0 THEN change_denominator ELSE 0 END) AS sample_denominator,
    SUM(CASE WHEN invalid_change=0 THEN 1 ELSE 0 END) AS sample_records,`
    }
    SUM(unknown_quantity) AS unknown_quantity,
    COUNT(*) AS records,SUM(invalid_change) AS invalid
    FROM (${events}) sku_events GROUP BY region,province${customer ? ',cust_code' : ''}`;
}
