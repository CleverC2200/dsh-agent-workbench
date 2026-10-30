import {
  computeWorkbenchMetrics,
  metricDelta,
  metricComparisonNote,
  metricCoverageSummary,
  metricNames,
  metricState,
  metricValue,
  stockDaily,
  dayOffset,
} from './metric-model.mjs';
import {
  performanceCurrentCell,
  highlightAgePeak,
  performanceStyleVersion,
} from './performance-rules.mjs';
const text = (value, unit = '%', digits = 2) =>
  value === null || value === undefined ? '—' : Number(value).toFixed(digits) + unit;
const value = (metrics, name) =>
  text(metricValue(metrics, name), name === '周转天数' ? '' : '%') +
  (metrics?.[name]?.sample ? '*' : '');
const rows = (period, id) =>
  period?.sections.find((section) => section.id === id && section.status === 'ready')?.rows ?? [];
const distinct = (values) =>
  [...new Set(values)].sort((a, b) => String(a).localeCompare(String(b), 'zh'));
const dimensionValue = (value) => value || '未映射';
export const workbenchBaseIncluded = (base) =>
  !['濮阳', '濮阳基地'].includes(String(base ?? '').trim());
export function directorNames(mappings, row) {
  const relevant =
    mappings instanceof Map
      ? mappings.get(JSON.stringify([row.base, row.base === '郑州' ? row.sku : ''])) || []
      : mappings.filter(
          (mapping) =>
            mapping.base === row.base && (row.base !== '郑州' || mapping.sku === row.sku),
        );
  const owners = (mapping) => {
    let explicit = mapping.directors;
    if (typeof explicit === 'string') {
      try {
        explicit = JSON.parse(explicit);
      } catch {
        explicit = null;
      }
    }
    if (Array.isArray(explicit)) {
      const values = [
        ...new Set(
          explicit
            .filter((value) => typeof value === 'string' && value.trim())
            .map((value) => value.trim()),
        ),
      ];
      if (values.length === Number(mapping.names)) return values;
    }
    return Number(mapping.names) === 1 ? [String(mapping.director || '')] : null;
  };
  if (relevant.some((mapping) => Number(mapping.names) > 1 && !owners(mapping)))
    return ['归属待补全'];
  const names = distinct(
    relevant.flatMap((mapping) =>
      owners(mapping)
        ? owners(mapping).flatMap((value) =>
            value
              .split(/[,，、]/)
              .map((name) => name.trim())
              .filter(Boolean),
          )
        : [],
    ),
  );
  return names.length && (row.base === '郑州' || names.length === 1) ? names : ['归属待补全'];
}
function summaryRows(periods, field, directorMap, loading = false) {
  const selected = periods.month ?? periods.week;
  const source = [
    ...rows(selected, 'orders'),
    ...rows(selected, 'stock'),
    ...rows(selected, 'ages').filter(
      (row) =>
        Number(row.active_records ?? 0) > 0 ||
        Number(row.stock_qty) !== 0 ||
        Number(row.invalid) !== 0,
    ),
  ].filter((row) => field !== 'base' || workbenchBaseIncluded(row.base));
  let groups;
  const directors = (row, key = periods.month ? 'month' : 'week') => {
    const mapping =
      Number(row.summary) === 1 || row.periodAttribution === true
        ? row
        : directorMap?.get(JSON.stringify([row.base, row.sku]));
    if (!row.periodAttribution && Number(row.summary) !== 1) {
      const part = periods[key]?.sections.find((section) => section.id === 'directors');
      return directorNames(
        part
          ? part.status === 'ready'
            ? part.rows
            : []
          : ['month', 'week'].includes(key)
            ? [...directorMap.values()]
            : [],
        row,
      );
    }
    return mapping?.names === 1 && mapping.director
      ? mapping.director
          .split(/[,，、]/)
          .map((name) => name.trim())
          .filter(Boolean)
      : ['归属待补全'];
  };
  if (field === 'director')
    groups = distinct(
      source.flatMap((row) =>
        directors(row).map((name) => JSON.stringify([name, dimensionValue(row.base)])),
      ),
    ).map((key) => {
      const [name, base] = JSON.parse(key);
      return {
        labels: [name, base],
        filter: (row, key) =>
          dimensionValue(row.base) === base && directors(row, key).includes(name),
      };
    });
  else
    groups = distinct(source.map((row) => dimensionValue(row[field]))).map((label) => ({
      labels: [label],
      filter: (row) => dimensionValue(row[field]) === label,
    }));
  if (field !== 'director')
    groups.push({
      labels: ['合计'],
      filter: (row) => field !== 'base' || workbenchBaseIncluded(row.base),
    });
  const tables = {};
  for (const [key, previous, year] of [
    ['month', 'previousMonth', 'yearMonth'],
    ['week', 'previousWeek', 'yearWeek'],
  ]) {
    if (!periods[key]) {
      tables[key] = [];
      continue;
    }
    tables[key] = groups.map((group) => {
      const formulaOptions = { turnoverScope: field === 'item' ? 'item' : 'base' };
      const m = computeWorkbenchMetrics(
        periods[key],
        (row) => group.filter(row, key),
        formulaOptions,
      );
      const p = periods[previous]
        ? computeWorkbenchMetrics(
            periods[previous],
            (row) => group.filter(row, previous),
            formulaOptions,
          )
        : {};
      const y = periods[year]
        ? computeWorkbenchMetrics(periods[year], (row) => group.filter(row, year), formulaOptions)
        : {};
      const cells = (name) => {
        const currentCell = performanceCurrentCell(
          name,
          metricValue(m, name),
          value(m, name),
          field === 'director' ? group.labels[1] : field === 'base' ? group.labels[0] : '',
        );
        if (m[name]?.sample && currentCell && typeof currentCell === 'object')
          currentCell.title = metricCoverageSummary(m[name]) + '；不是全量指标。';
        const delta = (other, otherKey) => {
          if (loading && !periods[otherKey]) return '加载中';
          const text = metricDelta(m, other, name);
          return text !== '—' && (m[name]?.sample || other[name]?.sample)
            ? { text, title: metricComparisonNote(m, other, name) }
            : text;
        };
        return [currentCell, delta(p, previous), delta(y, year)];
      };
      if (field === 'item')
        return [
          ...group.labels,
          ...cells('订单满足率'),
          ...cells('周转天数').slice(0, key === 'month' ? 3 : 2),
          ...cells('货龄（>60天库存占比）').slice(0, key === 'month' ? 3 : 2),
          ...(key === 'month'
            ? [
                metricNames
                  .filter(
                    (name) =>
                      ['订单满足率', '周转天数'].includes(name) &&
                      ['预警', '严重'].includes(metricState(name, metricValue(m, name))),
                  )
                  .join('、') || '—',
              ]
            : []),
        ];
      return [
        ...group.labels,
        ...cells('订单满足率'),
        ...cells('准交率').slice(0, 2),
        ...cells('货龄（>60天库存占比）').slice(0, 2),
        ...cells('周转天数').slice(0, key === 'month' ? 3 : 2),
      ];
    });
    highlightAgePeak(
      tables[key],
      field === 'item' ? (key === 'month' ? 7 : 6) : field === 'director' ? 7 : 6,
    );
  }
  return tables;
}
export function workbenchPresentation(facts, options = {}) {
  const { periods, selected } = facts,
    current = periods[selected];
  const previous = periods[selected === 'month' ? 'previousMonth' : 'previousWeek'],
    year = periods[selected === 'month' ? 'yearMonth' : 'yearWeek'];
  const metrics = current.metrics;
  const loading = facts.complete === false;
  const comparison = (a, b, name) =>
    loading &&
    (!periods[a] ||
      !periods[b] ||
      periods[a].metrics[name]?.loading ||
      periods[b].metrics[name]?.loading)
      ? '加载中'
      : metricDelta(periods[a]?.metrics, periods[b]?.metrics, name);
  const cards = metricNames.map((name) => ({
    key: name,
    value:
      metricValue(metrics, name) === null
        ? '—'
        : metricValue(metrics, name).toFixed(name === '周转天数' ? 1 : 2),
    status: metrics[name]?.loading
      ? '加载中'
      : metrics[name]?.value == null && metrics[name]?.missingReason?.startsWith('系统读取未成功')
        ? '查询失败'
        : metrics[name]?.sample
          ? `样本 ${metrics[name].sample.coverage.toFixed(1)}%`
          : metricState(name, metricValue(metrics, name)),
    coverageNote: metrics[name]?.coverageNote ?? '',
    comparisonNotes: [
      metricComparisonNote(periods.month?.metrics, periods.previousMonth?.metrics, name),
      metricComparisonNote(periods.month?.metrics, periods.yearMonth?.metrics, name),
      metricComparisonNote(periods.week?.metrics, periods.previousWeek?.metrics, name),
      metricComparisonNote(periods.week?.metrics, periods.yearWeek?.metrics, name),
    ],
    formula: metrics[name].note,
    missingReason: metrics[name].missingReason,
    footer: `本周${name === '货龄（>60天库存占比）' ? '货龄占比' : name === '周转天数' ? '可发货天数' : name === '订单满足率' ? '满足率' : name} ${loading && !periods.week ? '加载中' : text(metricValue(periods.week?.metrics, name), name === '周转天数' ? '天' : '%', name === '周转天数' ? 1 : 2)}${periods.week?.metrics[name]?.sample ? '（可判定样本）' : ''}`,
    footerNote: periods.week?.metrics[name]?.coverageNote ?? '',
    comparison: [
      comparison('month', 'previousMonth', name),
      comparison('month', 'yearMonth', name),
      comparison('week', 'previousWeek', name),
      comparison('week', 'yearWeek', name),
    ],
  }));
  const directorMap = new Map(
    (facts.directors?.rows ?? []).map((row) => [
      JSON.stringify([row.base, row.sku]),
      { ...row, names: Number(row.names) },
    ]),
  );
  const performance = Object.fromEntries(
    [
      ['base-performance', 'base'],
      ['director-performance', 'director'],
      ['item-performance', 'item'],
    ].map(([key, field]) => [
      key,
      (options.dimension && options.dimension !== key) ||
      (field === 'director' && facts.directors?.status === 'loading')
        ? { month: [], week: [] }
        : summaryRows(periods, field, directorMap, loading),
    ]),
  );
  const all = [
    ...rows(current, 'orders'),
    ...rows(current, 'stock'),
    ...rows(current, 'ages').filter(
      (row) =>
        Number(row.active_records ?? 0) > 0 ||
        Number(row.stock_qty) !== 0 ||
        Number(row.invalid) !== 0,
    ),
  ];
  const categories = distinct(all.map((row) => dimensionValue(row.category))),
    bases = distinct(
      all.filter((row) => workbenchBaseIncluded(row.base)).map((row) => dimensionValue(row.base)),
    );
  const metric = (period, filter) => (period ? computeWorkbenchMetrics(period, filter) : {});
  const fill = (options.dimension && options.dimension !== 'category-fill' ? [] : categories).map(
    (category) => {
      const filter = (row) => dimensionValue(row.category) === category,
        m = metric(current, filter),
        p = metric(previous, filter),
        y = metric(year, filter);
      return [
        category,
        value(m, '订单满足率'),
        value(p, '订单满足率'),
        metricDelta(m, p, '订单满足率'),
        value(y, '订单满足率'),
        metricDelta(m, y, '订单满足率'),
        m['订单满足率']?.sample
          ? '可判定样本'
          : metricState('订单满足率', metricValue(m, '订单满足率')),
      ];
    },
  );
  const days = (options.dimension && options.dimension !== 'category-days' ? [] : categories).map(
    (category) => {
      const filter = (row) => dimensionValue(row.category) === category,
        m = metric(current, filter),
        stock = rows(current, 'stock').filter(filter);
      const sum = (key) =>
        stock.length &&
        stock.every(
          (row) =>
            Number(row['missing_' + key] ?? 0) === 0 &&
            row[key] !== null &&
            Number.isFinite(Number(row[key])),
        )
          ? stock.reduce((sum, row) => sum + Number(row[key]), 0)
          : null;
      const daily =
        stock.length && stock.every((row) => stockDaily(row, 'item') !== null)
          ? stock.reduce((sum, row) => sum + stockDaily(row, 'item'), 0)
          : null;
      const sales = sum('sales_plan');
      return [
        category,
        text(sum('inventory'), '件', 0),
        text(sales, '件', 0),
        text(daily, '件/天'),
        text(metricValue(m, '周转天数'), '天'),
        '—',
        metricState('周转天数', metricValue(m, '周转天数')),
      ];
    },
  );
  const regions = distinct(
    rows(current, 'changes')
      .filter((row) => String(row.kind) === '2')
      .map((row) => dimensionValue(row.province || row.region)),
  );
  const customers = [];
  const managers = new Map(
    (facts.customerManagers?.rows ?? []).map((row) => [
      row.customer,
      Number(row.names) === 1 ? row.manager : Number(row.names) > 1 ? '多位销售人员' : '—',
    ]),
  );
  const changes = (options.dimension && options.dimension !== 'region-change' ? [] : regions).map(
    (region) => {
      const filter = (row) => dimensionValue(row.province || row.region) === region,
        m = metric(current, filter),
        p = metric(previous, filter);
      customers.push(
        (facts.customers?.rows ?? []).filter(filter).map((row) => ({
          name: row.name || '未映射',
          code: row.customer,
          manager: managers.get(row.customer) || '—',
          changedQuantity: row.numerator,
          orderedQuantity: row.denominator,
        })),
      );
      return [
        region,
        value(m, '改单率'),
        value(p, '改单率'),
        metricDelta(m, p, '改单率'),
        metricState('改单率', metricValue(m, '改单率')),
      ];
    },
  );
  const cross = (name) =>
    bases.map((base) => [
      base,
      ...categories.map((category) =>
        value(
          metric(
            current,
            (row) => dimensionValue(row.base) === base && dimensionValue(row.category) === category,
          ),
          name,
        ),
      ),
    ]);
  const skus = {},
    skuPagination = {};
  for (const category of (facts.sqlSummary ? [] : categories).filter(
    (category) => !options.dimension || options.skuCategories?.includes(category),
  )) {
    const filtered = all.filter((row) => dimensionValue(row.category) === category);
    const allKeys = distinct(filtered.map((row) => JSON.stringify([row.base, row.sku])));
    const page = Math.min(
      Math.max(0, options.skuPages?.[category] ?? 0),
      Math.max(0, Math.ceil(allKeys.length / 20) - 1),
    );
    const keys = options.dimension ? allKeys.slice(page * 20, page * 20 + 20) : allKeys;
    skuPagination[category] = { page, total: allKeys.length, size: 20 };
    skus[category] = keys.map((key) => {
      const [base, sku] = JSON.parse(key),
        stock = rows(current, 'stock').find((row) => row.base === base && row.sku === sku);
      const m = metric(current, (row) => row.base === base && row.sku === sku);
      return {
        name: (stock?.name || filtered.find((row) => row.sku === sku)?.name || sku) + ' · ' + base,
        code: sku,
        inventory: text(stock?.inventory, '件', 0),
        salesPlan: text(stock?.sales_plan, '件', 0),
        shipDays: text(metricValue(m, '周转天数'), '天'),
        missingReasons: {
          inventory: stock
            ? '源数据未提供：当前基地SKU的全部库存 current_stock 为空。'
            : '系统未匹配：当前基地SKU在所选库存快照中没有对应记录。',
          salesPlan: stock
            ? '源数据未提供：当前基地SKU的月度需求计划（纠偏优先、月初备用）为空。'
            : '系统未匹配：当前基地SKU没有对应计划记录。',
          shipDays: m['周转天数']?.missingReason ?? '',
        },
      };
    });
  }
  return {
    lazy: !!options.dimension,
    performanceStyleVersion,
    cards,
    performance,
    skus,
    skuPagination,
    dimensions: {
      'category-fill': { rows: fill },
      'category-days': {
        rows: days,
        columns: [
          '品类',
          '可用库存',
          '月度需求计划',
          '计划日均',
          '可发货天数',
          '剔除大日期后',
          '状态',
        ],
      },
      'region-change': { rows: changes, customerDetails: customers },
      'base-category': {
        columns: ['基地 \\ 品类', ...categories],
        rows:
          !options.dimension || options.dimension === 'base-category' ? cross('订单满足率') : [],
      },
      'base-category-days': {
        columns: ['基地 \\ 品类', ...categories],
        rows:
          !options.dimension || options.dimension === 'base-category-days' ? cross('周转天数') : [],
      },
    },
  };
}
export function workbenchEvidence(facts) {
  if (!facts) return null;
  return {
    source: facts.source,
    complete: facts.complete !== false,
    pendingPeriods: facts.pendingPeriods ?? [],
    pendingSources: facts.pendingSources ?? [],
    readAt: facts.readAt,
    metricRegister: facts.metricRegister,
    selected: facts.selected,
    periods: Object.fromEntries(
      Object.entries(facts.periods).map(([name, period]) => [
        name,
        {
          start: period.start,
          endExclusive: period.end,
          inventoryEndExclusive: period.inventoryEnd ?? period.end,
          metrics: Object.fromEntries(
            Object.entries(period.metrics).map(([key, metric]) => [
              key,
              {
                value: metric.value,
                unit: metric.unit,
                ...(metric.value === null || metric.sample ? { note: metric.note } : {}),
                ...(metric.sample ? { sample: metric.sample } : {}),
              },
            ]),
          ),
          sourceDates: Object.fromEntries(
            period.sections.map((section) => [
              section.id,
              distinct(
                section.rows.map((row) => row.stock_date || row.snapshot_date).filter(Boolean),
              ).join('、'),
            ]),
          ),
          sections: period.sections.map((section) => ({
            id: section.id,
            status: section.status,
            code: section.code,
            total: section.rows.length,
            dates: distinct(
              section.rows.map((row) => row.stock_date || row.snapshot_date).filter(Boolean),
            ),
          })),
        },
      ]),
    ),
    detailScope:
      '指标由完整受控结果计算；仅传汇总和当前维度明细，未传原始明细。不得把聚合行数当订单数。',
  };
}

export function workbenchMetricDetail(facts, name) {
  if (!facts) return '正在读取所选周期数据…';
  const source =
    name === '作废率' || name === '改单率'
      ? 'changes'
      : name === '周转天数'
        ? 'stock'
        : name === '货龄（>60天库存占比）'
          ? 'ages'
          : name === '准交率'
            ? 'ontime'
            : 'orders';
  const lines = [facts.periods[facts.selected]?.metrics[name]?.note ?? ''];
  for (const [key, label] of [
    ['month', '本月'],
    ['previousMonth', '上月同期'],
    ['yearMonth', '去年同月同期'],
    ['week', '本周'],
    ['previousWeek', '上周同期'],
    ['yearWeek', '去年同周'],
  ]) {
    const period = facts.periods[key];
    if (!period) {
      if (facts.complete === false) lines.push(`${label}：加载中`);
      continue;
    }
    const metric = period.metrics[name],
      part = period.sections.find((section) => section.id === source);
    let reason = '';
    if (metric?.value === null || metric?.value === undefined) {
      if (part?.status === 'error') reason = '查询未完成：' + part.code;
      else if (!part?.rows.length) reason = '该周期无来源数据';
      else {
        const invalid = part.rows.reduce(
          (count, row) =>
            count +
            Number(row.invalid || 0) +
            (source === 'stock' && Number(row.source_rows) !== 1 ? 1 : 0),
          0,
        );
        reason =
          source === 'stock' && invalid
            ? `${invalid}条库存或计划记录异常，不能作为完整合计`
            : metric?.note || '缺少有效计算依据';
      }
    }
    const dates = distinct(
      (part?.rows ?? []).map((row) => row.stock_date || row.snapshot_date).filter(Boolean),
    );
    lines.push(
      `${label}（${period.start} 至 ${dayOffset(period.end, -1)}）：${text(metric?.value, metric?.unit ?? '%', name === '周转天数' ? 1 : 2)}${metric?.sample ? '；' + metric.coverageNote : ''}${reason ? '；' + reason : ''}${dates.length ? '；快照 ' + dates.join('、') : ''}`,
    );
  }
  return lines.join('\n');
}
