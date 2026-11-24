import type { createAgentQueries } from './agent-query';
import { selectDefaultPublishedTargetInventory } from './target-inventory-policy.js';

export const targetPlanVersionsQuery = 'calendar.target_plan_versions';

export async function readConfiguredTargetCalendar(
  client: ReturnType<typeof createAgentQueries>,
  asOf: string,
  signal?: AbortSignal,
) {
  const now = new Date(asOf + 'T12:00:00+08:00');
  const month = asOf.slice(0, 7) + '-01';
  const planQuery = client.config.queries[targetPlanVersionsQuery];
  const result = planQuery
    ? await client.read(
        targetPlanVersionsQuery,
        {
          plan_months: [
            ...new Set([
              month,
              selectDefaultPublishedTargetInventory([], now).requestedTargetMonth,
            ]),
          ],
        },
        { signal, requiredColumns: planQuery.resultColumns },
      )
    : await client.readAll(
        'calendar.target_versions',
        { page_size: 200, offset: 0 },
        {
          signal,
          requiredColumns: ['month', 'inventory_version'],
          keyFields: ['month', 'inventory_version'],
          maxRows: 10000,
          singlePageFirst: true,
        },
      );
  type VersionRow = Record<string, string | number | null | undefined>;
  const calendarRow = (row: VersionRow) => ({
    'safety_stock.target_month': row.month,
    'safety_stock.inventory_version': row.inventory_version,
  });
  const versions = result.rows.map(calendarRow);
  const usableVersions = result.rows
    .filter((row: VersionRow) => Number(row.usable_plan_rows) > 0)
    .map(calendarRow);
  const usableScope = selectDefaultPublishedTargetInventory(usableVersions, now);
  return {
    rows: usableScope.published ? usableVersions : versions,
    scope: usableScope.published
      ? usableScope
      : selectDefaultPublishedTargetInventory(versions, now),
    configVersion: result.configVersion,
  };
}

export async function readConfiguredTargetScope(
  client: ReturnType<typeof createAgentQueries>,
  asOf: string,
  signal?: AbortSignal,
) {
  const { scope, configVersion } = await readConfiguredTargetCalendar(client, asOf, signal);
  if (!scope.published)
    throw Object.assign(Error('当前没有可用的已发布目标月份与版本'), {
      code: 'SOURCE_NOT_AVAILABLE',
    });
  return { ...scope, configVersion };
}
