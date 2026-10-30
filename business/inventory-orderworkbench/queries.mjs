import { changesSql, customersSql, ordersSql, ontimeSql } from './document-queries.mjs';
const attributionSources = `SELECT belong_base,material_code,director,product_item,header_addtime AS attribution_date FROM agents_scm_execute_detail_d
        UNION ALL SELECT belong_base,material_code,director,product_item,header_addtime AS attribution_date FROM agents_scm_execute_detail_hourly_d
        UNION ALL SELECT belong_base,material_code,NULL AS director,product_item,the_date AS attribution_date FROM agents_scm_stock_detail_d
        UNION ALL SELECT belong_base,new_material_code AS material_code,NULL AS director,pinxiang AS product_item,fromorderno_month AS attribution_date FROM agents_order_execute_isontime_mi`;

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
      'sample_demand',
      'sample_shortage',
      'sample_records',
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
    columns: [
      'kind',
      'region',
      'province',
      'numerator',
      'denominator',
      'records',
      'invalid',
      'sample_numerator',
      'sample_denominator',
      'sample_records',
    ],
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
      'national_inventory',
      'national_sales_plan',
      'national_stock_records',
      'national_plan_records',
      'national_stock_invalid',
      'national_plan_invalid',
    ],
    sql: `SELECT COALESCE(s.belong_base,b.belong_base) AS base,COALESCE(s.material_code,b.material_code) AS sku,
      d.category,COALESCE(s.item,b.item) AS item,COALESCE(s.name,b.name) AS name,
      COALESCE(b.stock_date,s.stock_date) AS stock_date,s.source_rows,b.available,b.inventory,b.aged,s.sales_plan,s.transfer_plan,
      NULL AS daily_demand,
      b.inventory AS national_inventory,s.sales_plan AS national_sales_plan,
      CASE WHEN b.stock_date IS NOT NULL THEN 1 ELSE 0 END AS national_stock_records,
      CASE WHEN s.source_rows IS NOT NULL THEN 1 ELSE 0 END AS national_plan_records,
      COALESCE(b.invalid,0) AS national_stock_invalid,
      CASE WHEN s.source_rows>1 THEN 1 ELSE COALESCE(s.sales_invalid,0) END AS national_plan_invalid,
      CASE WHEN b.inventory IS NULL OR b.invalid>0 OR s.source_rows IS NULL THEN 1 ELSE 0 END AS invalid
      FROM (SELECT belong_base,material_code,MAX(product_item) AS item,MAX(material_name) AS name,
        COUNT(*) AS source_rows,CAST(MAX(the_date) AS CHAR) AS stock_date,
        SUM(CASE WHEN (CASE WHEN main_sales_plan_adj>0 THEN main_sales_plan_adj ELSE main_sales_plan_v1 END) IS NULL
          OR (CASE WHEN main_sales_plan_adj>0 THEN main_sales_plan_adj ELSE main_sales_plan_v1 END)<0 THEN 1 ELSE 0 END) AS sales_invalid,
        SUM(CASE WHEN main_sales_plan_adj>0 THEN main_sales_plan_adj ELSE main_sales_plan_v1 END) AS sales_plan,
        SUM(CASE WHEN transfer_out_plan_adj>0 THEN transfer_out_plan_adj ELSE transfer_out_plan_v1 END) AS transfer_plan
        FROM agents_scm_stock_detail_d
        WHERE the_date=(SELECT MAX(the_date) FROM agents_scm_stock_detail_d WHERE the_date>=:gea_p1 AND the_date<:gea_p2)
        GROUP BY belong_base,material_code) s
      FULL OUTER JOIN (SELECT belong_base,material_code,MAX(material_name) AS name,NULL AS item,
        CONCAT(SUBSTRING(MAX(month_date),1,4),'-',SUBSTRING(MAX(month_date),5,2),'-',SUBSTRING(MAX(month_date),7,2)) AS stock_date,
        SUM(available_qty) AS available,SUM(live_qty) AS inventory,
        NULL AS aged,SUM(CASE WHEN live_qty IS NULL THEN 1 ELSE 0 END) AS invalid
        FROM agents_scm_inventory_sku_data_d
        WHERE warehouse_classify IN ('01','02') AND warehouse_classify_name IN ('工厂成品仓','工厂外租库')
          AND month_date=REPLACE(CAST((SELECT MAX(the_date) FROM agents_scm_stock_detail_d WHERE the_date>=:gea_p1 AND the_date<:gea_p2) AS CHAR),'-','')
        GROUP BY belong_base,material_code) b ON b.belong_base=s.belong_base AND b.material_code=s.material_code
      LEFT JOIN (${dictionary}) d ON d.sku=COALESCE(s.material_code,b.material_code)`,
  },
  ageDate: {
    columns: ['day'],
    sql: `SELECT MAX(month_date) AS day FROM agents_scm_inventory_sku_data_d
      WHERE warehouse_classify IN ('01','02') AND warehouse_classify_name IN ('工厂成品仓','工厂外租库') AND month_date>=:gea_p1 AND month_date<:gea_p2`,
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
      WHERE (:gea_p900='' OR b.belong_base=:gea_p900) AND b.month_date=:gea_p1 AND b.warehouse_classify IN ('01','02') AND b.warehouse_classify_name IN ('工厂成品仓','工厂外租库')
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
    columns: ['base', 'sku', 'director', 'names', 'item', 'items', 'directors'],
    sql: `SELECT d.belong_base AS base,d.material_code AS sku,
      MIN(NULLIF(TRIM(d.director),'')) AS director,
      COUNT(DISTINCT NULLIF(TRIM(d.director),'')) AS names,
      ARRAY_AGG(DISTINCT NULLIF(TRIM(d.director),'')) AS directors,
      CASE WHEN COUNT(DISTINCT NULLIF(TRIM(d.product_item),''))=1 THEN MAX(NULLIF(TRIM(d.product_item),'')) END AS item,
      COUNT(DISTINCT NULLIF(TRIM(d.product_item),'')) AS items
      FROM (
        ${attributionSources}
      ) d WHERE NULLIF(TRIM(d.belong_base),'') IS NOT NULL AND NULLIF(TRIM(d.material_code),'') IS NOT NULL
        AND d.attribution_date>=:gea_p1 AND d.attribution_date<:gea_p2
      GROUP BY d.belong_base,d.material_code`,
  },
  items: {
    keys: ['sku'],
    columns: ['sku', 'item', 'names'],
    sql: `SELECT d.material_code AS sku,
      CASE WHEN COUNT(DISTINCT NULLIF(TRIM(d.product_item),''))=1 THEN MAX(NULLIF(TRIM(d.product_item),'')) END AS item,
      COUNT(DISTINCT NULLIF(TRIM(d.product_item),'')) AS names
      FROM (${attributionSources}) d WHERE NULLIF(TRIM(d.material_code),'') IS NOT NULL
        AND d.attribution_date>=:gea_p1 AND d.attribution_date<:gea_p2
      GROUP BY d.material_code`,
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
    const alias =
      name === 'stock'
        ? 's.'
        : name === 'ages'
          ? 'b.'
          : ['directors', 'items'].includes(name)
            ? 'd.'
            : '';
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
