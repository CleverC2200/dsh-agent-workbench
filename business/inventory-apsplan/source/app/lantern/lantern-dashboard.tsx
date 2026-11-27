import React, {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import {
  DashboardOverviewSkeleton,
  DashboardTableSkeleton,
} from '../../../../inventory-aqkc/source/inventory-light-plugins/src/dsh-ui/workbench-loading';
import { CalendarDays, Check, ChevronDown, ChevronRight, Search, Sparkles, X } from 'lucide-react';
import {
  configuredQueryFreshAfter,
  refreshConfiguredQueries,
} from '../../../../shared/query-cache';
import { useDashboardInsight } from '../../../../shared/use-dashboard-insight';
import { useQueryIdentity } from '../../../../shared/use-query-identity';
import {
  salesOrgHierarchy,
  type SalesOrgNode,
} from 'dsh-agent-manage/aps-compute/sales-org-hierarchy';
import {
  comparisonPeriods,
  lanternCategory,
  latestBusinessDate,
  observe,
  productFacts,
  productPath,
  readLanternFacts,
  sourceLabels,
  sourceForMetric,
  shiftDay,
  trendUnavailableReason,
  type DashboardModule,
  type DashboardPeriod,
  type DateRange,
  type InventoryScope,
  type LanternFacts,
  type MetricKey,
  type Observation,
  type PeriodView,
  type ProductFilters,
  type Scope,
} from './lantern-data';
import './lantern-dashboard.css';

type Note = readonly [label: string, value: string];
type Status = readonly [label: string, tone: 'success' | 'warning' | 'risk' | 'neutral'];
type Comparison = { basis: string; reference?: string; change: Note };
type Metric = {
  name: string;
  key: MetricKey;
  value: string;
  unit?: string;
  status?: Status;
  valueDetails?: readonly Note[];
  notes?: readonly Note[];
  snapshot?: { date: string; source: string };
  period?: 'monthly' | 'order';
  detailUnit?: string;
  periodUnavailable?: boolean;
  target?: { operator: '>' | '<'; value: number };
  amount?: number | null;
  comparisons?: readonly Comparison[];
};

type MetricDefinition = Pick<Metric, 'key' | 'name' | 'target' | 'period' | 'detailUnit'> & {
  unit: string;
};

const sales: readonly MetricDefinition[] = [
  {
    key: 'budget',
    name: '销售预算达成率',
    detailUnit: '万元',
    unit: '%',
    period: 'monthly',
    target: { operator: '>', value: 95 },
  },
  {
    key: 'salesPlan',
    name: '销售提报达成率',
    unit: '%',
    detailUnit: '万件',
    period: 'monthly',
  },
  {
    key: 'amendment',
    name: '改单率',
    unit: '%',
    period: 'order',
    target: { operator: '<', value: 2 },
  },
  { key: 'openQuantity', name: '未开订单量', unit: '万件' },
  { key: 'openShortage', name: '未开订单缺货量', unit: '万件' },
];
const production: readonly MetricDefinition[] = [
  {
    key: 'production',
    name: '生产计划达成率',
    unit: '%',
    period: 'monthly',
    target: { operator: '>', value: 99 },
  },
  {
    key: 'planning',
    name: '生产规划达成率',
    unit: '%',
    detailUnit: '万件',
    period: 'monthly',
  },
  {
    key: 'fulfillment',
    name: '订单满足率',
    unit: '%',
    period: 'monthly',
    target: { operator: '>', value: 95 },
  },
];
const inventoryDefinitions: readonly MetricDefinition[] = [
  { key: 'inventory', name: '库存量', unit: '万件' },
  { key: 'age', name: '平均货龄', unit: '天' },
  { key: 'stockValue', name: '库存价值', unit: '万元' },
  { key: 'freshness', name: '库存新鲜度', unit: '%' },
  { key: 'largeDate', name: '大日期情况', unit: '万件' },
];
const inventoryMetricNames = inventoryDefinitions.map(({ name }) => name);
const inventoryMetrics = (scope?: InventoryScope) =>
  scope === 'customer'
    ? inventoryDefinitions.map((definition) => ({
        ...definition,
        unit: definition.unit === '万件' ? '万箱' : definition.unit,
      }))
    : inventoryDefinitions;
const inventoryViews: readonly { id: InventoryScope; title: string }[] = [
  { id: 'all', title: '全量库存' },
  { id: 'base', title: '基地库存' },
  { id: 'branch', title: '分仓库存' },
  { id: 'customer', title: '客户库存' },
];
const inventoryAgeThresholds = {
  base: { target: 30, severe: 60 },
  branch: { target: 60, severe: 90 },
};
const dashboardTabs = [
  { id: 'sales', title: '销售', definitions: sales },
  { id: 'production', title: '生产供应链', definitions: production },
  { id: 'inventory', title: '库存', definitions: inventoryDefinitions },
] as const;

const valueScale = (unit: string) => (unit.startsWith('万') ? 10_000 : 1);
const displayNumber = (value: number) =>
  value.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
function displayValue(value: number | null, unit: string) {
  return value === null ? '-' : displayNumber(value / valueScale(unit)) + unit;
}
function metricValue(definition: MetricDefinition, observation: Observation): Metric {
  const { value, date, details, note, failed, progress } = observation;
  const met =
    value !== null &&
    definition.target &&
    (definition.target.operator === '>'
      ? value > definition.target.value
      : value < definition.target.value);
  const risk: Status | undefined =
    value === null
      ? undefined
      : definition.key === 'planning'
        ? Math.abs(value - 100) <= 3
          ? ['健康', 'success']
          : Math.abs(value - 100) <= 10
            ? ['预警', 'warning']
            : ['严重', 'risk']
        : progress !== undefined
          ? value > progress - 3
            ? ['健康', 'success']
            : value > progress - 5
              ? ['预警', 'warning']
              : ['严重', 'risk']
          : undefined;
  return {
    ...definition,
    amount: value,
    value: value === null ? '-' : displayNumber(value / valueScale(definition.unit)),
    unit: definition.unit,
    status:
      risk ??
      (value === null
        ? failed
          ? ['查询失败', 'warning']
          : ['无数据', 'neutral']
        : definition.target
          ? [met ? '达标' : '未达', met ? 'success' : 'warning']
          : undefined),
    valueDetails:
      definition.detailUnit && details
        ? details.map(([label, amount]) => [
            label,
            displayValue(amount, definition.detailUnit ?? ''),
          ])
        : undefined,
    notes:
      progress !== undefined
        ? [['时间进度', displayValue(progress, '%')]]
        : note
          ? [[failed ? '取数状态' : '口径', note]]
          : undefined,
    snapshot: date
      ? { date, source: definition.key === 'production' ? 'MES 实绩' : '受控数据' }
      : undefined,
    periodUnavailable: value === null,
  };
}

const noFacts: LanternFacts = {};

function useLanternFacts(
  module: DashboardModule,
  period: DashboardPeriod,
  {
    inventoryScope,
    only,
    product,
    categoryView = false,
    organization = false,
    enabled = true,
  }: {
    inventoryScope?: InventoryScope;
    only?: MetricKey;
    product?: ProductFilters;
    categoryView?: boolean;
    organization?: boolean;
    enabled?: boolean;
  } = {},
) {
  const [revision, setRevision] = useState(0);
  const queryIdentity = useQueryIdentity();
  const freshness = configuredQueryFreshAfter();
  const {
    view,
    range: { from, to },
  } = period;
  const category = product?.category,
    classification = product?.classification,
    series = product?.series,
    group = product?.group,
    sku = product?.sku,
    level = product?.level;
  const key = JSON.stringify([
    module,
    view,
    from,
    to,
    inventoryScope,
    only,
    category,
    classification,
    series,
    group,
    sku,
    level,
    categoryView,
    organization,
    revision,
    queryIdentity,
    freshness,
  ]);
  const [state, setState] = useState<{ key: string; facts: LanternFacts; busy: boolean }>();
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setState({ key, facts: {}, busy: true });
    const load = () =>
      void readLanternFacts({
        module,
        period: { view, range: { from, to } },
        signal: controller.signal,
        inventoryScope,
        only,
        categoryView,
        organization,
        product:
          category === undefined
            ? undefined
            : {
                category,
                classification: classification ?? '',
                series: series ?? '',
                group: group ?? '',
                sku: sku ?? '',
                level: level ?? 0,
              },
        onSource: (source, result) => {
          setState((current) =>
            current?.key === key
              ? {
                  ...current,
                  facts: { ...current.facts, [source]: result },
                }
              : current,
          );
        },
      }).then(
        (facts) => {
          if (!controller.signal.aborted) setState({ key, facts, busy: false });
        },
        () => {
          if (!controller.signal.aborted)
            setState((current) => (current?.key === key ? { ...current, busy: false } : current));
        },
      );
    const timer = sku || group ? window.setTimeout(load, 220) : undefined;
    if (timer === undefined) load();
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    module,
    view,
    from,
    to,
    key,
    inventoryScope,
    only,
    category,
    classification,
    series,
    group,
    sku,
    level,
    categoryView,
    organization,
    enabled,
  ]);
  return {
    facts: enabled && state?.key === key ? state.facts : noFacts,
    busy: enabled && (state?.key !== key || state.busy),
    refresh: () => {
      refreshConfiguredQueries();
      setRevision((value) => value + 1);
    },
  };
}

const periodViews = [
  { id: 'year', label: '年度视角' },
  { id: 'month', label: '月度视角' },
  { id: 'week', label: '周度视角' },
  { id: 'day', label: '日度视角' },
] as const;

type SelectedPeriod = { view: PeriodView; value: string; range: DateRange };

const isoDate = (year: number, month: number, day: number) =>
  new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
const daysInMonth = (year: number, month: number) =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

function weekRange(day: string): DateRange {
  const weekday = new Date(day + 'T00:00:00Z').getUTCDay() || 7;
  return { from: shiftDay(day, 1 - weekday), to: shiftDay(day, 7 - weekday) };
}

function naturalWeeks(year: number, month: number) {
  const start = isoDate(year, month, 1);
  const end = isoDate(year, month, daysInMonth(year, month));
  const weeks = [];
  for (let from = weekRange(start).from; from <= end; from = shiftDay(from, 7)) {
    const thursday = new Date(shiftDay(from, 3) + 'T00:00:00Z');
    const week = Math.ceil(
      ((thursday.getTime() - Date.UTC(thursday.getUTCFullYear(), 0, 1)) / 86_400_000 + 1) / 7,
    );
    weeks.push({
      label: `W${week}`,
      from,
      to: shiftDay(from, 6),
      selection: from < start ? start : from,
    });
  }
  return weeks;
}

function periodRange(view: PeriodView, value: string): DateRange {
  const [year, month] = value.split('-').map(Number);
  if (view === 'year') return { from: isoDate(year, 1, 1), to: isoDate(year, 12, 31) };
  if (view === 'month')
    return { from: isoDate(year, month, 1), to: isoDate(year, month, daysInMonth(year, month)) };
  if (view === 'week') return weekRange(value);
  return { from: value, to: value };
}

function MetricCard({
  metric,
  expanded,
  onToggle,
  trendId,
}: {
  metric: Metric;
  expanded?: boolean;
  onToggle?: () => void;
  trendId?: string;
}) {
  const { snapshot, period, target, comparisons } = metric;
  const difference =
    target && metric.value !== '-'
      ? Number(metric.value.replaceAll(',', '')) - target.value
      : undefined;
  const gap =
    difference === undefined ? '-' : `${difference > 0 ? '+' : ''}${difference.toFixed(2)}pp`;
  return (
    <article className="lantern-metric">
      {onToggle && (
        <button
          type="button"
          className="lantern-metric-toggle"
          aria-label={`${metric.name}趋势`}
          aria-expanded={expanded}
          aria-controls={expanded ? trendId : undefined}
          onClick={onToggle}
        />
      )}
      <div className="lantern-metric-heading">
        <h3>{metric.name}</h3>
        {metric.status && <span data-tone={metric.status[1]}>{metric.status[0]}</span>}
      </div>
      <p className="lantern-period" data-period={period}>
        <span>
          {snapshot
            ? '快照指标'
            : period === 'monthly'
              ? '累计指标'
              : period
                ? '统计指标'
                : '库存观察'}
        </span>
        {snapshot ? (
          <time dateTime={snapshot.date}>截至 {snapshot.date}</time>
        ) : (
          period && !metric.periodUnavailable && <small>{'所选统计期间'}</small>
        )}
      </p>
      <div className="lantern-value-row">
        <p className="lantern-value">
          <strong>{metric.value}</strong>
          {metric.value !== '-' && metric.unit && <span>{metric.unit}</span>}
        </p>
        {metric.valueDetails && (
          <dl className="lantern-value-details">
            {metric.valueDetails.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
      <div className="lantern-comparisons">
        <p className="lantern-comparison-head">
          <span>对比指标</span>
          <span>变化量</span>
        </p>
        {comparisons ? (
          <dl className="lantern-details">
            {comparisons.map(({ basis, reference, change: [label, value] }) => (
              <div key={`${basis}-${label}`}>
                <dt>
                  {basis}
                  {reference && ` ${reference}`}
                </dt>
                <dd
                  data-trend={
                    value.startsWith('+') ? 'up' : value.startsWith('−') ? 'down' : undefined
                  }
                >
                  {label} <strong>{value}</strong>
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="lantern-comparison-empty">
            <span>{expanded ? '暂无对比数据' : '展开查看同期对比'}</span>
            <span>-</span>
          </p>
        )}
        {snapshot && <p className="lantern-source">{snapshot.source}</p>}
        {metric.notes && (
          <dl className="lantern-details lantern-notes">
            {metric.notes.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
      <p className="lantern-target">
        <span>{target ? `目标 ${target.operator} ${target.value}%` : '无目标'}</span>
        <strong data-tone={target ? metric.status?.[1] : undefined}>
          {target ? `差距 ${gap}` : '观察项'}
        </strong>
      </p>
    </article>
  );
}

type TrendPoint = { label: string; value: number };
type TrendSlot = { range: DateRange; value: number | null };
type HistoryEntry = { label: string; period: DashboardPeriod; facts: LanternFacts };
type History = { entries: HistoryEntry[]; busy: boolean };

const trendPageSizes = { year: 3, month: 6, week: 6, day: 6 } satisfies Record<PeriodView, number>;

function trendRanges(period: DashboardPeriod, page: number): DateRange[] {
  const size = trendPageSizes[period.view];
  const first = Math.max(1, page * size);
  let range = period.range;
  const ranges: DateRange[] = [];
  for (let index = 1; index < (page + 1) * size; index++) {
    range = periodRange(period.view, shiftDay(range.from, -1));
    if (index >= first) ranges.push(range);
  }
  return ranges;
}

function trendLabel(view: PeriodView, range: DateRange) {
  if (view === 'year') return `${range.from.slice(0, 4)}年`;
  if (view === 'month') return range.from.slice(0, 7);
  if (view === 'week' && range.from !== range.to) return `${range.from} 至 ${range.to}`;
  return range.from;
}

function useHistoricalFacts(
  timing: SelectedPeriod,
  module: DashboardModule,
  key?: MetricKey,
  inventoryScope?: InventoryScope,
  product?: ProductFilters,
  organization = false,
  categoryView = false,
): History {
  const queryIdentity = useQueryIdentity();
  const freshness = configuredQueryFreshAfter();
  const {
    view,
    range: { from, to },
  } = timing;
  const category = product?.category,
    classification = product?.classification,
    series = product?.series,
    group = product?.group,
    sku = product?.sku,
    level = product?.level;
  const queryKey = JSON.stringify([
    module,
    inventoryScope,
    key,
    organization,
    categoryView,
    view,
    from,
    to,
    category,
    classification,
    series,
    group,
    sku,
    level,
    queryIdentity,
    freshness,
  ]);
  const [history, setHistory] = useState<History & { key: string }>();
  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    const periods = comparisonPeriods({ view, range: { from, to } });
    setHistory({ key: queryKey, entries: [], busy: true });
    const finish = () => {
      if (!controller.signal.aborted)
        setHistory((current) =>
          current?.key === queryKey ? { ...current, busy: false } : current,
        );
    };
    void (async () => {
      const entries: HistoryEntry[] = [];
      for (const { label, period } of periods) {
        if (controller.signal.aborted) return;
        const facts = await readLanternFacts({
          module,
          period,
          signal: controller.signal,
          background: true,
          only: key,
          inventoryScope,
          categoryView,
          organization,
          product:
            category === undefined
              ? undefined
              : {
                  category,
                  classification: classification ?? '',
                  series: series ?? '',
                  group: group ?? '',
                  sku: sku ?? '',
                  level: level ?? 0,
                },
        });
        entries.push({ label, period, facts });
        if (!controller.signal.aborted)
          setHistory({ key: queryKey, entries: [...entries], busy: true });
        if (Object.values(facts).some((source) => source.status === 'failed' && source.restricted))
          return;
      }
    })().then(finish, finish);
    return () => controller.abort();
  }, [
    from,
    to,
    view,
    module,
    inventoryScope,
    key,
    queryKey,
    categoryView,
    organization,
    category,
    classification,
    series,
    group,
    sku,
    level,
  ]);
  return history?.key === queryKey && key ? history : { entries: [], busy: Boolean(key) };
}

function historyPoints(
  key: MetricKey,
  history: History,
  scope?: Scope,
  inventoryScope?: InventoryScope,
): TrendPoint[] {
  return history.entries.flatMap(({ label, facts, period }) => {
    const { value } = observe(key, facts, period, scope, inventoryScope);
    return value === null ? [] : [{ label, value }];
  });
}

function metricComparisons(
  amount: number | null | undefined,
  unit: string,
  view: PeriodView,
  points: TrendPoint[],
): Comparison[] | undefined {
  if (amount == null || !points.length) return undefined;
  const [previous, change, earlier, secondChange] = salesComparisonColumns[view];
  return points.map(({ label, value }) => {
    const delta = (amount - value) / valueScale(unit);
    const prefix = delta >= 0.005 ? '+' : delta <= -0.005 ? '−' : '';
    return {
      basis: label,
      reference: displayValue(value, unit),
      change: [
        label === previous ? change : label === earlier ? secondChange : '变化',
        prefix + displayNumber(Math.abs(delta)) + (unit === '%' ? 'pp' : unit),
      ],
    };
  });
}

function comparisonCells(comparisons: readonly Comparison[] | undefined) {
  return (comparisons ?? []).flatMap(({ basis, reference, change }) => [
    [basis, reference ?? '-'] as const,
    change,
  ]);
}

function MetricTrend({
  id,
  metric,
  period,
  history,
  onClose,
  footer,
}: {
  id: string;
  metric: Metric;
  period: SelectedPeriod;
  history: { slots: TrendSlot[]; busy: boolean };
  onClose: () => void;
  footer: React.ReactNode;
}) {
  const periodLabel = periodViews.find(({ id }) => id === period.view)?.label;
  const { busy } = history;
  const unit = metric.unit ?? '';
  const points = [...history.slots, { range: period.range, value: metric.amount ?? null }].map(
    ({ range, value }) => ({
      label: trendLabel(period.view, range),
      key: range.from,
      value: value === null ? null : value / valueScale(unit),
    }),
  );
  const values = points.flatMap(({ value }) => (value === null ? [] : [value]));
  const target = metric.target;
  const scaleValues = target ? [...values, target.value] : values;
  const rangeMin = Math.min(...scaleValues, ...(!scaleValues.length ? [0] : []));
  const rangeMax = Math.max(...scaleValues, ...(!scaleValues.length ? [100] : []));
  const increment = Math.max(1, (rangeMax - rangeMin) / 5);
  const magnitude = 10 ** Math.floor(Math.log10(increment));
  const step =
    ([1, 2, 2.5, 5, 10].find((multiple) => multiple * magnitude >= increment) ?? 10) * magnitude;
  const scaleMin = Math.floor((rangeMin - step / 2) / step) * step;
  const scaleMax = Math.ceil((rangeMax + step / 2) / step) * step;
  const ticks = Array.from(
    { length: Math.round((scaleMax - scaleMin) / step) + 1 },
    (_, index) => scaleMax - index * step,
  );
  const verticalPosition = (value: number) => (100 * (scaleMax - value)) / (scaleMax - scaleMin);
  const positions = points.flatMap(({ value }, index) =>
    value === null
      ? []
      : [{ index, value, x: (100 * (index + 0.5)) / points.length, y: verticalPosition(value) }],
  );
  const segments: (typeof positions)[] = [];
  for (const point of positions) {
    const last = segments.at(-1);
    if (last?.at(-1)?.index === point.index - 1) last.push(point);
    else segments.push([point]);
  }
  return (
    <section id={id} className="lantern-sales-trend" aria-labelledby={`${id}-title`}>
      <div className="lantern-trend-toolbar">
        <div>
          <h3 id={`${id}-title`}>{metric.name}趋势</h3>
          <p>
            {periodLabel} · 数据截至 {metric.snapshot?.date ?? period.range.to}
          </p>
        </div>
        <button type="button" onClick={onClose}>
          关闭趋势
        </button>
      </div>
      {busy && <p className="lantern-trend-message">正在读取趋势数据…</p>}
      {(values.length > 0 || history.slots.length > 0) && (
        <div
          className="lantern-table-scroll"
          tabIndex={0}
          role="region"
          aria-label={metric.name + '趋势明细'}
        >
          <figure
            className="lantern-trend-figure"
            style={{ minWidth: points.length * (period.view === 'week' ? 94 : 72) }}
          >
            {target && (
              <figcaption className="lantern-visually-hidden">
                目标 {target.operator} {target.value}
                {unit}
              </figcaption>
            )}
            <div className="lantern-trend-chart" aria-hidden="true">
              <div className="lantern-trend-scale">
                {ticks.map((value) => (
                  <span key={value} style={{ top: `${verticalPosition(value)}%` }}>
                    {new Intl.NumberFormat('zh-CN', { notation: 'compact' }).format(value)}
                    {unit}
                  </span>
                ))}
              </div>
              <div className="lantern-trend-plot">
                {ticks.map((tick) => (
                  <span
                    key={tick}
                    className="lantern-trend-gridline"
                    style={{ top: `${verticalPosition(tick)}%` }}
                  />
                ))}
                {!busy &&
                  points.map(
                    ({ key, value }, index) =>
                      value === null && (
                        <span
                          key={key}
                          className="lantern-trend-missing"
                          style={{
                            left: `${(100 * index) / points.length}%`,
                            width: `${100 / points.length}%`,
                          }}
                        >
                          暂无数据
                        </span>
                      ),
                  )}
                {target && (
                  <span
                    className="lantern-trend-goal"
                    style={{ top: `${verticalPosition(target.value)}%` }}
                  >
                    <span>
                      目标 {target.operator} {target.value}
                      {unit}
                    </span>
                  </span>
                )}
                {segments.some((segment) => segment.length > 1) && (
                  <svg viewBox="0 0 100 100" preserveAspectRatio="none">
                    {segments
                      .filter((segment) => segment.length > 1)
                      .map((segment) => (
                        <polyline
                          key={segment[0].index}
                          points={segment.map(({ x, y }) => `${x},${y}`).join(' ')}
                          vectorEffect="non-scaling-stroke"
                        />
                      ))}
                  </svg>
                )}
                {positions.map(({ x, y, value }) => (
                  <span
                    key={x}
                    className="lantern-trend-point"
                    data-latest={x === positions.at(-1)?.x ? true : undefined}
                    style={{ left: `${x}%`, top: `${y}%` }}
                  >
                    <span data-below={y < 14 ? 'true' : undefined}>
                      {displayNumber(value)}
                      {unit}
                    </span>
                  </span>
                ))}
              </div>
            </div>
            <table className="lantern-trend-labels" aria-label={metric.name + '趋势数值'}>
              <thead>
                <tr>
                  {points.map(({ key, label }) => (
                    <th key={key} scope="col">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {points.map(({ key, value }) => (
                    <td key={key}>{value === null ? '—' : displayNumber(value) + unit}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </figure>
        </div>
      )}
      {!busy && values.length === 0 && (
        <p className="lantern-trend-message" role="status">
          当前时间视角暂无趋势数据。
        </p>
      )}
      {footer}
    </section>
  );
}

type TrendQuery = {
  module: DashboardModule;
  period: SelectedPeriod;
  metricKey: MetricKey;
  scope?: Scope;
  inventoryScope?: InventoryScope;
  categoryView?: boolean;
  product?: ProductFilters;
};

function HistoricalMetricTrend({
  id,
  metric,
  onClose,
  ...filters
}: Omit<TrendQuery, 'metricKey'> & { id: string; metric: Metric; onClose: () => void }) {
  const identity = useQueryIdentity();
  const freshness = configuredQueryFreshAfter();
  const query = { ...filters, metricKey: metric.key };
  return (
    <TrendHistoryPanel
      key={JSON.stringify([query, identity, freshness])}
      query={query}
      id={id}
      metric={metric}
      onClose={onClose}
    />
  );
}

function TrendHistoryPanel({
  id,
  metric,
  query,
  onClose,
}: {
  id: string;
  metric: Metric;
  query: TrendQuery;
  onClose: () => void;
}) {
  const [filters] = useState(query);
  const { period, metricKey, scope, inventoryScope, ...request } = filters;
  const unavailable = trendUnavailableReason(metricKey, period, inventoryScope);
  const [batch, setBatch] = useState({ page: 0, attempt: 0 });
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed' | 'restricted'>('loading');
  const [history, setHistory] = useState<TrendSlot[]>(() =>
    unavailable
      ? []
      : trendRanges(period, 0)
          .map((range) => ({ range, value: null }))
          .reverse(),
  );
  useEffect(() => {
    if (unavailable) return;
    const pending = new AbortController();
    const ranges = trendRanges(period, batch.page);
    void (async () => {
      let failed = false;
      for (const range of ranges) {
        pending.signal.throwIfAborted();
        const historyPeriod = { view: period.view, range };
        const facts = await readLanternFacts({
          ...request,
          only: metricKey,
          period: historyPeriod,
          signal: pending.signal,
          inventoryScope,
          background: true,
        });
        pending.signal.throwIfAborted();
        const issues = Object.values(facts).filter((source) => source.status === 'failed');
        const { value } = observe(metricKey, facts, historyPeriod, scope, inventoryScope);
        setHistory((existing) =>
          existing.map((slot) => (slot.range.from === range.from ? { range, value } : slot)),
        );
        if (issues.some((issue) => issue.restricted)) {
          setStatus('restricted');
          return;
        }
        failed ||= issues.length > 0;
      }
      setStatus(failed ? 'failed' : 'ready');
    })().catch(() => {
      if (!pending.signal.aborted) setStatus('failed');
    });
    return () => pending.abort();
  }, [batch, filters, unavailable]);

  function loadEarlier() {
    if (status !== 'ready' && status !== 'failed') return;
    const retry = status === 'failed';
    const page = retry ? batch.page : batch.page + 1;
    if (!retry) {
      const older = trendRanges(period, page)
        .map((range) => ({ range, value: null }))
        .reverse();
      setHistory((existing) => [...older, ...existing]);
    }
    setStatus('loading');
    setBatch({ page, attempt: batch.attempt + 1 });
  }

  return (
    <MetricTrend
      id={id}
      metric={metric}
      history={{ slots: history, busy: !unavailable && status === 'loading' }}
      period={period}
      onClose={onClose}
      footer={
        unavailable ? (
          <p className="lantern-trend-message">{unavailable}</p>
        ) : status === 'restricted' ? (
          <p className="lantern-trend-message" role="status">
            当前账号或指标来源未开放所需趋势数据。
          </p>
        ) : (
          <div className="lantern-trend-toolbar lantern-trend-actions">
            <p role="status">
              {status === 'failed'
                ? '部分期间查询失败。'
                : status === 'ready'
                  ? `已显示 ${history.length + 1} 个统计期间`
                  : ''}
            </p>
            <button type="button" aria-disabled={status === 'loading'} onClick={loadEarlier}>
              {status === 'failed' ? '重试这一批' : '加载更早数据'}
            </button>
          </div>
        )
      }
    />
  );
}

function MetricCards({
  metrics,
  period,
  module,
  selected,
  onSelect,
  inventoryScope = 'all',
  externalHistory,
}: {
  metrics: readonly Metric[];
  period: SelectedPeriod;
  module: DashboardModule;
  selected: string | null;
  onSelect: (name: string | null) => void;
  inventoryScope?: InventoryScope;
  externalHistory?: History;
}) {
  const [side, setSide] = useState<'left' | 'right'>('left');
  const [expandedHeight, setExpandedHeight] = useState<number>();
  const grid = useRef<HTMLDivElement>(null);
  const before = useRef<DOMRect | null>(null);
  const animatedCard = useRef<HTMLElement | null>(null);
  const restoreFocus = useRef(false);
  const active = metrics.find(({ name }) => name === selected);
  const trendId = `lantern-${module}-trend`;
  const history = useHistoricalFacts(
    period,
    module,
    externalHistory ? undefined : active?.key,
    inventoryScope,
  );
  const trend = externalHistory ?? history;
  const points = active ? historyPoints(active.key, trend, undefined, inventoryScope) : [];
  const comparisons = active?.unit
    ? metricComparisons(active.amount, active.unit, period.view, points)
    : undefined;

  function findCard(name: string | null) {
    return Array.from(grid.current?.querySelectorAll<HTMLElement>('[data-metric]') ?? []).find(
      (card) => card.dataset.metric === name,
    );
  }

  function toggle(name: string, focusCard = false) {
    const card = findCard(name);
    before.current = card?.getBoundingClientRect() ?? null;
    const bounds = grid.current?.getBoundingClientRect();
    if (selected !== name && before.current && bounds) {
      const cardCenter = before.current.left + before.current.width / 2;
      setSide(cardCenter > bounds.left + bounds.width / 2 + 1 ? 'right' : 'left');
      setExpandedHeight(before.current.height);
    }
    animatedCard.current = card ?? null;
    restoreFocus.current = focusCard;
    onSelect(selected === name ? null : name);
  }

  useLayoutEffect(() => {
    const card = animatedCard.current;
    const start = before.current;
    before.current = null;
    if (!card) return;
    if (restoreFocus.current) card.querySelector('button')?.focus({ preventScroll: true });
    if (!start || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const end = card.getBoundingClientRect();
    const animation = card.animate(
      [
        { transform: `translate(${start.left - end.left}px, ${start.top - end.top}px)` },
        { transform: 'none' },
      ],
      { duration: 260, easing: 'cubic-bezier(.2,.7,.25,1)' },
    );
    return () => animation.cancel();
  }, [selected]);

  return (
    <div
      className={`lantern-metrics lantern-sales-cards${active ? ' lantern-trend-open' : ''}`}
      data-side={active ? side : undefined}
      data-card-count={metrics.length}
      data-fixed-card-height={active && expandedHeight ? '' : undefined}
      style={
        active && expandedHeight
          ? ({ '--lantern-card-height': `${expandedHeight}px` } as CSSProperties)
          : undefined
      }
      ref={grid}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && active) {
          event.stopPropagation();
          toggle(active.name, true);
        }
      }}
    >
      {metrics.map((metric) => (
        <div
          className="lantern-sales-card"
          key={metric.name}
          data-metric={metric.name}
          hidden={Boolean(active && active.name !== metric.name)}
        >
          <MetricCard
            metric={active?.name === metric.name ? { ...metric, comparisons } : metric}
            expanded={active?.name === metric.name}
            trendId={trendId}
            onToggle={() => toggle(metric.name)}
          />
        </div>
      ))}
      {active && (
        <HistoricalMetricTrend
          id={trendId}
          metric={active}
          module={module}
          period={period}
          inventoryScope={inventoryScope}
          onClose={() => toggle(active.name, true)}
        />
      )}
    </div>
  );
}

const productLevels = ['品类', '汤圆分类', '系列', '物料组', 'SKU'];

function LanternInsight({
  module,
  period,
  facts,
  loading,
}: {
  module: 'sales' | 'production';
  period: SelectedPeriod;
  facts: LanternFacts;
  loading: boolean;
}) {
  const [active, setActive] = useState(false);
  const budget = useLanternFacts('sales', period, {
    organization: true,
    only: 'budget',
    enabled: active && module === 'sales',
  });
  const definitions = module === 'sales' ? sales : production;
  const field = module === 'sales' ? 'province' : 'base';
  const available = { ...facts, ...budget.facts };
  const rankings = active
    ? definitions.map(({ key, name, target, unit }) => {
        if (key === 'openQuantity' || key === 'openShortage')
          return { name, missing: '来源按交付范围汇总，暂无可核对的省区归属' };
        const source = sourceForMetric(key, key === 'budget');
        const rows = productFacts(available, [source]);
        const areas = new Set(
          rows.flatMap((row) => {
            const area = row[field];
            return typeof area === 'string' && area.trim() && !area.startsWith('未归属')
              ? [area]
              : [];
          }),
        );
        const amounts = [...areas].flatMap((area) => {
          const scoped = field === 'province' ? { province: area } : { base: area };
          const { value } = observe(key, available, period, scoped);
          if (value === null) return [];
          const severity =
            key === 'planning' ? Math.abs(value - 100) : target?.operator === '<' ? value : -value;
          return [{ area, value, severity }];
        });
        const worst = amounts.sort(
          (a, b) => b.severity - a.severity || a.area.localeCompare(b.area, 'zh-CN'),
        )[0];
        const reported = worst
          ? amounts.filter(({ severity }) => severity === worst.severity).map(({ area }) => area)
          : [];
        return worst
          ? {
              name,
              area: reported.join('、'),
              value: displayValue(worst.value, unit),
              coverage: amounts.length,
            }
          : { name, missing: '所选期间暂无可比数据' };
      })
    : [];
  const ready = rankings.some(({ area }) => area);
  const busy = budget.busy || loading;
  const insight = useDashboardInsight(
    {
      dashboard: '汤圆定制看板',
      module,
      period: period.range,
      dimension: field === 'province' ? '省区' : '基地',
      rankings,
    },
    active && ready && !busy,
  );
  return (
    <section className="intelligent-hero panel lantern-insight" aria-label="汤圆指标分析">
      <div className="intelligent-briefing">
        <div className="lantern-trend-toolbar">
          <h3>
            <span>
              <Sparkles aria-hidden="true" /> AI 洞察
            </span>{' '}
            汤圆指标分析
          </h3>
          <button type="button" aria-expanded={active} onClick={() => setActive(!active)}>
            {active ? '收起分析' : '查看 AI 分析'}
          </button>
        </div>
        {active && (
          <>
            <ul>
              {rankings.map(({ name, area, value, missing }) => (
                <li key={name}>
                  {name} · {area ? area + ' ' + value : missing}
                </li>
              ))}
            </ul>
            {(ready || busy) && (
              <p role="status">
                {busy || insight.status === 'loading'
                  ? '正在生成分析…'
                  : insight.status === 'ready'
                    ? insight.answer
                    : 'AI 总结暂不可用，可查阅上方指标。'}
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function MetricResults({
  metrics,
  module,
  period,
  facts,
  loading,
}: {
  metrics: readonly Metric[];
  module: 'sales' | 'production';
  period: SelectedPeriod;
  facts: LanternFacts;
  loading: boolean;
}) {
  const [metric, setMetric] = useState<string | null>(null);
  return (
    <>
      {loading && !metric ? (
        <DashboardOverviewSkeleton cards={metrics.length} compact />
      ) : (
        <>
          <MetricCards
            metrics={metrics}
            period={period}
            module={module}
            selected={metric}
            onSelect={setMetric}
          />
          <LanternInsight module={module} period={period} facts={facts} loading={loading} />
        </>
      )}
      {module === 'sales' ? (
        <SalesOrgList facts={facts} period={period} loading={loading} />
      ) : (
        <ProductMetricList metrics={metrics} module={module} period={period} facts={facts} />
      )}
    </>
  );
}

const salesListTabs = [
  {
    title: '指标总览',
    columns: sales.map(({ name }) => name),
  },
  {
    title: '销售预算达成率',
    columns: ['销售额', '月度预算', '预算达成率', '达成状态'],
  },
  {
    title: '销售提报达成率',
    columns: ['实际发货量', '销售提报计划量', '销售提报达成率', '达成状态'],
  },
  ...sales
    .filter(
      ({ key, period }) => period === 'order' || key === 'openQuantity' || key === 'openShortage',
    )
    .map(({ name }) => ({
      title: name,
      columns: [name, '达成状态'],
    })),
];
const salesComparisonColumns = {
  year: ['去年同期', '同比变化', '前年同期', '较前年'],
  month: ['上月同期', '环比变化', '去年同月同期', '同比变化'],
  week: ['上周同期', '周环比', '去年同期', '同比变化'],
  day: ['前一日', '较前日', '去年同日', '同比变化'],
} satisfies Record<PeriodView, readonly string[]>;
const salesOrgLevels = ['大区', '省区', '区域', '销售组'];
const noSalesData = <span className="lantern-sales-no-data">无数据</span>;

type SalesRisk = '健康' | '预警' | '严重';
type SalesOrganization = SalesOrgNode;

type SalesColumn = { label: string; targetFor?: string };
const salesTargets = new Map(
  sales.map(({ name, target }) => [
    name,
    target ? `${target.operator} ${target.value}%` : '无目标',
  ]),
);

function SalesTableHeader({ name, columns }: { name: string; columns: readonly SalesColumn[] }) {
  return (
    <thead>
      <tr>
        <th scope="col">{name}</th>
        <th scope="col">层级</th>
        {columns.map(({ label, targetFor }) => (
          <th
            scope="col"
            key={targetFor ? `目标 ${targetFor}` : label}
            aria-label={targetFor ? `${targetFor}目标` : undefined}
          >
            {label}
          </th>
        ))}
      </tr>
    </thead>
  );
}

type ProductNode = { name: string; code?: string; children?: readonly ProductNode[] };
type ProductRow = { node: ProductNode; path: readonly string[] };
type VisibleProductRow = ProductRow & { level: number; expanded?: boolean };
const lanternCategoryRoot: ProductNode = { name: lanternCategory };

function buildProductTree(rows: ReturnType<typeof productFacts>): ProductNode[] {
  type Branch = { name: string; code?: string; children: Map<string, Branch> };
  const root = new Map<string, Branch>();
  for (const row of rows) {
    let children = root;
    for (const [index, part] of productPath(row).entries()) {
      let branch = children.get(part);
      if (!branch) {
        const name =
          index === productLevels.length - 1 && typeof row.material_name === 'string'
            ? row.material_name
            : part;
        branch = {
          name,
          code: index === productLevels.length - 1 ? part : undefined,
          children: new Map(),
        };
        children.set(part, branch);
      }
      children = branch.children;
    }
  }
  const list = (nodes: Map<string, Branch>): ProductNode[] =>
    [...nodes.values()]
      .sort((a, b) => (a.code ?? a.name).localeCompare(b.code ?? b.name, 'zh-CN'))
      .map(({ name, code, children }) => ({ name, code, children: list(children) }));
  return list(root);
}

function rowCells(
  definitions: readonly MetricDefinition[],
  facts: LanternFacts,
  period: DashboardPeriod,
  scope: Scope,
  inventoryScope?: InventoryScope,
  history?: History,
) {
  const values = new Map<string, { value: string; risk?: SalesRisk }>();
  for (const definition of definitions) {
    const data = observe(definition.key, facts, period, scope, inventoryScope);
    const metric = metricValue(definition, data);
    if (history && data.value !== null) {
      const comparisons = metricComparisons(
        data.value,
        definition.unit,
        period.view,
        historyPoints(definition.key, history, scope, inventoryScope),
      );
      for (const [label, value] of comparisonCells(comparisons)) values.set(label, { value });
    }
    const risk =
      metric.status?.[0] === '达标' || metric.status?.[0] === '健康'
        ? '健康'
        : metric.status?.[0] === '未达' || metric.status?.[0] === '预警'
          ? '预警'
          : metric.status?.[0] === '严重'
            ? '严重'
            : undefined;
    values.set(definition.name, { value: displayValue(data.value, definition.unit), risk });
    values.set('达成状态', { value: data.value === null ? '-' : (metric.status?.[0] ?? '无目标') });
    values.set('风险状态', { value: risk ?? '-', risk });
    if (definition.detailUnit && data.details) {
      for (const [name, amount] of data.details)
        values.set(name, { value: displayValue(amount, definition.detailUnit) });
    }
    if (definition.key === 'budget')
      values.set('预算达成率', { value: displayValue(data.value, '%'), risk });
  }
  return values;
}
const emptyProductFilters: ProductFilters = {
  category: lanternCategory,
  classification: '',
  series: '',
  group: '',
  sku: '',
  level: 0,
};

function childProductRows(rows: readonly ProductRow[]): ProductRow[] {
  return rows.flatMap(({ node, path }) =>
    (node.children ?? []).map((child) => ({
      node: child,
      path: [...path, child.code ?? child.name],
    })),
  );
}

function ProductDetailTable({
  metric,
  columns,
  category,
  rows,
  hasKeyword,
  onDrill,
  loading,
  targets = salesTargets,
  summary,
  baseRows = false,
  cells,
}: {
  metric: string;
  columns: readonly SalesColumn[];
  category: string;
  rows: readonly VisibleProductRow[];
  hasKeyword: boolean;
  onDrill: (path: readonly string[]) => void;
  loading: boolean;
  targets?: ReadonlyMap<string, string>;
  summary?: ReadonlyMap<string, React.ReactNode>;
  baseRows?: boolean;
  cells?: (path: readonly string[]) => ReturnType<typeof rowCells>;
}) {
  return (
    <div
      className="lantern-table-scroll lantern-sales-detail-table"
      tabIndex={0}
      role="region"
      aria-label="商品明细表格"
    >
      <table aria-label={`${metric}商品明细`}>
        <SalesTableHeader name={baseRows ? '基地' : '商品层级'} columns={columns} />
        <tbody>
          {summary && (
            <tr>
              <th scope="row">汇总</th>
              <td>-</td>
              {columns.map(({ label, targetFor }) => (
                <td key={targetFor ? `目标 ${targetFor}` : label}>
                  {targetFor ? targets.get(targetFor) : (summary.get(label) ?? '-')}
                </td>
              ))}
            </tr>
          )}
          {rows.length ? (
            rows.map(({ node, path, level, expanded }) => {
              const values = cells?.(path);
              const rowLevel = baseRows ? '基地' : productLevels[level];
              const label = baseRows
                ? `查看${node.name}品类`
                : `${expanded ? '折叠' : '展开'}${node.name}`;
              return (
                <tr key={JSON.stringify(path)} data-depth={level}>
                  <th scope="row">
                    <div className="lantern-sales-org" style={{ paddingInlineStart: level * 16 }}>
                      {baseRows || expanded !== undefined ? (
                        <button
                          type="button"
                          aria-label={label}
                          aria-expanded={baseRows ? undefined : expanded}
                          onClick={() => onDrill(path)}
                        >
                          {expanded ? (
                            <ChevronDown aria-hidden="true" />
                          ) : (
                            <ChevronRight aria-hidden="true" />
                          )}
                        </button>
                      ) : (
                        <span className="lantern-sales-leaf" aria-hidden="true" />
                      )}
                      <span title={path.join(' › ')}>
                        {node.name}
                        {node.code && ` · ${node.code}`}
                      </span>
                    </div>
                  </th>
                  <td>
                    <span className="lantern-sales-level" data-level={level}>
                      {rowLevel}
                    </span>
                  </td>
                  {columns.map(({ label, targetFor }) => (
                    <td key={targetFor ? `目标 ${targetFor}` : label}>
                      {targetFor ? targets.get(targetFor) : (values?.get(label)?.value ?? '-')}
                    </td>
                  ))}
                </tr>
              );
            })
          ) : !loading ? (
            <tr>
              <td colSpan={columns.length + 2}>
                <span role="status">
                  {hasKeyword ? '未找到匹配的商品。' : `当前快照暂无「${category}」商品明细。`}
                </span>
              </td>
            </tr>
          ) : null}
          {loading && (
            <tr>
              <td colSpan={columns.length + 2}>
                <DashboardTableSkeleton label="商品明细加载中" embedded />
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function SalesFilterSelect({
  label,
  value,
  options,
  onChange,
  disabled = false,
  emptyLabel,
}: {
  label: string;
  value: string;
  options: readonly { name: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
  emptyLabel?: string;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<CSSProperties | null>(null);

  function close(restoreFocus = false) {
    setPosition(null);
    if (restoreFocus) trigger.current?.focus({ preventScroll: true });
  }

  function open() {
    const button = trigger.current;
    const bounds = button?.closest('.lantern-dashboard')?.getBoundingClientRect();
    if (!button || !bounds) return;
    const anchor = button.getBoundingClientRect();
    const left = Math.max(6, bounds.left + 6);
    const right = Math.min(window.innerWidth - 6, bounds.right - 6);
    const width = Math.min(Math.max(anchor.width, 188), right - left);
    const below = Math.min(window.innerHeight, bounds.bottom) - anchor.bottom - 7;
    const above = anchor.top - Math.max(0, bounds.top) - 7;
    const openAbove = below < Math.min(280, 12 + (options.length + 1) * 34) && above > below;
    setPosition({
      width,
      left: Math.max(left, Math.min(anchor.left, right - width)),
      maxHeight: Math.min(280, openAbove ? above : below),
      ...(openAbove ? { bottom: window.innerHeight - anchor.top + 7 } : { top: anchor.bottom + 7 }),
    });
  }

  useEffect(() => {
    if (!position) return;
    const selected = menu.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]');
    selected?.focus({ preventScroll: true });
    selected?.scrollIntoView({ block: 'nearest' });
    const closeOutside = (event: Event) => {
      if (
        !(event.target instanceof Node) ||
        (!menu.current?.contains(event.target) && !trigger.current?.contains(event.target))
      ) {
        setPosition(null);
      }
    };
    const closeOnResize = () => setPosition(null);
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('scroll', closeOutside, true);
    window.addEventListener('resize', closeOnResize);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('scroll', closeOutside, true);
      window.removeEventListener('resize', closeOnResize);
    };
  }, [position]);

  const entries = [
    { id: '', name: `全部${label}` },
    ...Array.from(new Set(options.map(({ name }) => name)), (name) => ({ id: name, name })),
  ];
  const expanded = Boolean(position) && !disabled;
  return (
    <div className="lantern-sales-filter">
      <span id={`${id}-label`}>{label}</span>
      <button
        type="button"
        ref={trigger}
        className="lantern-sales-filter-trigger"
        aria-labelledby={`${id}-label ${id}-value`}
        aria-haspopup="listbox"
        aria-expanded={expanded}
        aria-controls={expanded ? id : undefined}
        disabled={disabled}
        onClick={() => (expanded ? close() : open())}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            open();
          }
        }}
      >
        <span id={`${id}-value`}>{value || emptyLabel || `全部${label}`}</span>
        <ChevronDown aria-hidden="true" />
      </button>
      {expanded &&
        createPortal(
          <div
            id={id}
            ref={menu}
            className="agent-workbench-ui lantern-sales-options"
            role="listbox"
            aria-labelledby={`${id}-label`}
            style={position ?? undefined}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.stopPropagation();
                close(true);
                return;
              }
              if (event.key === 'Tab') {
                close(true);
                return;
              }
              if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const rows = Array.from(
                event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]'),
              );
              const index = rows.indexOf(document.activeElement as HTMLButtonElement);
              const next =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? rows.length - 1
                    : Math.max(
                        0,
                        Math.min(rows.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)),
                      );
              rows[next]?.focus();
            }}
          >
            {entries.map(({ id: optionId, name }) => (
              <button
                key={optionId}
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={value === optionId}
                onClick={() => {
                  onChange(optionId);
                  close(true);
                }}
              >
                {name}
                {value === optionId && <Check aria-hidden="true" />}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}

function SalesSearch({
  label,
  value,
  onChange,
  placeholder = `搜索${label}`,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="lantern-sales-filter">
      <label htmlFor={id}>{label}</label>
      <div className="lantern-sales-search">
        <Search aria-hidden="true" />
        <input
          id={id}
          ref={input}
          type="search"
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
        {value && (
          <button
            type="button"
            aria-label={`清空${label}搜索`}
            className="lantern-search-clear"
            onClick={() => {
              onChange('');
              input.current?.focus();
            }}
          >
            <X aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}

function useProductFilters(
  categories: readonly ProductNode[],
  onFilters: (value: ProductFilters) => void,
  onClearBase?: () => void,
) {
  const [filters, setFilters] = useState(emptyProductFilters);
  const [expanded, setExpanded] = useState<ReadonlyMap<string, boolean>>(() => new Map());
  const { classification, series, group, sku } = filters;
  const groupQuery = group.trim().toLowerCase();
  const skuQuery = sku.trim().toLowerCase();
  const filterDepth = skuQuery ? 4 : groupQuery ? 3 : series ? 3 : classification ? 2 : 0;
  const categoryRows = categories
    .filter(({ name }) => name === lanternCategory)
    .map((node) => ({ node, path: [node.name] }));
  const classes = childProductRows(categoryRows);
  const classRows = classes.filter(({ node }) => !classification || node.name === classification);
  const allSeries = childProductRows(classRows);
  const matches = [
    () => true,
    (node: ProductNode) => !classification || node.name === classification,
    (node: ProductNode) => !series || node.name === series,
    (node: ProductNode) => !groupQuery || node.name.toLowerCase().includes(groupQuery),
    (node: ProductNode) =>
      !skuQuery ||
      node.name.toLowerCase().includes(skuQuery) ||
      node.code?.toLowerCase().includes(skuQuery),
  ];
  const rows: VisibleProductRow[] = [];
  function append(siblings: readonly ProductRow[], level: number) {
    for (const item of siblings) {
      if (!matches[level](item.node)) continue;
      const expandable = level === 0 || Boolean(item.node.children?.length);
      const open = expandable && (expanded.get(JSON.stringify(item.path)) ?? level < filterDepth);
      rows.push({ ...item, level, expanded: expandable ? open : undefined });
      if (open) append(childProductRows([item]), level + 1);
    }
  }
  append(categoryRows, 0);

  function notify(next: ProductFilters, nextExpanded: ReadonlyMap<string, boolean>) {
    const readDetails = Boolean(
      next.classification ||
      next.series ||
      next.group.trim() ||
      next.sku.trim() ||
      [...nextExpanded.values()].some(Boolean),
    );
    onFilters({ ...next, level: readDetails ? 1 : 0 });
  }
  function apply(next: ProductFilters) {
    setFilters(next);
    setExpanded(new Map());
    notify(next, new Map());
  }
  function drill(path: readonly string[]) {
    const key = JSON.stringify(path);
    const item = rows.find((row) => JSON.stringify(row.path) === key);
    if (item?.expanded === undefined) return;
    const next = new Map(expanded).set(key, !item.expanded);
    if (item.expanded) {
      const prefix = key.slice(0, -1) + ',';
      for (const id of next.keys()) if (id.startsWith(prefix)) next.delete(id);
    }
    setExpanded(next);
    notify(filters, next);
  }
  const filtering = Boolean(classification || series || groupQuery || skuQuery);
  const controls = (
    <div className="lantern-sales-filter-group" role="search" aria-label="商品筛选">
      <span className="lantern-fixed-category">
        品类 <strong>{lanternCategory}</strong>
      </span>
      <SalesFilterSelect
        label="汤圆分类"
        value={classification}
        options={classes.map(({ node }) => node)}
        disabled={!classes.length}
        onChange={(name) =>
          apply({ ...filters, classification: name, series: '', group: '', sku: '' })
        }
      />
      <SalesFilterSelect
        label="系列"
        value={series}
        options={allSeries.map(({ node }) => node)}
        disabled={!allSeries.length}
        onChange={(name) => apply({ ...filters, series: name, group: '', sku: '' })}
      />
      <SalesSearch
        label="物料组"
        value={group}
        onChange={(value) => apply({ ...filters, group: value })}
      />
      <SalesSearch
        label="SKU"
        value={sku}
        placeholder="搜索 SKU 名称或编码"
        onChange={(value) => apply({ ...filters, sku: value })}
      />
      {(onClearBase || filtering) && (
        <button
          type="button"
          onClick={() => {
            onClearBase?.();
            apply(emptyProductFilters);
          }}
        >
          清空筛选
        </button>
      )}
    </div>
  );
  return {
    controls,
    reset: () => apply(emptyProductFilters),
    filtering,
    tableProps: {
      category: lanternCategory,
      rows,
      hasKeyword: Boolean(groupQuery || skuQuery),
      onDrill: drill,
    },
  };
}

const emptyProductCategories: readonly ProductNode[] = [];

function ProductMetricList({
  metrics,
  module,
  period,
  facts,
  inventoryScope,
}: {
  metrics: readonly Metric[];
  module: 'production' | 'inventory';
  period: SelectedPeriod;
  facts: LanternFacts;
  inventoryScope?: InventoryScope;
}) {
  const { view } = period;
  const id = useId();
  const [selected, setSelected] = useState(0);
  const [dimension, setDimension] = useState(0);
  const [base, setBase] = useState('');
  const [product, setProduct] = useState(emptyProductFilters);
  const canBrowseBases = inventoryScope !== 'customer';
  const byBase = canBrowseBases && dimension === 1;
  const categoryView = !byBase;
  const active = metrics[selected - 1];
  const keys: Parameters<typeof productFacts>[1] =
    module === 'production'
      ? ['production', 'planning', 'fulfillment']
      : !inventoryScope || inventoryScope === 'all'
        ? ['base', 'branch']
        : [inventoryScope];
  const needsDetail = product.level > 0 || Boolean(product.group.trim() || product.sku.trim());
  const baseNames = new Set(
    productFacts(facts, keys).flatMap(({ base }) =>
      typeof base === 'string' && base.trim() ? [base] : [],
    ),
  );
  const bases = [...baseNames]
    .sort((a, b) => a.localeCompare(b, 'zh-CN'))
    .map((name) => ({ name }));
  const categoryData = useLanternFacts(module, period, {
    inventoryScope,
    categoryView,
    only: active?.key,
    enabled: categoryView,
  });
  const detail = useLanternFacts(module, period, {
    inventoryScope,
    categoryView,
    only: active?.key,
    product,
    enabled: needsDetail,
  });
  const aggregateFacts = categoryView ? categoryData.facts : facts;
  const tableFacts = needsDetail ? detail.facts : aggregateFacts;
  const listBusy = needsDetail ? detail.busy : categoryData.busy;
  const categories = useMemo(() => {
    if (byBase && !base) return emptyProductCategories;
    const rows = buildProductTree(productFacts(tableFacts, keys, { base: base || undefined }));
    return rows.length ? rows : [lanternCategoryRoot];
  }, [tableFacts, module, inventoryScope, base, byBase]);
  const products = useProductFilters(
    categories,
    setProduct,
    byBase && base ? () => setBase('') : undefined,
  );
  const showBaseRows = byBase && !base && !products.filtering;
  const history = useHistoricalFacts(
    period,
    module,
    !listBusy && keys.some((key) => tableFacts[key]?.status === 'ready') ? active?.key : undefined,
    inventoryScope,
    needsDetail ? product : undefined,
    false,
    categoryView,
  );
  const definitions = module === 'production' ? production : inventoryMetrics(inventoryScope);
  const labels = ['指标总览', ...metrics.map(({ name }) => name)];
  const comparisons = salesComparisonColumns[view];
  const summaryMetrics = categoryView
    ? definitions.map((definition) =>
        metricValue(
          definition,
          observe(definition.key, aggregateFacts, period, {}, inventoryScope),
        ),
      )
    : metrics;
  const summaryActive = summaryMetrics.find((metric) => metric.key === active?.key);
  function showsAssessment(name: string) {
    return (
      module !== 'inventory' ||
      !(
        name === '库存价值' ||
        name === '大日期情况' ||
        (name === '平均货龄' && inventoryScope === 'all')
      )
    );
  }

  const columns: SalesColumn[] = active
    ? [
        ...(showsAssessment(active.name) ? [{ label: '目标', targetFor: active.name }] : []),
        { label: active.name },
        ...(active.key === 'planning'
          ? [{ label: '实际入库量' }, { label: '纠偏生产计划量' }]
          : []),
        ...(showsAssessment(active.name) ? [{ label: '达成状态' }, { label: '风险状态' }] : []),
        ...comparisons.map((label) => ({ label })),
      ]
    : metrics.flatMap(({ name }) =>
        showsAssessment(name)
          ? [{ label: '目标', targetFor: name }, { label: name }]
          : [{ label: name }],
      );
  const targets = new Map(
    metrics.map(({ name, target }) => [
      name,
      target ? `${target.operator} ${target.value}%` : '无目标',
    ]),
  );
  const summary = new Map<string, React.ReactNode>(
    summaryMetrics.map(({ name, value, unit }) => [name, unit ? `${value} ${unit}` : value]),
  );
  targets.set('生产规划达成率', '距 100% 不超过 3pp');
  const ageThresholds =
    inventoryScope === 'base' || inventoryScope === 'branch'
      ? inventoryAgeThresholds[inventoryScope]
      : undefined;
  if (ageThresholds) targets.set('平均货龄', `< ${ageThresholds.target} 天`);
  if (inventoryScope === 'customer') targets.set('平均货龄', '-');

  if (summaryActive) {
    for (const [name, value] of summaryActive.valueDetails ?? []) summary.set(name, value);
    const status = summaryActive.status?.[0];
    summary.set('达成状态', summaryActive.value === '-' ? '无数据' : (status ?? '无目标'));
    summary.set(
      '风险状态',
      status && ['健康', '预警', '严重', '大日期风险'].includes(status) ? status : '-',
    );
    if (
      summaryActive.name === '平均货龄' &&
      ageThresholds &&
      Number.isFinite(Number(summaryActive.value))
    ) {
      const age = Number(summaryActive.value);
      const met = age < ageThresholds.target;
      const achievement = met ? '达标' : '未达';
      const risk = met ? '健康' : age < ageThresholds.severe ? '预警' : '严重';
      summary.set(
        '达成状态',
        <span className="lantern-sales-achievement" data-achievement={achievement}>
          {achievement}
        </span>,
      );
      summary.set(
        '风险状态',
        <span className="lantern-sales-risk" data-risk={risk}>
          {risk}
        </span>,
      );
    }
    if (summaryActive.unit) {
      const comparisons = metricComparisons(
        summaryActive.amount,
        summaryActive.unit,
        view,
        historyPoints(summaryActive.key, history, undefined, inventoryScope),
      );
      for (const [label, value] of comparisonCells(comparisons)) summary.set(label, value);
    }
  }

  function selectBase(name: string) {
    setBase(name);
    products.reset();
  }

  function switchDimension(index: number) {
    if (dimension !== index) selectBase('');
    setDimension(index);
  }

  return (
    <section className="lantern-list lantern-sales-list" aria-labelledby={`${id}-heading`}>
      <div className="lantern-list-toolbar">
        <h2 id={`${id}-heading`}>指标清单</h2>
        <span className="lantern-drilldown-path">
          {(byBase ? ['基地', ...productLevels] : productLevels).join(' › ')}
        </span>
      </div>
      <div className="lantern-sales-panel">
        <div
          className="lantern-module-tabs lantern-sales-tabs"
          role="tablist"
          aria-label="清单指标"
          style={{ '--lantern-list-tabs': labels.length } as CSSProperties}
          onKeyDown={(event) =>
            selectTabWithKeyboard(event, selected, labels.length, setSelected, false)
          }
        >
          {labels.map((label, index) => (
            <button
              key={label}
              type="button"
              role="tab"
              id={`${id}-metric-${index}`}
              aria-controls={`${id}-metric-panel`}
              aria-selected={index === selected}
              tabIndex={index === selected ? 0 : -1}
              onClick={() => setSelected(index)}
            >
              {label}
            </button>
          ))}
        </div>
        <div id={`${id}-metric-panel`} role="tabpanel" aria-labelledby={`${id}-metric-${selected}`}>
          <div className={`lantern-sales-filters${byBase ? ' lantern-base-filters' : ''}`}>
            {canBrowseBases && (
              <div
                className="lantern-inventory-switch lantern-sales-dimension"
                role="tablist"
                aria-label="清单维度"
                style={
                  {
                    '--inventory-tab-index': dimension,
                    '--inventory-tab-count': 2,
                  } as CSSProperties
                }
                onKeyDown={(event) =>
                  selectTabWithKeyboard(event, dimension, 2, switchDimension, false)
                }
              >
                {['品类维度', '基地维度'].map((label, index) => (
                  <button
                    key={label}
                    type="button"
                    role="tab"
                    id={`${id}-dimension-${index}`}
                    aria-controls={`${id}-dimension-panel`}
                    aria-selected={dimension === index}
                    tabIndex={dimension === index ? 0 : -1}
                    onClick={() => switchDimension(index)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            {byBase && (
              <SalesFilterSelect label="基地" value={base} options={bases} onChange={selectBase} />
            )}
            {products.controls}
          </div>
          <div
            id={`${id}-dimension-panel`}
            role={canBrowseBases ? 'tabpanel' : undefined}
            aria-labelledby={canBrowseBases ? `${id}-dimension-${dimension}` : undefined}
          >
            {history.busy && <p role="status">正在读取清单同期数据…</p>}
            {(categoryView || needsDetail) &&
              Object.values(tableFacts).some((source) => source.status === 'failed') && (
                <p role="status">部分商品指标查询失败</p>
              )}
            <ProductDetailTable
              {...products.tableProps}
              metric={active?.name ?? labels[0]}
              columns={columns}
              targets={targets}
              summary={!byBase && !products.filtering ? summary : undefined}
              category={[byBase ? base : '', products.tableProps.category]
                .filter(Boolean)
                .join(' / ')}
              loading={listBusy}
              baseRows={showBaseRows}
              cells={(path) =>
                rowCells(
                  active
                    ? definitions.filter((definition) => definition.key === active.key)
                    : definitions,
                  !showBaseRows && path.length > 1 ? tableFacts : aggregateFacts,
                  period,
                  showBaseRows ? { base: path[0] } : { base: base || undefined, product: path },
                  inventoryScope,
                  history,
                )
              }
              {...(showBaseRows
                ? {
                    rows: bases.map((node) => ({ node, path: [node.name], level: 0 })),
                    onDrill: ([name]) => selectBase(name),
                  }
                : {})}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function SalesOrgList({
  period,
  facts: primaryFacts,
  loading,
}: {
  period: SelectedPeriod;
  facts: LanternFacts;
  loading: boolean;
}) {
  const { view } = period;
  const [selected, setSelected] = useState(0);
  const [dimension, setDimension] = useState(0);
  const [product, setProduct] = useState(emptyProductFilters);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [region, setRegion] = useState('');
  const [province, setProvince] = useState('');
  const [search, setSearch] = useState('');
  const [filterOverrides, setFilterOverrides] = useState<ReadonlyMap<string, boolean>>(
    () => new Map(),
  );
  const keyword = search.trim().toLocaleLowerCase();
  const filtering = Boolean(region || province || keyword);
  const tab = salesListTabs[selected];
  const isOverview = selected === 0;
  const listMetric = isOverview ? undefined : sales.find(({ name }) => name === tab.title)?.key;
  const mergedDimensions = listMetric === 'budget' || listMetric === 'salesPlan';
  const useProductOnly = listMetric === 'openQuantity' || listMetric === 'openShortage';
  const hasProductDimension = listMetric !== undefined && !useProductOnly && !mergedDimensions;
  const showProductList =
    mergedDimensions || useProductOnly || (hasProductDimension && dimension === 1);
  const showOrganization = mergedDimensions || !showProductList;
  const budgetOrganization = useLanternFacts('sales', period, {
    only: 'budget',
    organization: true,
    enabled: listMetric === 'budget',
  });
  const facts =
    listMetric === 'budget' ? { ...primaryFacts, ...budgetOrganization.facts } : primaryFacts;
  const organizations = useMemo(() => {
    if (listMetric === 'budget') {
      const names = new Set(
        productFacts(budgetOrganization.facts, ['budgetProvince']).flatMap(({ province }) =>
          typeof province === 'string' && province.trim() ? [province] : [],
        ),
      );
      const matches = new Map<string, string[]>();
      for (const { name, children } of salesOrgHierarchy) {
        for (const province of children ?? []) {
          if (names.has(province.name))
            matches.set(province.name, [...(matches.get(province.name) ?? []), name]);
        }
      }
      const regions = new Map<string, SalesOrgNode[]>();
      for (const province of names) {
        const region = matches.get(province);
        const group = region?.length === 1 ? region[0] : '未归属大区';
        const existing = regions.get(group) ?? [];
        existing.push({ name: province });
        regions.set(group, existing);
      }
      return [...regions].map(([name, children]) => ({ name, children }));
    }
    const roots = mergedDimensions
      ? []
      : salesOrgHierarchy.map(({ name, children }) => ({ name, children: [...(children ?? [])] }));
    const sources = mergedDimensions
      ? (['accuracy'] as const)
      : (['accuracy', 'amendment'] as const);
    for (const row of productFacts(primaryFacts, sources)) {
      if (typeof row.region !== 'string' || !row.region.trim()) continue;
      let root = roots.find(({ name }) => name === row.region);
      if (!root) {
        root = { name: row.region, children: [] };
        roots.push(root);
      }
      if (
        typeof row.province === 'string' &&
        row.province.trim() &&
        !root.children.some(({ name }) => name === row.province)
      )
        root.children.push({ name: row.province });
    }
    return roots;
  }, [budgetOrganization.facts, listMetric, mergedDimensions, primaryFacts]);
  const provinces = organizations.find(({ name }) => name === region)?.children ?? [];
  const columns: SalesColumn[] = isOverview
    ? tab.columns.flatMap((label) => [{ label: '目标', targetFor: label }, { label }])
    : [
        { label: '目标', targetFor: tab.title },
        ...[...tab.columns, '风险状态', ...salesComparisonColumns[view]].map((label) => ({
          label,
        })),
      ];
  const productData = useLanternFacts('sales', period, {
    product,
    categoryView: true,
    only: listMetric,
    enabled: showProductList,
  });
  const source = listMetric ? sourceForMetric(listMetric) : undefined;
  const currentListReady =
    source && (showProductList ? productData.facts : facts)[source]?.status === 'ready';
  const history = useHistoricalFacts(
    period,
    'sales',
    currentListReady ? listMetric : undefined,
    undefined,
    showProductList ? product : undefined,
    false,
    showProductList,
  );
  const organizationHistory = useHistoricalFacts(
    period,
    'sales',
    mergedDimensions
      ? listMetric === 'budget'
        ? budgetOrganization.facts.budgetProvince?.status === 'ready'
          ? listMetric
          : undefined
        : primaryFacts.accuracy?.status === 'ready'
          ? listMetric
          : undefined
      : undefined,
    undefined,
    undefined,
    listMetric === 'budget',
  );
  const productOptions = useMemo(() => {
    const rows = source ? buildProductTree(productFacts(productData.facts, [source])) : [];
    return rows.length ? rows : [lanternCategoryRoot];
  }, [productData.facts, source]);
  const products = useProductFilters(productOptions, setProduct);

  function switchMetric(index: number) {
    setSelected(index);
    products.reset();
    setRegion('');
    setProvince('');
    setSearch('');
    setFilterOverrides(new Map());
    setExpanded(new Set());
    setDimension(0);
  }

  function switchDimension(index: number) {
    if (index === 1 && dimension !== 1) products.reset();
    setDimension(index);
  }

  function matchesGroup({ name, children }: SalesOrganization): boolean {
    return children?.length
      ? children.some(matchesGroup)
      : name.toLocaleLowerCase().includes(keyword);
  }

  function matchesFilters(node: SalesOrganization, depth: number) {
    if (depth === 0 && region && node.name !== region) return false;
    if (depth === 1 && province && node.name !== province) return false;
    if (!keyword) return true;
    if (depth === 0 && province) {
      return node.children?.some((child) => child.name === province && matchesGroup(child));
    }
    return matchesGroup(node);
  }

  function renderRows(
    nodes: readonly SalesOrganization[],
    depth = 0,
    ancestors: readonly string[] = [],
  ): React.ReactNode {
    return nodes.map((node) => {
      if (!matchesFilters(node, depth)) return null;
      const { name, children } = node;
      const path = [...ancestors, name];
      const scope: Scope =
        listMetric === 'budget'
          ? depth === 0
            ? { provinces: children?.map(({ name }) => name) ?? [] }
            : { province: name }
          : { organization: path };
      const metrics = rowCells(
        isOverview ? sales : sales.filter((definition) => definition.name === tab.title),
        facts,
        period,
        scope,
        undefined,
        mergedDimensions ? organizationHistory : history,
      );
      const id = JSON.stringify(path);
      const hasChildren = Boolean(children?.length);
      const isExpanded = filtering
        ? (filterOverrides.get(id) ??
          Boolean(keyword || (depth === 0 && region) || (depth === 1 && province)))
        : expanded.has(id);
      const level = mergedDimensions || depth === 0 || hasChildren ? Math.min(depth, 3) : 3;
      return (
        <React.Fragment key={id}>
          <tr data-depth={depth}>
            <th scope="row">
              <div className="lantern-sales-org" style={{ paddingInlineStart: depth * 22 }}>
                {hasChildren ? (
                  <button
                    type="button"
                    aria-label={`${isExpanded ? '折叠' : '展开'}${name}`}
                    aria-expanded={isExpanded}
                    onClick={() => {
                      if (filtering) {
                        setFilterOverrides((current) => new Map(current).set(id, !isExpanded));
                        return;
                      }
                      setExpanded((current) => {
                        const next = new Set(current);
                        if (next.has(id)) next.delete(id);
                        else next.add(id);
                        return next;
                      });
                    }}
                  >
                    {isExpanded ? (
                      <ChevronDown aria-hidden="true" />
                    ) : (
                      <ChevronRight aria-hidden="true" />
                    )}
                  </button>
                ) : (
                  <span className="lantern-sales-leaf" aria-hidden="true" />
                )}
                <span>{name}</span>
              </div>
            </th>
            <td>
              <span className="lantern-sales-level" data-level={level}>
                {salesOrgLevels[level]}
              </span>
            </td>
            {columns.map(({ label: column, targetFor }) => {
              if (targetFor)
                return <td key={`目标 ${targetFor}`}>{salesTargets.get(targetFor)}</td>;
              const metric = metrics.get(column);
              const risk = column === '风险状态' ? metrics.get(tab.title)?.risk : metric?.risk;
              return (
                <td key={column}>
                  {risk && (isOverview || column === '风险状态') ? (
                    <span
                      className="lantern-sales-risk"
                      data-risk={risk}
                      title={isOverview ? risk : undefined}
                    >
                      {isOverview ? metric?.value : risk}
                      {isOverview && <span className="lantern-visually-hidden">（{risk}）</span>}
                    </span>
                  ) : (column === '达成状态' || column === '风险状态') &&
                    (!metric || metric.value === '-') ? (
                    noSalesData
                  ) : (
                    (metric?.value ?? '-')
                  )}
                </td>
              );
            })}
          </tr>
          {isExpanded && children && renderRows(children, depth + 1, path)}
        </React.Fragment>
      );
    });
  }

  return (
    <section className="lantern-list lantern-sales-list" aria-labelledby="lantern-sales-list-title">
      <div className="lantern-list-toolbar">
        <h2 id="lantern-sales-list-title">指标清单</h2>
        <span className="lantern-drilldown-path">
          {(mergedDimensions
            ? salesOrgLevels.slice(0, 2)
            : showProductList
              ? productLevels
              : salesOrgLevels
          ).join(' › ')}
        </span>
      </div>
      <div className="lantern-sales-panel">
        <div
          className="lantern-module-tabs lantern-sales-tabs"
          role="tablist"
          aria-label="销售清单指标"
          onKeyDown={(event) =>
            selectTabWithKeyboard(event, selected, salesListTabs.length, switchMetric, false)
          }
        >
          {salesListTabs.map(({ title }, index) => (
            <button
              key={title}
              type="button"
              role="tab"
              id={`lantern-sales-list-tab-${index}`}
              aria-controls="lantern-sales-list-panel"
              aria-selected={selected === index}
              tabIndex={selected === index ? 0 : -1}
              onClick={() => switchMetric(index)}
            >
              {title}
            </button>
          ))}
        </div>
        <div
          id="lantern-sales-list-panel"
          role="tabpanel"
          aria-labelledby={`lantern-sales-list-tab-${selected}`}
        >
          <div className="lantern-sales-filters">
            {hasProductDimension && (
              <div
                className="lantern-inventory-switch lantern-sales-dimension"
                role="tablist"
                aria-label="清单维度"
                style={
                  {
                    '--inventory-tab-index': dimension,
                    '--inventory-tab-count': 2,
                  } as CSSProperties
                }
                onKeyDown={(event) =>
                  selectTabWithKeyboard(event, dimension, 2, switchDimension, false)
                }
              >
                {['大区维度', '品类维度'].map((label, index) => (
                  <button
                    type="button"
                    role="tab"
                    id={`lantern-sales-dimension-${index}`}
                    key={label}
                    aria-selected={dimension === index}
                    aria-controls="lantern-sales-dimension-panel"
                    tabIndex={dimension === index ? 0 : -1}
                    onClick={() => switchDimension(index)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            {showOrganization && (
              <div className="lantern-sales-filter-group" role="search" aria-label="销售组织筛选">
                <SalesFilterSelect
                  label="大区"
                  value={region}
                  options={organizations}
                  onChange={(value) => {
                    setRegion(value);
                    setProvince('');
                    setSearch('');
                    setFilterOverrides(new Map());
                  }}
                />
                <SalesFilterSelect
                  label="省区"
                  value={province}
                  disabled={!provinces.length}
                  options={provinces}
                  onChange={(value) => {
                    setProvince(value);
                    setSearch('');
                    setFilterOverrides(new Map());
                  }}
                />
                {!mergedDimensions && (
                  <SalesSearch
                    label="销售组"
                    value={search}
                    onChange={(value) => {
                      setSearch(value);
                      setFilterOverrides(new Map());
                    }}
                  />
                )}
                {filtering && (
                  <button
                    type="button"
                    onClick={() => {
                      setRegion('');
                      setProvince('');
                      setSearch('');
                      setFilterOverrides(new Map());
                    }}
                  >
                    清空筛选
                  </button>
                )}
              </div>
            )}
          </div>
          <div
            id={hasProductDimension ? 'lantern-sales-dimension-panel' : undefined}
            role={hasProductDimension ? 'tabpanel' : undefined}
            aria-labelledby={
              hasProductDimension ? `lantern-sales-dimension-${dimension}` : undefined
            }
          >
            {(history.busy || organizationHistory.busy) && (
              <p role="status">正在读取清单同期数据…</p>
            )}
            {showOrganization &&
              ((listMetric === 'budget' ? budgetOrganization.busy : loading) ? (
                <DashboardTableSkeleton label="销售明细加载中" embedded />
              ) : (
                <div
                  className="lantern-table-scroll lantern-sales-detail-table"
                  tabIndex={0}
                  role="region"
                  aria-label="销售组织明细表格"
                >
                  <table aria-label="销售组织明细">
                    <SalesTableHeader name="组织名称" columns={columns} />
                    <tbody>
                      {organizations.some((node) => matchesFilters(node, 0)) ? (
                        renderRows(organizations)
                      ) : (
                        <tr>
                          <td colSpan={columns.length + 2}>
                            <span role="status">
                              {budgetOrganization.facts.budgetProvince?.status === 'failed'
                                ? '省区预算查询失败，可刷新重试。'
                                : filtering
                                  ? '未找到匹配的销售组织。'
                                  : '当前期间暂无销售组织明细。'}
                            </span>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              ))}
            {showProductList && (
              <div className={mergedDimensions ? 'lantern-merged-products' : ''}>
                {mergedDimensions && (
                  <div className="lantern-merged-heading">
                    <h3>汤圆商品明细</h3>
                    <p>组织明细到省区。汤圆商品数据按可见组织汇总。</p>
                  </div>
                )}
                <div className="lantern-sales-filters">{products.controls}</div>
                {Object.values(productData.facts).some((source) => source.status === 'failed') && (
                  <p role="status">商品指标查询失败，可刷新重试。</p>
                )}
                <ProductDetailTable
                  metric={tab.title}
                  columns={columns}
                  {...products.tableProps}
                  loading={productData.busy}
                  cells={(path) =>
                    rowCells(
                      sales.filter((item) => item.key === listMetric),
                      path.length === 1 ? primaryFacts : productData.facts,
                      period,
                      path.length === 1 ? {} : { product: path },
                      undefined,
                      history,
                    )
                  }
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function selectTabWithKeyboard(
  event: KeyboardEvent<HTMLDivElement>,
  selected: number,
  count: number,
  onSelect: (index: number) => void,
  activate = true,
) {
  const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
  const focused = tabs.findIndex((tab) => tab === document.activeElement);
  const current = focused >= 0 ? focused : selected;
  let next;
  switch (event.key) {
    case 'ArrowLeft':
      next = (current + count - 1) % count;
      break;
    case 'ArrowRight':
      next = (current + 1) % count;
      break;
    case 'Home':
      next = 0;
      break;
    case 'End':
      next = count - 1;
      break;
    default:
      return;
  }
  event.preventDefault();
  if (activate) onSelect(next);
  tabs[next]?.focus();
}

function InventoryComparisonTable({
  rows,
  view,
  activeScope,
  activeMetric,
}: {
  rows: readonly { id: InventoryScope; title: string; metrics: readonly Metric[] }[];
  view: PeriodView;
  activeScope: InventoryScope;
  activeMetric: string | null;
}) {
  const headingId = useId();
  const comparisons = [
    { label: '环比', source: salesComparisonColumns.month[1] },
    { label: '同比', source: salesComparisonColumns.month[3] },
  ];

  return (
    <section className="lantern-list">
      <div className="lantern-list-toolbar">
        <h2 id={headingId}>库存指标对比</h2>
      </div>
      <div
        className="lantern-table-scroll lantern-inventory-comparison"
        role="region"
        aria-labelledby={headingId}
        tabIndex={0}
      >
        <table aria-labelledby={headingId}>
          <thead>
            <tr>
              <th scope="col">库存范围</th>
              {inventoryMetricNames.map((name) => (
                <th key={name} scope="col">
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ id, title, metrics }) => {
              const cutoff = metrics.find(({ name }) => name === '库存量')?.snapshot?.date;
              const highlighted = id === activeScope && activeMetric !== null;
              return (
                <tr key={id} data-highlighted={highlighted || undefined}>
                  <th scope="row">
                    {title}
                    {cutoff && <small>库存量截至 {cutoff}</small>}
                  </th>
                  {metrics.map(({ name, value, unit, comparisons: changes }) => (
                    <td
                      key={name}
                      aria-current={highlighted && name === activeMetric ? true : undefined}
                    >
                      <div
                        className="lantern-inventory-value"
                        data-missing={value === '-' || undefined}
                      >
                        <strong>{value}</strong>
                        {value !== '-' && unit && (
                          <>
                            {' '}
                            <small>{unit}</small>
                          </>
                        )}
                      </div>
                      <dl className="lantern-inventory-changes">
                        {comparisons.map(({ label, source }) => (
                          <div key={label}>
                            <dt>{label}</dt>
                            <dd>
                              {view === 'month' && value !== '-'
                                ? (changes?.find(({ change }) => change[0] === source)?.change[1] ??
                                  '-')
                                : '-'}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function InventoryViews({
  period,
  facts,
  loading,
}: {
  period: SelectedPeriod;
  facts: LanternFacts;
  loading: boolean;
}) {
  const [selected, setSelected] = useState(0);
  const [metric, setMetric] = useState<string | null>(null);
  const count = inventoryViews.length;
  const activeKey = inventoryDefinitions.find(({ name }) => name === metric)?.key;
  const history = useHistoricalFacts(period, 'inventory', activeKey);
  const rows = inventoryViews.map(({ id, title }) => ({
    id,
    title,
    metrics: inventoryMetrics(id).map((definition) => {
      const observation = observe(definition.key, facts, period, {}, id);
      const item = metricValue(definition, observation);
      if (definition.key === activeKey)
        item.comparisons = metricComparisons(
          observation.value,
          definition.unit,
          period.view,
          historyPoints(activeKey, history, undefined, id),
        );
      return item;
    }),
  }));

  function selectScope(index: number) {
    if (index === selected) return;
    setSelected(index);
    setMetric(null);
  }

  return (
    <>
      <div className="lantern-inventory-toolbar">
        <div
          className="lantern-inventory-switch"
          role="tablist"
          aria-label="库存范围"
          style={
            { '--inventory-tab-index': selected, '--inventory-tab-count': count } as CSSProperties
          }
          onKeyDown={(event) => selectTabWithKeyboard(event, selected, count, selectScope)}
        >
          {inventoryViews.map(({ id, title }, index) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`lantern-inventory-tab-${id}`}
              aria-selected={selected === index}
              aria-controls={`lantern-inventory-panel-${id}`}
              tabIndex={selected === index ? 0 : -1}
              onClick={() => selectScope(index)}
            >
              {title}
            </button>
          ))}
        </div>
      </div>
      {rows.map(({ id, metrics }, index) => (
        <div
          key={id}
          className="lantern-inventory-panel"
          role="tabpanel"
          id={`lantern-inventory-panel-${id}`}
          aria-labelledby={`lantern-inventory-tab-${id}`}
          hidden={selected !== index}
          tabIndex={0}
        >
          {selected === index && (
            <>
              <header>
                <h2 className="lantern-kpi-title">核心指标</h2>
              </header>
              {loading && !metric ? (
                <>
                  <DashboardOverviewSkeleton cards={metrics.length} compact />
                  <DashboardTableSkeleton label="库存对比加载中" />
                </>
              ) : (
                <>
                  <MetricCards
                    metrics={metrics}
                    period={period}
                    module="inventory"
                    externalHistory={history}
                    inventoryScope={id}
                    selected={metric}
                    onSelect={setMetric}
                  />
                  <InventoryComparisonTable
                    rows={rows}
                    view={period.view}
                    activeScope={id}
                    activeMetric={metric}
                  />
                  <ProductMetricList
                    metrics={metrics}
                    module="inventory"
                    period={period}
                    facts={facts}
                    inventoryScope={id}
                  />
                </>
              )}
            </>
          )}
        </div>
      ))}
    </>
  );
}

function PeriodDatePicker({
  period,
  onChange,
}: {
  period: SelectedPeriod;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const { view, value } = period;
  const [year, month, day] = value.split('-').map(Number);
  const latest = latestBusinessDate();
  const lastDay = daysInMonth(year, month);
  const weeks = view === 'week' ? naturalWeeks(year, month) : [];
  const shortDate = (date: string) => date.slice(5).replace('-', '.');
  const currentWeek = weeks.find(({ from, to }) => from <= value && value <= to);
  const monthLabel = `${year}年${month}月`;
  const label =
    view === 'year'
      ? `${year}年`
      : view === 'day'
        ? `${monthLabel}${day}日`
        : currentWeek
          ? `${monthLabel} · ${currentWeek.label}`
          : monthLabel;

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !wrap.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);

  function choose(nextYear: number, nextMonth: number, nextDay: number, close = false) {
    const date = isoDate(nextYear, nextMonth, Math.min(nextDay, daysInMonth(nextYear, nextMonth)));
    onChange(date > latest ? latest : date);
    if (close) {
      setOpen(false);
      trigger.current?.focus();
    }
  }

  return (
    <div
      className="lantern-date-wrap"
      ref={wrap}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
      onBlur={(event) => {
        if (
          event.relatedTarget instanceof Node &&
          !event.currentTarget.contains(event.relatedTarget)
        )
          setOpen(false);
      }}
    >
      <button
        type="button"
        className="lantern-date-button"
        ref={trigger}
        aria-label={`统计日期 ${label}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="lantern-date-picker"
        onClick={() => setOpen((previous) => !previous)}
      >
        <CalendarDays aria-hidden="true" />
        <span>{label}</span>
        <ChevronDown aria-hidden="true" />
      </button>
      {open && (
        <div
          id="lantern-date-picker"
          className="lantern-date-picker"
          role="dialog"
          aria-label="统计日期筛选"
        >
          <p>选择{view === 'year' ? '年份' : view === 'day' ? '日期' : '年月'}</p>
          <div className="lantern-date-options">
            <div className="lantern-date-section">
              <strong>年</strong>
              <div className="lantern-date-years">
                {Array.from(
                  { length: Number(latest.slice(0, 4)) - 2024 },
                  (_, index) => 2025 + index,
                ).map((option) => (
                  <button
                    type="button"
                    key={option}
                    aria-pressed={year === option}
                    onClick={() => choose(option, month, day)}
                  >
                    {option}年
                  </button>
                ))}
              </div>
            </div>
            {view !== 'year' && (
              <div className="lantern-date-section">
                <strong>月</strong>
                <div className="lantern-date-months">
                  {Array.from({ length: 12 }, (_, index) => index + 1).map((option) => (
                    <button
                      type="button"
                      key={option}
                      aria-pressed={month === option}
                      disabled={isoDate(year, option, 1) > latest}
                      onClick={() => choose(year, option, day)}
                    >
                      {option}月
                    </button>
                  ))}
                </div>
              </div>
            )}
            {view === 'week' && (
              <div className="lantern-date-section">
                <strong>自然周</strong>
                <div className="lantern-date-weeks">
                  {weeks.map((week) => (
                    <button
                      type="button"
                      key={week.from}
                      aria-pressed={currentWeek?.from === week.from}
                      disabled={week.from > latest}
                      onClick={() => choose(year, month, Number(week.selection.slice(-2)), true)}
                    >
                      <strong>{week.label}</strong>{' '}
                      <span>
                        {shortDate(week.from)}–{shortDate(week.to)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {view === 'day' && (
              <div className="lantern-date-section">
                <strong>日</strong>
                <div className="lantern-date-days">
                  {Array.from({ length: lastDay }, (_, index) => index + 1).map((option) => (
                    <button
                      type="button"
                      key={option}
                      aria-label={`${monthLabel}${option}日`}
                      aria-pressed={day === option}
                      disabled={isoDate(year, month, option) > latest}
                      onClick={() => choose(year, month, option, true)}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function LanternDashboard() {
  const [selected, setSelected] = useState(0);
  const [periodIndex, setPeriodIndex] = useState(1);
  const [value, setValue] = useState(latestBusinessDate);
  const { id: view } = periodViews[periodIndex];
  const rawRange = periodRange(view, value);
  const latest = latestBusinessDate();
  const range = { from: rawRange.from, to: rawRange.to < latest ? rawRange.to : latest };
  const period = { view, value, range };
  const { facts, busy, refresh } = useLanternFacts(dashboardTabs[selected].id, period);
  const failed = Object.entries(facts).flatMap(([source, result]) =>
    result.status === 'failed'
      ? [`${sourceLabels[source as keyof typeof sourceLabels]} ${result.reason}`]
      : [],
  );
  const timeToolbar = (
    <div className="agent-workbench-ui lantern-time-toolbar">
      <div
        className="lantern-inventory-switch lantern-period-switch"
        role="tablist"
        aria-label="统计粒度"
        style={
          {
            '--inventory-tab-index': periodIndex,
            '--inventory-tab-count': periodViews.length,
          } as CSSProperties
        }
        onKeyDown={(event) =>
          selectTabWithKeyboard(event, periodIndex, periodViews.length, setPeriodIndex, false)
        }
      >
        {periodViews.map(({ id, label }, index) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`lantern-period-tab-${id}`}
            aria-controls="lantern-period-panel"
            aria-selected={periodIndex === index}
            tabIndex={periodIndex === index ? 0 : -1}
            onClick={() => setPeriodIndex(index)}
          >
            {label}
          </button>
        ))}
      </div>
      <PeriodDatePicker key={view} period={period} onChange={setValue} />
      <button type="button" className="lantern-date-button" disabled={busy} onClick={refresh}>
        刷新
      </button>
      <p className="lantern-selected-range" aria-live="polite">
        数据范围 {range.from}
        {range.from !== range.to && ` 至 ${range.to}`}
      </p>
    </div>
  );
  return (
    <div className="agent-workbench-ui lantern-dashboard" aria-label="汤圆订制看板">
      {timeToolbar}
      <div id="lantern-period-panel" role="tabpanel" aria-labelledby={`lantern-period-tab-${view}`}>
        <div
          className="lantern-module-tabs lantern-primary-tabs"
          role="tablist"
          aria-label="看板模块"
          onKeyDown={(event) =>
            selectTabWithKeyboard(event, selected, dashboardTabs.length, setSelected, false)
          }
        >
          {dashboardTabs.map(({ id, title }, index) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`lantern-module-tab-${id}`}
              aria-controls={`lantern-module-panel-${id}`}
              aria-selected={selected === index}
              tabIndex={selected === index ? 0 : -1}
              onClick={() => setSelected(index)}
            >
              {title}
            </button>
          ))}
        </div>
        <div className="lantern-content" aria-busy={busy}>
          {failed.length > 0 && <p role="status">{failed.join(' · ')}</p>}
          {dashboardTabs.map((tab, index) => (
            <section
              className="lantern-section"
              key={tab.id}
              role="tabpanel"
              id={`lantern-module-panel-${tab.id}`}
              data-module={tab.id}
              aria-labelledby={`lantern-module-tab-${tab.id}`}
              hidden={selected !== index}
              tabIndex={selected === index ? 0 : -1}
            >
              {selected !== index ? null : tab.id === 'inventory' ? (
                <InventoryViews period={period} facts={facts} loading={busy} />
              ) : (
                <>
                  <header>
                    <h2 className="lantern-kpi-title">核心指标</h2>
                  </header>
                  <MetricResults
                    module={tab.id}
                    period={period}
                    facts={facts}
                    metrics={tab.definitions.map((definition) =>
                      metricValue(definition, observe(definition.key, facts, period)),
                    )}
                    loading={busy}
                  />
                </>
              )}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
