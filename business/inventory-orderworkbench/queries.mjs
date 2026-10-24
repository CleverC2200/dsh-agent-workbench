// Field formulas confirmed in the shared metric register, 2026-10-23.
const dictionary = `SELECT material_code AS sku,
  CASE WHEN COUNT(DISTINCT product_categ_name)=1 THEN MAX(product_categ_name) END AS category,
  CASE WHEN COUNT(DISTINCT material_group_name)=1 THEN MAX(material_group_name) END AS item
  FROM agents_scm_material_in_out_summary_d GROUP BY material_code`;

export const workbenchQueries = {
  orders: {
    keys: ['base', 'category', 'item', 'sku'],
    columns: [
      'base',
      'category',
      'item',
      'sku',
      'name',
      'demand',
      'shortage',
      'records',
      'invalid',
      'ontime',
      'judged',
      'unjudged',
      'invalid_judgment',
    ],
    sql: `SELECT belong_base AS base,product_categ_name AS category,pinxiang AS item,new_material_code AS sku,
      MAX(new_material_name) AS name,SUM(need_qty_origin) AS demand,SUM(outqty) AS shortage,COUNT(*) AS records,
      SUM(CASE WHEN need_qty_origin IS NULL OR outqty IS NULL OR need_qty_origin<0 OR outqty<0 OR outqty>need_qty_origin THEN 1 ELSE 0 END) AS invalid,
      COALESCE(SUM(is_ontime),0) AS ontime,COUNT(is_ontime) AS judged,COUNT(*)-COUNT(is_ontime) AS unjudged,
      SUM(CASE WHEN is_ontime IS NOT NULL AND is_ontime NOT IN (0,1) THEN 1 ELSE 0 END) AS invalid_judgment
      FROM agents_order_execute_isontime_mi
      WHERE fromorderno_month>=:gea_p1 AND fromorderno_month<:gea_p2
      GROUP BY belong_base,product_categ_name,pinxiang,new_material_code`,
  },
  changes: {
    keys: ['kind', 'region', 'province'],
    columns: ['kind', 'region', 'province', 'numerator', 'denominator', 'records'],
    sql: `SELECT order_typecode AS kind,region_name AS region,province_region_name AS province,
      SUM(COALESCE(cancel_qty,0)) AS numerator,SUM(COALESCE(order_qty,0)) AS denominator,COUNT(*) AS records
      FROM agents_order_cancel_change_di
      WHERE order_create_date>=:gea_p1 AND order_create_date<:gea_p2 AND order_typecode IN ('1','2')
      GROUP BY order_typecode,region_name,province_region_name`,
  },
  customers: {
    keys: ['region', 'province', 'customer'],
    columns: ['region', 'province', 'customer', 'name', 'numerator', 'denominator', 'records'],
    sql: `SELECT region_name AS region,province_region_name AS province,cust_code AS customer,MAX(cust_name) AS name,
      SUM(COALESCE(cancel_qty,0)) AS numerator,SUM(COALESCE(order_qty,0)) AS denominator,COUNT(*) AS records
      FROM agents_order_cancel_change_di
      WHERE order_create_date>=:gea_p1 AND order_create_date<:gea_p2 AND order_typecode='2'
      GROUP BY region_name,province_region_name,cust_code`,
  },
  stock: {
    keys: ['base', 'sku'],
    columns: [
      'base',
      'sku',
      'category',
      'item',
      'name',
      'stock_date',
      'source_rows',
      'available',
      'inventory',
      'aged',
      'sales_plan',
      'transfer_plan',
      'invalid',
    ],
    sql: `SELECT s.belong_base AS base,s.material_code AS sku,MAX(d.category) AS category,MAX(s.product_item) AS item,
      MAX(s.material_name) AS name,MAX(s.the_date) AS stock_date,COUNT(*) AS source_rows,
      SUM(s.available_stock) AS available,SUM(s.current_stock) AS inventory,SUM(s.current_stock_60) AS aged,
      SUM(s.roll_sales_plan) AS sales_plan,SUM(s.transfer_out_plan_roll) AS transfer_plan,
      SUM(CASE WHEN s.available_stock IS NULL OR s.available_stock<0 OR s.roll_sales_plan IS NULL OR s.roll_sales_plan<0
        OR s.transfer_out_plan_roll IS NULL OR s.transfer_out_plan_roll<0 THEN 1 ELSE 0 END) AS invalid
      FROM agents_scm_stock_detail_d s LEFT JOIN (${dictionary}) d ON d.sku=s.material_code
      WHERE s.the_date=(SELECT MAX(the_date) FROM agents_scm_stock_detail_d WHERE the_date>=:gea_p1 AND the_date<:gea_p2)
      GROUP BY s.belong_base,s.material_code`,
  },
  ageDate: {
    columns: ['day'],
    sql: `SELECT MAX(month_date) AS day FROM agents_scm_inventory_sku_data_d
      WHERE month_date>=:gea_p1 AND month_date<:gea_p2 AND warehouse_classify IN ('01','02')`,
  },
  ages: {
    keys: ['base', 'sku'],
    columns: [
      'base',
      'sku',
      'category',
      'item',
      'snapshot_date',
      'stock_qty',
      'aged_qty',
      'records',
      'excluded',
      'invalid',
    ],
    sql: `SELECT b.belong_base AS base,b.material_code AS sku,MAX(d.category) AS category,MAX(d.item) AS item,
      MAX(b.month_date) AS snapshot_date,
      SUM(CASE WHEN CAST(b.prod_date AS DATE) IS NOT NULL AND b.live_qty<>0 THEN b.live_qty ELSE 0 END) AS stock_qty,
      SUM(CASE WHEN CAST(b.prod_date AS DATE)<=:gea_p3 AND b.live_qty<>0 THEN b.live_qty ELSE 0 END) AS aged_qty,
      COUNT(*) AS records,SUM(CASE WHEN CAST(b.prod_date AS DATE) IS NULL OR b.live_qty=0 THEN 1 ELSE 0 END) AS excluded,
      SUM(CASE WHEN b.live_qty IS NULL OR (b.live_qty<>0 AND CAST(b.prod_date AS DATE)>:gea_p4) THEN 1 ELSE 0 END) AS invalid
      FROM agents_scm_inventory_sku_data_d b LEFT JOIN (${dictionary}) d ON d.sku=b.material_code
      WHERE b.month_date=:gea_p1 AND b.warehouse_classify IN ('01','02')
      GROUP BY b.belong_base,b.material_code`,
    omitEnd: true,
    extra: {
      gea_p3: { name: 'age_cutoff', type: 'string', required: true, format: 'YYYY-MM-DD' },
      gea_p4: { name: 'snapshot', type: 'string', required: true, format: 'YYYY-MM-DD' },
    },
  },
  directors: {
    keys: ['base', 'sku'],
    columns: ['base', 'sku', 'director', 'names'],
    sql: `SELECT belong_base AS base,material_code AS sku,MIN(NULLIF(director,'')) AS director,
      COUNT(DISTINCT NULLIF(director,'')) AS names FROM agents_scm_execute_detail_d
      WHERE header_addtime>=:gea_p1 AND header_addtime<:gea_p2 GROUP BY belong_base,material_code`,
  },
  customerManagers: {
    keys: ['customer'],
    columns: ['customer', 'manager', 'names'],
    sql: `SELECT cust_code AS customer,MIN(NULLIF(sales_person,'')) AS manager,
      COUNT(DISTINCT NULLIF(sales_person,'')) AS names FROM agents_scm_execute_detail_d
      WHERE header_addtime>=:gea_p1 AND header_addtime<:gea_p2 GROUP BY cust_code`,
  },
};

export function addWorkbenchQueries(config) {
  for (const [name, definition] of Object.entries(workbenchQueries)) {
    const id = 'workbench.' + name.toLowerCase();
    const parameterSpec = {
      gea_p1: { name: 'start', type: 'string', required: true },
      ...(definition.omitEnd
        ? {}
        : { gea_p2: { name: 'end_exclusive', type: 'string', required: true } }),
      ...definition.extra,
    };
    const make = (sql, spec, columns) => ({
      title: '订单工作台：' + name,
      parameterSpec: spec,
      request: {
        sql,
        parameters: Object.fromEntries(Object.keys(spec).map((key) => [key, null])),
        includeTotal: false,
      },
      resultColumns: columns,
    });
    if (!definition.keys) {
      config.queries[id] = make(definition.sql, parameterSpec, definition.columns);
      continue;
    }
    const countId = id + '.count';
    config.queries[countId] = make(
      'SELECT COUNT(*) AS total FROM (' + definition.sql + ') counted',
      parameterSpec,
      ['total'],
    );
    const pageSpec = {
      ...parameterSpec,
      gea_p1001: { name: 'page_size', type: 'integer', required: true, minimum: 1, maximum: 200 },
      gea_p1002: { name: 'offset', type: 'integer', required: true, minimum: 0 },
    };
    config.queries[id] = {
      ...make(
        definition.sql +
          ' ORDER BY ' +
          definition.keys.join(',') +
          ' LIMIT :gea_p1001 OFFSET :gea_p1002',
        pageSpec,
        definition.columns,
      ),
      pagination: { countQuery: countId },
    };
  }
  return config;
}
