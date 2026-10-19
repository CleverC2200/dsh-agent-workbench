import { useEffect, useState } from 'react';
import { readConfiguredOverview } from './configured-overview';
import type { AgentSqlConfig } from './sql-config';
export function useConfiguredOverview(
  config: AgentSqlConfig,
  date: string,
  customer: string,
  revision: number,
  onRead?: (data: any) => void,
) {
  const [state, setState] = useState<any>({ parts: {}, busy: true, errors: [] });
  useEffect(() => {
    const controller = new AbortController();
    setState({ parts: {}, busy: true, errors: [] });
    void readConfiguredOverview(config, date, customer, {
      signal: controller.signal,
      onProgress: (parts) => {
        if (!controller.signal.aborted)
          setState({
            parts,
            busy: true,
            errors: Object.values(parts)
              .map((p: any) => p.error)
              .filter(Boolean),
          });
      },
    })
      .then((parts) => {
        if (controller.signal.aborted) return;
        const errors = Object.values(parts)
          .map((p: any) => p.error)
          .filter(Boolean);
        setState({ parts, busy: false, errors });
        onRead?.({
          status: errors.length ? 'partial' : 'available',
          date,
          customer,
          overview: parts,
          coverage: '各来源独立统计；基地库存不等于全链库存，累计订单不等于当前待发',
        });
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setState({ parts: {}, busy: false, errors: [e.message] });
          onRead?.({ status: 'failed', date, customer, error: e.message });
        }
      });
    return () => controller.abort();
  }, [config.agentId, date, customer, revision]);
  return state;
}
