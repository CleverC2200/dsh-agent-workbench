import { changesSql, customersSql, ordersSql, ontimeSql } from './document-queries.mjs';
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
      'missing_ship_date',
      'unmatched_order',
      'missing_trace',
      'missing_ship_time',
    ],
    sql: ordersSql,
    scoped: true,
  },
  ontime: {
    keys: ['order_no', 'customer'],
    columns: ['order_no', 'customer', 'ontime', 'arrival_date', 'invalid', 'members'],
    sql: ontimeSql,
    scoped: true,
  },
  changes: {
    keys: ['kind', 'region', 'province'],
    columns: ['kind', 'region', 'province', 'numerator', 'denominator', 'records', 'invalid'],
    sql: changesSql,
    scoped: true,
  },
  customers: {
    keys: ['region', 'province', 'customer'],
    columns: [
      'region',
      'province',
      'customer',
      'name',
      'numerator',
      'denominator',
      'records',
      'invalid',
    ],
    sql: customersSql,
    scoped: true,
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
      'daily_demand',
      'invalid',
    ],
    sql: `SELECT s.belong_base AS base,s.material_code AS sku,MAX(d.category) AS category,MAX(s.product_item) AS item,
      MAX(s.material_name) AS name,MAX(s.the_date) AS stock_date,COUNT(*) AS source_rows,
      SUM(s.available_stock) AS available,SUM(s.current_stock) AS inventory,SUM(s.current_stock_60) AS aged,
      SUM(CASE WHEN s.main_sales_plan_adj>0 THEN s.main_sales_plan_adj ELSE s.main_sales_plan_v1 END) AS sales_plan,
      SUM(CASE WHEN s.transfer_out_plan_adj>0 THEN s.transfer_out_plan_adj ELSE s.transfer_out_plan_v1 END) AS transfer_plan,
      NULL AS daily_demand,
      SUM(CASE WHEN s.current_stock IS NULL THEN 1 ELSE 0 END) AS invalid
      FROM agents_scm_stock_detail_d s LEFT JOIN (${dictionary}) d ON d.sku=s.material_code
      WHERE s.the_date=(SELECT MAX(the_date) FROM agents_scm_stock_detail_d WHERE the_date>=:gea_p1 AND the_date<:gea_p2)
      GROUP BY s.belong_base,s.material_code`,
  },
  ageDate: {
    columns: ['day'],
    sql: `SELECT MAX(month_date) AS day FROM agents_scm_inventory_sku_data_d
      WHERE month_date>=:gea_p1 AND month_date<:gea_p2`,
  },
  ages: {
    scoped: true,
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
    sql: `SELECT b.belong_base AS base,b.material_code AS sku,MAX(d.category) AS category,
        CASE WHEN MAX(s.names)>1 THEN NULL ELSE COALESCE(MAX(s.item),MAX(m.item)) END AS item,
      MAX(b.month_date) AS snapshot_date,
      SUM(b.live_qty) AS stock_qty,
      SUM(CASE WHEN CAST(b.prod_date AS DATE)<=:gea_p3 AND b.live_qty<>0 THEN b.live_qty ELSE 0 END) AS aged_qty,
      COUNT(*) AS records,SUM(CASE WHEN b.live_qty=0 THEN 1 ELSE 0 END) AS excluded,
      SUM(CASE WHEN b.live_qty IS NULL OR (b.live_qty<>0 AND (CAST(b.prod_date AS DATE) IS NULL OR CAST(b.prod_date AS DATE)>:gea_p4)) THEN 1 ELSE 0 END) AS invalid
      FROM agents_scm_inventory_sku_data_d b LEFT JOIN (${dictionary}) d ON d.sku=b.material_code
      LEFT JOIN (SELECT material_code AS sku,
        COUNT(DISTINCT NULLIF(TRIM(product_item),'')) AS names,
        CASE WHEN COUNT(DISTINCT NULLIF(TRIM(product_item),''))=1 THEN MAX(NULLIF(TRIM(product_item),'')) END AS item
        FROM agents_scm_stock_detail_d WHERE the_date=:gea_p4 GROUP BY material_code) s ON s.sku=b.material_code
      LEFT JOIN (SELECT new_material_code AS sku,
        CASE WHEN COUNT(DISTINCT NULLIF(TRIM(pinxiang),''))=1 THEN MAX(NULLIF(TRIM(pinxiang),'')) END AS item
        FROM agents_order_execute_isontime_mi WHERE fromorderno_month>=:gea_p5 AND fromorderno_month<:gea_p6
        GROUP BY new_material_code) m ON m.sku=b.material_code
      WHERE (:gea_p900='' OR b.belong_base=:gea_p900) AND b.month_date=:gea_p1
      GROUP BY b.belong_base,b.material_code`,
    omitEnd: true,
    extra: {
      gea_p3: { name: 'age_cutoff', type: 'string', required: true, format: 'YYYY-MM-DD' },
      gea_p4: { name: 'snapshot', type: 'string', required: true, format: 'YYYY-MM-DD' },
      gea_p5: { name: 'mapping_start', type: 'string', required: true, format: 'YYYY-MM-DD' },
      gea_p6: { name: 'mapping_end', type: 'string', required: true, format: 'YYYY-MM-DD' },
    },
  },
  directors: {
    keys: ['base', 'sku'],
    columns: ['base', 'sku', 'director', 'names', 'directors'],
    sql: `SELECT belong_base AS base,material_code AS sku,MIN(NULLIF(director,'')) AS director,
      COUNT(DISTINCT NULLIF(TRIM(director),'')) AS names,
      ARRAY_AGG(DISTINCT NULLIF(TRIM(director),'')) AS directors FROM agents_scm_execute_detail_hourly_d
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
  for (const [name, original] of Object.entries(workbenchQueries)) {
    const definition = { ...original };
    const alias = name === 'stock' ? 's.' : name === 'ages' ? 'b.' : '';
    if (!definition.scoped)
      definition.sql = definition.sql.replace(
        name === 'stock' ? 'WHERE s.the_date=' : 'WHERE ',
        "WHERE (:gea_p900 = '' OR " +
          alias +
          'belong_base = :gea_p900) AND ' +
          (name === 'stock' ? 's.the_date=' : ''),
      );
    const id = 'workbench.' + name.toLowerCase();
    const parameterSpec = {
      gea_p900: { name: 'report_base', type: 'string', required: false },
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
