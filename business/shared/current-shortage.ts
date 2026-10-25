import { createAgentQueries } from './agent-query';
import { agentSqlConfig, type AgentSqlConfig } from './sql-config';
const knownNumber = (value: unknown): number | null =>
  value == null || String(value).trim() === '' || !Number.isFinite(Number(value))
    ? null
    : Number(value);

export const currentShortageValues = (
  filters: {
    base?: string;
    warehouse_code?: string;
    sku?: string;
    category?: string;
    skus?: string[];
  } = {},
  page = 1,
  pageSize = 10,
) => ({
  base: filters.base || null,
  warehouse_code: filters.warehouse_code || null,
  sku: filters.sku || null,
  category: filters.category || null,
  skus: filters.skus?.length ? filters.skus : [''],
  page_size: pageSize,
  offset: (page - 1) * pageSize,
});

/** Read server-side three-stage results. Values are current, independent of historical page dates. */
export async function readCurrentShortage(
  config: AgentSqlConfig,
  queryId = 'current-shortage.summary',
  filters: Parameters<typeof currentShortageValues>[0] = {},
  options: {
    signal?: AbortSignal;
    execute?: Parameters<typeof createAgentQueries>[1];
    page?: number;
    pageSize?: number;
  } = {},
) {
  const active = agentSqlConfig(config),
    client = createAgentQueries(active, options.execute);
  const definition = active.queries[queryId];
  const inputs = currentShortageValues(filters, options.page, options.pageSize);
  const values = Object.fromEntries(
    Object.values(definition.parameterSpec).map((spec: any) => [
      spec.name,
      Object.entries(inputs).find(([name]) => name === spec.name)?.[1],
    ]),
  );
  const result = await client.read(queryId, values, {
    signal: options.signal,
    requiredColumns: definition.resultColumns,
  });
  if (queryId.endsWith('.detail')) {
    const total = Number(result.rows[0]?.page_scope_total);
    if (!Number.isSafeInteger(total) || total < 0) throw Error('CURRENT_SHORTAGE_PAGE_INVALID');
    result.rows = result.rows.filter((r: Record<string, unknown>) => r.page_row_present != null);
    if (result.rows.length !== Math.min(inputs.page_size, Math.max(0, total - inputs.offset)))
      throw Error('CURRENT_SHORTAGE_PAGE_INCOMPLETE');
    result.total = total;
  } else result.total = result.rows.length;
  if (
    !Number.isSafeInteger(result.total) ||
    result.total < result.rows.length ||
    result.rows.some(
      (r: Record<string, unknown>) =>
        ['demand', 'allocated', 'remaining'].some((field) => knownNumber(r[field]) === null) ||
        (knownNumber(r.invalid)! > 0
          ? r.available !== null || r.shortage !== null
          : knownNumber(r.invalid) !== 0 ||
            ['available', 'shortage'].some((field) => knownNumber(r[field]) === null)),
    )
  )
    throw Object.assign(Error('当前缺货模型返回不完整范围'), {
      code: 'CURRENT_SHORTAGE_INCOMPLETE',
    });
  return {
    ...result,
    partial: result.rows.some((r: Record<string, unknown>) => knownNumber(r.invalid)! > 0),
  };
}

export function currentShortageSum(
  rows: Array<Record<string, unknown>> | undefined,
  field: string,
  locationType?: string,
): number | null {
  if (!rows) return null;
  const values = rows
    .filter((r) => !locationType || r.location_type === locationType)
    .map((r) => knownNumber(r[field]));
  return values.length && values.every((v) => v !== null)
    ? values.reduce<number>((sum, value) => sum + (value ?? 0), 0)
    : null;
}
