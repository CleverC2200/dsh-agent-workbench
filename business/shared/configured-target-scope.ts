import type { createAgentQueries } from './agent-query';
import { selectDefaultPublishedTargetInventory } from './target-inventory-policy.js';

/** Use the authorized published calendar, not a bundled month/version example. */
export async function readConfiguredTargetScope(
  client: ReturnType<typeof createAgentQueries>,
  asOf: string,
  signal?: AbortSignal,
) {
  const result = await client.readAll(
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
  const scope = selectDefaultPublishedTargetInventory(
    result.rows.map((row: Record<string, string | number | null | undefined>) => ({
      'safety_stock.target_month': row.month,
      'safety_stock.inventory_version': row.inventory_version,
    })),
    new Date(asOf + 'T12:00:00+08:00'),
  );
  if (!scope.published)
    throw Object.assign(Error('当前没有可用的已发布目标月份与版本'), {
      code: 'SOURCE_NOT_AVAILABLE',
    });
  return { ...scope, configVersion: result.configVersion };
}
