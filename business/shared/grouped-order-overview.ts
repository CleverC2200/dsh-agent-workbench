import { createAgentQueries, type ConfiguredExecution } from './agent-query';
import type { AgentSqlConfig } from './sql-config';

/** One scan, separate business scopes: never sum factory and branch fulfillment rates. */
export async function readGroupedOrderOverview(
  config: AgentSqlConfig,
  asOf: string,
  options: { signal?: AbortSignal; execute?: ConfiguredExecution } = {},
) {
  const definition = config.overviewOrderGroups;
  const query = config.queries[definition.queryId];
  const day = new Date(asOf + 'T00:00:00Z');
  if (!Number.isFinite(day.valueOf()) || day.toISOString().slice(0, 10) !== asOf)
    throw Object.assign(Error('读取日期无效'), { code: 'INVALID_PERIOD' });
  day.setUTCDate(day.getUTCDate() + 1);
  const values = Object.fromEntries(
    Object.entries(query.parameterSpec).map(([key, spec]: any) => [
      spec.name,
      spec.name === 'start'
        ? asOf.slice(0, 7) + '-01'
        : spec.name === 'end_exclusive'
          ? day.toISOString().slice(0, 10)
          : structuredClone(query.request.parameters[key]),
    ]),
  );
  values.pickup_type_mode = 'all';
  values.pickup_type = null;
  const result = await createAgentQueries(config, options.execute).read(
    definition.queryId,
    values,
    { signal: options.signal, requiredColumns: query.resultColumns },
  );
  const parts: Record<string, any> = {};
  for (const [id, type] of Object.entries(definition.views)) {
    const rows = result.rows.filter((row: any) => row.pickup_type === type);
    const count = rows[0]?.row_count;
    if (
      rows.length > 1 ||
      (rows.length && (count == null || !Number.isSafeInteger(Number(count)) || Number(count) < 1))
    )
      throw Object.assign(Error('订单汇总返回无效'), { code: 'INVALID_SUMMARY' });
    const { pickup_type: _type, ...summary } = rows[0] ?? {};
    parts[id] = {
      summary: rows.length ? summary : null,
      total: rows.length ? Number(count) : 0,
      snapshotDate: null,
      configVersion: result.configVersion,
    };
  }
  return parts;
}
