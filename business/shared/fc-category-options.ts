import { createAgentQueries } from './agent-query';
import { unpackAtomicPage } from './atomic-page';
import type { AgentSqlConfig } from './sql-config';

/** Enumerate category groups, never the categories of just one SKU page. */
export async function readFcCategoryOptions(
  config: AgentSqlConfig,
  scope: { snapshotDate: string | null; warehouseCode: string | null },
  signal: AbortSignal,
) {
  if (!scope.snapshotDate) return [];
  const queryId = 'batch-age.atomic';
  const query = config.queries[queryId];
  const values = Object.fromEntries(
    Object.entries<{ name: string }>(query.parameterSpec).map(([key, spec]) => [
      spec.name,
      query.request.parameters[key],
    ]),
  );
  const rolling = new Date(scope.snapshotDate + 'T00:00:00Z');
  rolling.setUTCDate(rolling.getUTCDate() - 29);
  const end = new Date(scope.snapshotDate + 'T00:00:00Z');
  end.setUTCDate(end.getUTCDate() + 1);
  Object.assign(values, {
    stat_date: scope.snapshotDate,
    warehouse_code: scope.warehouseCode,
    group_level: 'category',
    batch_rolling_start: rolling.toISOString().slice(0, 10).replaceAll('-', ''),
    batch_end_exclusive: end.toISOString().slice(0, 10).replaceAll('-', ''),
    page_size: 200,
  });
  const client = createAgentQueries(config);
  const categories = new Set<string>();
  let total = 0;
  let configVersion: string | undefined;
  for (let page = 1; page === 1 || (page - 1) * 200 < total; page++) {
    const result = await client.read(
      queryId,
      { ...values, offset: (page - 1) * 200 },
      {
        signal,
        requiredColumns: ['level', 'page_scope_total'],
      },
    );
    signal.throwIfAborted();
    if (configVersion !== undefined && configVersion !== result.configVersion)
      throw Error('读取期间配置发生变化，请重新打开筛选');
    configVersion = result.configVersion;
    const data = unpackAtomicPage(result, page, 200);
    total = data.total;
    for (const row of data.rows)
      if (typeof row.level === 'string' && row.level.trim()) categories.add(row.level);
  }
  return [...categories]
    .sort((a, b) => a.localeCompare(b, 'zh-CN'))
    .map((value) => ({ value, label: value }));
}
