import { z } from 'zod';
import { createAgentQueries, type ConfiguredExecution } from './agent-query';
import { unpackAtomicPage } from './atomic-page';
import { agentSqlConfig, type AgentSqlConfig } from './sql-config';

const quantity = z.union([
  z.number().finite(),
  z.string().trim().min(1).transform(Number).pipe(z.number().finite()),
]);
const rowSchema = z.object({
  level: z.string().nullable(),
  material_code: z.string().nullable(),
  material_name: z.string().nullable(),
  total_qty: quantity,
  age_weight_qty: quantity,
  unknown_age_qty: quantity,
  average_age: quantity.nullable(),
  max_age: quantity.nullable(),
  row_count: quantity,
  age_valid_count: quantity,
  age0_30: quantity,
  age31_40: quantity,
  age41_60: quantity,
  age60_plus: quantity,
  future7: quantity,
  future14: quantity,
  daily_movement: quantity,
  sku_count: quantity,
  warning: z.string().nullable(),
});
export type BatchAgeRow = z.infer<typeof rowSchema>;

/** One snapshot lookup and one atomic aggregate/page; never download all batches. */
export async function readBatchAge(
  fallback: AgentSqlConfig,
  input: {
    asOf: string;
    bases?: string[];
    category?: string;
    sku?: string;
    search?: string;
    groupBy: 'base' | 'category' | 'sku';
    page?: number;
    pageSize?: number;
    sort?: {
      key: 'total_qty' | 'age60_plus' | 'average_age' | 'daily_movement';
      direction: 'asc' | 'desc';
    };
  },
  options: { signal?: AbortSignal; execute?: ConfiguredExecution } = {},
) {
  const config = agentSqlConfig(fallback);
  const client = createAgentQueries(config, options.execute);
  const latest = await client.read(
    'source.health-date',
    { as_of: input.asOf },
    {
      signal: options.signal,
      requiredColumns: ['day'],
    },
  );
  const snapshot = latest.rows[0]?.day;
  if (snapshot == null) return { rows: [], total: 0, snapshotDate: null };
  const day = z.string().date().parse(snapshot);
  if (day > input.asOf) throw Error('INVALID_SOURCE_DATE');
  const rolling = new Date(day + 'T00:00:00Z');
  rolling.setUTCDate(rolling.getUTCDate() - 29);
  const next = new Date(day + 'T00:00:00Z');
  next.setUTCDate(next.getUTCDate() + 1);
  const page = input.page ?? 1;
  const pageSize = input.pageSize ?? 200;
  if (!Number.isSafeInteger(page) || page < 1) throw Error('INVALID_PAGE');
  const queryId = 'batch-age.atomic';
  const result = await client.read(
    queryId,
    {
      stat_date: day,
      bases_enabled: Boolean(input.bases?.length),
      bases: input.bases?.length ? input.bases : [''],
      warehouse_code: null,
      material_code: input.sku || null,
      batch_rolling_start: rolling.toISOString().slice(0, 10).replaceAll('-', ''),
      batch_end_exclusive: next.toISOString().slice(0, 10).replaceAll('-', ''),
      category: input.category || null,
      group_level: input.groupBy,
      page_size: pageSize,
      offset: (page - 1) * pageSize,
      search_pattern: input.search ? '%' + input.search.replace(/[\\%_]/g, '\\$&') + '%' : null,
      sort_field: input.sort?.key ?? 'key',
      sort_direction: input.sort?.direction ?? 'asc',
    },
    { signal: options.signal, requiredColumns: config.queries[queryId].resultColumns },
  );
  if (result.configVersion !== latest.configVersion) throw Error('QUERY_CONFIG_CHANGED');
  const unpacked = unpackAtomicPage(result, page, pageSize);
  return {
    rows: z.array(rowSchema).parse(unpacked.rows),
    total: unpacked.total,
    snapshotDate: day,
  };
}

/** Ratios use the positive quantity with known batch ages, not the SKU's maximum age. */
export function batchAgeShare(value: unknown, denominator: unknown): string {
  const qty = quantity.nullable().safeParse(value);
  const total = quantity.nullable().safeParse(denominator);
  if (!qty.success || qty.data === null || !total.success || total.data === null) return '-';
  const number = qty.data.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
  return number + ' / ' + (total.data > 0 ? ((100 * qty.data) / total.data).toFixed(1) + '%' : '-');
}
