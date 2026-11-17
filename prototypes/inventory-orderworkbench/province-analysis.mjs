import { cancellationReasonGroups } from '../../business/inventory-orderworkbench/cancellation-reason-groups.mjs';
import {
  computeWorkbenchMetrics,
  metricDelta,
  metricComparisonNote,
  metricValue,
  dayOffset,
} from './metric-model.mjs';
import { metricSnapshot } from './metric-components.mjs';
import { metricSection, readySectionRows } from './metric-sections.mjs';
import { performanceCurrentCell } from './performance-rules.mjs';

const label = (value) => String(value ?? '').trim();
const groupKey = (row) => JSON.stringify([label(row.province), label(row.region)]);
const quantity = (value) =>
  Number.isFinite(value) ? value.toLocaleString('zh-CN', { maximumFractionDigits: 6 }) : '—';
const cell = (text, title) => ({ text, title });
const groups = (columns) => columns.map((label) => ({ label, rowspan: true }));

export function provinceAnalysisContext(analysis) {
  return {
    title: analysis.title,
    periodNote: analysis.periodNote,
    unrankedCount: analysis.unrankedCount,
    reasonsStatus: analysis.reasonsStatus,
    ordersStatus: analysis.ordersStatus,
    tables: analysis.tables.map((table) => ({
      title: table.title,
      groups: table.groups,
      loading: table.loading,
      rows: table.rows.map((row) => row.map((value) => value?.text ?? value)),
    })),
  };
}

function scopedPeriod(period, key) {
  if (!period) return null;
  const filter = (row) => groupKey(row) === key;
  const sections = period.sections
    .filter((part) => part.id === 'changes')
    .map((part) => ({
      ...part,
      rows: (part.rows ?? []).filter(filter),
      ...(part.parts
        ? { parts: part.parts.map((item) => ({ ...item, rows: (item.rows ?? []).filter(filter) })) }
        : {}),
    }));
  const scoped = { ...period, sections };
  scoped.metrics = computeWorkbenchMetrics(scoped);
  return scoped;
}

function rate(period, name, loading) {
  const metric = period?.metrics[name];
  if (!period || metric?.loading)
    return cell(
      loading ? '加载中' : '—',
      loading ? '正在读取该统计周期的数据。' : '该统计周期暂无有效数据。',
    );
  const snapshot = metricSnapshot(period, name);
  const text =
    metricValue(period.metrics, name) === null
      ? '—'
      : metric.value.toFixed(2) + '%' + (metric.sample || metric.provisional ? '*' : '');
  const title = [
    `${name}：分子 ${quantity(snapshot.numerator)} 件 / 分母 ${quantity(snapshot.denominator)} 件`,
    metric.coverageNote,
    metric.missingReason,
    metric.note,
  ]
    .filter(Boolean)
    .join('；');
  const styled = performanceCurrentCell(name, metricValue(period.metrics, name), text);
  return { ...cell(text, title), ...(typeof styled === 'object' ? styled : {}) };
}

function comparison(current, previous, name, loading) {
  if (
    (!current || !previous || current.metrics[name]?.loading || previous.metrics[name]?.loading) &&
    loading
  )
    return cell('加载中', '比较期数据正在读取。');
  const text = metricDelta(current?.metrics, previous?.metrics, name);
  return cell(
    text,
    text === '—'
      ? current?.metrics[name]?.missingReason ||
          previous?.metrics[name]?.missingReason ||
          '当前期或比较期缺少有效分子、分母，不能计算差值。'
      : metricComparisonNote(current?.metrics, previous?.metrics, name),
  );
}

function amount(period, name, field, loading) {
  if (!period || period.metrics[name]?.loading)
    return cell(loading ? '加载中' : '—', '该统计周期的数量数据尚未返回。');
  const metric = period.metrics[name];
  const snapshot = metricSnapshot(period, name);
  return cell(
    quantity(snapshot[field]),
    `${name}${field === 'numerator' ? '分子' : '分母'}；单位：商品件数，沿用该指标的业务筛选条件。${metric?.coverageNote || metric?.missingReason || ''}`,
  );
}

export function provinceAnalysis(facts) {
  const periods = facts.periods ?? {},
    loading = facts.complete === false;
  const keys = [
    ...new Set(
      ['month', 'week'].flatMap((key) => readySectionRows(periods[key], 'changes').map(groupKey)),
    ),
  ].sort((a, b) => a.localeCompare(b, 'zh'));
  const counts = facts.provinceOrders;
  const countMap = new Map(
    (counts?.rows ?? []).map((row) => [groupKey(row), Number(row.changed_orders)]),
  );
  const reasons = facts.provinceReasons;
  const reasonMap = new Map();
  for (const row of reasons?.status === 'ready' ? reasons.rows : []) {
    const key = groupKey(row);
    if (!reasonMap.has(key)) reasonMap.set(key, new Map());
    const amounts = reasonMap.get(key);
    const reason = cancellationReasonGroups.includes(row.reason) ? row.reason : '未明确';
    amounts.set(reason, (amounts.get(reason) ?? 0) + Number(row.cancel_qty));
  }
  const records = keys.map((key) => {
    const [province, region] = JSON.parse(key);
    const labels = [
      cell(province || '省区待补全', province ? '' : '源数据省区字段为空，未用所属大区代替省区。'),
      cell(region || '大区待补全', region ? '' : '源数据所属大区字段为空。'),
    ];
    const current = scopedPeriod(periods.month, key),
      previous = scopedPeriod(periods.previousMonth, key),
      year = scopedPeriod(periods.yearMonth, key),
      week = scopedPeriod(periods.week, key);
    const values = (name) => ({
      denominator: amount(current, name, 'denominator', loading),
      numerator: amount(current, name, 'numerator', loading),
      value: rate(current, name, loading),
      previous: comparison(current, previous, name, loading),
      week: rate(week, name, loading),
    });
    const cancellation = values('作废率'),
      amendment = values('改单率');
    const reasonAmounts = reasonMap.get(key) ?? new Map();
    const cancelled = metricSnapshot(current, '作废率').numerator;
    const reasonTotal = [...reasonAmounts.values()].reduce((sum, value) => sum + value, 0);
    const reconciled =
      reasons?.status === 'ready' &&
      cancelled > 0 &&
      metricValue(current?.metrics, '作废率') !== null &&
      Math.abs(reasonTotal - cancelled) <= Math.max(0.000001, Math.abs(cancelled) * 1e-9);
    cancellation.reasons = cancellationReasonGroups.map((reason) => {
      const value = reasonAmounts.get(reason) ?? 0;
      return cell(
        reconciled
          ? ((value / cancelled) * 100).toFixed(2) + '%'
          : reasons?.status === 'loading'
            ? '加载中'
            : '—',
        reconciled
          ? reason +
              '：' +
              quantity(value) +
              ' 件 / 本期已确认作废 ' +
              quantity(cancelled) +
              ' 件；过期作废归系统·车型·交期，空白或分类冲突归未明确。'
          : reasons?.status === 'error'
            ? '作废原因读取失败：' + (reasons.code || 'QUERY_FAILED') + '，可重新读取。'
            : reasons?.status !== 'ready'
              ? '作废原因尚未返回。'
              : cancelled === 0
                ? '本期无已确认作废量，不计算原因占比。'
                : '原因合计与本期作废量尚未一致，暂不显示占比。',
      );
    });
    cancellation.year = comparison(current, year, '作废率', loading);
    const amendmentSource = metricSection(current, 'changes', '改单率');
    const count =
      counts?.status === 'ready' &&
      amendmentSource?.status === 'ready' &&
      metricValue(current?.metrics, '改单率') !== null
        ? (countMap.get(key) ?? 0)
        : null;
    amendment.orders = cell(
      count === null ? (counts?.status === 'loading' ? '加载中' : '—') : quantity(count),
      counts?.status === 'error'
        ? `改单笔数读取失败：${counts.code || 'QUERY_FAILED'}；可点击重新读取。`
        : '本期发生减货的客户＋原订单去重数；同一订单的多个商品、执行单及基地只计一笔，不用商品明细条数代替。',
    );
    const a = metricValue(current?.metrics, '作废率'),
      b = metricValue(current?.metrics, '改单率');
    const score = a === null || b === null ? null : a + b;
    const denominator =
      cancellation.denominator.text === amendment.denominator.text
        ? cancellation.denominator
        : cell(
            `作废 ${cancellation.denominator.text} / 改单 ${amendment.denominator.text}`,
            '两项指标业务筛选条件不同，分别显示各自分母；不将一个指标的分母用于另一个指标。',
          );
    return {
      key,
      labels,
      cancellation,
      amendment,
      denominator,
      score,
      cancellationRate: a,
      amendmentRate: b,
      scoreCell: cell(
        score === null
          ? '—'
          : score.toFixed(2) +
              '%' +
              (current.metrics['作废率'].sample ||
              current.metrics['作废率'].provisional ||
              current.metrics['改单率'].sample ||
              current.metrics['改单率'].provisional
                ? '*'
                : ''),
        '按未四舍五入的本期作废率＋本期改单率降序排序，不合并两项指标的分子分母。',
      ),
    };
  });
  const descending = (field) => (a, b) =>
    (a[field] === null && b[field] === null
      ? 0
      : a[field] === null
        ? 1
        : b[field] === null
          ? -1
          : b[field] - a[field]) || a.key.localeCompare(b.key, 'zh');
  const ranked = [...records].sort(descending('score'));
  const section = metricSection(periods.month, 'changes');
  const emptyText = loading
    ? '加载中…'
    : section?.status === 'error'
      ? '省区数据读取失败，请检查查询状态后重试。'
      : '当前授权范围和统计周期内暂无省区数据。';
  const table = (title, headers, rows) => ({ title, groups: headers, rows, loading, emptyText });
  return {
    title: '省区维度达成分析',
    periodNote: ['month', 'week']
      .map((key) => {
        const p = periods[key];
        return `${key === 'month' ? '本期' : '本周'}：${p && p.start < p.end ? `${p.start} 至 ${dayOffset(p.end, -1)}` : '暂无已结束日期'}`;
      })
      .join('；'),
    tables: [
      table(
        '省区作废率',
        groups([
          '省区',
          '所属大区',
          '订单量（件）',
          '作废量（件）',
          '本期作废率',
          ...cancellationReasonGroups,
          '本期环比',
          '本期同比',
          '本周作废率',
        ]),
        [...records]
          .sort(descending('cancellationRate'))
          .map(({ labels, cancellation: c }) => [
            ...labels,
            c.denominator,
            c.numerator,
            c.value,
            ...c.reasons,
            c.previous,
            c.year,
            c.week,
          ]),
      ),
      table(
        '省区改单率',
        groups([
          '省区',
          '所属大区',
          '订单量（件）',
          '改单量（件）',
          '本期改单率',
          '本期环比',
          '本期改单笔数',
          '本周改单率',
        ]),
        [...records]
          .sort(descending('amendmentRate'))
          .map(({ labels, amendment: a }) => [
            ...labels,
            a.denominator,
            a.numerator,
            a.value,
            a.previous,
            a.orders,
            a.week,
          ]),
      ),
      table(
        '省区改单和作废综合排名',
        [
          ...groups(['省区', '所属大区', '订单量（件）']),
          { label: '作废数据', columns: ['作废量（件）', '作废率', '环比', '同比', '本周'] },
          { label: '改单数据', columns: ['改单量（件）', '改单率', '环比', '改单笔数', '本周'] },
          ...groups(['本期作废+改单']),
        ],
        ranked.map(({ labels, denominator, cancellation: c, amendment: a, scoreCell }) => [
          ...labels,
          denominator,
          c.numerator,
          c.value,
          c.previous,
          c.year,
          c.week,
          a.numerator,
          a.value,
          a.previous,
          a.orders,
          a.week,
          scoreCell,
        ]),
      ),
    ],
    unrankedCount: records.filter((row) => row.score === null).length,
    ordersStatus: counts?.status ?? 'idle',
    reasonsStatus: reasons?.status ?? 'idle',
  };
}
