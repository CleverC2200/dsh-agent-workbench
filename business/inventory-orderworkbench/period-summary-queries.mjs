import { workbenchQueryParts as parts, workbenchQueries } from './queries.mjs';
import { ordersSql, periodChangesSql } from './document-queries.mjs';
import { rowPacketSql } from '../shared/row-packets.mjs';
import { cancellationPartitionSql } from './cancellation-partitions.mjs';
import {
  workbenchPeriodPacketSize,
  workbenchDirectorPeriodColumns,
} from './period-summary-contract.mjs';

const windows = Array.from({ length: 6 }, (_, index) => ({
  index,
  start: ':gea_p' + (810 + index * 3),
  end: ':gea_p' + (811 + index * 3),
  enabled: ':gea_p' + (812 + index * 3),
  inventoryEnd: ':gea_p' + (830 + index),
  directorStart: ':gea_p' + (836 + index),
  stock: ':gea_p' + (850 + index * 5),
  age: ':gea_p' + (851 + index * 5),
  ageDate: ':gea_p' + (852 + index * 5),
  mappingStart: ':gea_p' + (853 + index * 5),
  mappingEnd: ':gea_p' + (854 + index * 5),
}));
const orWindows = (predicate) =>
  '(' +
  windows.map((window) => `(${window.enabled}=TRUE AND ${predicate(window)})`).join(' OR ') +
  ')';
const inWindows = (field) =>
  orWindows((window) => `${field}>=${window.start} AND ${field}<${window.end}`);
const compact = (value) => `REPLACE(${value},'-','')`;
const ageInWindows = (field) =>
  orWindows(
    (window) => `${field}>=${compact(window.start)} AND ${field}<${compact(window.inventoryEnd)}`,
  );
const list = (field) => windows.map((window) => window[field]).join(',');
const windowCte = `report_windows AS (${windows
  .map(
    (window) =>
      `SELECT ${window.index} AS period_index,${window.start} AS start_date,${window.end} AS end_date,
    ${window.enabled} AS enabled,${window.directorStart} AS director_start,${window.stock} AS stock_date,${window.age} AS age_day,
    ${window.ageDate} AS age_date,${window.mappingStart} AS mapping_start,${window.mappingEnd} AS mapping_end`,
  )
  .join(' UNION ALL ')})`;
const replace = (sql, from, to) => {
  if (!sql.includes(from)) throw Error('WORKBENCH_PERIOD_SOURCE_CHANGED: ' + from);
  return sql.replaceAll(from, to);
};
const ownerWindow = (field) =>
  orWindows(
    (window) => `${field}>=CONCAT(SUBSTRING(${window.start},1,7),'-01') AND ${field}<${window.end}`,
  );
const attributionSource = parts.attributionSources
  .replaceAll('header_addtime>=:gea_p1 AND header_addtime<:gea_p2', ownerWindow('header_addtime'))
  .replaceAll(
    'd.order_close_time>=:gea_p1 AND d.order_close_time<:gea_p2',
    ownerWindow('d.order_close_time'),
  )
  .replaceAll('the_date>=:gea_p1 AND the_date<:gea_p2', ownerWindow('the_date'))
  .replaceAll(
    'fromorderno_month>=:gea_p1 AND fromorderno_month<:gea_p2',
    ownerWindow('fromorderno_month'),
  );
const ownerCtes = `period_members AS (
  SELECT DISTINCT rw.period_index,d.belong_base AS base,d.material_code AS sku,
    NULLIF(TRIM(d.director),'') AS director,NULLIF(TRIM(d.product_item),'') AS item
  FROM (${attributionSource}) d INNER JOIN report_windows rw
    ON rw.enabled=TRUE AND d.attribution_date>=rw.start_date AND d.attribution_date<rw.end_date
  WHERE (:gea_p900='' OR d.belong_base=:gea_p900) AND NULLIF(TRIM(d.material_code),'') IS NOT NULL
),period_owners AS (
  SELECT period_index,base,sku,MIN(director) AS director,COUNT(DISTINCT director) AS names,
    CASE WHEN COUNT(DISTINCT item)=1 THEN MAX(item) END AS item,COUNT(DISTINCT item) AS items
  FROM period_members WHERE NULLIF(TRIM(base),'') IS NOT NULL GROUP BY period_index,base,sku
),period_items AS (
  SELECT period_index,sku,CASE WHEN COUNT(DISTINCT item)=1 THEN MAX(item) END AS item,
    COUNT(DISTINCT item) AS names FROM period_members GROUP BY period_index,sku
)`;

function periodOrders() {
  let sql = replace(
    ordersSql,
    'HAVING MAX(fromorderno_month)>=:gea_p1 AND MIN(fromorderno_month)<:gea_p2',
    'HAVING ' +
      orWindows(
        (window) =>
          `MAX(fromorderno_month)>=${window.start} AND MIN(fromorderno_month)<${window.end}`,
      ),
  );
  sql = replace(sql, 'SELECT m.base,m.category', 'SELECT rw.period_index,m.base,m.category');
  sql = replace(
    sql,
    'WHERE m.period_end>=:gea_p1 AND m.period_start<:gea_p2',
    'INNER JOIN report_windows rw ON rw.enabled=TRUE AND m.period_end>=rw.start_date AND m.period_start<rw.end_date',
  );
  return replace(
    sql,
    'GROUP BY m.base,m.category,m.item,m.sku',
    'GROUP BY rw.period_index,m.base,m.category,m.item,m.sku',
  );
}

function periodStock() {
  // stock_date already identifies each snapshot; extra batch_date projections
  // inside these CTEs are rejected by the gateway's published-field analysis.
  let plans = parts.stockPlans;
  plans = replace(
    plans,
    'the_date=(SELECT MAX(the_date) FROM agents_scm_stock_detail_d WHERE the_date>=:gea_p1 AND the_date<:gea_p2)',
    `the_date IN (${list('stock')})`,
  );
  plans = replace(
    plans,
    'GROUP BY belong_base,material_code',
    'GROUP BY the_date,belong_base,material_code',
  );
  let batches = parts.stockBatches;
  batches = replace(
    batches,
    "month_date=REPLACE(CAST((SELECT MAX(the_date) FROM agents_scm_stock_detail_d WHERE the_date>=:gea_p1 AND the_date<:gea_p2) AS CHAR),'-','')",
    `month_date IN (${windows.map((window) => compact(window.stock)).join(',')})`,
  );
  batches = replace(
    batches,
    'GROUP BY belong_base,material_code',
    'GROUP BY month_date,belong_base,material_code',
  );
  const arm = (inventoryOnly) =>
    replace(
      replace(
        parts.stockJoin(inventoryOnly, true),
        'SELECT COALESCE(s.belong_base,b.belong_base)',
        'SELECT COALESCE(s.stock_date,b.stock_date) AS batch_date,COALESCE(s.belong_base,b.belong_base)',
      ),
      'ON (b.belong_base=s.belong_base OR (b.belong_base IS NULL AND s.belong_base IS NULL)) AND b.material_code=s.material_code',
      'ON (b.belong_base=s.belong_base OR (b.belong_base IS NULL AND s.belong_base IS NULL)) AND b.material_code=s.material_code AND b.stock_date=s.stock_date',
    );
  return {
    ctes: `stock_plans AS (${plans}),stock_batches AS (${batches}),stock_dictionary AS (${parts.dictionary})`,
    sql: `SELECT rw.period_index,${workbenchQueries.stock.columns.map((column) => 'snapshot.' + column).join(',')} FROM (${arm(false)} UNION ALL ${arm(true)}) snapshot
      INNER JOIN report_windows rw ON rw.enabled=TRUE AND snapshot.batch_date=rw.stock_date`,
  };
}

function periodAges() {
  let sql = replace(
    workbenchQueries.ages.sql,
    `SELECT ${parts.ageBase} AS base,`,
    `SELECT b.dt AS batch_date,${parts.ageBase} AS base,`,
  );
  sql = replace(sql, 'b.dt=:gea_p1', `b.dt IN (${list('age')})`);
  sql = replace(
    sql,
    'SELECT material_code AS sku,\n        COUNT',
    'SELECT the_date AS snapshot_date,material_code AS sku,\n        COUNT',
  );
  sql = replace(
    sql,
    'WHERE the_date=:gea_p4 GROUP BY material_code',
    `WHERE the_date IN (${list('ageDate')}) GROUP BY the_date,material_code`,
  );
  sql = replace(
    sql,
    's ON s.sku=b.material_code',
    "s ON s.sku=b.material_code AND REPLACE(s.snapshot_date,'-','')=b.dt",
  );
  sql = replace(
    sql,
    'SELECT new_material_code AS sku,',
    'SELECT sw.age_day AS mapping_date,new_material_code AS sku,',
  );
  sql = replace(
    sql,
    'FROM agents_order_execute_isontime_mi WHERE fromorderno_month>=:gea_p5 AND fromorderno_month<:gea_p6',
    'FROM agents_order_execute_isontime_mi INNER JOIN snapshot_windows sw ON fromorderno_month>=sw.mapping_start AND fromorderno_month<sw.mapping_end',
  );
  sql = replace(
    sql,
    'GROUP BY new_material_code) m ON m.sku=b.material_code',
    'GROUP BY sw.age_day,new_material_code) m ON m.sku=b.material_code AND m.mapping_date=b.dt',
  );
  sql = replace(
    sql,
    `GROUP BY ${parts.ageBase},b.material_code`,
    `GROUP BY b.dt,${parts.ageBase},b.material_code`,
  );
  return {
    ctes: `snapshot_windows AS (SELECT DISTINCT age_day,mapping_start,mapping_end FROM report_windows WHERE enabled=TRUE AND age_day IS NOT NULL)`,
    sql: `SELECT rw.period_index,${workbenchQueries.ages.columns.map((column) => 'snapshot.' + column).join(',')} FROM (${sql}) snapshot
      INNER JOIN report_windows rw ON rw.enabled=TRUE AND snapshot.batch_date=rw.age_day`,
  };
}

export function addPeriodSummaryQuery(config, name, fields, group, columns) {
  const original = config.queries['workbench.ontime.periods.summary'];
  const parameterSpec = { ...original.parameterSpec };
  for (const window of windows) {
    parameterSpec[window.inventoryEnd.slice(1)] = {
      name: `period_${window.index}_inventory_end`,
      type: 'string',
      format: 'YYYY-MM-DD',
    };
    parameterSpec[window.directorStart.slice(1)] = {
      name: `period_${window.index}_director_start`,
      type: 'string',
      format: 'YYYY-MM-DD',
    };
    for (const [field, suffix, format] of [
      ['stock', 'stock_date', 'YYYY-MM-DD'],
      ['age', 'age_day', 'YYYYMMDD'],
      ['ageDate', 'age_date', 'YYYY-MM-DD'],
      ['mappingStart', 'mapping_start', 'YYYY-MM-DD'],
      ['mappingEnd', 'mapping_end', 'YYYY-MM-DD'],
    ])
      parameterSpec[window[field].slice(1)] = {
        name: `period_${window.index}_${suffix}`,
        type: 'string',
        nullable: true,
        format,
      };
  }
  const register = (id, sql, resultColumns, keys) => {
    const parameters = Object.fromEntries(Object.keys(parameterSpec).map((key) => [key, null]));
    config.queries[id + '.count'] = {
      title: id + ' count',
      parameterSpec,
      request: {
        sql: `SELECT COUNT(*) AS total FROM (${sql}) counted`,
        parameters,
        includeTotal: false,
      },
      resultColumns: ['total'],
    };
    config.queries[id] = {
      title: id,
      parameterSpec,
      request: {
        sql:
          sql.replace(/ ORDER BY packet_index$/, '') +
          ` ORDER BY ${keys.join(',')} LIMIT :gea_p1001 OFFSET :gea_p1002`,
        parameters,
        includeTotal: false,
      },
      resultColumns,
      pagination: { countQuery: id + '.count' },
    };
    if (/^workbench\.changes\.cancellation\.partition[01]\.periods\.summary$/.test(id)) {
      const initialId = id + '.initial';
      config.queries[initialId] = {
        ...config.queries[id],
        request: { ...config.queries[id].request, sql },
      };
      delete config.queries[initialId].pagination;
      config.queries[id].pagination.initialQuery = initialId;
    }
  };
  if (name === 'orders') {
    const stock = `SELECT ${windows.map((window) => `MAX(CASE WHEN ${window.enabled}=TRUE AND s.the_date>=${window.start} AND s.the_date<${window.end} THEN s.the_date END) AS stock_${window.index}`).join(',')}
      FROM agents_scm_stock_detail_d s WHERE ${inWindows('s.the_date')}`;
    const ageDay = "REPLACE(CAST(b.the_date AS CHAR),'-','')";
    const age = `SELECT ${windows.map((window) => `MAX(CASE WHEN ${window.enabled}=TRUE AND ${ageDay}>=${compact(window.start)} AND ${ageDay}<${compact(window.inventoryEnd)} THEN ${ageDay} END) AS age_${window.index}`).join(',')}
      FROM agents_scm_stock_detail_d b
      WHERE (:gea_p900='' OR ${parts.ageBase}=:gea_p900) AND ${ageInWindows(ageDay)}`;
    register(
      'workbench.period-snapshots',
      `SELECT ${windows.flatMap((window) => [`stock_dates.stock_${window.index} AS stock_${window.index}`, `age_dates.age_${window.index} AS age_${window.index}`]).join(',')} FROM (${stock}) stock_dates CROSS JOIN (${age}) age_dates`,
      windows.flatMap((window) => ['stock_' + window.index, 'age_' + window.index]),
      ['stock_0'],
    );
  }
  if (name === 'changes') {
    const columns = ['period_index', ...config.queries['workbench.changes'].resultColumns];
    for (const [suffix, kind, partition] of [
      ['', undefined],
      ['.cancellation', '1'],
      ['.amendment', '2'],
      ['.cancellation.partition0', '1', 0],
      ['.cancellation.partition1', '1', 1],
    ]) {
      const change = periodChangesSql(kind);
      const sql = `WITH ${windowCte}${change.ctes ? ',' + change.ctes : ''} ${change.sql}`;
      register(
        'workbench.changes' + suffix + '.periods.summary',
        rowPacketSql(
          partition === undefined ? sql : cancellationPartitionSql(sql, partition),
          columns,
          ['period_index', 'kind', 'region', 'province'],
          workbenchPeriodPacketSize,
        ),
        ['packet_index', 'packet_count', 'packet_scope_total', 'packet_rows'],
        ['packet_index'],
      );
    }
    return;
  }
  const source =
    name === 'orders' ? { sql: periodOrders() } : name === 'stock' ? periodStock() : periodAges();
  const prefix = `WITH ${windowCte},${ownerCtes}${source.ctes ? ',' + source.ctes : ''} `;
  const sql = `SELECT q.period_index,${fields.join(',')} FROM (${source.sql}) q
    LEFT JOIN period_owners own ON own.period_index=q.period_index AND own.base=q.base AND own.sku=q.sku
    LEFT JOIN period_items shared ON shared.period_index=q.period_index AND shared.sku=q.sku
    GROUP BY q.period_index,${group.join(',')}`;
  const periodColumns = ['period_index', ...columns];
  const packetColumns = ['packet_index', 'packet_count', 'packet_scope_total', 'packet_rows'];
  const packets = rowPacketSql(
    sql,
    periodColumns,
    ['period_index', 'base', 'category', 'item', 'director', 'names'],
    workbenchPeriodPacketSize,
  );
  if (name === 'orders') {
    const metadata = `SELECT period_index,base,sku,MIN(director_value) OVER (PARTITION BY period_index,base,sku) AS director,director_value,item_value FROM (
      SELECT DISTINCT rw.period_index,d.belong_base AS base,d.material_code AS sku,
        NULLIF(TRIM(d.director),'') AS director_value,NULLIF(TRIM(d.product_item),'') AS item_value
      FROM (${attributionSource}) d INNER JOIN report_windows rw
        ON rw.enabled=TRUE AND d.attribution_date>=rw.director_start AND d.attribution_date<rw.end_date
      WHERE (:gea_p900='' OR d.belong_base=:gea_p900) AND NULLIF(TRIM(d.belong_base),'') IS NOT NULL AND NULLIF(TRIM(d.material_code),'') IS NOT NULL
    ) members`;
    const directorPackets = rowPacketSql(
      metadata,
      workbenchDirectorPeriodColumns,
      ['period_index', 'base', 'sku', 'director_value', 'item_value'],
      workbenchPeriodPacketSize,
    );
    register(
      `workbench.${name}.periods.summary`,
      prefix +
        `SELECT 0 AS section_id,${packetColumns.map((column) => 'p.' + column).join(',')} FROM (${packets}) p
      UNION ALL SELECT 1 AS section_id,${packetColumns.map((column) => 'p.' + column).join(',')} FROM (${directorPackets}) p`,
      ['section_id', ...packetColumns],
      ['section_id', 'packet_index'],
    );
  } else
    register(
      `workbench.${name}.periods.summary`,
      prefix + packets.replace(/^WITH /, ','),
      packetColumns,
      ['packet_index'],
    );
}
