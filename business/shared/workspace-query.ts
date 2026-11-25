import { createAgentQueries } from './agent-query';
import { agentSqlConfig, type AgentSqlConfig } from './sql-config';

const iso = (date: Date) => date.toISOString().slice(0, 10);
function shifted(value: string, days = 0, months = 0) {
  const date = new Date(value + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  if (months) {
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + months);
  }
  return iso(date);
}

export async function readWorkspaceQuery(
  fallback: AgentSqlConfig,
  name: string,
  input: Record<string, any>,
  options: {
    signal?: AbortSignal;
    execute?: any;
    onInventory?: (rows: Record<string, unknown>[]) => void;
    allowPreviousStock?: boolean;
    stockSnapshot?: Promise<{ rows: Record<string, unknown>[]; configVersion: unknown }>;
  } = {},
) {
  const config = agentSqlConfig(fallback);
  const client = createAgentQueries(config, options.execute);
  const end = input.end;
  const snapshotOptions = { signal: options.signal, requiredColumns: ['day'] };
  const readSnapshot = async (month: unknown) => {
    const current = await client.read('source.stock-date', { month, as_of: end }, snapshotOptions);
    if (options.allowPreviousStock && current.rows[0]?.day == null)
      return client.read('source.previous-stock-date', { as_of: end }, snapshotOptions);
    return current;
  };
  if (options.onInventory && input.summary && config.workspaceQuickBindings?.[name]) {
    let fullReady = false;
    const stockSnapshot = readSnapshot(end.slice(0, 7) + '-01');
    const readOptions = {
      signal: options.signal,
      execute: options.execute,
      allowPreviousStock: options.allowPreviousStock,
      stockSnapshot,
    };
    const quick = readWorkspaceQuery(fallback, name, { ...input, inventoryOnly: true }, readOptions)
      .then((rows) => {
        options.signal?.throwIfAborted();
        if (!fullReady) options.onInventory?.(rows);
      })
      .catch(() => undefined);
    const full = readWorkspaceQuery(fallback, name, input, readOptions).then((rows) => {
      fullReady = true;
      return rows;
    });

    return full.catch(async (error) => {
      options.signal?.throwIfAborted();
      await quick;
      throw error;
    });
  }

  const binding =
    (input.inventoryOnly ? config.workspaceQuickBindings?.[name] : undefined) ??
    (input.summary
      ? config.workspaceSummaryBindings?.[name]
      : config.workspaceDrillBindings?.[input.detailMode]?.[name]) ??
    config.workspaceBindings?.[name];
  if (!binding)
    throw Object.assign(
      Error(config.workspaceUnavailable?.[name] || '新库尚无该页面数据的等价来源：' + name),
      { code: 'SOURCE_NOT_AVAILABLE' },
    );
  const query = config.queries[binding.queryId];
  const start = input.start;
  const values: Record<string, unknown> = {};
  let dateConfigVersion: unknown;
  let hasSnapshotDate = false;
  for (const [key, spec] of Object.entries(query.parameterSpec) as Array<[string, any]>) {
    const field = spec.name;
    let value = query.request.parameters[key];
    if (field === 'start') value = start;
    if (field === 'as_of') value = end;
    if (field === 'end_exclusive')
      value = spec.format === 'YYYYMM' ? shifted(end, 0, 1) : shifted(end, 1);
    if (['month', 'start_month'].includes(field)) value = start.slice(0, 7) + '-01';
    if (field === 'end_month_exclusive') value = shifted(end, 0, 1);
    if (field === 'stock_date') value = end;
    if (field === 'stock_month') value = end.slice(0, 7) + '-01';
    if (field === 'inventory_version') value = input.version;
    if (field === 'order_type') value = input.order_type;
    if (field === 'page_size') value = binding.pageSize ?? 200;
    if (field === 'offset') value = 0;
    if (spec.format === 'YYYYMM' && typeof value === 'string')
      value = value.slice(0, 7).replace('-', '');
    if (spec.format === 'YYYYMMDD' && typeof value === 'string') value = value.replaceAll('-', '');
    values[field] = value;
  }
  Object.assign(values, binding.overrides);
  if ('product_group_mode' in values) {
    const scope = input.productScope ?? {};
    const categories = scope.categories ?? [],
      items = scope.items ?? [];
    Object.assign(values, {
      product_group_mode: scope.mode ?? 'category',
      product_categories_enabled: categories.length > 0,
      product_categories: categories.length ? categories : [''],
    });
    if ('product_items' in values)
      Object.assign(values, {
        product_items_enabled: items.length > 0,
        product_items: items.length ? items : [''],
      });
  }
  if (input.base && 'bases_enabled' in values) {
    values.bases_enabled = true;
    values.bases = [input.base];
  }
  if (input.base && 'base_mode' in values) {
    values.base_mode = 'equal';
    values.base = input.base;
  }
  if ('stock_date' in values) {
    values.month = end.slice(0, 7) + '-01';
    const result = await (options.stockSnapshot ??
      readSnapshot(values.stock_month ?? values.month));
    const day = result.rows[0]?.day;
    dateConfigVersion = result.configVersion;
    hasSnapshotDate = true;
    if (
      typeof day !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
      (options.allowPreviousStock && day > end)
    )
      throw Object.assign(Error('截止日前没有可用库存快照'), { code: 'SOURCE_NOT_AVAILABLE' });
    values.stock_date = day;
    if (options.allowPreviousStock && 'stock_month' in values)
      values.stock_month = day.slice(0, 7) + '-01';
  }

  const expandedProductStock =
    input.detailMode === 'product' &&
    Boolean(input.productScope?.items?.length) &&
    binding.queryId === 'drill.product.stock';
  const result = await client.readAll(binding.queryId, values, {
    signal: options.signal,
    keyFields: binding.keyFields,
    requiredColumns: query.resultColumns,
    maxRows: 100000,
    atomicPages: expandedProductStock,
    singlePageFirst:
      !expandedProductStock &&
      Boolean(
        binding.singlePageFirst || (input.summary && config.workspaceSummaryBindings?.[name]),
      ),
  });
  if (hasSnapshotDate && result.configVersion !== dateConfigVersion)
    throw Object.assign(Error('库存日期与明细读取期间配置发生变化，请刷新重读'), {
      code: 'QUERY_CONFIG_CHANGED',
    });
  return result.rows;
}
