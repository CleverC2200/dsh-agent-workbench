import { deriveMetrics, type MetricData } from 'dsh-agent-manage/aps-compute/metrics';
import { scopedData, type Scope } from 'dsh-agent-manage/aps-compute/adapter';

type Snapshot = MetricData & { readAt?: string };

// Keep the period and source failures beside the numbers passed to page Q&A.
// A null comparison alone cannot distinguish no history from a rejected query.
export function comparisonEvidence(
  current: Snapshot | null,
  previous: Snapshot | null,
  annual: Snapshot | null,
  scope: Scope,
  pending: boolean,
) {
  const period = (data: Snapshot | null) => {
    if (!data) return { status: pending ? 'loading' : 'unavailable', metrics: {}, sources: [] };
    const scoped = scopedData(data, scope);
    return {
      status: scoped.sections.some((section) => section.status === 'loading')
        ? 'loading'
        : 'settled',
      start: data.start,
      end: data.end,
      granularity: data.granularity,
      readAt: data.readAt,
      metrics: deriveMetrics(scoped),
      sources: scoped.sections.map(({ rows, ...source }) => ({ ...source, groups: rows.length })),
    };
  };
  return {
    scope,
    changeBasis: 'current-minus-comparison',
    rateChangeUnit: 'percentage-points',
    current: period(current),
    previous: period(previous),
    annual: period(annual),
  };
}
