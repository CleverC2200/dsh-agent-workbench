import React, {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, Check, ChevronDown, ChevronRight, Search, X } from 'lucide-react';
import { baseProductHierarchy } from 'dsh-agent-manage/aps-compute/base-product-hierarchy';
import {
  salesOrgHierarchy,
  type SalesOrgNode,
} from 'dsh-agent-manage/aps-compute/sales-org-hierarchy';
import styles from './lantern-dashboard.css';

type Note = readonly [label: string, value: string];
type Status = readonly [label: string, tone: 'success' | 'warning' | 'risk' | 'neutral'];
type Comparison = { basis: string; reference?: string; change: Note };
type Metric = {
  name: string;
  value: string;
  unit?: string;
  status?: Status;
  valueDetails?: readonly Note[];
  notes?: readonly Note[];
  snapshot?: { date: string; source: string };
  period?: 'monthly' | 'order';
  periodUnavailable?: boolean;
  target?: { operator: '>' | '<'; value: number };
  comparisons?: readonly Comparison[];
};

function monthlyComparisons(previous = '—', change = '—'): readonly Comparison[] {
  return [
    { basis: '上月同期', reference: previous, change: ['环比变化', change] },
    { basis: '去年同月同期', reference: '—', change: ['同比变化', '—'] },
  ];
}

function orderComparisons(monthOnMonth: string, yearOnYear = '—'): readonly Comparison[] {
  return [
    { basis: '本期', change: ['环比', monthOnMonth] },
    { basis: '本期', change: ['同比', yearOnYear] },
  ];
}

const sales: readonly Metric[] = [
  {
    name: '销售预算达成率',
    value: '72.61',
    unit: '%',
    valueDetails: [
      ['销售额', '—'],
      ['月度预算', '—'],
    ],
    status: ['未达', 'risk'],
    period: 'monthly',
    target: { operator: '>', value: 95 },
    comparisons: monthlyComparisons('75.30%', '−2.69pp'),
  },
  {
    name: '销售提报准确率',
    value: '—',
    status: ['数据不足', 'neutral'],
    period: 'monthly',
    target: { operator: '>', value: 70 },
    comparisons: monthlyComparisons(),
    notes: [['统计范围', '11月1日–22日']],
  },
  {
    name: '作废率',
    value: '4.07',
    unit: '%',
    status: ['健康', 'success'],
    period: 'order',
    target: { operator: '<', value: 6 },
    comparisons: orderComparisons('−1.77%*'),
  },
  {
    name: '改单率',
    value: '2.16',
    unit: '%',
    status: ['预警', 'warning'],
    period: 'order',
    target: { operator: '<', value: 2 },
    comparisons: orderComparisons('−1.18%', '+2.16%'),
  },
  {
    name: '准交率',
    value: '99.74',
    unit: '%',
    status: ['健康', 'success'],
    period: 'order',
    target: { operator: '>', value: 98.5 },
    comparisons: orderComparisons('+0.14%*'),
  },
];

const production: readonly Metric[] = [
  {
    name: '生产计划达成率',
    value: '99.95',
    unit: '%',
    status: ['达标', 'success'],
    period: 'monthly',
    target: { operator: '>', value: 99 },
    comparisons: monthlyComparisons(),
    notes: [['源数据截至', '2026-11-22']],
  },
  {
    name: '订单满足率',
    value: '97.34',
    unit: '%',
    status: ['达标', 'success'],
    period: 'monthly',
    target: { operator: '>', value: 95 },
    comparisons: monthlyComparisons('95.76%', '+1.58pp'),
  },
];

const inventoryMetricNames = [
  '库存量',
  '平均货龄',
  '库存价值',
  '库存新鲜度',
  '大日期情况',
] as const;

type InventoryValues = Partial<Record<(typeof inventoryMetricNames)[number], Omit<Metric, 'name'>>>;
type InventoryScope = 'all' | 'base' | 'branch' | 'customer';

const inventoryAgeThresholds = {
  base: { target: 30, severe: 60 },
  branch: { target: 60, severe: 90 },
};

const inventoryViews: readonly {
  id: InventoryScope;
  title: string;
  values: InventoryValues;
}[] = [
  {
    id: 'all',
    title: '全量库存',
    values: {
      库存量: {
        value: '453.06',
        unit: '万件',
        snapshot: { date: '2026-11-22', source: '产销协同工作台' },
      },
      平均货龄: { value: '18.51', unit: '天' },
    },
  },
  {
    id: 'base',
    title: '基地库存',
    values: {
      库存量: {
        value: '454.11',
        unit: '万件',
        snapshot: { date: '2026-11-23', source: '全链库存工作台' },
      },
      平均货龄: { value: '17.87', unit: '天' },
    },
  },
  {
    id: 'branch',
    title: '分仓库存',
    values: {
      库存量: {
        value: '14.75',
        unit: '万件',
        snapshot: { date: '2026-11-23', source: '全链库存工作台' },
      },
      平均货龄: { value: '38.83', unit: '天' },
    },
  },
  {
    id: 'customer',
    title: '客户库存',
    values: {
      库存量: {
        value: (5_879_429 / 10_000).toFixed(2),
        unit: '万件',
        snapshot: { date: '2026-11-23', source: '客户库存（总部角色）' },
      },
      库存价值: { value: '50,255.6', unit: '万', notes: [['数据覆盖', '2,816 / 2,877 客户']] },
      库存新鲜度: {
        value: '92.8',
        unit: '%',
        notes: [
          ['数据覆盖', '1,502 / 2,877 客户'],
          ['口径', '部分数据测算上限'],
        ],
      },
      大日期情况: {
        value: (389_708 / 10_000).toFixed(2),
        unit: '万件',
        status: ['大日期风险', 'warning'],
        notes: [
          ['数据覆盖', '1,503 / 2,877 客户'],
          ['口径', '已知数量'],
        ],
      },
    },
  },
];

const missingInventoryValue: Omit<Metric, 'name'> = { value: '—', status: ['数据不足', 'neutral'] };

const groups = [
  {
    id: 'sales',
    title: '销售',
    rows: [sales],
  },
  {
    id: 'production',
    title: '生产供应链',
    rows: [production],
  },
] as const;

const dashboardTabs = [...groups, { id: 'inventory', title: '库存' }] as const;

const periodViews = [
  { id: 'year', label: '年度视角' },
  { id: 'month', label: '月度视角' },
  { id: 'week', label: '周度视角' },
  { id: 'day', label: '日度视角' },
] as const;

type PeriodView = (typeof periodViews)[number]['id'];
type DateRange = { from: string; to: string };
type SelectedPeriod = { view: PeriodView; value: string; range: DateRange };

const snapshotDate = '2026-11-23';

const isoDate = (year: number, month: number, day: number) =>
  new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
const daysInMonth = (year: number, month: number) =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

function naturalWeeks(year: number, month: number) {
  const lastDay = daysInMonth(year, month);
  const weeks = [];
  for (let start = 1; start <= lastDay;) {
    const thursday = new Date(Date.UTC(year, month - 1, start));
    const weekday = thursday.getUTCDay() || 7;
    const end = Math.min(lastDay, start + 7 - weekday);
    thursday.setUTCDate(thursday.getUTCDate() + 4 - weekday);
    const week = Math.ceil(
      ((thursday.getTime() - Date.UTC(thursday.getUTCFullYear(), 0, 1)) / 86_400_000 + 1) / 7,
    );
    weeks.push({
      label: `W${week}`,
      from: isoDate(year, month, start),
      to: isoDate(year, month, end),
    });
    start = end + 1;
  }
  return weeks;
}

function periodRange(view: PeriodView, value: string): DateRange {
  const [year, month] = value.split('-').map(Number);
  if (view === 'year') return { from: isoDate(year, 1, 1), to: isoDate(year, 12, 31) };
  if (view === 'month')
    return { from: isoDate(year, month, 1), to: isoDate(year, month, daysInMonth(year, month)) };
  if (view === 'week')
    return naturalWeeks(year, month).find(({ from, to }) => from <= value && value <= to)!;
  return { from: value, to: value };
}

function metricsForPeriod(metrics: readonly Metric[], { view, value, range }: SelectedPeriod) {
  return metrics.map((metric) => {
    const date = metric.snapshot?.date ?? snapshotDate;
    const inRange = range.from <= date && date <= range.to;
    const supported =
      metric.period === 'monthly'
        ? view === 'month' && value.startsWith('2026-11')
        : metric.period === 'order'
          ? (view === 'week' || view === 'month') && inRange
          : inRange;
    if (supported) return metric;
    return {
      name: metric.name,
      target: metric.target,
      period: metric.period,
      valueDetails: metric.valueDetails?.map(([label]) => [label, '—'] as const),
      periodUnavailable: true,
      ...missingInventoryValue,
    };
  });
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
    target && metric.value !== '—' ? Number(metric.value) - target.value : undefined;
  const gap =
    difference === undefined ? '—' : `${difference > 0 ? '+' : ''}${difference.toFixed(2)}pp`;
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
          period &&
          !metric.periodUnavailable && (
            <small>{period === 'monthly' ? '本月累计' : '11月第五周'}</small>
          )
        )}
      </p>
      <div className="lantern-value-row">
        <p className="lantern-value">
          <strong>{metric.value}</strong>
          {metric.unit && <span>{metric.unit}</span>}
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
            <span>暂无对比数据</span>
            <span>—</span>
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

function MetricTrend({
  id,
  metric,
  period,
  onClose,
}: {
  id: string;
  metric: Metric;
  period: SelectedPeriod;
  onClose: () => void;
}) {
  const periodLabel = periodViews.find(({ id }) => id === period.view)?.label;
  const month = Number(snapshotDate.slice(5, 7));
  const previous = metric.comparisons?.find(({ basis }) => basis === '上月同期')?.reference;
  const points: { label: string; value: number }[] = [];
  if (period.view === 'month' && previous && previous.endsWith('%')) {
    points.push({
      label: `${month === 1 ? 12 : month - 1}月同期`,
      value: Number(previous.slice(0, -1)),
    });
  }
  const current = Number(metric.value.replaceAll(',', ''));
  if (Number.isFinite(current)) {
    points.push({
      label:
        metric.period === 'order'
          ? `${month}月第五周`
          : metric.period === 'monthly'
            ? `${month}月累计`
            : (metric.snapshot?.date ?? snapshotDate),
      value: current,
    });
  }
  const unit = metric.unit ?? '';
  const maximum = Math.max(0, ...points.map(({ value }) => value));
  const step = unit === '%' ? 10 : 10 ** Math.floor(Math.log10(Math.max(1, maximum)));
  const scaleMin = points.length
    ? Math.max(0, Math.floor(Math.min(...points.map(({ value }) => value)) / step) * step - step)
    : 0;
  const scaleMax = points.length
    ? Math.max(
        maximum,
        Math.min(
          unit === '%' && maximum <= 100 ? 100 : Infinity,
          Math.ceil(maximum / step) * step + step,
        ),
      )
    : 100;
  const positions = points.map(({ value }, index) => ({
    x: (100 * (index + 0.5)) / points.length,
    y: (100 * (scaleMax - value)) / (scaleMax - scaleMin),
  }));
  return (
    <section id={id} className="lantern-sales-trend" aria-labelledby={`${id}-title`}>
      <div className="lantern-trend-toolbar">
        <div>
          <h3 id={`${id}-title`}>{metric.name}趋势</h3>
          <p>
            {periodLabel} · {period.range.from}
            {period.range.from !== period.range.to && ` 至 ${period.range.to}`}
          </p>
        </div>
        <button type="button" onClick={onClose}>
          关闭趋势
        </button>
      </div>
      {points.length > 0 ? (
        <figure className="lantern-trend-figure">
          <div className="lantern-trend-chart" aria-hidden="true">
            <div className="lantern-trend-scale">
              {[scaleMax, (scaleMax + scaleMin) / 2, scaleMin].map((value) => (
                <span key={value}>
                  {new Intl.NumberFormat('zh-CN', { notation: 'compact' }).format(value)}
                  {unit}
                </span>
              ))}
            </div>
            <div className="lantern-trend-plot">
              {positions.length > 1 && (
                <svg viewBox="0 0 100 100" preserveAspectRatio="none">
                  <polyline
                    points={positions.map(({ x, y }) => `${x},${y}`).join(' ')}
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
              )}
              {positions.map(({ x, y }) => (
                <span
                  key={x}
                  className="lantern-trend-point"
                  style={{ left: `${x}%`, top: `${y}%` }}
                />
              ))}
            </div>
          </div>
          <figcaption
            className="lantern-trend-labels"
            style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}
          >
            {points.map(({ label, value }) => (
              <span key={label}>
                {label}{' '}
                <strong>
                  {value.toLocaleString('zh-CN', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                  {unit}
                </strong>
              </span>
            ))}
          </figcaption>
          {points.length === 1 && <p className="lantern-trend-message">当前仅有一个统计点。</p>}
        </figure>
      ) : (
        <p className="lantern-trend-message" role="status">
          当前时间视角暂无趋势数据。
        </p>
      )}
    </section>
  );
}

function MetricCards({
  metrics,
  period,
  module,
  selected,
  onSelect,
}: {
  metrics: readonly Metric[];
  period: SelectedPeriod;
  module: DashboardModule;
  selected: string | null;
  onSelect: (name: string | null) => void;
}) {
  const [side, setSide] = useState<'left' | 'right'>('left');
  const [expandedHeight, setExpandedHeight] = useState<number>();
  const grid = useRef<HTMLDivElement>(null);
  const before = useRef<DOMRect | null>(null);
  const animatedCard = useRef<HTMLElement | null>(null);
  const restoreFocus = useRef(false);
  const active = metrics.find(({ name }) => name === selected);
  const trendId = `lantern-${module}-trend`;

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
            metric={metric}
            expanded={active?.name === metric.name}
            trendId={trendId}
            onToggle={() => toggle(metric.name)}
          />
        </div>
      ))}
      {active && (
        <MetricTrend
          id={trendId}
          metric={active}
          period={period}
          onClose={() => toggle(active.name, true)}
        />
      )}
    </div>
  );
}

const productLevels = ['品类', '系列', '物料组', 'SKU'];
type DashboardModule = 'sales' | 'production' | 'inventory';

function MetricResults({
  metrics,
  module,
  period,
}: {
  metrics: readonly Metric[];
  module: 'sales' | 'production';
  period: SelectedPeriod;
}) {
  const [metric, setMetric] = useState<string | null>(null);
  return (
    <>
      <MetricCards
        metrics={metrics}
        period={period}
        module={module}
        selected={metric}
        onSelect={setMetric}
      />
      {module === 'sales' ? (
        <SalesOrgList view={period.view} />
      ) : (
        <ProductMetricList metrics={metrics} module={module} view={period.view} />
      )}
    </>
  );
}

const salesListTabs = [
  {
    title: '五指标总览',
    columns: sales.map(({ name }) => name),
  },
  {
    title: '销售预算达成率',
    columns: ['销售额', '月度预算', '预算达成率', '达成状态'],
  },
  {
    title: '销售提报准确率',
    columns: ['初版需求预测准确率', '纠偏版需求预测准确率', '销售提报准确率', '达成状态'],
  },
  ...sales
    .filter(({ period }) => period === 'order')
    .map(({ name }) => ({
      title: name,
      columns: [name, '达成状态'],
    })),
];
const salesComparisonColumns = {
  year: ['去年同期', '同比变化', '前年同期', '较前年'],
  month: ['上月同期', '环比变化', '去年同月同期', '同比变化'],
  week: ['上周同期', '周环比', '去年同周同期', '同比变化'],
  day: ['前一日', '较前日', '去年同日', '同比变化'],
} satisfies Record<PeriodView, readonly string[]>;
const salesOrgLevels = ['大区', '省区', '区域', '销售组'];
const noSalesData = <span className="lantern-sales-no-data">无数据</span>;

type SalesRisk = '健康' | '预警' | '严重';
type SalesOrganization = Omit<SalesOrgNode, 'children'> & {
  children?: readonly SalesOrganization[];
  metrics?: Readonly<Partial<Record<string, { value: string; risk?: SalesRisk }>>>;
};

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
const salesProductCategories: readonly ProductNode[] = baseProductHierarchy.map(({ name }) => ({
  name,
}));
const emptyProductFilters = { category: '', series: '', group: '', sku: '' };

function childProductRows(rows: readonly ProductRow[]): ProductRow[] {
  return rows.flatMap(({ node, path }) =>
    (node.children ?? []).map((child) => ({ node: child, path: [...path, child.name] })),
  );
}

function ProductDetailTable({
  metric,
  columns,
  level,
  category,
  rows,
  hasKeyword,
  onDrill,
  targets = salesTargets,
  summary,
  baseRows = false,
}: {
  metric: string;
  columns: readonly SalesColumn[];
  level: number;
  category: string;
  rows: readonly ProductRow[];
  hasKeyword: boolean;
  onDrill: (category: string) => void;
  targets?: ReadonlyMap<string, string>;
  summary?: ReadonlyMap<string, React.ReactNode>;
  baseRows?: boolean;
}) {
  const rowLevel = baseRows ? '基地' : productLevels[level];
  return (
    <div
      className="lantern-table-scroll lantern-sales-detail-table"
      tabIndex={0}
      role="region"
      aria-label="商品明细表格"
    >
      <table aria-label={`${metric}商品明细`}>
        <SalesTableHeader name={rowLevel} columns={columns} />
        <tbody>
          {summary && (
            <tr>
              <th scope="row">汇总</th>
              <td>—</td>
              {columns.map(({ label, targetFor }) => (
                <td key={targetFor ? `目标 ${targetFor}` : label}>
                  {targetFor ? targets.get(targetFor) : (summary.get(label) ?? '—')}
                </td>
              ))}
            </tr>
          )}
          {rows.length ? (
            rows.map(({ node, path }) => (
              <tr key={JSON.stringify(path)}>
                <th scope="row">
                  <div className="lantern-sales-org">
                    {level === 0 && (
                      <button
                        type="button"
                        aria-label={`查看${node.name}${baseRows ? '品类' : '系列'}`}
                        onClick={() => onDrill(node.name)}
                      >
                        <ChevronRight aria-hidden="true" />
                      </button>
                    )}
                    <span title={path.join(' › ')}>
                      {node.name}
                      {node.code && ` · ${node.code}`}
                    </span>
                  </div>
                </th>
                <td>
                  <span className="lantern-sales-level" data-level="0">
                    {rowLevel}
                  </span>
                </td>
                {columns.map(({ label, targetFor }) => (
                  <td key={targetFor ? `目标 ${targetFor}` : label}>
                    {targetFor
                      ? targets.get(targetFor)
                      : label === '达成状态' || label === '风险状态'
                        ? noSalesData
                        : '—'}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length + 2}>
                <span role="status">
                  {hasKeyword
                    ? `未找到匹配的${productLevels[level]}，当前快照可能缺少该层级明细。`
                    : `当前快照暂无${category ? `「${category}」` : ''}${productLevels[level]}明细。`}
                </span>
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
    ...options.map(({ name }) => ({ id: name, name })),
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
  categories = salesProductCategories,
  categoryOptions = categories,
  onClearBase?: () => void,
) {
  const [productFilters, setProductFilters] = useState(emptyProductFilters);
  const [showSeries, setShowSeries] = useState(false);
  const { category, series, group, sku } = productFilters;
  const groupQuery = group.trim().toLowerCase();
  const skuQuery = sku.trim().toLowerCase();
  const categoryRows = categories
    .filter(({ name }) => !category || name === category)
    .map((node) => ({ node, path: [node.name] }));
  const allSeries = childProductRows(categoryRows);
  const seriesRows = allSeries.filter(({ node }) => !series || node.name === series);
  const groupRows = childProductRows(seriesRows).filter(({ node }) =>
    node.name.toLowerCase().includes(groupQuery),
  );
  const skuRows = childProductRows(groupRows).filter(
    ({ node }) =>
      node.name.toLowerCase().includes(skuQuery) || node.code?.toLowerCase().includes(skuQuery),
  );
  const productLevel = skuQuery ? 3 : groupQuery ? 2 : series || showSeries ? 1 : 0;
  const productRows = [categoryRows, seriesRows, groupRows, skuRows][productLevel];

  function selectCategory(name: string, drill = false) {
    setProductFilters({ ...emptyProductFilters, category: name });
    setShowSeries(drill);
  }

  const controls = (
    <div className="lantern-sales-filter-group" role="search" aria-label="商品筛选">
      <SalesFilterSelect
        label="品类"
        value={category}
        options={categoryOptions}
        disabled={!categoryOptions.length}
        emptyLabel={categoryOptions.length ? undefined : '暂无品类'}
        onChange={selectCategory}
      />
      <SalesFilterSelect
        label="系列"
        value={series}
        disabled={!category || allSeries.length === 0}
        emptyLabel={!category ? '请先选择品类' : allSeries.length === 0 ? '暂无系列' : undefined}
        options={allSeries.map(({ node }) => node)}
        onChange={(name) => {
          setProductFilters({ ...emptyProductFilters, category, series: name });
          setShowSeries(true);
        }}
      />
      <SalesSearch
        label="物料组"
        value={group}
        onChange={(value) => setProductFilters((filters) => ({ ...filters, group: value }))}
      />
      <SalesSearch
        label="SKU"
        value={sku}
        placeholder="搜索 SKU 名称或编码"
        onChange={(value) => setProductFilters((filters) => ({ ...filters, sku: value }))}
      />
      {(onClearBase || category || series || group || sku) && (
        <button
          type="button"
          onClick={() => {
            onClearBase?.();
            selectCategory('');
          }}
        >
          清空筛选
        </button>
      )}
    </div>
  );
  return {
    controls,
    reset: () => selectCategory(''),
    filtering: Boolean(category || series || groupQuery || skuQuery || showSeries),
    tableProps: {
      level: productLevel,
      category,
      rows: productRows,
      hasKeyword: Boolean(groupQuery || skuQuery),
      onDrill: (name: string) => selectCategory(name, true),
    },
  };
}

const productionBases = ['华东', '华南', '西南', '遂平', '郑州'].map((name) => ({ name }));
const emptyProductCategories: readonly ProductNode[] = [];

function ProductMetricList({
  metrics,
  module,
  view,
  inventoryScope,
}: {
  metrics: readonly Metric[];
  module: 'production' | 'inventory';
  view: PeriodView;
  inventoryScope?: InventoryScope;
}) {
  const id = useId();
  const [selected, setSelected] = useState(0);
  const [dimension, setDimension] = useState(0);
  const [base, setBase] = useState('');
  const byBase = module === 'production' && dimension === 1;
  const products = useProductFilters(
    byBase ? emptyProductCategories : salesProductCategories,
    salesProductCategories,
    byBase && base ? () => setBase('') : undefined,
  );
  const showBaseRows = byBase && !base && !products.filtering;
  const active = metrics[selected - 1];
  const labels = [
    module === 'production' ? '两指标总览' : '五指标总览',
    ...metrics.map(({ name }) => name),
  ];
  const comparisons = salesComparisonColumns[view];
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
    metrics.map(({ name, value, unit }) => [name, unit ? `${value} ${unit}` : value]),
  );
  const ageThresholds =
    inventoryScope === 'base' || inventoryScope === 'branch'
      ? inventoryAgeThresholds[inventoryScope]
      : undefined;
  if (ageThresholds) targets.set('平均货龄', `< ${ageThresholds.target} 天`);
  if (inventoryScope === 'customer') targets.set('平均货龄', '—');

  if (active) {
    const status = active.status?.[0];
    summary.set(
      '达成状态',
      active.value === '—' ? '无数据' : active.target ? (status ?? '—') : '无目标',
    );
    summary.set(
      '风险状态',
      status && ['健康', '预警', '严重', '大日期风险'].includes(status) ? status : '—',
    );
    if (active.name === '平均货龄' && ageThresholds && Number.isFinite(Number(active.value))) {
      const age = Number(active.value);
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
    if (view === 'month') {
      for (const {
        basis,
        reference,
        change: [label, value],
      } of active.comparisons ?? []) {
        if (reference) summary.set(basis, reference);
        summary.set(label, value);
      }
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
          onKeyDown={(event) => selectTabWithKeyboard(event, selected, labels.length, setSelected)}
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
            {module === 'production' && (
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
                onKeyDown={(event) => selectTabWithKeyboard(event, dimension, 2, switchDimension)}
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
              <SalesFilterSelect
                label="基地"
                value={base}
                options={productionBases}
                onChange={selectBase}
              />
            )}
            {products.controls}
          </div>
          <div
            id={`${id}-dimension-panel`}
            role={module === 'production' ? 'tabpanel' : undefined}
            aria-labelledby={module === 'production' ? `${id}-dimension-${dimension}` : undefined}
          >
            <ProductDetailTable
              {...products.tableProps}
              metric={active?.name ?? labels[0]}
              columns={columns}
              targets={targets}
              summary={!byBase && !products.filtering ? summary : undefined}
              category={[byBase ? base : '', products.tableProps.category]
                .filter(Boolean)
                .join(' / ')}
              baseRows={showBaseRows}
              {...(showBaseRows
                ? {
                    rows: productionBases.map((node) => ({ node, path: [node.name] })),
                    onDrill: selectBase,
                  }
                : {})}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function SalesOrgList({ view }: { view: PeriodView }) {
  const [selected, setSelected] = useState(0);
  const [dimension, setDimension] = useState(0);
  const products = useProductFilters();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [region, setRegion] = useState('');
  const [province, setProvince] = useState('');
  const [search, setSearch] = useState('');
  const [filterOverrides, setFilterOverrides] = useState<ReadonlyMap<string, boolean>>(
    () => new Map(),
  );
  const keyword = search.trim().toLocaleLowerCase();
  const filtering = Boolean(region || province || keyword);
  const provinces =
    salesOrgHierarchy
      .find(({ name }) => name === region)
      ?.children?.filter(({ children }) => children?.length) ?? [];
  const tab = salesListTabs[selected];
  const isOverview = selected === 0;
  const columns: SalesColumn[] = isOverview
    ? tab.columns.flatMap((label) => [{ label: '目标', targetFor: label }, { label }])
    : [
        { label: '目标', targetFor: tab.title },
        ...[...tab.columns, '风险状态', ...salesComparisonColumns[view]].map((label) => ({
          label,
        })),
      ];
  const hasProductDimension = sales.some(
    ({ name, period }) => name === tab.title && period === 'order',
  );
  const showProductList = hasProductDimension && dimension === 1;
  function switchMetric(index: number) {
    setSelected(index);
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
    parent = '',
    depth = 0,
  ): React.ReactNode {
    return nodes.map((node, index) => {
      if (!matchesFilters(node, depth)) return null;
      const { name, children, metrics } = node;
      const id = `${parent}/${index}`;
      const hasChildren = Boolean(children?.length);
      const isExpanded = filtering
        ? (filterOverrides.get(id) ??
          Boolean(keyword || (depth === 0 && region) || (depth === 1 && province)))
        : expanded.has(id);
      const level = depth === 0 || hasChildren ? Math.min(depth, 3) : 3;
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
              const metric = metrics?.[column];
              const risk = column === '风险状态' ? metrics?.[tab.title]?.risk : metric?.risk;
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
                  ) : column === '达成状态' || column === '风险状态' ? (
                    noSalesData
                  ) : (
                    (metric?.value ?? '—')
                  )}
                </td>
              );
            })}
          </tr>
          {isExpanded && children && renderRows(children, id, depth + 1)}
        </React.Fragment>
      );
    });
  }

  return (
    <section className="lantern-list lantern-sales-list" aria-labelledby="lantern-sales-list-title">
      <div className="lantern-list-toolbar">
        <h2 id="lantern-sales-list-title">指标清单</h2>
        <span className="lantern-drilldown-path">
          {(showProductList ? productLevels : salesOrgLevels).join(' › ')}
        </span>
      </div>
      <div className="lantern-sales-panel">
        <div
          className="lantern-module-tabs lantern-sales-tabs"
          role="tablist"
          aria-label="销售清单指标"
          onKeyDown={(event) =>
            selectTabWithKeyboard(event, selected, salesListTabs.length, switchMetric)
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
                onKeyDown={(event) => selectTabWithKeyboard(event, dimension, 2, switchDimension)}
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
            {showProductList ? (
              products.controls
            ) : (
              <div className="lantern-sales-filter-group" role="search" aria-label="销售组织筛选">
                <SalesFilterSelect
                  label="大区"
                  value={region}
                  options={salesOrgHierarchy}
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
                <SalesSearch
                  label="销售组"
                  value={search}
                  onChange={(value) => {
                    setSearch(value);
                    setFilterOverrides(new Map());
                  }}
                />
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
            {showProductList ? (
              <ProductDetailTable metric={tab.title} columns={columns} {...products.tableProps} />
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
                    {salesOrgHierarchy.some((node) => matchesFilters(node, 0)) ? (
                      renderRows(salesOrgHierarchy)
                    ) : (
                      <tr>
                        <td colSpan={columns.length + 2}>
                          <span role="status">未找到匹配的销售组。</span>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
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
) {
  let next;
  switch (event.key) {
    case 'ArrowLeft':
      next = (selected + count - 1) % count;
      break;
    case 'ArrowRight':
      next = (selected + 1) % count;
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
  onSelect(next);
  event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
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
                        data-missing={value === '—' || undefined}
                      >
                        <strong>{value}</strong>
                        {value !== '—' && unit && (
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
                              {view === 'month' && value !== '—'
                                ? (changes?.find(({ change }) => change[0] === source)?.change[1] ??
                                  '—')
                                : '—'}
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

function InventoryViews({ period }: { period: SelectedPeriod }) {
  const [selected, setSelected] = useState(0);
  const [metric, setMetric] = useState<string | null>(null);
  const count = inventoryViews.length;
  const rows = inventoryViews.map(({ id, title, values }) => ({
    id,
    title,
    metrics: metricsForPeriod(
      inventoryMetricNames.map((name) => ({ name, ...(values[name] ?? missingInventoryValue) })),
      period,
    ),
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
              <MetricCards
                metrics={metrics}
                period={period}
                module="inventory"
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
                view={period.view}
                inventoryScope={id}
              />
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
  const today = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const latest = today > snapshotDate ? today : snapshotDate;
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
                      onClick={() => choose(year, month, Number(week.from.slice(-2)), true)}
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

export function LanternDashboard({ toolbarHost }: { toolbarHost?: HTMLElement | null }) {
  const [selected, setSelected] = useState(0);
  const [periodIndex, setPeriodIndex] = useState(1);
  const [value, setValue] = useState(snapshotDate);
  const { id: view } = periodViews[periodIndex];
  const range = periodRange(view, value);
  const period = { view, value, range };
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
          selectTabWithKeyboard(event, periodIndex, periodViews.length, setPeriodIndex)
        }
      >
        {periodViews.map(({ id, label }, index) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={periodIndex === index}
            tabIndex={periodIndex === index ? 0 : -1}
            onClick={() => setPeriodIndex(index)}
          >
            {label}
          </button>
        ))}
      </div>
      <PeriodDatePicker key={view} period={period} onChange={setValue} />
      <p className="lantern-selected-range" aria-live="polite">
        数据范围 {range.from}
        {range.from !== range.to && ` 至 ${range.to}`}
      </p>
    </div>
  );
  return (
    <div className="agent-workbench-ui lantern-dashboard" aria-label="汤圆定制看板">
      <style>{styles}</style>
      {toolbarHost ? createPortal(timeToolbar, toolbarHost) : timeToolbar}
      <div
        className="lantern-module-tabs lantern-primary-tabs"
        role="tablist"
        aria-label="看板模块"
        onKeyDown={(event) =>
          selectTabWithKeyboard(event, selected, dashboardTabs.length, setSelected)
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
      <div className="lantern-content">
        {dashboardTabs.map((tab, index) => (
          <section
            className="lantern-section"
            key={tab.id}
            role="tabpanel"
            id={`lantern-module-panel-${tab.id}`}
            data-module={tab.id}
            aria-labelledby={`lantern-module-tab-${tab.id}`}
            hidden={selected !== index}
            tabIndex={0}
          >
            {tab.id === 'inventory' ? (
              <InventoryViews period={period} />
            ) : (
              <>
                <header>
                  <h2 className="lantern-kpi-title">核心指标</h2>
                </header>
                <MetricResults
                  module={tab.id}
                  period={period}
                  metrics={metricsForPeriod(tab.rows.flat(), period)}
                />
                {tab.id === 'sales' && <p className="lantern-note">* 沿用订单工作台截图标记。</p>}
              </>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
