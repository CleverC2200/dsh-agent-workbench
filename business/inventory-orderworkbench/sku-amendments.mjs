// Quantity sums over daily execution details; no source-order/SKU deduplication.
export const amendmentMetricContract = {
  version: 'quantity-shipment-nonnegative-no-lock-v2',
  source: 'agents_scm_execute_detail_d',
  warehouseSource: 'agents_dim_bas_warehouse_d',
  dateField: 'lastshipmenttime',
  dateSource: 'agents_scm_order_trace_final_di',
  dateBasis:
    '实际发货：装车完成时间；按执行单号＋客户关联，取update_time、load_time最新批次并列记录的最后装车完成时间',
  missingDate:
    '缺装车完成时间或无法关联的执行单不能归属发货周期，不用OMS新增、WMS关单或预计到货时间替代',
  countFields: {
    records: '通过时间及业务筛选的明细条数，不是订单张数',
    invalid: '保留集合内关键字段不足的待判定明细条数，不是被剔除的明细条数；本查询未返回剔除数量',
  },
  aggregation: '商品明细数量合计，不按订单张数、SKU种类数或明细条数计率',
  effectiveQuantity: 'COALESCE(dms_last_update_qty,need_qty_origin,0)',
  numerator:
    'SUM(CASE WHEN change_order_qty>=0 THEN ABS(change_order_qty-COALESCE(dms_last_update_qty,need_qty_origin,0)) ELSE 0 END)',
  denominator: 'SUM(COALESCE(dms_last_update_qty,need_qty_origin,0))',
  denominatorScope: '全部有效明细；客户要求改单量为空或负值的有效量仍保留在分母，三个数量全空剔除',
  lockPeriod: false,
  changeTimeRequired: false,
  filters:
    'detailstatus=10、is_stat=1、剔除作废单；仅createsource=20，剔除is_virtual=1/2和timeout_code=14/16；两端仓库同提货点且均为01/02工厂仓类型才剔除短驳；郑州仅pickup_point=01',
  answer:
    '分子、分母均为商品数量，不使用张；明细条数或订单张数只能另列，不能替代数量；旧快照或小时表结果不能冒充本口径',
};

export const amendmentShipmentSql = `SELECT executeorderno,cust_code,MAX(lastshipmenttime) AS shipped_at
  FROM (SELECT executeorderno,cust_code,lastshipmenttime,
    DENSE_RANK() OVER (PARTITION BY executeorderno,cust_code ORDER BY update_time DESC,load_time DESC) AS version_rank
    FROM agents_scm_order_trace_final_di) latest_shipments
  WHERE version_rank=1 GROUP BY executeorderno,cust_code`;

const warehousePointsSql = `SELECT warehouseid AS warehouse_id,
  CASE WHEN COUNT(pickup_point)=COUNT(*) AND COUNT(DISTINCT pickup_point)=1
    THEN MAX(pickup_point) END AS pickup_point,
  CASE WHEN COUNT(warehouse_classify)=COUNT(*) AND COUNT(DISTINCT warehouse_classify)=1
    THEN MAX(warehouse_classify) END AS warehouse_classify
  FROM agents_dim_bas_warehouse_d GROUP BY warehouseid`;

export function skuAmendmentEventsSql({ stage = 'events', periods = false } = {}) {
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
  ];
  const projection = (alias) =>
    fields
      .map((field) =>
        alias === 'd' && field === 'shipped_at'
          ? 'shipment.shipped_at AS shipped_at'
          : `${alias}.${field}`,
      )
      .join(',');
  const source = `SELECT ${periods ? 'rw.period_index,' : ''}${projection('d')}
    FROM agents_scm_execute_detail_d d
    INNER JOIN (${amendmentShipmentSql}) shipment ON shipment.executeorderno=d.executeorderno AND shipment.cust_code=d.cust_code
    ${periods ? 'INNER JOIN report_windows rw ON rw.enabled=TRUE AND shipment.shipped_at>=rw.start_date AND shipment.shipped_at<rw.end_date' : ''}
    WHERE (:gea_p900=''
      OR (:gea_p900='郑州' AND d.pickup_point='01')
      OR (:gea_p900<>'郑州' AND d.belong_base=:gea_p900))
      ${periods ? '' : 'AND shipment.shipped_at>=:gea_p1 AND shipment.shipped_at<:gea_p2'}
      AND d.createsource='20'
      AND d.pickup_point IN ('01','02','03','04','37')
      AND (d.is_virtual IS NULL OR d.is_virtual NOT IN ('1','2'))
      AND (d.timeout_code IS NULL OR d.timeout_code NOT IN ('14','16'))`;
  const factoryTransfer = `CASE WHEN shipping.pickup_point IS NOT NULL
      AND shipping.pickup_point=receiving.pickup_point
      AND shipping.warehouse_classify IN ('01','02')
      AND receiving.warehouse_classify IN ('01','02') THEN 1 ELSE 0 END`;
  const knownWarehouse = "NULLIF(NULLIF(TRIM(warehouseid),'*'),'')";
  // Unallocated rows inherit only a unique warehouse on the same valid execution and route.
  const executionShipping = `SELECT ${periods ? 'period_index,' : ''}cust_code,executeorderno,pickup_point,receive_wh,
    CASE WHEN COUNT(DISTINCT ${knownWarehouse})=1 THEN MAX(${knownWarehouse}) END AS warehouse_id
    FROM (${source}) execution_lines
    WHERE detailstatus=10 AND is_stat='1' AND (orderstatus<>90 OR orderstatus IS NULL)
    GROUP BY ${periods ? 'period_index,' : ''}cust_code,executeorderno,pickup_point,receive_wh`;
  const resolvedWarehouse = `COALESCE(NULLIF(NULLIF(TRIM(s.warehouseid),'*'),''),execution_shipping.warehouse_id)`;
  const cohort = `SELECT ${periods ? 's.period_index,' : ''}${projection('s')},
    s.change_order_qty AS requested_qty,
    COALESCE(s.dms_last_update_qty,s.need_qty_origin,0) AS effective_qty,
    ${factoryTransfer} AS factory_short_transfer,${resolvedWarehouse} AS resolved_warehouseid
    FROM (${source}) s
    LEFT JOIN (${executionShipping}) execution_shipping
      ON execution_shipping.cust_code=s.cust_code AND execution_shipping.executeorderno=s.executeorderno
      AND execution_shipping.pickup_point=s.pickup_point AND execution_shipping.receive_wh=s.receive_wh
      ${periods ? 'AND execution_shipping.period_index=s.period_index' : ''}
    LEFT JOIN (${warehousePointsSql}) shipping ON shipping.warehouse_id=${resolvedWarehouse}
    LEFT JOIN (${warehousePointsSql}) receiving ON receiving.warehouse_id=s.receive_wh`;
  const lines = `${cohort}
    WHERE s.detailstatus=10 AND s.is_stat='1'
      AND (s.orderstatus<>90 OR s.orderstatus IS NULL)
      AND (${factoryTransfer})=0
      AND (s.change_order_qty IS NOT NULL OR s.dms_last_update_qty IS NOT NULL
        OR s.need_qty_origin IS NOT NULL)`;
  const invalid = `NULLIF(TRIM(cust_code),'') IS NULL
      OR NULLIF(TRIM(cust_order_no),'') IS NULL OR NULLIF(TRIM(material_code),'') IS NULL
      OR orderstatus IS NULL`;
  const classified = `SELECT ${periods ? 'period_index,' : ''}cust_code,cust_order_no,material_code,cust_name,region_name,province_region_name,
    requested_qty,effective_qty,
    CASE WHEN requested_qty>=0 THEN ABS(requested_qty-effective_qty) ELSE 0 END AS difference_qty,
    CASE WHEN requested_qty>=0 THEN ABS(requested_qty-effective_qty) ELSE 0 END AS changed_quantity,
    CASE WHEN ${invalid} THEN 1 ELSE 0 END AS invalid_denominator,
    CASE WHEN ${invalid} THEN 1 ELSE 0 END AS invalid_line
    FROM (${lines}) amendment_lines`;
  const events = `SELECT ${periods ? 'period_index,' : ''}cust_code,cust_order_no,material_code,cust_name AS name,
    region_name AS region,province_region_name AS province,
    CASE WHEN invalid_line=0 THEN changed_quantity ELSE 0 END AS change_numerator,
    effective_qty AS change_denominator,invalid_denominator,invalid_line AS invalid_change,
    CASE WHEN invalid_line>0 THEN difference_qty ELSE 0 END AS unknown_quantity
    FROM (${classified}) classified_details`;
  const selected = { cohort, lines, classified, events }[stage];
  if (!selected) throw new Error('Unknown amendment query stage');
  return selected;
}

export function aggregateAmendmentSql(events, customer = false, periods = false) {
  return `SELECT ${periods ? 'period_index,' : ''}${customer ? 'region,province,cust_code AS customer,MAX(name) AS name' : "'2' AS kind,region,province"},
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
    FROM (${events}) sku_events GROUP BY ${periods ? 'period_index,' : ''}region,province${customer ? ',cust_code' : ''}`;
}
