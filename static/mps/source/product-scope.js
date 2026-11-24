import { canonicalBaseName } from './relations.js';

const text = (value) => (typeof value === 'string' ? value.trim() : '');
const key = (row) => JSON.stringify([row.base, row.code]);
const unique = (values) => [...new Set(values.filter(Boolean))];
const normalize = (row) => ({
  base: canonicalBaseName(row.target_base ?? row['基地'] ?? row.base),
  code: text(row.material_code ?? row['产品编码'] ?? row.code),
  name: text(row.material_name ?? row['产品名称'] ?? row.name),
  category: text(row.responsible_item ?? row['大类'] ?? row.category),
  series: text(row.series ?? row['系列']),
  group: text(row.product_item ?? row['物料组'] ?? row.group),
  historyCode: text(row.replacement_material_code ?? row['老品编码'] ?? row.historyCode),
  historyFactor: row.replace_num === undefined ? row.historyFactor : row.replace_num,
  period: text(row.stat_period),
});

export function buildProductScope(draft, products, result, exclusions) {
  const raw = draft.productRaw ?? [];
  const source = (raw.length ? raw : (draft.products ?? []))
    .map(normalize)
    .filter((row) => row.category !== '粽子' && row.base !== 'ODM');
  const adopted = products.map(normalize);
  const actual = [...new Map(result.rows.map((row) => [key(row), normalize(row)])).values()];
  const bySource = Map.groupBy(source, key);
  const byAdopted = Map.groupBy(adopted, key);
  const byActual = new Map(actual.map((row) => [key(row), row]));
  const byExcluded = new Map(exclusions.map((row) => [key(row), row]));
  const expected = new Set(source.filter((row) => row.base && row.code).map(key));
  const ids = unique([...bySource.keys(), ...byAdopted.keys(), ...byActual.keys()]);
  const rows = ids.map((id) => {
    const sources = bySource.get(id) ?? [];
    const mappings = byAdopted.get(id) ?? [];
    const participating = byActual.has(id);
    const excluded = byExcluded.get(id);
    const row = sources[0] ?? mappings[0] ?? byActual.get(id);
    const issues = [];
    if (!row.base) issues.push('产品清单缺基地');
    if (!row.code) issues.push('产品清单缺SKU');
    for (const [field, label] of [
      ['name', '产品名称'],
      ['category', '大类'],
      ['series', '系列'],
      ['group', '物料组'],
    ]) {
      if (sources.some((source) => !source[field])) issues.push(`源${label}缺失`);
      if (unique([...sources, ...mappings].map((source) => source[field])).length > 1)
        issues.push(`源清单或采用映射的${label}冲突`);
    }
    if (new Set([...sources, ...mappings].map((source) => source.historyCode)).size > 1)
      issues.push('源清单或采用映射的替换SKU冲突');
    const factors = sources
      .filter((source) => source.historyCode && source.historyCode !== source.code)
      .map((source) => source.historyFactor);
    if (new Set(factors.map((factor) => (factor == null ? null : Number(factor)))).size > 1)
      issues.push('源替换系数冲突');
    if (
      mappings.some(
        (mapping) =>
          mapping.historyCode &&
          mapping.historyCode !== mapping.code &&
          mapping.historyFactor === null,
      )
    )
      issues.push('计算采用的替换系数缺失、冲突或无效');
    const status =
      !row.base || !row.code
        ? '主数据缺项'
        : expected.has(id)
          ? excluded
            ? participating
              ? '排除仍参与'
              : '主动排除'
            : participating
              ? '已覆盖'
              : '遗漏'
          : '额外组合';
    if (excluded) issues.push(...(excluded.missing ?? []));
    if (status === '遗漏')
      issues.push(
        mappings.length ? '已映射但未进入计算，需核对范围接线' : '源组合未映射到当前采用产品清单',
      );
    if (status === '额外组合') issues.push('采用清单或计算组合不在本次源产品清单');
    if (status === '排除仍参与') issues.push('已声明排除的组合仍参与计算');
    return {
      base: row.base,
      code: row.code,
      categories: unique([...sources, ...mappings].map((source) => source.category)),
      groups: unique([...sources, ...mappings].map((source) => source.group)),
      periods: unique(sources.map((source) => source.period)),
      sourceRows: sources.length,
      expected: expected.has(id),
      participating,
      status,
      issues,
    };
  });
  const periods = unique(source.map((row) => row.period));
  const sourceMonths = unique(periods.map((period) => /^\d{4}-\d{2}/.exec(period)?.[0]));
  const coverageIssues = [
    ...(!raw.length ? ['未取得独立产品源明细，当前按采用清单对账'] : []),
    ...(draft.productsRead?.status !== 'ready'
      ? [`产品清单读取状态为${draft.productsRead?.status ?? '未记录'}`]
      : []),
    ...(!periods.length ? ['产品清单缺源统计期，无法证明与评估同期间'] : []),
    ...(periods.length && (sourceMonths.length !== 1 || sourceMonths[0] !== draft.month)
      ? [`产品源统计期${periods.join('、')}与评估月${draft.month}未证明同期间`]
      : []),
    '未取得同期间全国基地范围及独立完整性证明，仅报告实际参与范围',
  ];
  return {
    month: draft.month,
    source: raw.length ? '当前产品源清单' : '当前采用产品清单',
    sourceRows: source.length,
    periods,
    bases: unique(actual.map((row) => row.base)),
    expectedCount: expected.size,
    participatingCount: actual.length,
    coveredCount: rows.filter((row) => row.expected && row.participating).length,
    excludedCount: rows.filter((row) => row.status === '主动排除').length,
    missingCount: rows.filter((row) => row.status === '遗漏').length,
    extraCount: rows.filter((row) => row.status === '额外组合').length,
    conflictCount: rows.filter((row) => row.issues.some((issue) => issue.includes('冲突'))).length,
    invalidCount: rows.filter((row) => row.status === '主数据缺项').length,
    coverageIssues,
    rows,
  };
}
