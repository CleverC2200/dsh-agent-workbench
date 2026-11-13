export function amendmentReductionSql(requested = 'requested_qty', effective = 'effective_qty') {
  return `CASE WHEN ${requested}>=0 AND ${requested}<${effective} THEN ${effective}-${requested} ELSE 0 END`;
}

export const amendmentMetricContract = {
  version: 'quantity-order-close-reduction-only-bi-v5',
  source: 'agents_scm_execute_detail_d',
  dateField: 'order_close_time',
  dateSource: 'agents_scm_execute_detail_d',
  dateBasis: 'BI统计周期：执行明细日表order_close_time订单关单时间，不关联物流轨迹表',
  missingDate: '缺order_close_time不能归属统计周期，不用OMS新增、WMS关单或轨迹装车时间替代',
  countFields: {
    records: '通过时间及业务筛选的明细条数，不是订单张数',
    invalid: '保留集合内关键字段不足的待判定明细条数，不是被剔除的明细条数；本查询未返回剔除数量',
  },
  aggregation: '商品明细数量合计，不按订单张数、SKU种类数或明细条数计率',
  effectiveQuantity: 'COALESCE(dms_last_update_qty,need_qty_origin,0)',
  numerator: `SUM(${amendmentReductionSql('change_order_qty', 'COALESCE(dms_last_update_qty,need_qty_origin,0)')})`,
  denominator: 'SUM(COALESCE(dms_last_update_qty,need_qty_origin,0))',
  denominatorScope: '全部有效明细；客户要求改单量为空或负值的有效量仍保留在分母，三个数量全空剔除',
  lockPeriod: false,
  changeTimeRequired: false,
  filters:
    'detailstatus<>20，剔除作废明细；仅createsource=20，剔除is_virtual=1/2和timeout_code=14/16；仅保留is_short_transfer=非短拨，不重新按仓库映射判断；仅pickup_point IN (01,02,03,04,37)；郑州仅pickup_point=01',
  answer:
    '分子、分母均为商品数量，不使用张；明细条数或订单张数只能另列，不能替代数量；旧快照或小时表结果不能冒充本口径',
};

export function skuAmendmentEventsSql({
  stage = 'events',
  periods = false,
  dimensions = false,
} = {}) {
  const fields = [
    'cust_code',
    'cust_order_no',
    'executeorderno',
    'belong_base',
    'pickup_point',
    'material_code',
    'region_name',
    'province_region_name',
    'cust_name',
    'header_addtime',
    'shipped_at',
    'orderstatus',
    'detailstatus',
    'is_stat',
    'change_order_qty',
    'dms_last_update_qty',
    'need_qty_origin',
    'warehouseid',
    'receive_wh',
    'createsource',
    'is_virtual',
    'timeout_code',
    'order_close_time',
    'is_short_transfer',
  ];
  const projection = (alias) =>
    fields
      .map((field) =>
        alias === 'd' && field === 'shipped_at'
          ? 'd.order_close_time AS shipped_at'
          : `${alias}.${field}`,
      )
      .join(',');
  const source = `SELECT ${periods ? 'rw.period_index,' : ''}${projection('d')}
    FROM agents_scm_execute_detail_d d
    ${periods ? 'INNER JOIN report_windows rw ON rw.enabled=TRUE AND d.order_close_time>=rw.start_date AND d.order_close_time<rw.end_date' : ''}
    WHERE (:gea_p900=''
      OR (:gea_p900='郑州' AND d.pickup_point='01')
      OR (:gea_p900<>'郑州' AND d.belong_base=:gea_p900))
      ${periods ? '' : 'AND d.order_close_time>=:gea_p1 AND d.order_close_time<:gea_p2'}
      AND d.createsource='20'
      AND d.pickup_point IN ('01','02','03','04','37')
      AND (d.is_virtual IS NULL OR d.is_virtual NOT IN ('1','2'))
      AND (d.timeout_code IS NULL OR d.timeout_code NOT IN ('14','16'))`;
  const cohort = `SELECT ${periods ? 's.period_index,' : ''}${projection('s')},
    s.change_order_qty AS requested_qty,
    COALESCE(s.dms_last_update_qty,s.need_qty_origin,0) AS effective_qty
    FROM (${source}) s`;
  const lines = `${cohort}
    WHERE s.detailstatus<>20 AND s.is_short_transfer='非短拨'
      AND (s.change_order_qty IS NOT NULL OR s.dms_last_update_qty IS NOT NULL
        OR s.need_qty_origin IS NOT NULL)`;
  const invalid = `NULLIF(TRIM(cust_code),'') IS NULL
      OR NULLIF(TRIM(cust_order_no),'') IS NULL OR NULLIF(TRIM(material_code),'') IS NULL
      OR orderstatus IS NULL`;
  const classified = `SELECT ${periods ? 'period_index,' : ''}${dimensions ? "CASE WHEN :gea_p900<>'' THEN :gea_p900 ELSE belong_base END AS base," : ''}cust_code,cust_order_no,material_code,cust_name,region_name,province_region_name,
    requested_qty,effective_qty,
    ${amendmentReductionSql()} AS difference_qty,
    ${amendmentReductionSql()} AS changed_quantity,
    CASE WHEN ${invalid} THEN 1 ELSE 0 END AS invalid_denominator,
    CASE WHEN ${invalid} THEN 1 ELSE 0 END AS invalid_line
    FROM (${lines}) amendment_lines`;
  const events = `SELECT ${periods ? 'period_index,' : ''}${dimensions ? 'base,' : ''}cust_code,cust_order_no,material_code,cust_name AS name,
    region_name AS region,province_region_name AS province,
    CASE WHEN invalid_line=0 THEN changed_quantity ELSE 0 END AS change_numerator,
    effective_qty AS change_denominator,invalid_denominator,invalid_line AS invalid_change,
    CASE WHEN invalid_line>0 THEN difference_qty ELSE 0 END AS unknown_quantity
    FROM (${classified}) classified_details`;
  const selected = { cohort, lines, classified, events }[stage];
  if (!selected) throw new Error('Unknown amendment query stage');
  return selected;
}

export function aggregateAmendmentSql(events, customer = false, periods = false, dimensions = []) {
  const grouped = dimensions.length ? dimensions.join(',') + ',' : '';
  return `SELECT ${periods ? 'period_index,' : ''}${grouped}${customer ? 'region,province,cust_code AS customer,MAX(name) AS name' : "'2' AS kind,region,province"},
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
    FROM (${events}) sku_events GROUP BY ${periods ? 'period_index,' : ''}${grouped}region,province${customer ? ',cust_code' : ''}`;
}
