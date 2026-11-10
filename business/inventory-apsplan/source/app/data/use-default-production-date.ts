import { useEffect, useState } from 'react';
import { createAgentQueries } from '../../../../shared/agent-query';
import { businessDay } from '../../../../shared/business-day';
import { usesConfiguredSql } from '../../../../shared/sql-config';
import sqlConfiguration from '../../../sql.config.json';

type Resolution =
  | { scope: string; status: 'ready' }
  | { scope: string; status: 'error'; message: string };

export function useDefaultProductionDate({
  enabled,
  manual,
  base,
  onDate,
}: {
  enabled: boolean;
  manual: boolean;
  base: string;
  onDate: (date: string) => void;
}) {
  const [resolution, setResolution] = useState<Resolution | null>(null);
  const active = enabled && !manual && usesConfiguredSql();
  const asOf = businessDay();
  const scope = JSON.stringify([base, asOf]);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    createAgentQueries(sqlConfiguration)
      .read(
        'source.production-date',
        { as_of: asOf.replaceAll('-', ''), base },
        { signal: controller.signal, requiredColumns: ['day'] },
      )
      .then(({ rows }) => {
        if (controller.signal.aborted) return;
        const day: unknown = rows[0]?.day;
        if (day != null) {
          if (typeof day !== 'string' || !/^20\d{6}$/.test(day))
            throw Error('生产数据日期格式无效');
          const iso = `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}`;
          const date = new Date(iso + 'T00:00:00Z');
          if (
            !Number.isFinite(date.valueOf()) ||
            date.toISOString().slice(0, 10) !== iso ||
            iso > asOf
          )
            throw Error('生产数据日期无效');
          onDate(iso);
        }
        setResolution({ scope, status: 'ready' });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setResolution({
            scope,
            status: 'error',
            message: error instanceof Error ? error.message : '最新生产日期读取失败',
          });
      });
    return () => controller.abort();
  }, [active, asOf, base, scope, onDate]);
  return {
    pending: active && resolution?.scope !== scope,
    error:
      active && resolution?.scope === scope && resolution.status === 'error'
        ? resolution.message
        : '',
  };
}
