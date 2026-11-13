export const ontimeMetricContract = {
  version: 'execution-arrival-18-12-complete-v1',
  source: 'agents_scm_order_trace_final_di',
  executionSources: ['agents_scm_execute_detail_d', 'agents_scm_execute_detail_hourly_d'],
  dateField: 'COALESCE(gpsisinraildate_to,arriveconfirm_time)',
  dateBasis: '按TMS实际到货时间归属周期；优先目的地GPS围栏，其次到货确认',
  grain: '执行单号去重，单位张；不按SKU、来源单或执行记录行计率',
  numerator: '已确认准交执行单数',
  denominator: '所选实际到货周期内符合剔除规则的全部已发货候选执行单数，包含待判定',
  deadline:
    'MAX(客户期望到货requireddeliverytimebak,开单确认到货requireddeliverytime,系统计算到货expected_deliv_time)',
  graceHours: { kamd: 18, dc: 18, other: 12 },
  customerType:
    "agents_scm_order_trace_final_di.cust_type；LOWER(TRIM(cust_type)) IN ('kamd','dc')取18小时，否则12小时",
  lateBoundary: '到货时间>=基准交期+对应18/12小时为逾期；严格早于为准交',
  unknown: '待判定保留在完整分母，暂不计分子，不视为已确认逾期；样本率不能替代主率',
  missingDeadline:
    '系统交期缺失时，仅到货严格早于已有两交期最大值+对应时限才可确认准交，否则待判定',
  scope:
    '复用当前看板：短驳按两端同提货点且均工厂仓/工厂外租仓；剔除海外/国外/港澳、未派车、虚拟1/2、空车型及指定车型、超时原因14/16；不加OMS新增时间、最后发货时间非空或detailstatus/is_stat条件',
  baseScope: '按看板belong_base筛选；郑州庞丽娟使用郑州基地准交率',
};
export const ontimeWarehousesSql = `SELECT warehouseid,
  CASE WHEN COUNT(DISTINCT NULLIF(TRIM(pickup_point),''))=1
    THEN MAX(NULLIF(TRIM(pickup_point),'')) END AS pickup_point,
  CASE WHEN COUNT(DISTINCT NULLIF(TRIM(warehouse_classify),''))=1
    THEN MAX(NULLIF(TRIM(warehouse_classify),'')) END AS warehouse_classify
  FROM (SELECT warehouseid,pickup_point,warehouse_classify FROM agents_scm_material_in_out_summary_d
    UNION ALL SELECT warehouse_id AS warehouseid,NULL AS pickup_point,warehouse_classify FROM dim_bas_warehouse) sources
  GROUP BY warehouseid`;

const shortTransfer = `CASE
  WHEN NULLIF(TRIM(t.receive_wh),'') IS NULL THEN 0
  WHEN f.warehouse_classify NOT IN ('01','02') OR r.warehouse_classify NOT IN ('01','02') THEN 0
  WHEN f.warehouse_classify IN ('01','02') AND r.warehouse_classify IN ('01','02')
    AND f.pickup_point IS NOT NULL AND r.pickup_point IS NOT NULL
    THEN CASE WHEN f.pickup_point=r.pickup_point THEN 1 ELSE 0 END
  ELSE NULL END`;

const excluded = `CASE WHEN TRIM(t.is_dispatch)='否'
  OR TRIM(t.region_name) IN ('海外大区','国外大区','港澳大区')
  OR TRIM(t.is_virtual_odo) IN ('1','2')
  OR COALESCE(TRIM(t.vehicle_type),'')=''
  OR REPLACE(REPLACE(TRIM(t.vehicle_type_name),'(', '（'),')','）')
    IN ('铁柜40','铁柜45','无车型要求（常温）','无车型要求（速冻）','自提')
  OR TRIM(t.timeout_code) IN ('14','16','安全库存','调账订单')
  OR (${shortTransfer})=1 THEN 1 ELSE 0 END`;

const extendedGrace = "CASE WHEN LOWER(TRIM(t.cust_type)) IN ('kamd','dc') THEN 1 ELSE 0 END";
const deadlineWithGrace = (fields) => `CASE WHEN MIN(${extendedGrace})=1
    THEN GREATEST(${fields}) + INTERVAL '18' HOUR
    ELSE GREATEST(${fields}) + INTERVAL '12' HOUR END`;
export const ontimeTraceHeadersSql = `SELECT t.executeorderno,t.cust_code,
  MAX(t.lastshipmenttime) AS shipped,
  CASE WHEN COUNT(COALESCE(t.gpsisinraildate_to,t.arriveconfirm_time))=COUNT(*)
    AND COUNT(DISTINCT COALESCE(t.gpsisinraildate_to,t.arriveconfirm_time))=1
    THEN MAX(COALESCE(t.gpsisinraildate_to,t.arriveconfirm_time)) END AS arrived,
  CASE WHEN COUNT(t.requireddeliverytimebak)=COUNT(*) AND COUNT(t.requireddeliverytime)=COUNT(*)
    AND COUNT(CAST(t.expected_deliv_time AS DATETIME))=COUNT(*)
    AND COUNT(DISTINCT t.requireddeliverytimebak)=1 AND COUNT(DISTINCT t.requireddeliverytime)=1
    AND COUNT(DISTINCT t.expected_deliv_time)=1
    THEN ${deadlineWithGrace('MAX(t.requireddeliverytimebak),MAX(t.requireddeliverytime),MAX(CAST(t.expected_deliv_time AS DATETIME))')} END AS deadline,
  CASE WHEN COUNT(t.requireddeliverytimebak)=COUNT(*) AND COUNT(t.requireddeliverytime)=COUNT(*)
    AND COUNT(DISTINCT t.requireddeliverytimebak)=1 AND COUNT(DISTINCT t.requireddeliverytime)=1
    THEN ${deadlineWithGrace('MAX(t.requireddeliverytimebak),MAX(t.requireddeliverytime)')} END AS known_deadline,
  CASE WHEN COUNT(DISTINCT ${extendedGrace})>1 THEN 1
    ELSE MAX(CASE WHEN (${shortTransfer}) IS NULL THEN 1 ELSE 0 END) END AS invalid_scope
  FROM agents_scm_order_trace_final_di t INNER JOIN
    (SELECT executeorderno,cust_code,MAX(update_time) AS updated FROM agents_scm_order_trace_final_di GROUP BY executeorderno,cust_code) latest
    ON latest.executeorderno=t.executeorderno AND latest.cust_code=t.cust_code AND latest.updated=t.update_time
  LEFT JOIN (${ontimeWarehousesSql}) f ON f.warehouseid=t.deliver_wh
  LEFT JOIN (${ontimeWarehousesSql}) r ON r.warehouseid=t.receive_wh
  GROUP BY t.executeorderno,t.cust_code HAVING MAX(${excluded})=0`;

const tuple = (fields) =>
  fields.map((field) => `LENGTH(COALESCE(${field},'')),':',COALESCE(${field},'')`).join(',');
export function createOntimeQueries(productsSql) {
  const scopedTraces = ontimeTraceHeadersSql.replace(
    'SELECT executeorderno,cust_code,MAX(update_time) AS updated FROM agents_scm_order_trace_final_di GROUP BY executeorderno,cust_code',
    `SELECT history.executeorderno,history.cust_code,MAX(history.update_time) AS updated
      FROM agents_scm_order_trace_final_di history INNER JOIN
        (SELECT DISTINCT executeorderno,cust_code FROM agents_scm_order_trace_final_di
          WHERE COALESCE(gpsisinraildate_to,arriveconfirm_time)>=:gea_p1
            AND COALESCE(gpsisinraildate_to,arriveconfirm_time)<:gea_p2) candidates
        ON candidates.executeorderno=history.executeorderno AND candidates.cust_code=history.cust_code
      GROUP BY history.executeorderno,history.cust_code`,
  );
  const members = ['h.belong_base', 'd.product_categ_name', 'h.product_item', 'h.material_code'];

  const arrivals = `SELECT t.executeorderno,t.cust_code,t.arrived AS arrival_date,
    CASE WHEN t.invalid_scope=0 AND t.arrived<t.known_deadline THEN 1
      WHEN t.deadline IS NOT NULL AND t.invalid_scope=0 THEN CASE WHEN t.arrived<t.deadline THEN 1 ELSE 0 END END AS ontime,
    CASE WHEN t.invalid_scope>0 OR (t.deadline IS NULL AND (t.known_deadline IS NULL OR t.arrived>=t.known_deadline)) THEN 1 ELSE 0 END AS invalid
    FROM ontime_traces t WHERE t.arrived>=:gea_p1 AND t.arrived<:gea_p2`;

  const scopedProducts = productsSql.replace(
    ') execution_rows\n  WHERE ',
    `) execution_rows
  WHERE executeorderno IN (SELECT executeorderno FROM ontime_arrivals) AND `,
  );
  const prefix = `WITH ontime_traces AS (${scopedTraces}),ontime_arrivals AS (${arrivals}),
    ontime_products AS (${scopedProducts}) `;
  const geographyFields = ['region_name', 'province_region_name']
    .map(
      (field, index) =>
        `CASE WHEN COUNT(NULLIF(TRIM(t.${field}),''))=COUNT(*) AND COUNT(DISTINCT NULLIF(TRIM(t.${field}),''))=1 THEN MAX(NULLIF(TRIM(t.${field}),'')) END AS ${index === 0 ? 'region' : 'province'}`,
    )
    .join(',');
  const geographyTraces = scopedTraces.replace(
    'SELECT t.executeorderno,t.cust_code,',
    `SELECT t.executeorderno,t.cust_code,${geographyFields},`,
  );
  const geographyArrivals = arrivals.replace(
    't.arrived AS arrival_date,',
    't.arrived AS arrival_date,t.region,t.province,',
  );
  const geographyPrefix = `WITH ontime_traces AS (${geographyTraces}),ontime_arrivals AS (${geographyArrivals}),ontime_products AS (${scopedProducts}) `;
  const from = `FROM ontime_products h INNER JOIN ontime_arrivals a
    ON a.executeorderno=h.executeorderno AND a.cust_code=h.cust_code
    INNER JOIN (SELECT executeorderno,cust_code FROM ontime_products GROUP BY executeorderno,cust_code
      HAVING MAX(virtual_excluded)=0) eligible ON eligible.executeorderno=h.executeorderno AND eligible.cust_code=h.cust_code
    LEFT JOIN (SELECT material_code,CASE WHEN COUNT(DISTINCT product_categ_name)=1 THEN MAX(product_categ_name) END AS product_categ_name
      FROM agents_scm_material_in_out_summary_d GROUP BY material_code) d ON d.material_code=h.material_code`;
  const windows = Array.from({ length: 6 }, (_, index) => ({
    index,
    start: ':gea_p' + (810 + index * 3),
    end: ':gea_p' + (811 + index * 3),
    enabled: ':gea_p' + (812 + index * 3),
  }));
  const inWindows = (field) =>
    '(' +
    windows
      .map(
        (window) =>
          `(${window.enabled}=TRUE AND ${field}>=${window.start} AND ${field}<${window.end})`,
      )
      .join(' OR ') +
    ')';
  const periodTraces = scopedTraces.replace(
    /COALESCE\(gpsisinraildate_to,arriveconfirm_time\)>=:gea_p1\s+AND COALESCE\(gpsisinraildate_to,arriveconfirm_time\)<:gea_p2/,
    inWindows('COALESCE(gpsisinraildate_to,arriveconfirm_time)'),
  );
  const periodArrivals = arrivals.replace(
    't.arrived>=:gea_p1 AND t.arrived<:gea_p2',
    inWindows('t.arrived'),
  );
  const periodPrefix = `WITH report_windows AS (${windows
    .map(
      (window) =>
        `SELECT ${window.index} AS period_index,${window.start} AS start_date,${window.end} AS end_date,${window.enabled} AS enabled`,
    )
    .join(' UNION ALL ')}),
    ontime_traces AS (${periodTraces}),ontime_arrivals AS (${periodArrivals}),ontime_products AS (${scopedProducts}) `;
  const executionPrefix = `${prefix.trimEnd()},ontime_executions AS (
    SELECT h.executeorderno AS order_no,
      CASE WHEN COUNT(DISTINCT h.cust_code)=1 THEN MAX(h.cust_code) END AS customer,
      MAX(a.arrival_date) AS arrival_date,MIN(a.ontime) AS ontime,
      MAX(CASE WHEN NULLIF(TRIM(h.executeorderno),'') IS NULL OR NULLIF(TRIM(h.cust_code),'') IS NULL
        THEN 1 ELSE a.invalid END) AS invalid
      ${from} GROUP BY h.executeorderno) `;
  return {
    ontimeGeographySummarySql:
      geographyPrefix +
      `SELECT h.belong_base AS base,a.invalid,a.ontime,
      ARRAY_AGG(CONCAT(${tuple(['h.executeorderno', 'h.cust_code', 'CAST(a.arrival_date AS CHAR)', ...members, 'a.region', 'a.province'])})) AS packed_orders
      ${from} GROUP BY h.belong_base,a.invalid,a.ontime`,
    ontimeAgentSummarySql:
      executionPrefix +
      `SELECT
      COALESCE(SUM(CASE WHEN invalid=0 AND ontime=1 THEN 1 ELSE 0 END),0) AS numerator,
      COUNT(*) AS denominator,
      COALESCE(SUM(CASE WHEN invalid=0 AND ontime IN (0,1) THEN 1 ELSE 0 END),0) AS known,
      COALESCE(SUM(CASE WHEN invalid<>0 OR ontime IS NULL THEN 1 ELSE 0 END),0) AS pending,
      COALESCE(SUM(CASE WHEN invalid=0 AND ontime=0 THEN 1 ELSE 0 END),0) AS late
      FROM ontime_executions`,
    ontimeAgentDetailsSql:
      executionPrefix +
      `SELECT order_no,customer,arrival_date,ontime,invalid
      FROM ontime_executions`,
    ontimePeriodSummarySql:
      periodPrefix +
      `SELECT rw.period_index,h.belong_base AS base,a.invalid,a.ontime,
      ARRAY_AGG(CONCAT(${tuple(['h.executeorderno', 'h.cust_code', 'CAST(a.arrival_date AS CHAR)', ...members])})) AS packed_orders
      ${from} INNER JOIN report_windows rw ON rw.enabled=TRUE AND a.arrival_date>=rw.start_date AND a.arrival_date<rw.end_date
      GROUP BY rw.period_index,h.belong_base,a.invalid,a.ontime`,
    ontimeSql:
      prefix +
      `SELECT h.executeorderno AS order_no,h.cust_code AS customer,
      MAX(a.ontime) AS ontime,MAX(a.arrival_date) AS arrival_date,MAX(a.invalid) AS invalid,
      ARRAY_AGG(CONCAT(${tuple(members)})) AS members ${from} GROUP BY h.executeorderno,h.cust_code`,
    ontimeSummarySql:
      prefix +
      `SELECT h.belong_base AS base,a.invalid,a.ontime,
      ARRAY_AGG(CONCAT(${tuple(['h.executeorderno', 'h.cust_code', 'CAST(a.arrival_date AS CHAR)', ...members])})) AS packed_orders
      ${from} GROUP BY h.belong_base,a.invalid,a.ontime`,
  };
}
