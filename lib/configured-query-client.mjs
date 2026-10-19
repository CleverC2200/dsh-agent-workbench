// Configuration-driven caller. The trusted host supplies execute and owns all
// identity, data-source and authorization context. This module contains no SQL.
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
// One HTML document shares this queue across its cards and collections. Avoid
// multiplying collection concurrency by the number of independently loaded cards.
let runningQueries = 0;
const waitingQueries = [];
function scheduledQuery(task, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => {
      const index = waitingQueries.indexOf(start);
      if (index >= 0) waitingQueries.splice(index, 1);
      reject(signal.reason);
    };
    const start = () => {
      signal?.removeEventListener('abort', abort);
      runningQueries++;
      Promise.resolve()
        .then(() => {
          signal?.throwIfAborted();
          return task();
        })
        .then(resolve, reject)
        .finally(() => {
          runningQueries--;
          waitingQueries.shift()?.();
        });
    };
    if (signal?.aborted) return reject(signal.reason);
    if (runningQueries < 4) start();
    else {
      waitingQueries.push(start);
      signal?.addEventListener('abort', abort, { once: true });
    }
  });
}
export class QueryContractError extends Error {
  constructor(code, message, metadata = {}) {
    super(message);
    this.name = 'QueryContractError';
    this.code = code;
    Object.assign(this, metadata);
  }
}
const fail = (code, message, metadata) => {
  throw new QueryContractError(code, message, metadata);
};
function query(config, id) {
  if (!own(config.queries, id)) fail('QUERY_NOT_REGISTERED', `未登记查询：${id}`);
  return config.queries[id];
}
function validDate(value, format) {
  const pattern =
    format === 'YYYYMM' ? /^\d{6}$/ : format === 'YYYYMMDD' ? /^\d{8}$/ : /^\d{4}-\d{2}-\d{2}$/;
  if (!pattern.test(value)) return false;
  const compact = value.replaceAll('-', '');
  const iso = `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8) || '01'}`;
  const at = new Date(iso + 'T00:00:00Z');
  return (
    Number.isFinite(at.valueOf()) &&
    at.toISOString().slice(0, 10) === iso &&
    (format !== 'YYYY-MM-01' || iso.endsWith('-01'))
  );
}
export function makeRequest(config, id, values) {
  const q = query(config, id),
    specs = q.parameterSpec;
  const names = Object.values(specs).map((s) => s.name);
  if (!values || Object.keys(values).length !== names.length || names.some((n) => !own(values, n)))
    fail('PARAMETER_MISMATCH', '必须完整提供配置中的业务参数，且不能附加身份、数据源或SQL');
  const parameters = {};
  for (const [key, s] of Object.entries(specs)) {
    const v = values[s.name];
    if (v === null) {
      if (!s.nullable) fail('PARAMETER_TYPE_MISMATCH', `${s.name}不可为空`);
    } else {
      const types = {
        string: () => typeof v === 'string' && v.length <= 600,
        integer: () => Number.isSafeInteger(v),
        boolean: () => typeof v === 'boolean',
        array: () =>
          Array.isArray(v) &&
          v.length > 0 &&
          v.length <= 200 &&
          v.every((x) => typeof x === 'string' && x.length <= 255),
      };
      if (
        !types[s.type]?.() ||
        (s.enum && !s.enum.includes(v)) ||
        (s.minimum !== undefined && v < s.minimum) ||
        (s.maximum !== undefined && v > s.maximum)
      )
        fail('PARAMETER_TYPE_MISMATCH', `参数无效：${s.name}`);
      if (
        ['YYYY-MM-DD', 'YYYY-MM-01', 'YYYYMMDD', 'YYYYMM'].includes(s.format) &&
        !validDate(v, s.format)
      )
        fail('PARAMETER_TYPE_MISMATCH', `日期无效：${s.name}`);
    }
    parameters[key] = structuredClone(v);
  }
  for (const [name, value] of Object.entries(values))
    if (name.endsWith('_mode') && value === 'equal' && values[name.slice(0, -5)] == null)
      fail('PARAMETER_TYPE_MISMATCH', `equal模式缺少值：${name}`);
  for (const [start, end] of [
    ['start', 'end_exclusive'],
    ['start_month', 'end_month_exclusive'],
    ['delivery_start', 'delivery_end_exclusive'],
  ])
    if (own(values, start) && own(values, end) && !(values[start] < values[end]))
      fail('INVALID_PERIOD', '日期范围须左闭右开');
  if (
    own(values, 'stock_date') &&
    values.stock_date.slice(0, 7) !== (values.stock_month ?? values.month).slice(0, 7)
  )
    fail('INVALID_PERIOD', '库存日必须属于配置的库存月份');
  if (
    id.startsWith('orders.active_customers') &&
    (values.date_basis !== 'created' ||
      (Date.parse(values.end_exclusive) - Date.parse(values.start)) / 86400000 !== 30)
  )
    fail('INVALID_PERIOD', '活跃客户使用created近30日范围');
  if (id.startsWith('plan_execution.')) {
    const d = new Date(values.month + 'T00:00:00Z');
    d.setUTCMonth(d.getUTCMonth() + 1);
    if (
      values.delivery_start !== values.month.replaceAll('-', '') ||
      values.delivery_end_exclusive !== values.order_end_exclusive.replaceAll('-', '') ||
      !(
        values.month < values.order_end_exclusive &&
        values.order_end_exclusive <= d.toISOString().slice(0, 10)
      )
    )
      fail('INVALID_PERIOD', '计划执行须同月月初起，订单和交货截止日一致');
  }
  if (id.startsWith('base_plan_execution.')) {
    const d = new Date(values.month + 'T00:00:00Z');
    d.setUTCMonth(d.getUTCMonth() + 1);
    const next = d.toISOString().slice(0, 10).replaceAll('-', '');
    if (
      values.delivery_start !== values.month.replaceAll('-', '') ||
      values.delivery_end_exclusive > next
    )
      fail('INVALID_PERIOD', '基地计划执行须从本月月初起，交货截止不跨月');
  }
  return { sql: q.request.sql, parameters, includeTotal: false };
}

export function requireColumns(result, columns) {
  const rejected = new Set(
    (result.rejectedColumns || []).map((c) =>
      typeof c === 'string' ? c : (c.outputAlias ?? c.alias ?? c.name ?? c.columnName),
    ),
  );
  const returned = result.returnedColumns?.map((c) =>
    typeof c === 'string' ? c : (c.outputAlias ?? c.alias ?? c.name ?? c.columnName),
  );
  const missing = columns.filter(
    (c) =>
      rejected.has(c) || (returned && !returned.includes(c)) || result.rows.some((r) => !own(r, c)),
  );
  if (missing.length)
    fail('REQUIRED_COLUMN_UNAVAILABLE', `所需字段不可用：${missing.join(', ')}`, {
      missingColumns: missing,
      returnedColumns: result.returnedColumns,
      rejectedColumns: result.rejectedColumns,
    });
}

export function createQueryClient(config, execute) {
  // Capture one immutable registry for a request chain, including paired counts.
  config = structuredClone(config);
  async function read(id, values, { signal, requiredColumns = [] } = {}) {
    signal?.throwIfAborted();
    const request = makeRequest(config, id, values);
    // No retry or alternate-source fallback, including authorization failures.
    const result = await scheduledQuery(
      () => execute(request, { signal, queryId: id, values: structuredClone(values) }),
      signal,
    );
    signal?.throwIfAborted();
    const failure = result?.failure ?? result?.error;
    if (failure || result?.success === false)
      fail(
        failure?.reasonCode || failure?.code || result.errorCode || 'QUERY_FAILED',
        failure?.message || result.message || '受控查询失败',
        {
          failure,
          errorCode: result.errorCode,
          returnedColumns: result.returnedColumns,
          rejectedColumns: result.rejectedColumns,
        },
      );
    if (!Array.isArray(result?.rows)) fail('INVALID_QUERY_RESPONSE', '查询未返回行集合');
    requireColumns(result, requiredColumns);
    return structuredClone(result);
  }
  async function readAll(
    id,
    values,
    {
      keyFields,
      requiredColumns = [],
      maxRows = 100000,
      signal,
      singlePageFirst = false,
      atomicPages = false,
    } = {},
  ) {
    const q = query(config, id),
      countId = q.pagination?.countQuery;
    if (
      !countId ||
      !Array.isArray(keyFields) ||
      !keyFields.length ||
      !Number.isSafeInteger(maxRows) ||
      maxRows < 1
    )
      fail('INVALID_COLLECTION_CONTRACT', '完整读取必须有配对计数、稳定键及有效上限');
    // Validate the caller's full contract before deriving count parameters.
    makeRequest(config, id, values);
    const pageSize = values.page_size;
    if (!Number.isSafeInteger(pageSize) || pageSize < 1)
      fail('INVALID_COLLECTION_CONTRACT', '完整读取必须声明有效分页大小');
    const atomicId = atomicPages ? q.pagination?.atomicQuery : undefined;
    const readId = atomicId || id;
    const pageColumns = [
      ...new Set([
        ...keyFields,
        ...requiredColumns,
        ...(atomicId ? ['page_scope_total', 'page_row_present'] : []),
      ]),
    ];
    // A short first page proves a bounded aggregate is complete in one statement.
    // A full page may be truncated: discard it and use the counted multi-page path.
    if (singlePageFirst && !atomicId) {
      const result = await read(
        id,
        { ...values, offset: 0 },
        {
          signal,
          requiredColumns: [...new Set([...keyFields, ...requiredColumns])],
        },
      );
      if (result.rows.length > pageSize) fail('RESULT_INCOMPLETE', '返回数量超过请求分页大小');
      if (result.rows.length < pageSize) {
        if (result.rows.length > maxRows)
          fail('RESULT_TOO_LARGE', '完整计算范围超过上限，请缩小业务范围');
        const keys = result.rows.map((row) => JSON.stringify(keyFields.map((key) => row[key])));
        if (new Set(keys).size !== keys.length) fail('UNSTABLE_PAGINATION', '汇总出现重复业务键');
        return {
          rows: result.rows,
          total: result.rows.length,
          configVersion: result.configVersion,
          pages: [
            {
              offset: 0,
              returnedColumns: result.returnedColumns,
              rejectedColumns: result.rejectedColumns,
            },
          ],
          consistency: 'single_statement_complete_page',
        };
      }
    }
    const countValues = Object.fromEntries(
      Object.values(query(config, countId).parameterSpec).map((s) => [s.name, values[s.name]]),
    );
    let version,
      versionSeen = false;
    const checkVersion = (result) => {
      if (versionSeen && result.configVersion !== version)
        fail('QUERY_CONFIG_CHANGED', '查询配置在读取期间发生变化，请刷新后重新查询');
      versionSeen = true;
      version = result.configVersion;
    };
    const count = async () => {
      const result = await read(countId, countValues, { signal, requiredColumns: ['total'] });
      checkVersion(result);
      const raw = result.rows[0]?.total;
      if (
        result.rows.length !== 1 ||
        raw === null ||
        raw === '' ||
        !/^(0|[1-9]\d*)$/.test(String(raw))
      )
        fail('INVALID_COUNT', '计数必须是唯一非负整数');
      const total = Number(raw);
      if (!Number.isSafeInteger(total)) fail('INVALID_COUNT', '计数超出整数范围');
      return total;
    };
    const firstAtomic = atomicId
      ? await read(atomicId, { ...values, offset: 0 }, { signal, requiredColumns: pageColumns })
      : undefined;
    const firstPage = firstAtomic ? unpackAtomicPage(firstAtomic, 1, pageSize) : undefined;
    const total = firstPage ? firstPage.total : await count();
    if (total > maxRows) fail('RESULT_TOO_LARGE', '完整计算范围超过上限，请缩小业务范围');
    const rows = [],
      seen = new Set(),
      metadata = [];
    let columnsSignature;
    const accept = (result, offset) => {
      checkVersion(result);
      const signature = JSON.stringify([
        result.returnedColumns ?? null,
        result.rejectedColumns ?? null,
      ]);
      if (columnsSignature !== undefined && signature !== columnsSignature)
        fail('RETURN_COLUMNS_CHANGED', '分页期间返回列权限发生变化，未生成汇总');
      columnsSignature = signature;
      if (result.rows.length !== Math.min(pageSize, total - offset))
        fail('RESULT_INCOMPLETE', '分页与计数不一致，未生成汇总');
      for (const row of result.rows) {
        const key = JSON.stringify(keyFields.map((k) => row[k]));
        if (seen.has(key)) fail('UNSTABLE_PAGINATION', '分页出现重复业务键，未生成汇总');
        seen.add(key);
        rows.push(row);
      }
      metadata.push({
        offset,
        returnedColumns: result.returnedColumns,
        rejectedColumns: result.rejectedColumns,
      });
    };
    // Confirm the first page before scheduling more. Then overlap at most three
    // independent pages; consume them in offset order and never return a prefix
    // as a complete collection. Counts, permissions and stable keys still gate it.
    const stop = new AbortController();
    const pageSignal = signal ? AbortSignal.any([signal, stop.signal]) : stop.signal;
    if (firstAtomic) accept({ ...firstAtomic, rows: firstPage.rows }, 0);
    for (let offset = firstAtomic ? pageSize : 0; offset < total;) {
      const width = Math.min(offset === 0 ? 1 : 3, Math.ceil((total - offset) / pageSize));
      const offsets = Array.from({ length: width }, (_, index) => offset + index * pageSize);
      let failure;
      const results = await Promise.allSettled(
        offsets.map(async (at) => {
          try {
            const result = await read(
              readId,
              { ...values, offset: at },
              { signal: pageSignal, requiredColumns: pageColumns },
            );
            if (!atomicId) return result;
            const page = unpackAtomicPage(result, at / pageSize + 1, pageSize);
            if (page.total !== total) fail('SOURCE_CHANGED', '读取期间源计数变化，请重新查询');
            return { ...result, rows: page.rows };
          } catch (error) {
            if (!failure) failure = { error };
            stop.abort(error);
            throw error;
          }
        }),
      );
      if (failure) throw failure.error;
      results.forEach((result, index) => accept(result.value, offsets[index]));
      offset += width * pageSize;
    }
    if (!atomicId && (await count()) !== total)
      fail('SOURCE_CHANGED', '读取期间源计数变化，请重新查询');
    return {
      rows,
      total,
      pages: metadata,
      configVersion: version,
      consistency: atomicId
        ? 'page_totals_checked_not_atomic_snapshot'
        : 'count_checked_not_atomic_snapshot',
    };
  }
  return { read, readAll };
}

export function inventoryOverview(result) {
  const fields = [
    'row_count',
    'inventory',
    'known_target',
    'known_daily_demand',
    'known_target_gap',
    'known_stock_days',
    'known_target_turnover',
    'missing_inventory',
    'missing_target',
    'missing_daily_demand',
    'negative_inventory',
    'negative_daily_demand',
    'known_stock_avg_30d_sale',
    'missing_stock_avg_30d_sale',
    'negative_stock_avg_30d_sale',
  ];
  requireColumns(result, fields);
  if (result.rows.length !== 1) fail('INVALID_SUMMARY', '总览需完整范围唯一汇总行');
  const row = result.rows[0];
  const n = (name) => {
    if (row[name] === null) return null;
    if (
      !['string', 'number'].includes(typeof row[name]) ||
      String(row[name]).trim() === '' ||
      !Number.isFinite(Number(row[name]))
    )
      fail('INVALID_SUMMARY', `汇总数值无效：${name}`);
    return Number(row[name]);
  };
  const count = n('row_count');
  if (!Number.isSafeInteger(count) || count < 0) fail('INVALID_SUMMARY', '汇总行数无效');
  if (!count)
    return {
      status: 'empty',
      inventory: null,
      target: null,
      demand: null,
      gap: null,
      stock_days: null,
      targetTurnover: null,
      dailySales: null,
    };
  for (const field of fields.filter((f) => f.startsWith('missing_') || f.startsWith('negative_'))) {
    const value = n(field);
    if (!Number.isSafeInteger(value) || value < 0 || value > count)
      fail('INVALID_SUMMARY', `缺值/异常计数无效：${field}`);
  }
  const missingTarget = n('missing_target'),
    missingDemand = n('missing_daily_demand'),
    missingInventory = n('missing_inventory');
  const negativeInventory = n('negative_inventory'),
    negativeDemand = n('negative_daily_demand');
  const invalid = negativeInventory > 0 || negativeDemand > 0;
  return {
    status:
      invalid || missingInventory > 0 || missingTarget > 0 || missingDemand > 0
        ? 'partial'
        : 'complete',
    inventory: n('inventory'),
    target: n('known_target'),
    demand: n('known_daily_demand'),
    gap: negativeInventory > 0 ? null : n('known_target_gap'),
    stock_days: invalid ? null : n('known_stock_days'),
    targetTurnover: negativeDemand > 0 ? null : n('known_target_turnover'),
    missingTargetCount: missingTarget,
    missingDemandCount: missingDemand,
    missingInventoryCount: missingInventory,
    dailySales: n('negative_stock_avg_30d_sale') > 0 ? null : n('known_stock_avg_30d_sale'),
    dailySalesPartial: n('missing_stock_avg_30d_sale') > 0 || n('negative_stock_avg_30d_sale') > 0,
    // The source is a daily average, not the legacy report's period total.
    shipment30: null,
    shipment30UnavailableReason: 'PERIOD_MOVEMENT_SOURCE_NOT_CONFIRMED',
    aggregateRisk:
      missingTarget > 0 || missingInventory > 0 || invalid
        ? 'unknown'
        : n('known_target_gap') > 0
          ? 'high'
          : n('known_target_gap') < 0
            ? 'low'
            : 'normal',
  };
}

/** An empty OFFSET still returns its scope count through the LEFT JOIN sentinel. */
export function unpackAtomicPage(result, page, size) {
  const fail = (code, message) => {
    throw Object.assign(Error(message), { code });
  };
  const raw = result.rows[0]?.page_scope_total;
  if (raw == null || !/^(0|[1-9]\d*)$/.test(String(raw)) || !Number.isSafeInteger(Number(raw)))
    return fail('INVALID_COUNT', '来源计数无效，未展示不完整页');
  const total = Number(raw),
    expected = Math.min(size, Math.max(0, total - (page - 1) * size));
  if (result.rows.some((r) => String(r.page_scope_total) !== String(raw)))
    return fail('INVALID_COUNT', '当前页总数不一致');
  if (expected === 0) {
    if (result.rows.length !== 1 || result.rows[0].page_row_present != null)
      return fail('RESULT_INCOMPLETE', '空页标记不正确');
    return { rows: [], total };
  }
  if (
    result.rows.length !== expected ||
    result.rows.some((r) => String(r.page_row_present) !== '1')
  )
    return fail('RESULT_INCOMPLETE', '分页行数与同一查询的总数不一致');
  return {
    rows: result.rows.map(
      ({ page_scope_total: _total, page_row_present: _present, ...row }) => row,
    ),
    total,
  };
}
