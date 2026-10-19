import { readConfiguredFacts } from './configured-facts';
import type { AgentSqlConfig } from './sql-config';

/** Read daily/base aggregates, never SKU detail; refuse a truncated or changing collection. */
export async function readConfiguredHistory(
  config: AgentSqlConfig,
  asOf: string,
  options: { signal?: AbortSignal; execute?: any } = {},
) {
  const first = await readConfiguredFacts(config, 'history', { asOf, pageSize: 100 }, options);
  if (!['available', 'empty'].includes(first.status) || first.total == null || first.total > 10000)
    throw Error('历史范围不可完整读取，请缩小范围');
  const rows = [...first.rows];
  for (let page = 2; rows.length < first.total; page++) {
    options.signal?.throwIfAborted();
    const result = await readConfiguredFacts(
      config,
      'history',
      { asOf, pageSize: 100, page },
      options,
    );
    if (
      result.total !== first.total ||
      result.configVersion !== first.configVersion ||
      !result.rows.length
    )
      throw Error('历史范围发生变化，请重新查询');
    rows.push(...result.rows);
  }
  if (rows.length !== first.total) throw Error('历史结果不完整');
  return historyPoints(rows, asOf);
}
export function historyPoints(rows: any[], asOf: string) {
  return Array.from({ length: 30 }, (_, index) => {
    const day = new Date(asOf + 'T00:00:00Z');
    day.setUTCDate(day.getUTCDate() - 29 + index);
    const snapshotDate = day.toISOString().slice(0, 10);
    const matches = rows.filter((row) => String(row.the_date).slice(0, 10) === snapshotDate);
    const complete =
      matches.length > 0 &&
      matches.every(
        (row) =>
          Number(row.missing_current_stock) === 0 &&
          row.current_stock != null &&
          String(row.current_stock).trim() !== '' &&
          Number.isFinite(Number(row.current_stock)),
      );
    return {
      snapshotDate,
      base: complete ? matches.reduce((sum, row) => sum + Number(row.current_stock), 0) : null,
    };
  });
}
