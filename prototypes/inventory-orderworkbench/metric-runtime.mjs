import { loadWorkbenchReport } from './report-source.js';
import { metricCalculationVersion, computeWorkbenchMetrics, dayOffset } from './metric-model.mjs';
import { metricSnapshot } from './metric-components.mjs';
import { metricSpecs, metricContract, resolveMetricName } from './metric-definitions.mjs';
import { createQueryClient } from '../../business/shared/configured-query-client.mjs';

export {
  metricCalculationVersion,
  computeWorkbenchMetrics,
  metricSnapshot,
  metricContract,
  resolveMetricName,
};

/** The same reader and evaluator serve a page and a page-independent governed read. */
export async function readOrderMetric(config, input, execute, signal, { now = new Date() } = {}) {
  signal?.throwIfAborted();
  const metric = resolveMetricName(input.metric),
    spec = metricSpecs[metric];
  const date = (value) =>
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value;
  if (
    !date(input.start) ||
    !date(input.endExclusive) ||
    input.start >= input.endExclusive ||
    Date.parse(input.endExclusive) - Date.parse(input.start) > 366 * 86400000
  )
    throw Error('INVALID_ORDER_METRIC_PERIOD');
  if (input.base !== undefined && (typeof input.base !== 'string' || input.base.length > 64))
    throw Error('INVALID_ORDER_METRIC_SCOPE');
  if (!['contract', 'summary', 'details', undefined].includes(input.view))
    throw Error('INVALID_ORDER_METRIC_VIEW');
  const page = input.page ?? 1;
  if (!Number.isSafeInteger(page) || page < 1 || page > 5000)
    throw Error('INVALID_ORDER_METRIC_PAGE');
  if (
    config.agentId !== 'inventory-orderworkbench' ||
    config.metricRuntime?.version !== metricCalculationVersion ||
    (input.expectedVersion !== undefined && input.expectedVersion !== metricCalculationVersion)
  )
    throw Error('ORDER_METRIC_VERSION_STALE');
  const base = input.base ?? '',
    scope = base ? 'base' : 'national',
    contract = metricContract(metric, config, scope);
  const today = new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10);
  const end = input.endExclusive < today ? input.endExclusive : today;
  const inventoryEnd =
    input.endExclusive < dayOffset(today, 1) ? input.endExclusive : dayOffset(today, 1);
  const period = { start: input.start, end, inventoryEnd, kind: 'range' };
  const envelope = {
    readonly: true,
    metric,
    version: metricCalculationVersion,
    revision: config.metricRuntime.revision,
    period: {
      start: period.start,
      endExclusive: period.end,
      inventoryEndExclusive: period.inventoryEnd,
    },
    requestedPeriod: { start: input.start, endExclusive: input.endExclusive },
    base,
    contract,
  };
  if (input.view === 'contract') return envelope;
  const facts = await loadWorkbenchReport(input.start, input.endExclusive, signal, {
    config,
    execute,
    now,
    singlePeriod: period,
    sections: [spec.section],
    changeKind: metric === '作废率' ? '1' : metric === '改单率' ? '2' : undefined,
    metadata: false,
    summary: true,
    periodQueries: false,
    base,
    turnoverScope: scope,
  });
  const currentPeriod = facts.periods.month;
  const current = metricSnapshot(currentPeriod, metric, { base, turnoverScope: scope });
  const sources = currentPeriod.sections.map((part) => ({
    id: part.id,
    status: part.metricFailures?.[metric === '作废率' ? '1' : '2'] ? 'error' : part.status,
    code: part.metricFailures?.[metric === '作废率' ? '1' : '2']?.code ?? part.code,
    detail: part.metricFailures?.[metric === '作废率' ? '1' : '2']?.detail ?? part.detail,
    rows: part.rows.length,
    dates: [
      ...new Set(part.rows.map((row) => row.stock_date ?? row.snapshot_date).filter(Boolean)),
    ],
  }));
  const result = { ...envelope, current, sources, readAt: facts.readAt };
  if (input.view === 'details') {
    if (!spec.details)
      return {
        ...result,
        details: {
          availability: 'not-published',
          reason: '当前统一入口未发布该指标原始明细；不代表底表无数据或无权限。',
        },
      };
    const client = createQueryClient(config, execute);
    const values = {
      start: period.start,
      end_exclusive: period.end,
      report_base: base,
      page_size: 200,
      offset: (page - 1) * 200,
    };
    const selected = Object.fromEntries(
      Object.values(config.queries[spec.details].parameterSpec).map((p) => [
        p.name,
        values[p.name],
      ]),
    );
    const details = await client.read(spec.details, selected, {
      signal,
      requiredColumns: config.queries[spec.details].resultColumns,
    });
    return {
      ...result,
      details: {
        ...details,
        page,
        pageSize: 200,
        availability: 'available',
        scope: '当前页明细，不替代完整汇总；不推断全国集中分布。',
      },
    };
  }
  return result;
}
