import Decimal from 'decimal.js';
import { sumSourceAmounts } from './source-money.js';
import { createSourceProductMatcher } from './source-projections.js';

const Money = Decimal.clone({ precision: 80, rounding: Decimal.ROUND_HALF_UP });
const key = (base, code) => JSON.stringify([base, code]);
const totalAmount = (values) => values.reduce((total, value) => total.plus(value), new Money(0));
const knownAmount = (values) => (values.length ? totalAmount(values).toFixed(2) : null);

export function reconcileDemandAmounts(draft, result, rows, filters = {}) {
  const month = filters.month || draft.month;
  const filtered = Boolean(
    filters.base || filters.category || filters.search || filters.onlyMissing,
  );
  const selected = rows.filter((row) => row.month === month);
  const selectedKeys = new Set(selected.map((row) => key(row.base, row.code)));
  const prices = new Map(
    draft.productPrices?.status === 'ready'
      ? draft.productPrices.rows.map((row) => [row['产品编码'], row['未税到岸单价']])
      : [],
  );
  const read = draft.reportRead?.periods?.[month] ?? draft.reportRead;
  const amounts = draft.reportAmounts?.[month];
  const ready = read?.status === 'ready' && amounts?.status === 'ready' && amounts.period === month;
  const sources = ready ? amounts.rows.filter((row) => row['月份'] === month) : [];
  const products = draft.products ?? [];
  const matchProduct = createSourceProductMatcher(products);
  const productsByCode = new Map();
  for (const product of products) {
    const code = product['产品编码'];
    if (!productsByCode.has(code)) productsByCode.set(code, []);
    productsByCode.get(code).push(product);
  }
  const classified = (row) => {
    const match = matchProduct(row['产品编码']);
    const matches = (productsByCode.get(match.currentCode) ?? []).filter(
      (product) => !product['基地'] || product['基地'] === row['基地'],
    );
    return {
      ...row,
      currentCode: match.currentCode,
      category: match.category || '未归类',
      products: matches,
    };
  };
  const excluded = [];
  const sourceRows = sources.map(classified).filter((row) => {
    if (filters.base && row['基地'] && row['基地'] !== filters.base) return false;
    if (filters.category && row.category !== '未归类' && row.category !== filters.category)
      return false;
    if ((filters.base && !row['基地']) || (filters.category && row.category === '未归类')) {
      excluded.push(row);
      return false;
    }
    if (
      filters.search &&
      ![
        row['月份'],
        row['基地'],
        row['产品编码'],
        row.currentCode,
        row.category,
        ...row.products.flatMap((product) => [
          product['产品名称'],
          product['系列'],
          product['物料组'],
        ]),
      ].some((value) => String(value ?? '').includes(filters.search))
    )
      return false;
    return (
      !filters.onlyMissing || selectedKeys.has(key(row['基地'], row.currentCode || row['产品编码']))
    );
  });
  const categories = [
    ...new Set([...selected.map((row) => row.category), ...sourceRows.map((row) => row.category)]),
  ];
  const summarize = (category) => {
    const generated = selected.filter((row) => !category || row.category === category);
    const plans = sourceRows.filter((row) => !category || row.category === category);
    const values = [];
    let missingPrice = 0,
      missingQuantity = 0;
    for (const row of generated) {
      const price = prices.get(row.code);
      if (price == null || price === '') missingPrice++;
      if (row.demand == null) missingQuantity++;
      if (price != null && price !== '' && row.demand != null)
        values.push(new Money(price).times(row.demand));
    }
    const missingDemand = plans.filter(
      (row) => !selectedKeys.has(key(row['基地'], row.currentCode || row['产品编码'])),
    ).length;
    const initial = sumSourceAmounts(plans, '月初计划金额');
    const final = sumSourceAmounts(plans, '最终计划金额');
    const generatedKnown = knownAmount(values);
    const complete = generated.length > 0 && !missingPrice && !missingQuantity && !missingDemand;
    const generatedAmount = complete ? generatedKnown : null;
    const difference =
      generatedAmount !== null && final.amount !== null
        ? totalAmount(values).minus(final.amount).toFixed(2)
        : null;
    return {
      month,
      category: category || (filtered ? '当前范围合计' : '全国合计'),
      initial,
      final,
      generatedAmount,
      generatedKnown,
      difference,
      missingPrice,
      missingQuantity,
      missingDemand,
      coverage:
        `${values.length}/${generated.length}项有效需求已计价` +
        [
          missingPrice ? `缺价${missingPrice}项` : '',
          missingQuantity ? `缺量${missingQuantity}项` : '',
          missingDemand ? `源金额${missingDemand}条无同范围需求` : '',
          !ready ? '同月提报金额待补' : '',
          initial.missing ? `月初金额缺${initial.missing}条` : '',
          final.missing ? `最终金额缺${final.missing}条` : '',
          plans.some((row) => !row['基地']) ? '含缺基地源金额' : '',
          plans.some((row) => row.category === '未归类') ? '含未归类源金额' : '',
        ]
          .filter(Boolean)
          .map((message) => `；${message}`)
          .join(''),
    };
  };
  return {
    month,
    ready,
    status: read?.status === 'ready' ? (amounts?.status ?? 'unread') : (read?.status ?? 'unread'),
    rows: [summarize(), ...categories.map(summarize)],
    excluded: {
      count: excluded.length,
      initial: sumSourceAmounts(excluded, '月初计划金额').knownAmount,
      final: sumSourceAmounts(excluded, '最终计划金额').knownAmount,
    },
    sourceError: !ready ? amounts?.error || '当前月份的提报金额尚未读取完成' : '',
    poolComplete: result.scopeCoverage === 'national',
  };
}
