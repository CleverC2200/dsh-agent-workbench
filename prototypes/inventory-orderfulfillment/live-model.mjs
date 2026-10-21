import {
  createQueryClient,
  QueryContractError,
} from '../../business/shared/configured-query-client.mjs';

export function shanghaiToday(now = new Date()) {
  return new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10);
}
export function nextDay(day) {
  return new Date(Date.parse(day + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
}
export function plannedShippingDays(row) {
  const number = (key) =>
    row[key] === null || row[key] === undefined || row[key] === '' ? null : Number(row[key]);
  const date = new Date(row.stock_date + 'T00:00:00Z');
  if (!Number.isFinite(date.getTime()) || number('source_rows') !== 1) return null;
  const day = date.getUTCDate();
  const days = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  if (![10, 20, days].includes(day) || number('month_days') !== days) return null;
  const effective = (name) => {
    const adjusted = number(name + '_adjusted');
    return adjusted !== null && adjusted > 0 ? adjusted : number(name + '_initial');
  };
  let sales,
    transfer,
    divisor = days;
  if (day === days) {
    sales = number('next_month_sales_plan');
    transfer = number('next_month_out_plan');
    divisor = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 2, 0)).getUTCDate();
  } else {
    const main = day === 10 ? number('main_plan_initial') : effective('main_plan');
    const bp = day === 10 ? number('bp_plan_initial') : effective('bp_plan');
    sales = main === null || bp === null ? null : main + bp;
    transfer = day === 10 ? number('transfer_plan_initial') : effective('transfer_plan');
  }
  const available = number('available_qty');
  if (
    [available, sales, transfer].some(
      (value) => value === null || !Number.isFinite(value) || value < 0,
    )
  )
    return null;
  const daily = (sales + transfer * 0.5) / divisor;
  return daily > 0 ? available / daily : null;
}
const alias = (value) =>
  typeof value === 'string'
    ? value
    : (value.outputAlias ?? value.alias ?? value.name ?? value.columnName);

/** Render only granted outputs; a rejected field never becomes an empty/zero business fact. */
export function visibleResult(result) {
  const denied = new Set((result.rejectedColumns ?? []).map(alias));
  const columns = (
    result.returnedColumns ?? [...new Set(result.rows.flatMap((row) => Object.keys(row)))]
  )
    .map(alias)
    .filter((column) => typeof column === 'string' && !denied.has(column));
  return {
    ...result,
    columns,
    rows: result.rows.map((row) =>
      Object.fromEntries(
        columns
          .filter((column) => Object.hasOwn(row, column))
          .map((column) => [column, row[column]]),
      ),
    ),
  };
}

/** Each collection keeps count/page/config and permission checks separate from other cards. */
export function createFulfillmentReader(config, execute) {
  const client = createQueryClient(config, execute);
  async function collection(id, filters, { signal, page = 1, size = 20 } = {}) {
    const countId = config.queries[id].pagination.countQuery;
    const before = await client.read(countId, filters, { signal, requiredColumns: ['total'] });
    const rawTotal = before.rows.length === 1 ? before.rows[0].total : null;
    if (!/^(0|[1-9]\d*)$/.test(String(rawTotal)) || !Number.isSafeInteger(Number(rawTotal)))
      throw new QueryContractError('INVALID_COUNT', '订单分页计数无效');
    const total = Number(rawTotal);
    const currentPage = Math.min(page, Math.max(1, Math.ceil(total / size)));
    const offset = (currentPage - 1) * size;
    const result = await client.read(id, { ...filters, page_size: size, offset }, { signal });
    const after = await client.read(countId, filters, { signal, requiredColumns: ['total'] });
    if (
      before.configVersion !== result.configVersion ||
      after.configVersion !== result.configVersion
    )
      throw new QueryContractError('QUERY_CONFIG_CHANGED', '读取期间配置已变化，请刷新');
    if (
      after.rows.length !== 1 ||
      Number(after.rows[0].total) !== total ||
      result.rows.length !== Math.min(size, Math.max(total - offset, 0))
    )
      throw new QueryContractError('RESULT_INCOMPLETE', '读取期间计数或分页已变化，请刷新');
    return {
      ...visibleResult(result),
      total,
      page: currentPage,
      size,
      readAt: new Date().toISOString(),
    };
  }
  return {
    collection,
    async summary(id, filters, signal) {
      const result = await client.read(id, filters, { signal });
      if (result.rows.length !== 1)
        throw new QueryContractError('INVALID_QUERY_RESPONSE', '汇总结果不完整');
      return visibleResult(result);
    },
  };
}

/** A newer load owns publication, even if an old transport ignores cancellation. */
export function createLoadOwner() {
  let generation = 0,
    controller;
  return {
    begin() {
      controller?.abort();
      controller = new AbortController();
      const own = ++generation;
      return {
        signal: controller.signal,
        current: () => own === generation && !controller.signal.aborted,
      };
    },
    invalidate() {
      generation++;
      controller?.abort();
    },
  };
}
