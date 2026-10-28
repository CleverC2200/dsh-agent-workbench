const text = (value) => (typeof value === 'string' ? value.trim() : '');
const values = (rows, field) => [...new Set(rows.map((row) => text(row[field])).filter(Boolean))];
const key = (code, group) => JSON.stringify([code, group]);
const numeric = (value) =>
  (typeof value === 'number' || (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value))) &&
  Number.isFinite(Number(value)) &&
  Math.abs(Number(value)) <= Number.MAX_SAFE_INTEGER
    ? Number(value)
    : null;

export function productProjections(products, raw = [], facts = []) {
  const source = new Map(),
    groups = new Map(),
    bases = new Map();
  for (const row of raw) {
    const id = key(text(row.material_code), text(row.product_item));
    source.set(id, [...(source.get(id) ?? []), row]);
  }
  products.forEach((row, index) => {
    if (!row['产品编码'] || !row['物料组']) return;
    const group = groups.get(row['物料组']) ?? [];
    group.push(index);
    groups.set(row['物料组'], group);
  });
  for (const row of facts) {
    if (!row['产品编码'] || !row['基地']) continue;
    const current = bases.get(row['产品编码']) ?? new Set();
    current.add(row['基地']);
    bases.set(row['产品编码'], current);
  }
  return products.map((row, index) => {
    const children = row['产品编码'] ? [] : (groups.get(row['物料组']) ?? []);
    const records = source.get(key(row['产品编码'], row['物料组'])) ?? [];
    const childSources = children.flatMap(
      (child) => source.get(key(products[child]['产品编码'], products[child]['物料组'])) ?? [],
    );
    const category = values(childSources, 'sub_category');
    const series = values(childSources, 'series');
    const labels = values(children.length ? childSources : records, 'responsible_item');
    const display = { ...row };
    const inherited = [];
    for (const [field, candidates] of [
      ['大类', category],
      ['系列', series],
    ]) {
      const sourceField = field === '大类' ? 'sub_category' : 'series';
      const complete =
        childSources.length === children.length &&
        childSources.every((child) => text(child[sourceField]));
      if (!display[field] && children.length && complete && candidates.length === 1) {
        display[field] = candidates[0];
        inherited.push(field);
      }
      if (!display[field] && children.length && candidates.length > 1)
        display[field] = `多值（${candidates.length}项）`;
    }
    const codes = children.length
      ? children.map((child) => products[child]['产品编码'])
      : [row['产品编码']];
    return {
      row,
      index,
      display,
      children,
      inherited,
      labels,
      categoryValues: category,
      seriesValues: series,
      sourceRows: records.length,
      replacementCodes: values(records, 'replacement_material_code'),
      replacementNames: values(records, 'replacement_product'),
      candidateBases: [...new Set(codes.flatMap((code) => [...(bases.get(code) ?? [])]))].sort(),
    };
  });
}

function aggregate(rows, column) {
  const known = rows.map((row) => numeric(row[column])).filter((value) => value !== null);
  const sum = known.reduce((total, value) => total + value, 0);
  const knownQuantity =
    known.length && Number.isFinite(sum) && Math.abs(sum) <= Number.MAX_SAFE_INTEGER ? sum : null;
  return {
    knownQuantity,
    quantity: rows.length && known.length === rows.length ? knownQuantity : null,
    missing: rows.length - known.length,
    count: rows.length,
  };
}

export function sourceCheckRows(checks, rawProducts, pull, categories = []) {
  const labels = new Map();
  for (const row of rawProducts ?? []) {
    const code = text(row.material_code),
      label = text(row.responsible_item);
    if (!code || !label) continue;
    const current = labels.get(code) ?? new Set();
    current.add(label);
    labels.set(code, current);
  }
  const periods = (checks?.periods ?? []).map((period) => ({
    ...period,
    historyError: period.history.error,
    reportError: period.report.error,
    history: period.history.rows,
    report: period.report.rows.map((row) => {
      const matches = labels.get(row['产品编码']);
      return { ...row, 源分类: matches?.size === 1 ? [...matches][0] : '' };
    }),
  }));
  const classes = [
    ...new Set([
      ...categories,
      ...periods
        .flatMap((period) => [
          ...period.history.map((row) => row['大类']),
          ...period.report.map((row) => row['源分类']),
        ])
        .filter(Boolean),
    ]),
  ];
  const column = pull === 'monthly' ? '月初数量' : '纠偏数量';
  const rows = periods.flatMap((period) =>
    classes.map((category) => {
      const history = period.history.filter((row) => row['大类'] === category);
      const report = period.report.filter((row) => row['源分类'] === category);
      const actual = aggregate(history, '数量');
      const plan = aggregate(report, column);
      const unclassified = period.report.filter((row) => !row['源分类']).length;
      const missingKeys = [...history, ...report].filter(
        (row) => !row['基地'] || !row['产品编码'],
      ).length;
      const missingHistoryClass = period.history.filter((row) => !row['大类']).length;
      const issues = [
        ...(period.historyError
          ? [`BI读取失败：${period.historyError}`]
          : !history.length
            ? ['本月BI无同名分类记录']
            : []),
        ...(period.reportError
          ? [`DMS读取失败：${period.reportError}`]
          : !report.length
            ? ['本月DMS无同名源标签记录']
            : []),
        ...(actual.missing ? [`BI缺数量${actual.missing}条，显示已知小计`] : []),
        ...(plan.missing ? [`DMS缺数量${plan.missing}条，显示已知小计`] : []),
        ...(missingKeys ? [`缺基地或SKU ${missingKeys}条`] : []),
        ...(unclassified ? [`DMS ${unclassified}条未唯一匹配源产品标签`] : []),
        ...(missingHistoryClass ? [`BI ${missingHistoryClass}条缺源分类`] : []),
        ...(plan.quantity === 0 ? ['DMS计划为0，比值不可用'] : []),
      ];
      const ratio =
        !issues.length && actual.quantity !== null && plan.quantity > 0
          ? actual.quantity / plan.quantity
          : null;
      return { month: period.month, category, actual, plan, ratio, issues };
    }),
  );
  return { rows, categories: classes, months: periods.map((period) => period.month), column };
}
