import { ontimeSummarySql } from './document-queries.mjs';
/** Derive summaries and bounded SKU pages from the same scoped, validated SKU queries. */
export function addWorkbenchSummaryQueries(config) {
  const names = ['orders', 'stock', 'ages'];
  const raw = (name) => config.queries['workbench.' + name].request.sql.split(' ORDER BY ')[0];
  const owner = raw('directors')
    .replace(/:gea_p1\b/g, ':gea_p703')
    .replace(/:gea_p2\b/g, ':gea_p704');

  const sharedItems = raw('items')
    .replace(/:gea_p1\b/g, ':gea_p703')
    .replace(/:gea_p2\b/g, ':gea_p704');
  const mappedItem =
    'CASE WHEN own.items=1 THEN own.item WHEN own.items>1 THEN NULL WHEN shared.names=1 THEN shared.item ELSE NULL END';
  const grouped = {};
  const extras = {
    gea_p701: { name: 'period_start', type: 'string', required: true },
    gea_p702: { name: 'period_end', type: 'string', required: true },
    gea_p703: { name: 'owner_start', type: 'string', required: true },
    gea_p704: { name: 'owner_end', type: 'string', required: true },
  };
  function register(id, sql, original, columns, keys) {
    const spec = { ...original.parameterSpec, ...extras };
    config.queries[id + '.count'] = {
      title: id + ' count',
      parameterSpec: spec,
      request: {
        sql: 'SELECT COUNT(*) AS total FROM (' + sql + ') counted',
        parameters: Object.fromEntries(Object.keys(spec).map((k) => [k, null])),
        includeTotal: false,
      },
      resultColumns: ['total'],
    };
    config.queries[id] = {
      title: id,
      parameterSpec: spec,
      request: {
        sql: sql + ' ORDER BY ' + keys.join(',') + ' LIMIT :gea_p1001 OFFSET :gea_p1002',
        parameters: Object.fromEntries(Object.keys(spec).map((k) => [k, null])),
        includeTotal: false,
      },
      resultColumns: columns,
      pagination: { countQuery: id + '.count' },
    };
  }
  // Keep every whole-order verdict and its dimensions, but transport them in
  // a few packets instead of re-running the same arrival query for 200 orders per page.
  if (config.queries['workbench.ontime'])
    register(
      'workbench.ontime.summary',
      ontimeSummarySql,
      config.queries['workbench.ontime'],
      ['base', 'invalid', 'ontime', 'packed_orders'],
      ['base', 'invalid', 'ontime'],
    );
  for (const name of names) {
    const original = config.queries['workbench.' + name];
    const item = name === 'ages' ? mappedItem : "COALESCE(NULLIF(q.item,'')," + mappedItem + ')';
    const director = 'CASE WHEN own.names=1 THEN own.director ELSE NULL END';
    const known = 'CASE WHEN own.names=1 THEN 1 ELSE 0 END';
    const group = ['q.base', 'q.category', item, director, known];
    const fields = original.resultColumns.map((field) => {
      if (field === 'base' || field === 'category') return 'q.' + field + ' AS ' + field;
      if (field === 'item') return item + ' AS item';
      if (field === 'sku') return 'NULL AS sku';
      if (
        name === 'stock' &&
        ['available', 'inventory', 'sales_plan', 'transfer_plan'].includes(field)
      )
        return (
          'CASE WHEN COUNT(q.' +
          field +
          ')=COUNT(*)' +
          (['sales_plan', 'transfer_plan'].includes(field) ? ' AND MIN(q.' + field + ')>=0' : '') +
          ' THEN SUM(q.' +
          field +
          ') END AS ' +
          field
        );

      if (['name', 'stock_date', 'snapshot_date'].includes(field))
        return 'MAX(q.' + field + ') AS ' + field;
      if (field === 'source_rows')
        return 'CASE WHEN MIN(q.source_rows)=1 AND MAX(q.source_rows)=1 THEN 1 ELSE 0 END AS source_rows';
      return 'SUM(COALESCE(q.' + field + ',0)) AS ' + field;
    });
    const extra = [];
    if (name === 'stock')
      for (const field of ['available', 'inventory', 'sales_plan', 'transfer_plan']) {
        extra.push('missing_' + field);
        fields.push('SUM(CASE WHEN q.' + field + ' IS NULL THEN 1 ELSE 0 END) AS missing_' + field);
      }
    if (name === 'ages') {
      extra.push('active_records');
      fields.push(
        'SUM(CASE WHEN COALESCE(q.stock_qty,0)<>0 OR COALESCE(q.invalid,0)<>0 THEN 1 ELSE 0 END) AS active_records',
      );
    }
    fields.push(director + ' AS director', known + ' AS names', '1 AS summary');
    const sql =
      'SELECT ' +
      fields.join(',') +
      ' FROM (' +
      raw(name) +
      ') q ' +
      'LEFT JOIN (' +
      owner +
      ') own ON own.base=q.base AND own.sku=q.sku LEFT JOIN (' +
      sharedItems +
      ') shared ON shared.sku=q.sku GROUP BY ' +
      group.join(',');
    grouped[name] = sql;
    register(
      'workbench.' + name + '.summary',
      sql,
      original,
      [...original.resultColumns, 'director', 'names', 'summary', ...extra],
      ['base', 'category', 'item', 'director', 'names'],
    );
  }
  const rawAges = raw('ages').replace(/:gea_p1\b/g, ':gea_p705');
  const keys = `SELECT DISTINCT base,sku FROM (SELECT base,sku,category FROM (${raw('orders')}) ko UNION ALL SELECT base,sku,category FROM (${raw('stock')}) ks UNION ALL SELECT base,sku,category FROM (${rawAges}) ka WHERE COALESCE(stock_qty,0)<>0 OR COALESCE(invalid,0)<>0) all_keys WHERE COALESCE(NULLIF(category,''),'未映射')=:gea_p706`;
  const pageSpec = {
    ...config.queries['workbench.orders'],
    parameterSpec: {
      ...config.queries['workbench.orders'].parameterSpec,
      ...config.queries['workbench.ages'].parameterSpec,
      ...extras,
      gea_p705: { name: 'batch_start', type: 'string', required: true },
      gea_p706: { name: 'category', type: 'string', required: true },
    },
  };
  register('workbench.sku.keys', keys, pageSpec, ['base', 'sku'], ['base', 'sku']);
  const pageKeys = keys + ' ORDER BY base,sku LIMIT :gea_p707 OFFSET :gea_p708';
  for (const name of names) {
    const original = config.queries['workbench.' + name];
    const sql =
      'SELECT ' +
      original.resultColumns
        .map((field) =>
          field === 'item'
            ? name === 'ages'
              ? mappedItem + ' AS item'
              : "COALESCE(NULLIF(q.item,'')," + mappedItem + ') AS item'
            : 'q.' + field,
        )
        .join(',') +
      ' FROM (' +
      (name === 'ages' ? rawAges : raw(name)) +
      ') q JOIN (' +
      pageKeys +
      ') selected ON selected.base=q.base AND selected.sku=q.sku LEFT JOIN (' +
      owner +
      ') own ON own.base=q.base AND own.sku=q.sku LEFT JOIN (' +
      sharedItems +
      ') shared ON shared.sku=q.sku';
    const spec = {
      ...pageSpec,
      parameterSpec: {
        ...pageSpec.parameterSpec,
        gea_p707: {
          name: 'sku_page_size',
          type: 'integer',
          required: true,
          minimum: 1,
          maximum: 20,
        },
        gea_p708: { name: 'sku_offset', type: 'integer', required: true, minimum: 0 },
      },
    };
    register(
      'workbench.' + name + '.page',
      sql,
      spec,
      original.resultColumns,
      name === 'orders' ? ['base', 'category', 'item', 'sku'] : ['base', 'sku'],
    );
  }
  return config;
}
