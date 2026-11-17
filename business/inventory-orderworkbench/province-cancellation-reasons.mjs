import { cancellationEvents } from './document-queries.mjs';

export function provinceCancellationReasonsSql() {
  const keys = [
    'cust_code',
    'cust_order_no',
    'executeorderno',
    'executeorderlineno',
    'material_code',
  ];
  const category = `CASE
    WHEN cancelreasoncode='02' AND (NULLIF(TRIM(cancelreason_desc),'') IS NULL OR TRIM(cancelreason_desc)='客户要求作废') THEN '客户取消'
    WHEN cancelreasoncode='03' AND (NULLIF(TRIM(cancelreason_desc),'') IS NULL OR TRIM(cancelreason_desc)='缺货作废') THEN '缺货'
    WHEN cancelreasoncode='01' AND (NULLIF(TRIM(cancelreason_desc),'') IS NULL OR TRIM(cancelreason_desc)='过期作废') THEN '系统·车型·交期'
    WHEN TRIM(cancelreason_desc) IN ('过期作废','系统原因','系统问题','车型原因','车型不符','交期原因') THEN '系统·车型·交期'
    WHEN TRIM(cancelreason_desc) IN ('预下市','预下市作废','新老品','新老品切换') THEN '预下市/新老品'
    WHEN NULLIF(TRIM(cancelreason_desc),'') IS NOT NULL OR NULLIF(TRIM(cancelreasoncode),'') IS NOT NULL THEN '未明确'
    ELSE NULL END`;
  const reasons = ['agents_scm_execute_detail_hourly_d', 'agents_scm_execute_detail_d']
    .map(
      (table) =>
        `SELECT ${keys.join(',')},${category} AS category FROM ${table}
      WHERE orderstatus=90 AND (NULLIF(TRIM(canceltime),'') IS NULL OR (canceltime>=:gea_p1 AND canceltime<:gea_p2))`,
    )
    .join(' UNION ALL ');
  const same = keys.map((key) => `e.${key}=r.${key}`).join(' AND ');
  return `SELECT e.region,e.province,COALESCE(r.reason,'未明确') AS reason,SUM(e.cancel_numerator) AS cancel_qty
    FROM (${cancellationEvents}) e LEFT JOIN (
      SELECT ${keys.join(',')},CASE WHEN COUNT(DISTINCT category)=1 THEN MAX(category) ELSE '未明确' END AS reason
      FROM (${reasons}) reason_rows GROUP BY ${keys.join(',')}
    ) r ON ${same}
    WHERE e.invalid_cancel=0 AND e.cancel_numerator>0
    GROUP BY e.region,e.province,COALESCE(r.reason,'未明确')`;
}
