import { metricSection } from './metric-sections.mjs';
import { loadWorkbenchReport } from './report-source.js';
import { normalizeWorkbenchBase } from '../../business/inventory-orderworkbench/base-scope.mjs';
import { metricCalculationVersion, computeWorkbenchMetrics, dayOffset } from './metric-model.mjs';
import { metricSnapshot } from './metric-components.mjs';
import { metricSpecs, metricContract, resolveMetricName } from './metric-definitions.mjs';
import { createQueryClient } from '../../business/shared/configured-query-client.mjs';
import { orderMetricGroups } from './metric-groups.mjs';
import { resolveMetricDimensions } from './metric-dimensions.mjs';

export {
  metricCalculationVersion,
  computeWorkbenchMetrics,
  metricSnapshot,
  metricContract,
  resolveMetricName,
};

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
  if (!['contract', 'summary', 'details', 'groups', undefined].includes(input.view))
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
  const base = normalizeWorkbenchBase(input.base ?? ''),
    scope = base ? 'base' : 'national',
    contract = metricContract(metric, config, scope);
  const grouping = resolveMetricDimensions(metric, input.dimensions);
  if (input.dimensions !== undefined && !['groups', 'contract'].includes(input.view))
    throw Error('ORDER_METRIC_DIMENSIONS_REQUIRE_GROUPS');
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
  if (input.view === 'groups' && grouping.unsupported.length)
    return {
      ...envelope,
      current: null,
      sources: [],
      groups: {
        availability: 'unsupported-dimension',
        dimensions: grouping.dimensions,
        rows: [],
        unsupported: grouping.contract.unsupported.filter((row) =>
          grouping.unsupported.includes(row.dimension),
        ),
        supportedDimensions: grouping.contract.supported,
        reason:
          '该维度不属于当前指标可核验的归属粒度；这不表示整个指标或其他维度未发布，也不表示无权限。',
      },
    };
  const facts = await loadWorkbenchReport(input.start, input.endExclusive, signal, {
    config,
    execute,
    now,
    singlePeriod: period,
    sections: [
      spec.section,
      ...(input.view === 'groups' &&
      grouping.dimensions.includes('director') &&
      spec.section === 'ontime'
        ? ['directors']
        : []),
    ],
    changeKinds: spec.kind ? [spec.kind] : undefined,
    metadata: false,
    summary: !(
      input.view === 'groups' &&
      grouping.dimensions.includes('sku') &&
      !['changes', 'ontime'].includes(spec.section)
    ),
    periodQueries: false,
    groupedChanges: input.view === 'groups',
    groupDimensions: grouping.dimensions,
    customerGroups:
      input.view === 'groups' &&
      grouping.dimensions.some((key) =>
        ['customer', 'region', 'province', 'salesRegion'].includes(key),
      ) &&
      spec.section === 'orders',
    geographyOntime:
      input.view === 'groups' &&
      grouping.dimensions.some((key) => ['region', 'province', 'salesRegion'].includes(key)) &&
      spec.section === 'ontime',
    base,
    turnoverScope: scope,
  });
  const currentPeriod = facts.periods.month;
  const current = metricSnapshot(currentPeriod, metric, {
    base,
    turnoverScope: scope,
  });
  const sources = currentPeriod.sections.map((part) => ({
    id: part.id,
    status: metricSection(currentPeriod, part.id, metric)?.status ?? part.status,
    code: metricSection(currentPeriod, part.id, metric)?.code ?? part.code,
    detail: metricSection(currentPeriod, part.id, metric)?.detail ?? part.detail,
    rows: part.rows.length,
    dates: [
      ...new Set(part.rows.map((row) => row.stock_date ?? row.snapshot_date).filter(Boolean)),
    ],
  }));
  const result = { ...envelope, current, sources, readAt: facts.readAt };
  if (input.view === 'groups') {
    const groups = orderMetricGroups(currentPeriod, metric, {
      base,
      turnoverScope: scope,
      dimensions: grouping.dimensions,
    });
    groups.contract = metricContract(metric, config, groups.calculationScope ?? scope);
    groups.contract.queryBase = base;
    groups.contract.meaning =
      '该合同用于当前维度的分组及其合计；base仍按原指标含义过滤，顶层contract/current仅为原卡片汇总，不混用不同维度的计划范围。';
    if (groups.availability === 'available') {
      const totalGroups = groups.rows.length,
        pageSize = 100;
      groups.empty = totalGroups === 0;
      groups.rows = groups.rows.slice((page - 1) * pageSize, page * pageSize);
      groups.pagination = {
        page,
        pageSize,
        totalGroups,
        hasMore: page * pageSize < totalGroups,
        outOfRange: totalGroups > 0 && (page - 1) * pageSize >= totalGroups,
        meaning:
          '当前页按维度排序，非指标排名；total与reconciliation来自全量，当前页不能冒充完整分组。',
      };
    }
    return { ...result, groups };
  }
  if (input.view === 'details') {
    if (!spec.details)
      return {
        ...result,
        details: {
          availability: 'not-published',
          reason: '当前统一入口未发布该指标原始明细；不代表底表无数据或无权限。',
          groupedAlternative: { view: 'groups', supportedDimensions: grouping.contract.supported },
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
