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
          ? [
              ...new Set(
                products
                  .filter((product) => product['产品编码'] === code)
                  .map((product) => product['大类']),
              ),
            ]
          : [...new Set(products.map((product) => product['大类']))].filter(
              (category) => category === (history ? row['维度值'] : row['大类']),
            );
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
  const details = ready
    ? scope(
        input.periods.flatMap((period) => (period.error ? [] : period.rows)),
        '历史发货',
        true,
      )
    : [];
  const groups = Map.groupBy(details, (row) => JSON.stringify([row['月份'], row['大类']]));
  const history = [...groups.values()].flatMap((categoryRows) => {
    const annual = total(categoryRows, '基地维度财年发货数量');
    return [...Map.groupBy(categoryRows, (row) => row['基地']).values()].map((rows) => {
      const fiscalYears = new Set(rows.map((row) => row['财年']));
      const valid =
        rows.every((row) => row['粒度状态'] === '唯一') &&
        fiscalYears.size === 1 &&
        new Set(rows.map((row) => row['维度值'])).size === rows.length;
      const quantity = valid ? total(rows, '月发货数量') : null;
      const previousYear = valid ? total(rows, '上年同期发货数量') : null;
      const previousMonth = valid ? total(rows, '上月发货数量') : null;
      return {
        月份: rows[0]['月份'],
        基地: rows[0]['基地'],
        大类: rows[0]['大类'],
        维度类型: '基地+大类',
        维度值: rows[0]['大类'],
        财年: rows[0]['财年'],
        月发货数量: quantity,
        上年同期发货数量: previousYear,
        上月发货数量: previousMonth,
        全国维度财年发货数量: annual,
        月发货占财年比例: quantity !== null && annual ? quantity / annual : null,
        同比增长率: quantity !== null && previousYear ? quantity / previousYear - 1 : null,
        环比增长率: quantity !== null && previousMonth ? quantity / previousMonth - 1 : null,
        源记录数: rows.reduce((sum, row) => sum + Number(row['源记录数'] || 0), 0),
        粒度状态: valid ? '唯一' : '业务键重复，仅保留源值',
        缺项原因: rows
          .map((row) => row['缺项原因'])
          .filter(Boolean)
          .join('；'),
      };
    });
  });
  const annualDetails = ready ? scope(input.annual?.rows ?? [], '年度计划') : [];
  const annual = [
    ...Map.groupBy(annualDetails, (row) =>
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
  const sourceRows = [
    ...details.map((row) => ({
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
      上年同期发货数量: row['上年同期发货数量'],
      上月发货数量: row['上月发货数量'],
      取数依据: '同基地SKU源财年12个月实际发货合计',
      缺项原因:
        row['缺项原因'] ||
        (number(row['基地维度财年发货数量']) === null
          ? '基地SKU源财年未覆盖12个有效月份或有数量冲突'
          : ''),
    })),
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
  return { history, annual, sourceRows, issues: [...new Set(issues)] };
}
