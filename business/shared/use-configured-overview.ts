import { refreshConfiguredQueries } from './query-cache';
import { useEffect, useState, useRef } from 'react';
import type { FcCycleRule } from './fc-cycle-rules';
import { readConfiguredOverview } from './configured-overview';
import type { AgentSqlConfig } from './sql-config';
export function useConfiguredOverview(
  config: AgentSqlConfig,
  date: string,
  customer: string,
  revision: number,
  onRead?: (data: any) => void,
  cycleDays?: number,
  viewIds?: readonly string[],
  fcCycleRules?: FcCycleRule[],
  warehouseCode?: string,
  fcCycleWarehouse?: string,
) {
  const previousRevision = useRef(revision);
  if (previousRevision.current !== revision) {
    refreshConfiguredQueries();
    previousRevision.current = revision;
  }
  const scopeKey = JSON.stringify([
    config.agentId,
    viewIds,
    date,
    customer,
    cycleDays,
    fcCycleRules,
    warehouseCode,
    fcCycleWarehouse,
  ]);
  const [state, setState] = useState<any>({ key: scopeKey, parts: {}, busy: true, errors: [] });
  useEffect(() => {
    const controller = new AbortController();
    setState((old: any) => ({
      key: scopeKey,
      parts: old.key === scopeKey ? old.parts : {},
      busy: true,
      errors: [],
    }));
    void readConfiguredOverview(config, date, customer, {
      signal: controller.signal,
      cycleDays,
      fcCycleRules,
      warehouseCode,
      fcCycleWarehouse,
      viewIds,
      onProgress: (parts) => {
        if (!controller.signal.aborted)
          setState((old: any) => ({
            key: scopeKey,
            parts: { ...(old.key === scopeKey ? old.parts : {}), ...parts },
            busy: true,
            errors: Object.values(parts)
              .map((p: any) => p.error)
              .filter(Boolean),
          }));
      },
    })
      .then((parts) => {
        if (controller.signal.aborted) return;
        const errors = Object.values(parts)
          .map((p: any) => p.error)
          .filter(Boolean);
        setState({ key: scopeKey, parts, busy: false, errors });
        onRead?.({
          status:
            errors.length || Object.values(parts).some((part: any) => part.partial)
              ? 'partial'
              : 'available',
          date,
          customer,
          warehouseCode,
          overview: parts,
          cycleDays,
          coverage: '各来源独立统计；基地库存不等于全链库存，累计订单不等于当前待发',
        });
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setState((old: any) => ({
            key: scopeKey,
            parts: e.code === 'QUERY_CONFIG_CHANGED' || old.key !== scopeKey ? {} : old.parts,
            busy: false,
            errors: [e.message],
          }));
          onRead?.({ status: 'failed', date, customer, error: e.message });
        }
      });
    return () => controller.abort();
  }, [
    config.agentId,
    JSON.stringify(viewIds),
    date,
    customer,
    revision,
    cycleDays,
    JSON.stringify(fcCycleRules),
    warehouseCode,
    fcCycleWarehouse,
  ]);
  return state.key === scopeKey ? state : { parts: {}, busy: true, errors: [] };
}
