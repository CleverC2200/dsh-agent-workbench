import {
  categoryHistoryMonths,
  historyFiscalMonths,
  historyMonthOffset,
} from './category-history-periods.js';
import { createSourceProductMatcher, sourceProductMappings } from './source-projections.js';
import { canonicalBaseName } from './relations.js';

const number = (value) =>
  value === '' || value == null || !Number.isFinite(Number(value)) ? null : Number(value);
const total = (rows, field) => {
  const values = rows.map((row) => number(row[field]));
  return values.length && values.every((value) => value !== null)
    ? values.reduce((sum, value) => sum + value, 0)
    : null;
};

export function categorySourceInputs(draft) {
  const products = sourceProductMappings(draft.products, draft.productRaw);
  const match = createSourceProductMatcher(products);
  const issues = [];
  const categoriesByCode = new Map(
    [...Map.groupBy(products, (row) => row['产品编码'])].map(([code, rows]) => [
      code,
      [...new Set(rows.map((row) => row['大类']))],
    ]),
  );
  const productCategories = [...new Set(products.map((row) => row['大类']))];
  const scope = (rows, source, history = false) =>
    rows.flatMap((row) => {
      const base = canonicalBaseName(row['基地']);
      const code = history ? row['维度值'] : row['产品编码'];
      const product = match(code, base);
      if (base && base !== '全国' && code && (!history || row['维度类型'] === '基地+产品'))
        return product.category
          ? [
              {
                ...row,
                基地: base,
                大类: product.category,
                原始来源数量: history ? row['月发货数量'] : row['数量'],
              },
            ]
          : [];
      const categories =
        code && (!history || row['维度类型'] === '基地+产品')
          ? (categoriesByCode.get(code) ?? [])
          : productCategories.filter((category, _index, categories) => {
              const sourceCategory = history ? row['维度值'] : row['大类'];
              return (
                sourceCategory !== '粽子' &&
                (category === sourceCategory || !categories.includes(sourceCategory))
              );
            });
      return categories.map((category) => {
        const reason = `${source} ${row['月份']} ${code || category} 缺可追溯的基地SKU明细，无法确定产品范围归属`;
        issues.push(reason);
        return {
          ...row,
          基地: '',
          大类: category,
          原始来源数量: history ? row['月发货数量'] : row['数量'],
          数量: null,
          月发货数量: null,
          上年同期发货数量: null,
          上月发货数量: null,
          基地维度财年发货数量: null,
          粒度状态: '关键维度缺失',
          缺项原因: reason,
        };
      });
    });
  const input = draft.historicalIndicators;
  const ready =
    draft.historicalIndicatorsRead?.status === 'ready' &&
    draft.historicalIndicatorsRead.month === draft.month;
  const periods = ready ? input.periods : [];
  const sourceMonths = new Map();
  for (const period of periods) {
    const groups = Map.groupBy(period.rows, (row) => row['月份']);
    const requested =
      period.metadata?.requestedMonths ??
      (period.month ? categoryHistoryMonths(period.month) : [...groups.keys()]);
    for (const month of requested) {
      const rows = groups.get(month) ?? [];
      const observations = sourceMonths.get(month) ?? [];
      observations.push({ rows, complete: !period.error && !period.metadata?.partial });
      sourceMonths.set(month, observations);
    }
  }
  const completeMonths = new Map();
  const conflictingGroups = new Set();
  for (const [month, observations] of sourceMonths) {
    const completed = observations.filter(({ complete }) => complete);
    completeMonths.set(month, completed.length > 0 && completed.every(({ rows }) => rows.length));
    if (completed.length < 2) continue;
    const groups = completed.map(({ rows }) =>
      Map.groupBy(
        scope(rows, '历史发货', true).filter((row) => row['基地']),
        (row) => JSON.stringify([row['大类'], row['基地']]),
      ),
    );
    for (const key of new Set(groups.flatMap((group) => [...group.keys()]))) {
      const values = groups.map((group) =>
        JSON.stringify(
          (group.get(key) ?? [])
            .map((row) =>
              JSON.stringify([
                row['维度值'],
                number(row['月发货数量']),
                row['粒度状态'],
                row['财年'],
              ]),
            )
            .sort(),
        ),
      );
      if (new Set(values).size > 1) {
        const [category, base] = JSON.parse(key);
        conflictingGroups.add(JSON.stringify([month, category, base]));
        conflictingGroups.add(JSON.stringify([month, category]));
      }
    }
  }
  const raw = [
    ...new Map(
      [...sourceMonths.values()]
        .flatMap((observations) => observations.flatMap(({ rows }) => rows))
        .map((row) => [JSON.stringify(row), row]),
    ).values(),
  ];
  const details = scope(raw, '历史发货', true);
  const calculationRows = [...sourceMonths.values()].flatMap(
    (observations) => observations.find(({ complete }) => complete)?.rows ?? [],
  );
  const scoped = scope(calculationRows, '历史发货', true);
  const assigned = scoped.filter((row) => row['基地']);
  const baseMonthly = Map.groupBy(assigned, (row) =>
    JSON.stringify([row['月份'], row['大类'], row['基地']]),
  );
  const monthly = Map.groupBy(assigned, (row) => JSON.stringify([row['月份'], row['大类']]));
  const unassigned = new Set(
    scoped.filter((row) => !row['基地']).map((row) => JSON.stringify([row['月份'], row['大类']])),
  );
  const validRows = (rows) =>
    rows.every((row) => row['粒度状态'] === '唯一') &&
    new Set(rows.map((row) => JSON.stringify([row['月份'], row['基地'], row['维度值']]))).size ===
      rows.length;
  const sum = (rows) => (validRows(rows) ? (rows.length ? total(rows, '月发货数量') : 0) : null);
  const categoryBases = [
    ...Map.groupBy(products, (row) =>
      JSON.stringify([canonicalBaseName(row['基地']), row['大类']]),
    ).values(),
  ]
    .map(([row]) => ({ base: canonicalBaseName(row['基地']), category: row['大类'] }))
    .filter(({ base, category }) => base && base !== '全国' && category);
  const quantities = new Map();
  for (const month of sourceMonths.keys()) {
    for (const { base, category } of categoryBases) {
      const categoryKey = JSON.stringify([month, category]);
      const categoryRows = monthly.get(categoryKey) ?? [];
      const rows = baseMonthly.get(JSON.stringify([month, category, base])) ?? [];
      const complete =
        completeMonths.get(month) &&
        !conflictingGroups.has(JSON.stringify([month, category, base])) &&
        (categoryRows.length || !unassigned.has(categoryKey));
      quantities.set(JSON.stringify([month, category, base]), {
        rows,
        quantity: complete ? sum(rows) : null,
      });
    }
  }
  const quantityAt = (month, category, base) =>
    quantities.get(JSON.stringify([month, category, base]))?.quantity ?? null;
  const fiscal = new Map();
  const monthFiscal = new Map();
  const history = [...sourceMonths.keys()].flatMap((month) => {
    return categoryBases.map(({ base, category }) => {
      const rows = quantities.get(JSON.stringify([month, category, base])).rows;
      const months = historyFiscalMonths(month);
      const fiscalKey = JSON.stringify([months[0], category]);
      if (!fiscal.has(fiscalKey)) {
        const fiscalRows = months.flatMap(
          (period) => monthly.get(JSON.stringify([period, category])) ?? [],
        );
        const years = new Set(fiscalRows.map((row) => row['财年']));
        const missing = months.filter((period) => {
          const key = JSON.stringify([period, category]);
          const rows = monthly.get(key) ?? [];
          return (
            !completeMonths.get(period) ||
            conflictingGroups.has(key) ||
            (rows.length ? sum(rows) === null : unassigned.has(key))
          );
        });
        const complete =
          !missing.length && years.size === 1 && fiscalRows.every((row) => row['财年']);
        fiscal.set(fiscalKey, {
          quantity: complete ? sum(fiscalRows) : null,
          year: years.size === 1 ? fiscalRows[0]['财年'] : '',
          missing,
          issue:
            years.size > 1 ? '同财年源月份的财年标识不一致' : !years.size ? '缺可归属财年明细' : '',
        });
      }
      const annual = fiscal.get(fiscalKey);
      monthFiscal.set(JSON.stringify([month, category]), annual);
      const quantity = quantityAt(month, category, base);
      const previousYear = quantityAt(historyMonthOffset(month, -12), category, base);
      const previousMonth = quantityAt(historyMonthOffset(month, -1), category, base);
      return {
        月份: month,
        基地: base,
        大类: category,
        维度类型: '基地+大类',
        维度值: category,
        财年: annual.year,
        月发货数量: quantity,
        上年同期发货数量: previousYear,
        上月发货数量: previousMonth,
        全国维度财年发货数量: annual.quantity,
        月发货占财年比例: quantity !== null && annual.quantity ? quantity / annual.quantity : null,
        同比增长率: quantity !== null && previousYear ? quantity / previousYear - 1 : null,
        环比增长率: quantity !== null && previousMonth ? quantity / previousMonth - 1 : null,
        源记录数: rows.reduce((count, row) => count + Number(row['源记录数'] || 0), 0),
        粒度状态: quantity !== null ? '唯一' : '源月份不完整或数量冲突',
        缺项原因: quantity === null ? `${month} 源月份不完整或数量冲突` : '',
      };
    });
  });
  const annualDetails = ready ? scope(input.annual?.rows ?? [], '年度计划') : [];
  const annualInputs = [
    ...Map.groupBy(annualDetails, (row) => JSON.stringify([row['月份'], row['大类']])).values(),
  ].flatMap((rows) => {
    const assigned = rows.filter((row) => row['基地']);
    return assigned.length ? assigned : rows;
  });
  const annual = [
    ...Map.groupBy(annualInputs, (row) =>
      JSON.stringify([row['月份'], row['基地'], row['大类']]),
    ).values(),
  ].map((rows) => ({
    月份: rows[0]['月份'],
    基地: rows[0]['基地'],
    大类: rows[0]['大类'],
    数量:
      new Set(rows.map((row) => row['产品编码'])).size === rows.length ? total(rows, '数量') : null,
    源记录数: rows.reduce((sum, row) => sum + Number(row['源记录数'] || 0), 0),
  }));
  const sourceCategories = new Set([...details, ...annualDetails].map((row) => row['大类']));
  const readSourceRows = () => [
    ...details.map((row) => {
      const annual = monthFiscal.get(JSON.stringify([row['月份'], row['大类']]));
      return {
        来源: '历史发货',
        月份: row['月份'],
        基地: row['基地'],
        产品编码: row['维度值'],
        大类: row['大类'],
        数量: row['月发货数量'],
        原始来源数量: row['原始来源数量'],
        财年: row['财年'],
        原始全国SKU财年量: row['全国维度财年发货数量'],
        基地SKU财年量: row['基地维度财年发货数量'],
        财年源月份数: row['基地财年源月份数'],
        财年有效月份数: row['基地财年有效月份数'],
        池内大类财年量: annual?.quantity ?? null,
        财年缺失或冲突月份: annual?.missing.join('、') ?? '',
        财年核对异常: annual?.issue ?? '',
        上年同期发货数量: row['上年同期发货数量'],
        上月发货数量: row['上月发货数量'],
        取数依据: '自然月独立按产品池汇总；财年按7月至次年6月完整源月份的池内记录合计',
        缺项原因:
          row['缺项原因'] ||
          (number(row['基地维度财年发货数量']) === null
            ? '原基地SKU财年量不可用；大类财年量由完整源月份独立汇总'
            : ''),
      };
    }),
    ...annualDetails.map((row) => ({
      来源: '年度计划',
      月份: row['月份'],
      基地: row['基地'],
      产品编码: row['产品编码'],
      大类: row['大类'],
      数量: row['数量'],
      原始来源数量: row['原始来源数量'],
      取数依据: '年度需求基地SKU源记录',
      缺项原因: row['缺项原因'] ?? '',
    })),
  ];
  return { history, annual, sourceCategories, readSourceRows, issues: [...new Set(issues)] };
}
