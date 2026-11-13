import {
  ontimeSummarySql,
  ontimePeriodSummarySql,
  ontimeGeographySummarySql,
} from './document-queries.mjs';
import { rowPacketSql } from '../shared/row-packets.mjs';
import { addPeriodSummaryQuery } from './period-summary-queries.mjs';
import {
  amendmentDimensionEventsSql,
  cancellationDimensionEventsSql,
} from './document-queries.mjs';
import { aggregateAmendmentSql } from './sku-amendments.mjs';
import { aggregateCancellationSql } from './sku-cancellations.mjs';

export function addWorkbenchSummaryQueries(config) {
  const names = ['orders', 'orders.customers', 'stock', 'ages'].filter(
    (name) => config.queries['workbench.' + name],
  );
  const raw = (name) => {
    const sql = config.queries['workbench.' + name].request.sql;

    return sql.endsWith(' LIMIT :gea_p1001 OFFSET :gea_p1002')
      ? sql.slice(0, sql.lastIndexOf(' ORDER BY '))
      : sql;
  };
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
  for (const [name, events] of [
    ['amendment', amendmentDimensionEventsSql],
    ['cancellation', cancellationDimensionEventsSql],
  ]) {
    if (!config.queries['workbench.changes.' + name]) continue;
    const fields =
      name === 'amendment'
        ? [
            'base',
            'cust_code',
            'cust_order_no',
            'material_code',
            'name',
            'region',
            'province',
            'change_numerator',
            'change_denominator',
            'invalid_denominator',
            'invalid_change',
            'unknown_quantity',
          ]
        : [
            'base',
            'cust_code',
            'cust_order_no',
            'executeorderno',
            'executeorderlineno',
            'material_code',
            'name',
            'region',
            'province',
            'cancel_numerator',
            'cancel_denominator',
            'invalid_cancel',
          ];
    const mapped = `SELECT ${fields.map((field) => 'e.' + field).join(',')},${mappedItem} AS item FROM (${events}) e
      LEFT JOIN (${owner}) own ON own.base=e.base AND own.sku=e.material_code
      LEFT JOIN (${sharedItems}) shared ON shared.sku=e.material_code`;
    const sql =
      name === 'amendment'
        ? aggregateAmendmentSql(mapped, false, false, ['base', 'item'])
        : aggregateCancellationSql(mapped, { dimensions: ['base', 'item'] });
    const original = config.queries['workbench.changes.' + name];
    register(
      'workbench.changes.' + name + '.groups',
      sql,
      original,
      ['base', 'item', ...original.resultColumns.filter((field) => field !== 'base')],
      ['base', 'item', 'kind', 'region', 'province'],
    );
    const fieldsByDimension = {
      item: mappedItem,
      category: 'dictionary.category',
      director: 'CASE WHEN own.names=1 THEN own.director END',
      sku: 'e.material_code',
      customer: 'e.cust_code',
    };
    const masks = Object.keys(fieldsByDimension);
    const projected = Object.entries(fieldsByDimension).map(
      ([field, expression], index) =>
        `CASE WHEN :gea_p${750 + index} THEN ${expression} END AS ${field}`,
    );
    const dimensionRows = `SELECT ${fields.map((field) => 'e.' + field).join(',')},${projected.join(',')},
      CASE WHEN :gea_p752 AND own.names=1 THEN 1 ELSE 0 END AS names
      FROM (${events}) e LEFT JOIN (${owner}) own ON own.base=e.base AND own.sku=e.material_code
      LEFT JOIN (${sharedItems}) shared ON shared.sku=e.material_code
      LEFT JOIN (SELECT material_code,CASE WHEN COUNT(DISTINCT product_categ_name)=1 THEN MAX(product_categ_name) END AS category
        FROM agents_scm_material_in_out_summary_d GROUP BY material_code) dictionary ON dictionary.material_code=e.material_code`;
    const dimensionKeys = ['base', ...masks, 'names'];
    const dimensionAggregate =
      name === 'amendment'
        ? aggregateAmendmentSql(dimensionRows, false, false, dimensionKeys)
        : aggregateCancellationSql(dimensionRows, { dimensions: dimensionKeys });
    const dimensionColumns = [
      ...dimensionKeys,
      ...original.resultColumns.filter((field) => !dimensionKeys.includes(field)),
      'summary',
    ];
    const dimensionSql = `SELECT ${dimensionColumns.filter((field) => field !== 'summary').join(',')},1 AS summary FROM (${dimensionAggregate}) mapped_dimensions`;
    const dimensionSpec = {
      ...original,
      parameterSpec: {
        ...original.parameterSpec,
        ...Object.fromEntries(
          masks.map((field, index) => [
            'gea_p' + (750 + index),
            { name: 'group_' + field, type: 'boolean', required: true },
          ]),
        ),
      },
    };
    register(
      'workbench.changes.' + name + '.dimensions',
      dimensionSql,
      dimensionSpec,
      dimensionColumns,
      [...dimensionKeys, 'kind', 'region', 'province'],
    );
    const packets = rowPacketSql(dimensionSql, dimensionColumns, [
      ...dimensionKeys,
      'kind',
      'region',
      'province',
    ]);
    register(
      'workbench.changes.' + name + '.dimensions.packets',
      packets.slice(0, packets.lastIndexOf(' ORDER BY ')),
      dimensionSpec,
      ['packet_index', 'packet_count', 'packet_scope_total', 'packet_rows'],
      ['packet_index'],
    );
  }
  const directors = config.queries['workbench.directormembers'];
  for (const [name, keys] of [
    ['customers', ['region', 'province', 'customer']],
    ['customermanagers', ['customer']],
  ]) {
    const original = config.queries['workbench.' + name];
    if (!original?.pagination?.countQuery) continue;
    const count = config.queries[original.pagination.countQuery];
    const packets = rowPacketSql(raw(name), original.resultColumns, keys);
    const id = 'workbench.' + name + '.packets';
    config.queries[id + '.count'] = {
      ...count,
      request: { ...count.request, sql: 'SELECT COUNT(*) AS total FROM (' + packets + ') counted' },
      resultColumns: ['total'],
    };
    config.queries[id] = {
      ...original,
      request: { ...original.request, sql: packets + ' LIMIT :gea_p1001 OFFSET :gea_p1002' },
      resultColumns: ['packet_index', 'packet_count', 'packet_scope_total', 'packet_rows'],
      pagination: { countQuery: id + '.count' },
    };
  }
  if (directors?.pagination?.countQuery) {
    const directorPackets = rowPacketSql(raw('directormembers'), directors.resultColumns, [
      'base',
      'sku',
      'director_value',
      'item_value',
    ]);
    const directorCount = config.queries[directors.pagination.countQuery];
    config.queries['workbench.directors.packets.count'] = {
      ...directorCount,
      request: {
        ...directorCount.request,
        sql: 'SELECT COUNT(*) AS total FROM (' + directorPackets + ') counted',
      },
    };
    config.queries['workbench.directors.packets'] = {
      ...directors,
      request: {
        ...directors.request,
        sql: directorPackets + ' LIMIT :gea_p1001 OFFSET :gea_p1002',
      },
      resultColumns: ['packet_index', 'packet_count', 'packet_scope_total', 'packet_rows'],
      pagination: { countQuery: 'workbench.directors.packets.count' },
    };
  }

  if (config.queries['workbench.ontime'])
    register(
      'workbench.ontime.geography.summary',
      ontimeGeographySummarySql,
      config.queries['workbench.ontime'],
      ['base', 'invalid', 'ontime', 'packed_orders'],
      ['base', 'invalid', 'ontime'],
    );
  if (config.queries['workbench.ontime'])
    register(
      'workbench.ontime.summary',
      ontimeSummarySql,
      config.queries['workbench.ontime'],
      ['base', 'invalid', 'ontime', 'packed_orders'],
      ['base', 'invalid', 'ontime'],
    );
  if (config.queries['workbench.ontime']) {
    const parameterSpec = { ...config.queries['workbench.ontime'].parameterSpec };
    for (let index = 0; index < 6; index++) {
      parameterSpec['gea_p' + (810 + index * 3)] = {
        name: `period_${index}_start`,
        type: 'string',
        format: 'YYYY-MM-DD',
      };
      parameterSpec['gea_p' + (811 + index * 3)] = {
        name: `period_${index}_end`,
        type: 'string',
        format: 'YYYY-MM-DD',
      };
      parameterSpec['gea_p' + (812 + index * 3)] = {
        name: `period_${index}_enabled`,
        type: 'boolean',
      };
    }
    register(
      'workbench.ontime.periods.summary',
      ontimePeriodSummarySql,
      { ...config.queries['workbench.ontime'], parameterSpec },
      ['period_index', 'base', 'invalid', 'ontime', 'packed_orders'],
      ['period_index', 'base', 'invalid', 'ontime'],
    );
  }
  for (const name of names) {
    const original = config.queries['workbench.' + name];
    const item = name === 'ages' ? mappedItem : "COALESCE(NULLIF(q.item,'')," + mappedItem + ')';
    const director = 'CASE WHEN own.names=1 THEN own.director ELSE NULL END';
    const known = 'CASE WHEN own.names=1 THEN 1 ELSE 0 END';
    const sharedSku = "CASE WHEN q.base='郑州' AND own.names>1 THEN q.sku ELSE NULL END";
    const group = [
      'q.base',
      'q.category',
      item,
      director,
      known,
      sharedSku,
      ...(name === 'orders.customers' ? ['q.customer', 'q.region', 'q.province'] : []),
    ];
    const fields = original.resultColumns.map((field) => {
      if (field === 'base' || field === 'category') return 'q.' + field + ' AS ' + field;
      if (['customer', 'region', 'province'].includes(field)) return 'q.' + field + ' AS ' + field;
      if (field === 'item') return item + ' AS item';
      if (field === 'sku') return sharedSku + ' AS sku';
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
      if (field === 'plan_month_offset')
        return 'CASE WHEN COUNT(q.plan_month_offset)=COUNT(*) AND MIN(q.plan_month_offset)=MAX(q.plan_month_offset) THEN MAX(q.plan_month_offset) END AS plan_month_offset';
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
      [
        'base',
        'category',
        'item',
        'director',
        'names',
        'sku',
        ...(name === 'orders.customers' ? ['customer', 'region', 'province'] : []),
      ],
    );
    if (config.queries['workbench.ontime.periods.summary'])
      addPeriodSummaryQuery(config, name, fields, group, [
        ...original.resultColumns,
        'director',
        'names',
        'summary',
        ...extra,
      ]);
    if (name === 'stock') {
      register(
        'workbench.stock.summary.packets',
        rowPacketSql(
          sql,
          [...original.resultColumns, 'director', 'names', 'summary', ...extra],
          ['base', 'category', 'item', 'director', 'names', 'sku'],
        ).replace(/ ORDER BY packet_index$/, ''),
        original,
        ['packet_index', 'packet_count', 'packet_scope_total', 'packet_rows'],
        ['packet_index'],
      );
    }
  }
  const rawAges = raw('ages').replace(/:gea_p1\b/g, ':gea_p705');
  const snapshotStock = raw('stock').replace(/:gea_p2\b/g, ':gea_p709');
  const keys = `SELECT DISTINCT base,sku FROM (SELECT base,sku,category FROM (${raw('orders')}) ko UNION ALL SELECT base,sku,category FROM (${snapshotStock}) ks UNION ALL SELECT base,sku,category FROM (${rawAges}) ka WHERE COALESCE(stock_qty,0)<>0 OR COALESCE(invalid,0)<>0) all_keys WHERE COALESCE(NULLIF(category,''),'未映射')=:gea_p706`;
  const pageSpec = {
    ...config.queries['workbench.orders'],
    parameterSpec: {
      ...config.queries['workbench.orders'].parameterSpec,
      ...config.queries['workbench.ages'].parameterSpec,
      ...extras,
      gea_p705: { name: 'batch_start', type: 'string', required: true },
      gea_p706: { name: 'category', type: 'string', required: true },
      gea_p709: { name: 'inventory_end_exclusive', type: 'string', required: true },
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
      (name === 'ages' ? rawAges : name === 'stock' ? snapshotStock : raw(name)) +
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
  if (config.queries['workbench.ontime.periods.summary']) addPeriodSummaryQuery(config, 'changes');
  return config;
}
