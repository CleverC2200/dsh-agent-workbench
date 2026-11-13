import { createAgentQueries, type ConfiguredExecution } from './agent-query';
import { agentSqlConfig, type AgentSqlConfig } from './sql-config';

export async function resolveFcDataDay(
  fallback: AgentSqlConfig,
  calendarDay: string,
  options: { signal?: AbortSignal; execute?: ConfiguredExecution } = {},
): Promise<string> {
  const config = agentSqlConfig(fallback);
  if (config.agentId !== 'inventory-fc') throw Error('仅分仓当前工作台可使用汇总业务日期');
  if (!config.dailySummary) return calendarDay;
  const snapshot = await createAgentQueries(config, options.execute).snapshot(options);
  if (snapshot.kind === 'unavailable') return calendarDay;
  if (snapshot.businessDate > calendarDay) throw Error('汇总日期晚于当前日期，请核对同步任务');
  return snapshot.businessDate;
}
