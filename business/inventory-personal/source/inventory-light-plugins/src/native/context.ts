import { publish, reportElements } from '../../../../../shared/channel.js';
import { dataMode } from '../personal/live-input';
let revision = 0;
let state: any = empty();
let sending: Promise<unknown> = Promise.resolve();
function empty(requested?: unknown) {
  return {
    source: 'GEA_GOVERNED_SQL',
    realData: false,
    parts: { personalWorkbench: { loading: true, requested } },
    coverage: '当前范围读取未完成，不能使用旧指标。',
  };
}
function bounded(value: any, depth = 0): any {
  if (depth > 7) return '[已省略深层字段]';
  if (typeof value === 'string') return value.slice(0, 1200);
  if (Array.isArray(value))
    return value.length > 30
      ? {
          rows: value.slice(0, 30).map((row) => bounded(row, depth + 1)),
          totalRows: value.length,
          truncated: true,
        }
      : value.map((row) => bounded(row, depth + 1));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 40)
        .map(([key, row]) => [key, bounded(row, depth + 1)]),
    );
  return value;
}
function send(signal?: AbortSignal) {
  const current = revision,
    snapshot = state;
  const next = sending
    .catch(() => {})
    .then(async () => {
      signal?.throwIfAborted();
      if (current !== revision) return false;
      await publish(snapshot, { signal });
      signal?.throwIfAborted();
      return current === revision;
    });
  sending = next;
  return next;
}
export const pageContext = () => state;
export function updateContext(_key: string, value: any) {
  const limited = bounded(value);
  state = {
    source: 'GEA_GOVERNED_SQL',
    realData: !value.loading && value.scope?.some((row: any) => row.snapshot && !row.error),
    dataMode,
    capturedAt: new Date().toISOString(),
    parts: { personalWorkbench: limited },
    coverage: '仅当前筛选的已返回对象；截断明细不能重新汇总成全量指标。',
  };
  if (new TextEncoder().encode(JSON.stringify(state)).length > 20000)
    state.parts.personalWorkbench = {
      loading: value.loading,
      summary: value.summary,
      filters: {
        allowedFields: value.filters.allowedFields,
        current: bounded(value.filters.current),
        options: {
          riskType: value.filters.options.riskType,
          objectId: {
            totalRows: value.filters.options.objectId.length,
            truncated: true,
          },
        },
      },
      scope: { totalRows: value.scope.length, truncated: true },
      risks: { totalRows: value.risks.length, truncated: true },
      errors: bounded(value.errors.slice(0, 5).map((error: string) => error.slice(0, 600))),
      eventsAvailable: false,
      feedbackAvailable: false,
      roleAssignmentAvailable: false,
      detailsOmitted: true,
    };
  if (new TextEncoder().encode(JSON.stringify(state)).length > 20000)
    throw Error('PAGE_CONTEXT_TOO_LARGE');
  revision++;
  return send();
}
export function withdraw(requested?: unknown, signal?: AbortSignal) {
  revision++;
  state = empty(requested);
  reportElements('personal-facts', []);
  return send(signal);
}
export function clearContext() {
  revision++;
  state = empty();
  reportElements('personal-facts', []);
}
export const confirmContext = send;
