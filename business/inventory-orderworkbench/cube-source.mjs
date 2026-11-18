import { createCubeCalculation } from './cube-calculation.mjs';

const daily = 'agents_scm_execute_detail_d';
const hourly = 'agents_scm_execute_detail_hourly_d';
const trace = 'agents_scm_order_trace_final_di';
const stock = 'agents_scm_stock_detail_d';
const orders = 'agents_order_execute_isontime_mi';
const warehouse = 'agents_scm_material_in_out_summary_d';
const classification = 'dim_bas_warehouse';
const policy = 'agents_dim_mark_xilie_d';
const executionFields =
  'cust_code cust_order_no executeorderno executeorderlineno material_code belong_base region_name province_region_name cust_name header_addtime latestsendcardate orderstatus detailstatus canceltime change_order_qty dms_last_update_qty need_qty_origin createsource is_virtual timeout_code warehouseid receive_wh pickup_point warehouse_classify wms_close_time qtyshipped product_item director order_close_time is_short_transfer is_stat custchangetime'.split(
    ' ',
  );
const traceFields =
  'executeorderno cust_code fromorderno receive_wh deliver_wh update_time load_time lastshipmenttime wms_order_close_time wms_ship_status load_status cust_type gpsisinraildate_to arriveconfirm_time requireddeliverytimebak requireddeliverytime expected_deliv_time is_dispatch region_name province_region_name is_virtual_odo vehicle_type vehicle_type_name timeout_code'.split(
    ' ',
  );
const stockFields =
  'the_date belong_base material_code material_name product_item current_stock current_stock_60 available_stock main_sales_plan_v1 main_sales_plan_adj roll_sales_plan next_month_sales_plan transfer_out_plan_v1 transfer_out_plan_adj transfer_out_plan_roll next_month_out_plan'.split(
    ' ',
  );
const orderFields =
  'fromorderno cust_code new_material_code executeorderno fromorderno_month belong_base product_categ_name pinxiang new_material_name need_qty_origin qtyshipped order_qty_origin exp_flag pickup_point_kpi region_name province_region_name'.split(
    ' ',
  );
const fields = {
  [daily]: executionFields,
  [hourly]: executionFields,
  [trace]: traceFields,
  [stock]: stockFields,
  [orders]: orderFields,
  [warehouse]:
    'warehouseid pickup_point warehouse_classify material_code product_categ_name material_group_name'.split(
      ' ',
    ),
  [classification]: ['warehouse_id', 'warehouse_classify', 'warehouse_classify_name'],
  [policy]: ['product_item', 'series', 'series_sort'],
};
const scalar = (value) =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)
    ? value
        .replace('T', ' ')
        .replace(/\.\d+(?:Z)?$/, '')
        .replace(/Z$/, '')
    : value;
const periodFilter = (table, field, start, end) => ({
  and: [
    { member: table + '.' + field, operator: 'gte', values: [start + ' 00:00:00'] },
    { member: table + '.' + field, operator: 'lt', values: [end + ' 00:00:00'] },
  ],
});

export function createCubeReader(call, signal) {
  const evidence = [];
  let sequence = 0;
  let active = 0;
  const waiting = [];
  const scheduled = async (args) => {
    if (active >= 3) await new Promise((resolve) => waiting.push(resolve));
    else active++;
    try {
      signal.throwIfAborted();
      return await call('query_business_data', args, signal);
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  };
  return {
    evidence,
    async read(table, columns, filters = [], { observations = true, maxRows = 2000000 } = {}) {
      signal.throwIfAborted();
      const dimensions = columns.map((field) => table + '.' + field);
      let total;
      const page = async (offset) => {
        const args = {
          action: 'query',
          response_mode: 'inline_complete',
          queries: [
            {
              name: 'order_kpi_' + ++sequence,
              query: {
                timezone: 'UTC',
                dimensions,
                ...(observations ? { measures: [table + '.record_count'] } : {}),
                filters,
                order: Object.fromEntries(dimensions.map((member) => [member, 'asc'])),
                limit: 5000,
                offset,
              },
            },
          ],
        };
        const response = JSON.parse(await scheduled(args));
        const dataset = response.datasets?.[0];
        if (
          !dataset ||
          !['ok', 'no_data'].includes(dataset.dataStatus) ||
          !Array.isArray(dataset.rows) ||
          !Number.isSafeInteger(dataset.totalRowCount) ||
          dataset.rowCount !== dataset.rows.length ||
          dataset.totalRowCount > 2000000
        )
          throw Error('ORDER_CUBE_INCOMPLETE_DATASET:' + table);
        if (dataset.totalRowCount > maxRows)
          throw Object.assign(
            Error('Cube缺少同口径的作废跨周期候选筛选能力；完整候选超出读取预算，未使用部分数据。'),
            {
              code: 'ORDER_CUBE_CANCELLATION_CANDIDATES_REQUIRED',
              totalCandidates: dataset.totalRowCount,
              required: [
                '业务行键',
                '完整观察合并后的最早归期时间',
                '完整观察合并后的最晚归期时间',
                '观察冲突状态',
              ],
            },
          );
        if (total !== undefined && total !== dataset.totalRowCount)
          throw Error('ORDER_CUBE_SOURCE_CHANGED:' + table);
        total = dataset.totalRowCount;
        const rows = [];
        for (const row of dataset.rows) {
          if (dimensions.some((member) => !Object.hasOwn(row, member)))
            throw Error('ORDER_CUBE_MISSING_FIELD:' + table);
          rows.push(
            Object.fromEntries(
              Object.entries(row).map(([member, value]) => [
                member.slice(member.indexOf('.') + 1),
                scalar(value),
              ]),
            ),
          );
        }
        evidence.push({
          table,
          columns,
          offset,
          rowCount: dataset.rowCount,
          totalRowCount: total,
          hasMorePages: dataset.hasMorePages,
        });
        if (
          dataset.rowCount !== Math.min(5000, total - offset) ||
          dataset.hasMorePages !== offset + dataset.rowCount < total
        )
          throw Error('ORDER_CUBE_INCOMPLETE_PAGES:' + table);
        return rows;
      };
      const first = await page(0);
      const pages = [first];
      let next = 5000;
      await Promise.all(
        [0, 1, 2].map(async () => {
          while (next < total) {
            const offset = next;
            next += 5000;
            pages[offset / 5000] = await page(offset);
          }
        }),
      );
      const rows = pages.flat();
      signal.throwIfAborted();
      if (rows.length !== total) throw Error('ORDER_CUBE_INCOMPLETE_PAGES:' + table);
      return rows;
    },
  };
}

async function batches(values, run) {
  const output = [];
  let next = 0;
  await Promise.all(
    [0, 1].map(async () => {
      while (next < values.length) {
        const offset = next;
        next += 700;
        output.push(...(await run(values.slice(offset, offset + 700))));
      }
    }),
  );
  return output;
}

function metadataSql(sql) {
  return sql
    .replace(
      /FROM agents_scm_execute_detail_d WHERE belong_base/g,
      'FROM cube_global_daily WHERE belong_base',
    )
    .replace(
      /FROM agents_scm_execute_detail_hourly_d WHERE belong_base/g,
      'FROM cube_global_hourly WHERE belong_base',
    )
    .replace(
      /FROM agents_scm_execute_detail_d( d)?\s+WHERE (d\.)?(header_addtime|order_close_time)>=/g,
      'FROM cube_attribution_daily$1 WHERE $2$3>=',
    )
    .replace(
      /FROM agents_scm_execute_detail_hourly_d\s+WHERE header_addtime>=/g,
      'FROM cube_attribution_hourly WHERE header_addtime>=',
    )
    .replace(
      /FROM agents_scm_stock_detail_d\s+WHERE the_date>=/g,
      'FROM cube_attribution_stock WHERE the_date>=',
    )
    .replace(
      /FROM agents_order_execute_isontime_mi\s+WHERE fromorderno_month>=/g,
      'FROM cube_attribution_orders WHERE fromorderno_month>=',
    );
}

export function createCubeMetricExecutor(config, input, { call, signal, now = new Date() }) {
  const cancelled = new AbortController();
  signal = AbortSignal.any([signal, cancelled.signal]);
  const metric = input.metric;
  const today = new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10);
  const tomorrow = new Date(Date.parse(today) + 86400000).toISOString().slice(0, 10);
  const inventory = [
    '货龄占比',
    '60天以上货龄占比',
    '60天及以上货龄占比',
    '货龄（>60天库存占比）',
    '可发货天数',
    '周转天数',
  ].includes(metric);
  const start = input.start;
  const end =
    input.endExclusive < (inventory ? tomorrow : today)
      ? input.endExclusive
      : inventory
        ? tomorrow
        : today;
  const reader = createCubeReader(call, signal);
  const calculation = createCubeCalculation();
  const loaded = new Set();
  let prepared;
  const load = async (table, filters = [], selected = fields[table], options) => {
    const rows = await reader.read(table, selected, filters, options);
    signal.throwIfAborted();
    calculation.table(table, selected, rows, {
      expand: [daily, hourly, trace, orders, stock].includes(table),
    });
    loaded.add(table);
    return rows;
  };
  const prepare = async () => {
    if (end <= start) {
      for (const [table, columns] of Object.entries(fields)) calculation.table(table, columns, []);
      return;
    }
    const grouped = input.view === 'groups';
    const cancellations = metric === '作废率';
    const ontime = metric === '准交率';
    const fulfillment = ['满足率', '订单满足率'].includes(metric);
    const amendment = metric === '改单率';
    if (amendment)
      await load(daily, [
        periodFilter(daily, 'order_close_time', start, end),
        { member: daily + '.createsource', operator: 'equals', values: ['20'] },
        {
          member: daily + '.pickup_point',
          operator: 'equals',
          values: ['01', '02', '03', '04', '37'],
        },
        { member: daily + '.is_short_transfer', operator: 'equals', values: ['非短拨'] },
      ]);
    if (cancellations || ontime) {
      const candidates = new Set();
      const sources = cancellations ? [daily, hourly, trace] : [trace];
      await Promise.all(
        sources.map(async (table) => {
          const dates =
            table === trace
              ? cancellations
                ? ['lastshipmenttime', 'wms_order_close_time']
                : ['gpsisinraildate_to', 'arriveconfirm_time']
              : ['wms_close_time'];
          const filters = { or: dates.map((field) => periodFilter(table, field, start, end)) };
          if (table !== trace && cancellations)
            filters.or.push({
              member: table + '.canceltime',
              operator: 'lt',
              values: [end + ' 00:00:00'],
            });
          const keys = await reader.read(
            table,
            ['executeorderno', 'cust_code'],
            [filters],
            cancellations && table === daily ? { maxRows: 100000 } : {},
          );
          for (const row of keys)
            if (row.executeorderno !== null) candidates.add(row.executeorderno);
        }),
      );
      const values = [...candidates].sort();
      await Promise.all(
        [daily, hourly, trace].map(async (table) => {
          const selected =
            ontime && table !== trace
              ? [
                  'cust_order_no',
                  'cust_code',
                  'material_code',
                  'executeorderno',
                  'belong_base',
                  'detailstatus',
                  'is_stat',
                  'product_item',
                  'is_virtual',
                ]
              : fields[table];
          const rows = await batches(values, (batch) =>
            reader.read(table, selected, [
              { member: table + '.executeorderno', operator: 'equals', values: batch },
            ]),
          );
          signal.throwIfAborted();
          calculation.table(table, selected, rows, { expand: true });
          loaded.add(table);
        }),
      );
    }
    if (fulfillment) {
      const valid = [
        { member: orders + '.exp_flag', operator: 'equals', values: ['否'] },
        {
          member: orders + '.pickup_point_kpi',
          operator: 'equals',
          values: ['郑州', '华东', '西南', '华南', '遂平'],
        },
        {
          or: ['order_qty_origin', 'need_qty_origin'].map((field) => ({
            member: orders + '.' + field,
            operator: 'gt',
            values: ['0'],
          })),
        },
      ];
      const keys = await reader.read(
        orders,
        ['fromorderno', 'cust_code'],
        [periodFilter(orders, 'fromorderno_month', start, end), ...valid],
      );
      const values = [
        ...new Set(keys.map((row) => row.fromorderno).filter((value) => value !== null)),
      ].sort();
      const rows = await batches(values, (batch) =>
        reader.read(orders, fields[orders], [
          { member: orders + '.fromorderno', operator: 'equals', values: batch },
          ...valid,
        ]),
      );
      signal.throwIfAborted();
      calculation.table(orders, fields[orders], rows, { expand: true });
      loaded.add(orders);
    }
    const mappingStart = grouped ? start.slice(0, 7) + '-01' : start;
    const stockFilters = [
      { member: stock + '.the_date', operator: 'gte', values: [start] },
      { member: stock + '.the_date', operator: 'lt', values: [end] },
    ];
    const loadStock = async () => {
      const dates = await reader.read(stock, ['the_date'], stockFilters);
      const latest = dates
        .map((row) => row.the_date)
        .sort()
        .at(-1);
      if (latest)
        return load(stock, [{ member: stock + '.the_date', operator: 'equals', values: [latest] }]);
      calculation.table(stock, fields[stock], []);
      loaded.add(stock);
    };
    await Promise.all([
      ...(cancellations || ontime || inventory || grouped
        ? [
            load(
              warehouse,
              [],
              cancellations || ontime
                ? fields[warehouse]
                : ['material_code', 'product_categ_name', 'material_group_name'],
            ),
          ]
        : []),
      ...(cancellations || ontime
        ? [load(classification, [], fields[classification], { observations: false })]
        : []),
      ...(inventory
        ? [
            loadStock(),
            load(policy, [
              { member: policy + '.product_item', operator: 'equals', values: ['节点'] },
            ]),
          ]
        : []),
    ]);
    if (grouped) {
      const baseOnly =
        amendment && input.dimensions?.length === 1 && input.dimensions[0] === 'base';
      const attributionFields = [
        'belong_base',
        'material_code',
        'director',
        'product_item',
        'header_addtime',
        'order_close_time',
      ];
      await Promise.all(
        [daily, hourly].map(async (table, index) => {
          const globalFields = ['belong_base', 'material_code', 'director', 'product_item'];
          const globalRows = baseOnly ? [] : await reader.read(table, globalFields);
          calculation.table(
            index ? 'cube_global_hourly' : 'cube_global_daily',
            globalFields,
            globalRows,
          );
          const local = baseOnly
            ? []
            : await reader.read(table, attributionFields, [
                {
                  or: ['header_addtime', ...(table === daily ? ['order_close_time'] : [])].map(
                    (field) => periodFilter(table, field, mappingStart, end),
                  ),
                },
              ]);
          calculation.table(
            index ? 'cube_attribution_hourly' : 'cube_attribution_daily',
            attributionFields,
            local,
          );
        }),
      );
      const stockColumns = ['belong_base', 'material_code', 'product_item', 'the_date'];
      const stockRows = baseOnly
        ? []
        : await reader.read(stock, stockColumns, [
            { member: stock + '.the_date', operator: 'gte', values: [mappingStart] },
            { member: stock + '.the_date', operator: 'lt', values: [end] },
          ]);
      calculation.table('cube_attribution_stock', stockColumns, stockRows);
      const orderColumns = ['belong_base', 'new_material_code', 'pinxiang', 'fromorderno_month'];
      const orderRows = baseOnly
        ? []
        : await reader.read(orders, orderColumns, [
            periodFilter(orders, 'fromorderno_month', mappingStart, end),
          ]);
      calculation.table('cube_attribution_orders', orderColumns, orderRows);
    }
    for (const [table, columns] of Object.entries(fields))
      if (!loaded.has(table)) calculation.table(table, columns, []);
  };
  return {
    evidence: reader.evidence,
    async execute(request, options) {
      signal.throwIfAborted();
      const definition = config.queries[options.queryId];
      if (!definition || request.sql !== definition.request?.sql)
        throw Error('ORDER_CUBE_QUERY_CONTRACT_MISMATCH');
      prepared ??= prepare().catch((error) => {
        cancelled.abort();
        throw error;
      });
      await prepared;
      signal.throwIfAborted();
      return calculation.read(
        input.view === 'groups' && request.sql.includes('attribution_date')
          ? metadataSql(request.sql)
          : request.sql,
        request.parameters,
      );
    },
    close: () => {
      cancelled.abort();
      calculation.close();
    },
  };
}
