import { createAgentQueries, type ConfiguredExecution } from './agent-query';
import type { AgentSqlConfig } from './sql-config';

export async function qllPublishedDate(
  config: AgentSqlConfig,
  requested: string,
  options: { execute?: ConfiguredExecution; signal?: AbortSignal; freshAfter?: number } = {},
) {
  if (config.agentId !== 'inventory-qll' || !config.dailySummary) return requested;
  const instant = Date.parse(requested + 'T00:00:00Z');
  if (!Number.isFinite(instant) || new Date(instant).toISOString().slice(0, 10) !== requested)
    throw Object.assign(Error('读取日期无效'), { code: 'INVALID_PERIOD' });
  const snapshot = await createAgentQueries(config, options.execute, {
    freshAfter: options.freshAfter,
  }).snapshot({ signal: options.signal });
  return snapshot.kind === 'ready' &&
    snapshot.businessDate <= requested &&
    snapshot.businessDate.slice(0, 7) === requested.slice(0, 7)
    ? snapshot.businessDate
    : requested;
}
