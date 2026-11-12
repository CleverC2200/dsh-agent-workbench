import { canonicalBaseName } from './relations.js';

const text = (value) => (typeof value === 'string' ? value.trim() : '');
const values = (rows, field) => [...new Set(rows.map((row) => text(row[field])).filter(Boolean))];
const key = (code, group) => JSON.stringify([code, group]);
const productSourceFields = {
  统计月份: 'stat_period',
  目标基地: 'target_base',
  调拨标签: 'transfer_tag',
  大类: 'sub_category',
  系列: 'series',
  物料组编码: 'product_item',
  物料组名称: 'product_item_name',
  物料编码: 'material_code',
  物料名称: 'material_name',
  产品标签: 'responsible_item',
  替换品: 'replacement_product',
  替换物料编码: 'replacement_material_code',
  净重: 'net_weight',
  重量单位: 'weight_unit',
  计量单位: 'measure_unit',
  替换系数: 'replace_num',
  更新时间: 'update_time',
  源记录数: 'source_rows',
};
export const productSourceColumns = [...Object.keys(productSourceFields), '新品标记'];
export function productSourceRows(rows) {
  return rows.map((row) => ({
    ...Object.fromEntries(
      Object.entries(productSourceFields).map(([field, source]) => [field, row[source] ?? '']),
    ),
    新品标记: !text(row.transfer_tag)
      ? '待确认'
      : text(row.transfer_tag) === '新品'
        ? '新品'
        : '非新品',
  }));
}
const numeric = (value) =>
  (typeof value === 'number' || (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value))) &&
  Number.isFinite(Number(value)) &&
  Math.abs(Number(value)) <= Number.MAX_SAFE_INTEGER
    ? Number(value)
    : null;

export function productProjections(products, raw = [], facts = [], prices = []) {
  const priceByCode = new Map(prices.map((price) => [price['产品编码'], price['未税到岸单价']]));
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
    const sourceRecords = children.length ? childSources : records;
    const transferTags = values(sourceRecords, 'transfer_tag');
    const newProduct = transferTags.includes('新品');
    const display = {
      ...row,
      未税到岸单价: priceByCode.get(row['产品编码']) ?? '',
      新品标记: newProduct
        ? transferTags.length === 1 && sourceRecords.every((record) => text(record.transfer_tag))
          ? '新品'
          : '部分基地新品'
        : sourceRecords.length && sourceRecords.every((record) => text(record.transfer_tag))
          ? '非新品'
          : '待确认',
    };
    const inherited = [];
    for (const [field, candidates] of [
      ['大类', category],
      ['系列', series],
    ]) {
      const sourceField = field === '大类' ? 'sub_category' : 'series';
      const complete =
        children.every((child) =>
          source.has(key(products[child]['产品编码'], products[child]['物料组'])),
        ) && childSources.every((child) => text(child[sourceField]));
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
      transferTags,
      targetBases: values(sourceRecords, 'target_base'),
      sourcePeriods: values(sourceRecords, 'stat_period'),
      sourceDetails: productSourceRows(sourceRecords),
      categoryValues: category,
      seriesValues: series,
      sourceRows: records.length,
      replacementCodes: values(records, 'replacement_material_code'),
      replacementNames: values(records, 'replacement_product'),
      candidateBases: [...new Set(codes.flatMap((code) => [...(bases.get(code) ?? [])]))].sort(),
    };
  });
}

export function sourceDimensions(rows, products) {
  const normalized = (products ?? []).map((product) => ({
    基地: text(product['基地'] ?? product.belong_base),
    产品编码: text(product['产品编码'] ?? product.material_code),
    大类: text(product['大类'] ?? product.sub_category),
    系列: text(product['系列'] ?? product.series),
    物料组: text(product['物料组'] ?? product.product_item),
    物料组名称: text(product['物料组名称'] ?? product.product_item_name),
  }));
  const byCode = new Map();
  for (const product of normalized) {
    const group = byCode.get(product['产品编码']) ?? [];
    group.push(product);
    byCode.set(product['产品编码'], group);
  }
  return rows.map((row) => {
    const matches = (byCode.get(text(row['产品编码'])) ?? []).filter(
      (product) =>
        product['产品编码'] &&
        product['产品编码'] === text(row['产品编码']) &&
        (!product['基地'] || product['基地'] === text(row['基地'])),
    );
    const fields = {},
      issues = [];
    if (!matches.length) issues.push('物料编码未匹配当前产品明细，分类留空');
    for (const field of ['大类', '系列', '物料组', '物料组名称']) {
      const candidates = [...new Set(matches.map((product) => product[field]).filter(Boolean))];
      fields[field] =
        matches.length && matches.every((product) => product[field]) && candidates.length === 1
          ? candidates[0]
          : '';
      if (matches.length && !fields[field])
        issues.push(
          candidates.length > 1
            ? `同物料编码的${field}存在多个当前值，未选择`
            : `当前产品明细的${field}映射为空`,
        );
    }
    return {
      ...row,
      源大类: row['源大类'] ?? row['大类'] ?? '',
      源系列: row['源系列'] ?? row['系列'] ?? '',
      源物料组: row['源物料组'] ?? row['物料组'] ?? '',
      ...fields,
      缺项原因: [row['缺项原因'], ...issues].filter(Boolean).join('；'),
    };
  });
}

function aggregate(rows, column, knownColumn) {
  const quantities = rows.map((row) => numeric(row[column]));
  const known = rows
    .map((row, index) => quantities[index] ?? (knownColumn ? numeric(row[knownColumn]) : null))
    .filter((value) => value !== null);
  const sum = known.reduce((total, value) => total + value, 0);
  const knownQuantity =
    known.length && Number.isFinite(sum) && Math.abs(sum) <= Number.MAX_SAFE_INTEGER ? sum : null;
  return {
    knownQuantity,
    quantity: rows.length && quantities.every((value) => value !== null) ? knownQuantity : null,
    missing: quantities.filter((value) => value === null).length,
    count: rows.length,
  };
}

export function productRows(rows) {
  const products = rows.map((row) => ({
    基地: '',
    产品编码: text(row.material_code),
    产品名称: text(row.material_name),
    大类: text(row.sub_category),
    系列: text(row.series),
    物料组: text(row.product_item),
    物料组名称: text(row.product_item_name),
    老品编码: text(row.replacement_material_code),
    老品名称: text(row.replacement_product),
  }));
  return [...new Map(products.map((row) => [JSON.stringify(row), row])).values()];
}

export function sourceProductMappings(products, raw = []) {
  if (!products) return raw;
  return products.flatMap((product) => {
    if (text(product['基地'])) return [product];
    const code = text(product['产品编码']);
    const sources = raw.filter((row) => text(row.material_code) === code);
    const matching = sources.filter(
      (row) => text(row.replacement_material_code) === text(product['老品编码']),
    );
    const bases = [
      ...new Set(
        (matching.length ? matching : sources)
          .map((row) => canonicalBaseName(row.target_base))
          .filter(Boolean),
      ),
    ];
    return bases.length ? bases.map((base) => ({ ...product, 基地: base })) : [product];
  });
}

export function createSourceProductMatcher(rawProducts) {
  const byBase = new Map();
  const categoriesByCode = new Map();
  const codesByOldCode = new Map();
  for (const product of rawProducts ?? []) {
    const code = text(product.material_code) || text(product['产品编码']);
    if (!code) continue;
    const categories = categoriesByCode.get(code) ?? new Set();
    categories.add(text(product.sub_category) || text(product['大类']));
    categoriesByCode.set(code, categories);
    const oldCode = text(product.replacement_material_code) || text(product['老品编码']);
    if (oldCode) {
      const codes = codesByOldCode.get(oldCode) ?? new Set();
      codes.add(code);
      codesByOldCode.set(oldCode, codes);
    }
  }
  return (sourceCode, sourceBase = '') => {
    const base = canonicalBaseName(sourceBase);
    if (base) {
      if (!byBase.has(base))
        byBase.set(
          base,
          createSourceProductMatcher(
            (rawProducts ?? []).filter((row) => {
              const productBase = canonicalBaseName(row.target_base ?? row['基地']);
              return !productBase || productBase === base;
            }),
          ),
        );
      return byBase.get(base)(sourceCode);
    }
    sourceCode = text(sourceCode);
    const oldCodes = codesByOldCode.get(sourceCode);
    const currentCode = categoriesByCode.has(sourceCode)
      ? sourceCode
      : oldCodes?.size === 1
        ? [...oldCodes][0]
        : '';
    const categories = categoriesByCode.get(currentCode);
    return {
      currentCode,
      category: categories?.size === 1 ? [...categories][0] : '',
      unknown: !categories && !oldCodes,
      poolPresent: categoriesByCode.size > 0,
      reason: categories
        ? '当前产品池大类不唯一'
        : oldCodes
          ? '老品编码对应多个当前产品，未选择'
          : '不在当前产品池',
    };
  };
}

export function sourceCheckRows(checks, rawProducts) {
  const excluded = [];
  const matchProduct = createSourceProductMatcher(rawProducts);
  const classify = (rows, month, source, error) =>
    rows.flatMap((row) => {
      const sourceCode = text(row['产品编码']);
      const match = matchProduct(sourceCode, row['基地']);
      const { currentCode, category } = match;
      const mapped = {
        ...row,
        当前产品编码: currentCode,
        源大类: row['源大类'] ?? row['大类'] ?? '',
        大类: category,
      };
      if (!category) {
        const quantity = source === 'BI' ? row['数量'] : (row['源计划数量'] ?? row['计划数量']);
        if (
          match.poolPresent &&
          match.unknown &&
          sourceCode &&
          !error &&
          (!row['缺项原因'] ||
            (source === '计划量' &&
              numeric(row['源记录数']) > 0 &&
              numeric(row['缺数量条数']) > 0 &&
              numeric(row['重复键条数']) === 0)) &&
          (quantity == null || quantity === '' || numeric(quantity) === 0)
        )
          return [];
        excluded.push({
          ...mapped,
          月份: month,
          来源: source,
          原因: match.reason,
        });
        return [];
      }
      return [
        {
          ...mapped,
          源分类: category,
          缺项原因: row['缺项原因'] ?? '',
        },
      ];
    });
  const periods = (checks?.periods ?? []).map((period) => ({
    ...period,
    historyError: period.history.error,
    reportError: period.report.error,
    history: classify(period.history.rows, period.month, 'BI', period.history.error),
    report: classify(period.report.rows, period.month, '计划量', period.report.error),
  }));
  const classes = [
    ...new Set(
      (rawProducts ?? []).map((row) => text(row.sub_category) || text(row['大类'])).filter(Boolean),
    ),
  ];
  const column = '计划数量';
  const rows = periods.flatMap((period) =>
    classes.map((category) => {
      const history = period.history.filter((row) => row['大类'] === category);
      const report = period.report.filter((row) => row['源分类'] === category);
      const actual = aggregate(history, '数量');
      const plan = aggregate(report, column, '已知计划数量');
      const missingKeys = [...history, ...report].filter((row) => !row['产品编码']).length;
      const issues = [
        ...(period.historyError
          ? [`BI读取失败：${period.historyError}`]
          : !history.length
            ? ['本月BI无当前产品池分类记录']
            : []),
        ...(period.reportError
          ? [`计划量读取失败：${period.reportError}`]
          : !report.length
            ? ['本月计划量无当前产品池分类记录']
            : []),
        ...(actual.missing ? [`BI缺数量${actual.missing}条，显示已知小计`] : []),
        ...(plan.missing ? [`计划量缺数量${plan.missing}条，显示已知小计`] : []),
        ...(missingKeys ? [`缺SKU ${missingKeys}条`] : []),
        ...new Set(report.map((row) => row['缺项原因']).filter(Boolean)),
        ...(plan.quantity === 0 ? ['计划量为0，比值不可用'] : []),
      ];
      const ratio =
        !issues.length && actual.quantity !== null && plan.quantity > 0
          ? actual.quantity / plan.quantity
          : null;
      return { month: period.month, category, actual, plan, ratio, issues };
    }),
  );
  return {
    rows,
    excluded,
    details: [
      ...periods.flatMap((period) => [
        ...period.history.map((row) => ({
          ...row,
          月份: period.month,
          来源: 'BI',
          原因: row['缺项原因'] || (numeric(row['数量']) === null ? '缺数量' : ''),
        })),
        ...period.report.map((row) => ({
          ...row,
          月份: period.month,
          来源: '计划量',
          原因: row['缺项原因'] || (numeric(row[column]) === null ? '缺数量' : ''),
        })),
        ...(period.historyError
          ? [{ 月份: period.month, 来源: 'BI', 原因: `读取失败：${period.historyError}` }]
          : []),
        ...(period.reportError
          ? [{ 月份: period.month, 来源: '计划量', 原因: `读取失败：${period.reportError}` }]
          : []),
      ]),
      ...excluded,
    ],
    categories: classes,
    months: periods.map((period) => period.month),
    column,
  };
}
