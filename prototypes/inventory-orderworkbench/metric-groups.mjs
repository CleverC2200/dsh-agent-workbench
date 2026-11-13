import { computeWorkbenchMetrics, stockComponents } from './metric-model.mjs';
import { metricSnapshot } from './metric-components.mjs';
import { metricSpecs } from './metric-definitions.mjs';
import { metricSection } from './metric-sections.mjs';
import {
  directorNames,
  publishedDirectorNames,
  directorMetricUsesBase,
} from './live-presentation.mjs';
import { resolveMetricDimensions } from './metric-dimensions.mjs';
import { highlightAgePeak, metricGroupTarget } from './performance-rules.mjs';

const label = (value) =>
  typeof value === 'number' && Number.isFinite(value)
    ? String(value)
    : typeof value === 'string' && value.trim()
      ? value.trim()
      : null;

export function orderMetricGroups(
  period,
  metric,
  { base = '', turnoverScope = base ? 'base' : 'national', dimensions: requestedDimensions } = {},
) {
  const { dimensions } = resolveMetricDimensions(metric, requestedDimensions);
  const calculationScope = dimensions.includes('base')
    ? 'base'
    : dimensions.includes('item')
      ? 'item'
      : 'national';
  const section = metricSection(period, metricSpecs[metric].section, metric);
  if (!section && period.start && period.end && period.start >= period.end)
    return {
      availability: 'available',
      dimensions,
      rows: [],
      total: metricSnapshot(period, metric, { base, turnoverScope }),
      emptyReason: 'NO_COMPLETED_DATES',
      reason: '所请求范围暂无已结束日期，不代表维度未发布或查询失败。',
      reconciliation: {
        additive: metric !== '准交率' && !dimensions.includes('director'),
        numerator: null,
        denominator: null,
        matches: null,
      },
    };
  if (section?.status !== 'ready')
    return {
      availability: 'unavailable',
      rows: [],
      code: section?.code ?? 'SOURCE_NOT_READY',
      reason: '指标来源未成功读取，不能将查询失败表示为没有品项数据。',
    };
  const candidates = section.rows.filter(
    (row) =>
      !['作废率', '改单率'].includes(metric) ||
      String(row.kind) === (metric === '作废率' ? '1' : '2'),
  );
  const buckets = new Map();
  const mappings = period.sections.find((part) => part.id === 'directors');
  if (dimensions.includes('director') && mappings?.status === 'error')
    return {
      availability: 'unavailable',
      dimensions,
      rows: [],
      code: mappings.code,
      reason:
        '指标数据已读取，但应责总监归属查询失败；不能把映射失败解释为总监维度未发布或无数据。',
    };
  const fieldValue = (row, field) =>
    field === 'base'
      ? base || label(row.base)
      : field === 'salesRegion'
        ? label(row.province || row.region)
        : label(row[field]);
  const owners = (row) =>
    row.summary === 1 || Number(row.summary) === 1 || row.periodAttribution
      ? publishedDirectorNames(row)
      : directorNames(mappings?.rows ?? [], row);
  for (const row of candidates) {
    const directors = dimensions.includes('director') ? owners(row) : [null];
    for (const director of new Set(directors)) {
      const values = Object.fromEntries(
        dimensions.map((field) => [
          field,
          field === 'director' ? director : fieldValue(row, field),
        ]),
      );
      const key = JSON.stringify(values);
      if (!buckets.has(key)) buckets.set(key, { values, rows: [] });
      buckets.get(key).rows.push(row);
    }
  }
  if (metric === '准交率' && dimensions.includes('director') && mappings?.status === 'ready') {
    const registered = mappings.rows.some(
      (mapping) =>
        ['郑州', '郑州基地'].includes(mapping.base) &&
        directorNames(mappings.rows, mapping).includes('庞丽娟'),
    );
    if (registered)
      for (const row of candidates) {
        if (!['郑州', '郑州基地'].includes(fieldValue(row, 'base'))) continue;
        const values = Object.fromEntries(
          dimensions.map((field) => [
            field,
            field === 'director' ? '庞丽娟' : fieldValue(row, field),
          ]),
        );
        const key = JSON.stringify(values);
        if (!buckets.has(key)) buckets.set(key, { values, rows: [] });
      }
  }
  const rows = [...buckets.values()]
    .map(({ values, rows }) => {
      if (directorMetricUsesBase(metric, values.director, values.base))
        rows = candidates.filter((row) =>
          dimensions
            .filter((key) => key !== 'director')
            .every((key) => fieldValue(row, key) === values[key]),
        );
      const selected = {
        ...period,
        sections: [{ ...section, id: metricSpecs[metric].section, rows }],
      };
      selected.metrics = computeWorkbenchMetrics(selected, undefined, {
        turnoverScope: calculationScope,
      });
      const {
        formula: _formula,
        note: _note,
        ...current
      } = metricSnapshot(selected, metric, {
        base: values.base ?? '',
        turnoverScope: calculationScope,
      });
      current.target = metricGroupTarget(metric, values.base ?? '', dimensions);
      if (metric === '周转天数') {
        const quantities = stockComponents(rows, calculationScope, { allowZeroDenominator: true });
        if (quantities) Object.assign(current, quantities);
      }
      return {
        ...values,
        dimensionKnown: Object.values(values).every((value) => value && value !== '归属待补全'),
        current,
      };
    })
    .sort((a, b) =>
      JSON.stringify(dimensions.map((key) => a[key])).localeCompare(
        JSON.stringify(dimensions.map((key) => b[key])),
        'zh-CN',
      ),
    );
  const additive = metric !== '准交率' && !dimensions.includes('director');
  const highlights = [];
  if (metric === '货龄（>60天库存占比）') {
    const displayed = rows.map((row, index) => [
      String(index),
      { raw: row.current.value, state: 'good' },
    ]);
    highlightAgePeak(displayed, 1);
    displayed.forEach((row, index) => {
      if (row[1].state !== 'warning') return;
      rows[index].presentation = {
        highestAge: true,
        meaning: '当前分组中的货龄占比最高提示，不代表超过未发布的目标阈值。',
      };
      highlights.push({
        ...Object.fromEntries(dimensions.map((key) => [key, rows[index][key]])),
        value: rows[index].current.value,
      });
    });
  }
  const sum = (field) =>
    rows.length &&
    rows.every(
      (row) => typeof row.current[field] === 'number' && Number.isFinite(row.current[field]),
    )
      ? rows.reduce((total, row) => total + row.current[field], 0)
      : null;
  const total = metricSnapshot(
    {
      ...period,
      metrics: computeWorkbenchMetrics(period, undefined, { turnoverScope: calculationScope }),
    },
    metric,
    {
      base: metric === '周转天数' && !dimensions.includes('base') ? '' : base,
      turnoverScope: calculationScope,
    },
  );
  total.target = metricGroupTarget(metric, base, dimensions);
  return {
    availability: 'available',
    dimensions,
    cardScope: turnoverScope,
    calculationScope,
    highlights,
    scopeNote:
      'groups.total为当前维度口径合计；current为原卡片汇总。可发货天数在基地与全国/品项维度的计划日均范围不同，不强行令不同维度的值相等。',
    rows,
    total,
    unmappedGroups: rows.filter((row) => !row.dimensionKnown).length,
    aggregation: additive
      ? '分组分子、分母分别合计后计算，不平均各组百分比；缺归属保留独立分组。'
      : metric === '准交率'
        ? '每组内按执行单去重；跨维度执行单可重复出现，合计必须对全部执行单再次去重，不能相加各组张数。'
        : '应责总监可能共同归属同一商品；按看板规则分别展示，合计使用未重复分配的原始集合，不能相加各总监数量。',
    reconciliation: {
      additive,
      numerator: additive ? sum('numerator') : null,
      denominator: additive ? sum('denominator') : null,
      matches:
        additive &&
        typeof total.numerator === 'number' &&
        typeof total.denominator === 'number' &&
        sum('numerator') !== null &&
        sum('denominator') !== null
          ? Math.abs(sum('numerator') - total.numerator) < 1e-6 &&
            Math.abs(sum('denominator') - total.denominator) < 1e-6
          : null,
    },
  };
}
