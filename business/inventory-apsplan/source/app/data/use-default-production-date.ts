import { useEffect } from 'react';
import { calendarDay } from 'dsh-agent-manage/aps-compute/period';
import { businessDay } from '../../../../shared/business-day';
import { usesConfiguredSql } from '../../../../shared/sql-config';

export function previousBusinessDate(asOf = businessDay()) {
  return calendarDay(asOf).previous;
}

export function useDefaultProductionDate({
  enabled,
  manual,
  currentDate,
  onDate,
}: {
  enabled: boolean;
  manual: boolean;
  currentDate: string;
  onDate: (date: string) => void;
}) {
  const active = enabled && !manual && usesConfiguredSql();
  const date = previousBusinessDate();
  useEffect(() => {
    if (active && currentDate !== date) onDate(date);
  }, [active, currentDate, date, onDate]);
  return { pending: active && currentDate !== date, error: '' };
}
