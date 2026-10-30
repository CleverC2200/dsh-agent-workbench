import { normalizedMonth } from './master-data.js';

export function annualWorkbookTables(source, months, base) {
  const dimensions = ['基地', '大类', '老大类', '物料组编码', '物料组名称', '物料编码', '物料名称'];
  const fields = [
    'belong_base',
    'sub_category',
    'old_category',
    'product_item',
    'product_item_name',
    'material_code',
    'material_name',
  ];
  const records = new Map();
  for (const row of source) {
    const month = normalizedMonth(row.stat_month);
    if (row.belong_base !== base || !months.includes(month))
      throw Error('年度明细超出当前基地或月份范围，请重新下载');
    const values = fields.map((field) => row[field] ?? '');
    const key = JSON.stringify(values);
    if (!records.has(key)) records.set(key, { values, cells: new Map() });
    const cells = records.get(key).cells;
    if (!cells.has(month)) cells.set(month, new Set());
    const quantity = row.demand_qty == null || row.demand_qty === '' ? '' : Number(row.demand_qty);
    if (
      quantity !== '' &&
      (!Number.isFinite(quantity) || Math.abs(quantity) > Number.MAX_SAFE_INTEGER)
    )
      throw Error('年度需求数量超出可靠计算范围');
    cells.get(month).add(quantity);
  }
  const sku = [],
    groups = [];
  for (const { values, cells } of records.values()) {
    const row = Object.fromEntries(dimensions.map((column, index) => [column, values[index]]));
    let total = 0,
      complete = true;
    const notes = [];
    for (const month of months) {
      const quantities = cells.get(month);
      const valid = quantities?.size === 1 && !quantities.has('');
      row[month] = valid ? [...quantities][0] : '';
      if (valid) total += row[month];
      else {
        complete = false;
        notes.push(`${month}${quantities?.size > 1 ? '数量冲突' : '缺失'}`);
      }
    }
    row['全年合计'] = complete ? total : '';
    row['核对说明'] = notes.join('；');
    (row['物料编码'] ? sku : groups).push(row);
  }
  const summary = [...new Set(sku.map((row) => row['大类']))].map((category) => {
    const rows = sku.filter((row) => row['大类'] === category);
    const result = { 基地: base, 大类: category };
    for (const month of months) {
      result[month] = rows.every((row) => row[month] !== '')
        ? rows.reduce((sum, row) => sum + row[month], 0)
        : '';
      const index = months.indexOf(month);
      const previous = result[months[index - 1]],
        current = result[month];
      result[`${month}环比`] =
        index && previous !== '' && current !== '' && previous !== 0 ? current / previous - 1 : '';
    }
    result['全年合计'] = months.every((month) => result[month] !== '')
      ? months.reduce((sum, month) => sum + result[month], 0)
      : '';
    return result;
  });
  return [
    { name: 'SKU明细', columns: [...dimensions, ...months, '全年合计', '核对说明'], rows: sku },
    {
      name: '大类汇总（仅SKU）',
      columns: ['基地', '大类', ...months, '全年合计', ...months.map((month) => `${month}环比`)],
      rows: summary,
    },
    {
      name: '物料组汇总（单独核对）',
      columns: [...dimensions, ...months, '全年合计', '核对说明'],
      rows: groups,
    },
  ];
}
